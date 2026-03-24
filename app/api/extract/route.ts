import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

interface ExamEntry {
  unit: string;
  date: string;
  time: string;
  venue: string;
}

function normalizeUnit(u: string) {
  return u.trim().toUpperCase().replace(/\s+/g, " ");
}

function cellVal(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col); // 1-based in exceljs
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (cell.value instanceof Date) {
    const d = cell.value;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }
  // Rich text
  if (typeof cell.value === "object" && "richText" in (cell.value as object)) {
    const rt = (cell.value as { richText: { text: string }[] }).richText;
    return rt.map(r => r.text).join("").trim();
  }
  if (typeof cell.value === "object" && "text" in (cell.value as object))
    return String((cell.value as { text: string }).text).trim();
  return String(cell.value).trim();
}

// Extract a unit code (XXX 000) from anywhere inside a cell's text
function extractUnitCode(raw: string): string | null {
  const m = raw.match(/[A-Z]{3}\s\d{3}/);
  return m ? m[0] : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const unitsRaw = formData.get("units") as string | null;

  if (!file || !unitsRaw) {
    return NextResponse.json({ error: "Missing file or units" }, { status: 400 });
  }

  const units: string[] = JSON.parse(unitsRaw).map(normalizeUnit);
  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workbook = new ExcelJS.Workbook();
  await (workbook.xlsx as unknown as { load(b: ArrayBuffer): Promise<void> }).load(arrayBuffer);
  const sheet = workbook.worksheets[0];

  const maxRow = sheet.rowCount;
  const maxCol = sheet.columnCount;

  const timePattern = /^\d{1,2}[:.]\d{2}/;
  const datePattern = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;

  // ── Build a 2D array for easy access (1-based row/col) ────────────────────
  // First pass: fill from rows
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rIdx) => {
    grid[rIdx] = [];
    for (let c = 1; c <= maxCol; c++) {
      grid[rIdx][c] = cellVal(row, c);
    }
  });

  // Second pass: fill merged cell ranges so every cell in a merge has the value
  const merges = (sheet as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges;
  if (merges) {
    for (const key of Object.keys(merges)) {
      const { top, left, bottom, right } = merges[key].model;
      const anchorVal = grid[top]?.[left] ?? "";
      for (let r = top; r <= bottom; r++) {
        if (!grid[r]) grid[r] = [];
        for (let c = left; c <= right; c++) {
          if (!grid[r][c]) grid[r][c] = anchorVal;
        }
      }
    }
  }

  function cell(r: number, c: number): string {
    return grid[r]?.[c] ?? "";
  }

  // ── Find venue header row (contains "No." and "Hall") ────────────────────
  let venueHeaderRow = -1;
  for (let r = 1; r <= Math.min(maxRow, 20); r++) {
    for (let c = 1; c <= maxCol; c++) {
      if (cell(r, c).toLowerCase() === "no." || cell(r, c).toLowerCase() === "no") {
        venueHeaderRow = r;
        break;
      }
    }
    if (venueHeaderRow !== -1) break;
  }

  // ── Find time header row ──────────────────────────────────────────────────
  let timeHeaderRow = -1;
  for (let r = 1; r <= Math.min(maxRow, 20); r++) {
    let count = 0;
    for (let c = 1; c <= maxCol; c++) {
      if (timePattern.test(cell(r, c))) count++;
    }
    if (count >= 2) { timeHeaderRow = r; break; }
  }
  if (timeHeaderRow === -1 && venueHeaderRow !== -1) timeHeaderRow = venueHeaderRow;

  // colToTime: col → time string
  const colToTime: Record<number, string> = {};
  if (timeHeaderRow !== -1) {
    for (let c = 1; c <= maxCol; c++) {
      const v = cell(timeHeaderRow, c);
      if (timePattern.test(v)) colToTime[c] = v;
    }
  }

  // ── Build slot map: for each unit column, find its No. col and Hall col ──
  // Structure per slot: [unit col] [No. col] [Hall col]
  // We find all No./Hall pairs in the venue header row, then for each unit
  // column we pick the nearest No./Hall pair to its right.
  interface SlotVenue { noCol: number; hallCol: number; }
  const slotVenues: SlotVenue[] = [];
  if (venueHeaderRow !== -1) {
    let pendingNoCol = -1;
    for (let c = 1; c <= maxCol; c++) {
      const lower = cell(venueHeaderRow, c).toLowerCase();
      if (lower === "no." || lower === "no") {
        pendingNoCol = c;
      } else if ((lower === "hall" || lower === "venue" || lower === "room") && pendingNoCol !== -1) {
        slotVenues.push({ noCol: pendingNoCol, hallCol: c });
        pendingNoCol = -1;
      }
    }
  }

  // For a given unit column, return the nearest SlotVenue to its right
  function venueForCol(unitCol: number): SlotVenue | null {
    let best: SlotVenue | null = null;
    for (const sv of slotVenues) {
      if (sv.noCol > unitCol) {
        if (!best || sv.noCol < best.noCol) best = sv;
      }
    }
    return best;
  }

  // ── Find date column ──────────────────────────────────────────────────────
  const dataStart = Math.max(venueHeaderRow, timeHeaderRow) + 1;
  let dateCol = 1;
  for (let c = 1; c <= Math.min(maxCol, 4); c++) {
    let hits = 0;
    for (let r = dataStart; r <= Math.min(maxRow, 30); r++) {
      if (datePattern.test(cell(r, c))) hits++;
    }
    if (hits >= 2) { dateCol = c; break; }
  }

  // ── Scan data rows ────────────────────────────────────────────────────────
  const found: ExamEntry[] = [];
  const foundUnits = new Set<string>();

  for (let r = dataStart; r <= maxRow; r++) {
    // Resolve date (handle merged cells by looking upward)
    let date = cell(r, dateCol);
    if (!date) {
      for (let pr = r - 1; pr >= dataStart; pr--) {
        const d = cell(pr, dateCol);
        if (d) { date = d; break; }
      }
    }

    for (let c = 1; c <= maxCol; c++) {
      const val = cell(r, c);
      const unitCode = extractUnitCode(val.toUpperCase());
      if (!unitCode) continue;
      if (!units.includes(unitCode)) continue;

      // Time: from header map or scan upward
      let time = colToTime[c] ?? "";
      if (!time) {
        for (let pr = r - 1; pr >= 1; pr--) {
          const t = cell(pr, c);
          if (timePattern.test(t)) { time = t; break; }
        }
      }

      // Venue: find the nearest No./Hall pair to the right of this unit column
      let venue = "";
      const sv = venueForCol(c);
      if (sv) {
        const hall = cell(r, sv.hallCol);
        venue = hall;
      }
      // Fallback: scan adjacent cells for venue-like text
      if (!venue) {
        for (let vc = c - 2; vc <= c + 2; vc++) {
          if (vc < 1 || vc === c) continue;
          const v = cell(r, vc);
          if (v && !extractUnitCode(v.toUpperCase()) && !timePattern.test(v) && v.length > 1) {
            venue = v;
            break;
          }
        }
      }

      foundUnits.add(unitCode);
      found.push({ unit: unitCode, date: date || "—", time: time || "—", venue: venue || "—" });
    }
  }

  const notFound = units.filter(u => !foundUnits.has(u));

  // Parse date strings into timestamps for correct chronological sorting
  function parseDate(d: string): number {
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy = d.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (dmy) {
      const day = parseInt(dmy[1]);
      const month = parseInt(dmy[2]) - 1;
      const year = dmy[3].length === 2 ? 2000 + parseInt(dmy[3]) : parseInt(dmy[3]);
      return Date.UTC(year, month, day);
    }
    // YYYY-MM-DD
    const ymd = d.match(/(\d{4})[\-.](\d{2})[\-.](\d{2})/);
    if (ymd) return Date.UTC(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
    // "Monday, 14 April 2026" or "14 April 2026" or "April 14 2026"
    const MONTHS = [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december"
    ];
    const lower = d.toLowerCase();
    let monthIdx = -1;
    for (let m = 0; m < MONTHS.length; m++) {
      if (lower.includes(MONTHS[m].slice(0, 3))) { monthIdx = m; break; }
    }
    if (monthIdx !== -1) {
      const nums = d.match(/\d+/g) ?? [];
      const year4 = nums.find(n => n.length === 4);
      const day2 = nums.find(n => parseInt(n) <= 31 && n.length <= 2);
      if (year4 && day2) {
        return Date.UTC(parseInt(year4), monthIdx, parseInt(day2));
      }
    }
    return 0;
  }

  found.sort((a, b) => {
    const dateDiff = parseDate(a.date) - parseDate(b.date);
    if (dateDiff !== 0) return dateDiff;
    return a.time.localeCompare(b.time);
  });

  return NextResponse.json({ found, notFound });
}
