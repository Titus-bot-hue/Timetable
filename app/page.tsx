"use client";
import { useState, useRef, useCallback } from "react";
import TimetableResult from "./components/TimetableResult";

interface ExamEntry {
  unit: string;
  unitName: string;
  date: string;
  time: string;
  venue: string;
}

const UNIT_REGEX = /^[A-Za-z]{3}\s\d{3}$/;

function Modal({ type, notFound, onClose }: {
  type: "noFile" | "notFound";
  notFound?: string[];
  onClose: () => void;
}) {
  const isNoFile = type === "noFile";
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
      background: "rgba(15,23,42,0.55)",
      backdropFilter: "blur(4px)",
      animation: "fadeInDown 0.25s ease-out",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff",
        borderRadius: "16px",
        padding: "2rem 1.75rem",
        maxWidth: "380px",
        width: "100%",
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
        animation: "fadeInUp 0.25s ease-out",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>
          {isNoFile ? "📂" : "🔍"}
        </div>
        <h3 style={{ color: "#2d3748", fontWeight: 800, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          {isNoFile ? "No Timetable Uploaded" : "Unit(s) Not Found"}
        </h3>

        {isNoFile ? (
          <p style={{ color: "#718096", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Please upload your exam timetable Excel file before extracting.
          </p>
        ) : (
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ color: "#718096", fontSize: "0.875rem", marginBottom: "0.875rem", lineHeight: 1.5 }}>
              The following unit{(notFound?.length ?? 0) > 1 ? "s were" : " was"} not found in the timetable:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {notFound?.map(u => (
                <div key={u} style={{
                  background: "#fff5f5",
                  border: "2px solid #fed7d7",
                  borderRadius: "8px",
                  padding: "0.6rem 1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                }}>
                  <span style={{ fontSize: "1.1rem" }}>⚠️</span>
                  <span style={{ fontWeight: 700, color: "#c53030", fontSize: "0.95rem", letterSpacing: "0.05em" }}>{u}</span>
                  <span style={{ color: "#718096", fontSize: "0.8rem", marginLeft: "auto" }}>not in timetable</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            background: isNoFile
              ? "linear-gradient(135deg,#667eea,#764ba2)"
              : "linear-gradient(135deg,#f6ad55,#ed8936)",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "0.7rem 2rem",
            fontWeight: 700,
            fontSize: "0.95rem",
            cursor: "pointer",
            width: "100%",
            boxShadow: isNoFile
              ? "0 4px 14px rgba(102,126,234,0.4)"
              : "0 4px 14px rgba(237,137,54,0.4)",
          }}
        >
          {isNoFile ? "Got it!" : "OK, Continue"}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [units, setUnits] = useState<string[]>(["", ""]);
  const [unitErrors, setUnitErrors] = useState<boolean[]>([false, false]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ found: ExamEntry[]; notFound: string[] } | null>(null);
  const [error, setError] = useState("");
  const [showNoFileToast, setShowNoFileToast] = useState(false);
  const [notFoundModal, setNotFoundModal] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── File handling ──────────────────────────────────────────────────────────
  function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls|ods)$/i)) {
      setError("Please upload an Excel file (.xlsx, .xls, .ods)");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  // ── Unit inputs ────────────────────────────────────────────────────────────
  function updateUnit(i: number, val: string) {
    const next = [...units];
    next[i] = val.toUpperCase();
    setUnits(next);
    const errs = [...unitErrors];
    errs[i] = false;
    setUnitErrors(errs);
  }

  function addUnit() {
    setUnits([...units, ""]);
    setUnitErrors([...unitErrors, false]);
  }

  function removeUnit(i: number) {
    setUnits(units.filter((_, idx) => idx !== i));
    setUnitErrors(unitErrors.filter((_, idx) => idx !== i));
  }

  // ── Extract ────────────────────────────────────────────────────────────────
  async function extract() {
    // Validate units
    const errs = units.map(u => u.trim() !== "" && !UNIT_REGEX.test(u.trim()));
    setUnitErrors(errs);
    const validUnits = units.filter(u => UNIT_REGEX.test(u.trim()));

    if (!file) { setShowNoFileToast(true); return; }
    if (validUnits.length === 0) { setError("Add at least one valid unit code (e.g. MMA 410)."); return; }

    setError("");
    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("units", JSON.stringify(validUnits));

      const res = await fetch("/api/extract", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
      if (data.notFound?.length > 0) setNotFoundModal(data.notFound);
      // Auto-scroll to results
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Extraction failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── PDF generation ─────────────────────────────────────────────────────────
  async function generatePDF() {
    if (!result?.found.length) return;
    const { default: jsPDF } = await import("jspdf");

    const doc = new jsPDF();
    const W = 210, H = 297;
    const ml = 14, mr = 14;
    const tableW = W - ml - mr;

    // Column widths
    const colDate = 55, colTime = 38, colUnit = 52;
    const colVenue = tableW - colDate - colTime - colUnit;

    // Colors
    const BG: [number,number,number]       = [15, 23, 42];
    const ROW1: [number,number,number]     = [30, 41, 59];
    const ROW2: [number,number,number]     = [15, 23, 42];
    const HEADER: [number,number,number]   = [99, 102, 241];
    const TEXT: [number,number,number]     = [226, 232, 240];
    const MUTED: [number,number,number]    = [148, 163, 184];
    const BORDER: [number,number,number]   = [51, 65, 85];
    const PURPLE: [number,number,number]   = [99, 102, 241];

    // Page background
    doc.setFillColor(...BG);
    doc.rect(0, 0, W, H, "F");

    // Title
    doc.setTextColor(...PURPLE);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("EXAM TIMETABLE", W / 2, 18, { align: "center" });
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by Exam Timetable Extractor", W / 2, 25, { align: "center" });

    // Header row
    let y = 31;
    const headerH = 10;
    doc.setFillColor(...HEADER);
    doc.rect(ml, y, tableW, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    const hPad = 3;
    doc.text("DATE",      ml + hPad,                          y + 6.5);
    doc.text("TIME",      ml + colDate + hPad,                y + 6.5);
    doc.text("UNIT CODE", ml + colDate + colTime + colUnit/2, y + 6.5, { align: "center" });
    doc.text("VENUE",     ml + colDate + colTime + colUnit + hPad, y + 6.5);
    y += headerH;

    // Group exams by date
    const groups: { date: string; exams: typeof result.found }[] = [];
    for (const e of result.found) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.date) last.exams.push(e);
      else groups.push({ date: e.date, exams: [e] });
    }

    const rowH = 18; // height per exam sub-row
    let rowIdx = 0;

    for (const group of groups) {
      const groupH = group.exams.length * rowH;
      const bg = rowIdx % 2 === 0 ? ROW1 : ROW2;

      // Date cell (spans full group height)
      doc.setFillColor(...bg);
      doc.rect(ml, y, colDate, groupH, "F");
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.rect(ml, y, colDate, groupH);
      doc.setTextColor(...TEXT);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      // Wrap date text
      const dateLines = doc.splitTextToSize(group.date, colDate - 6) as string[];
      const dateTextH = dateLines.length * 4;
      dateLines.forEach((line: string, li: number) => {
        doc.text(line, ml + hPad, y + groupH / 2 - dateTextH / 2 + 3 + li * 4);
      });

      // Sub-rows for each exam
      let subY = y;
      for (const exam of group.exams) {
        // Time cell
        doc.setFillColor(...bg);
        doc.rect(ml + colDate, subY, colTime, rowH, "F");
        doc.setDrawColor(...BORDER);
        doc.rect(ml + colDate, subY, colTime, rowH);
        doc.setTextColor(...MUTED);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        const timeLines = doc.splitTextToSize(exam.time, colTime - 4) as string[];
        timeLines.forEach((line: string, li: number) => {
          doc.text(line, ml + colDate + hPad, subY + 7 + li * 3.5);
        });

        // Unit code cell
        doc.setFillColor(...bg);
        doc.rect(ml + colDate + colTime, subY, colUnit, rowH, "F");
        doc.setDrawColor(...BORDER);
        doc.rect(ml + colDate + colTime, subY, colUnit, rowH);
        const ux = ml + colDate + colTime + colUnit / 2;
        doc.setTextColor(...TEXT);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(exam.unit, ux, subY + 6.5, { align: "center" });
        if (exam.unitName) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...MUTED);
          const uLines = doc.splitTextToSize(exam.unitName, colUnit - 6) as string[];
          uLines.slice(0, 2).forEach((line: string, li: number) => {
            doc.text(line, ux, subY + 11 + li * 3.2, { align: "center" });
          });
        }

        // Venue cell
        doc.setFillColor(...bg);
        doc.rect(ml + colDate + colTime + colUnit, subY, colVenue, rowH, "F");
        doc.setDrawColor(...BORDER);
        doc.rect(ml + colDate + colTime + colUnit, subY, colVenue, rowH);
        doc.setTextColor(...MUTED);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        const vLines = doc.splitTextToSize(exam.venue, colVenue - 4) as string[];
        vLines.forEach((line: string, li: number) => {
          doc.text(line, ml + colDate + colTime + colUnit + hPad, subY + 7 + li * 3.5);
        });

        subY += rowH;
      }

      y += groupH;
      rowIdx++;
    }

    // Footer
    doc.setTextColor(...MUTED);
    doc.setFontSize(7.5);
    doc.text(`${result.found.length} exam${result.found.length !== 1 ? "s" : ""}  ·  Evans The Developer`, W / 2, y + 8, { align: "center" });

    if (result.notFound.length > 0) {
      doc.setTextColor(251, 191, 36);
      doc.setFontSize(8);
      doc.text(`Not found: ${result.notFound.join(", ")}`, ml, y + 14);
    }

    doc.save("exam_timetable.pdf");
  }

  const canExtract = !loading;

  return (
    <div className="container">
      {showNoFileToast && <Modal type="noFile" onClose={() => setShowNoFileToast(false)} />}
      {notFoundModal.length > 0 && (
        <Modal type="notFound" notFound={notFoundModal} onClose={() => setNotFoundModal([])} />
      )}
      <div className="header">
        <h1>🎓 Exam Timetable Extractor</h1>
        <p>Upload your official timetable · Add your units · Get your schedule instantly</p>
      </div>

      {/* Upload */}
      <div className="card">
        <h2>📁 Step 1 &mdash; Upload Timetable</h2>
        <div
          className={`upload-zone ${dragging ? "active" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.ods"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="icon">📊</div>
          {file ? (
            <>
              <div className="icon">✅</div>
              <p style={{ fontWeight: 600, color: "#2d3748" }}>File ready</p>
              <p className="file-name">📊 {file.name}</p>
            </>
          ) : (
            <>
              <div className="icon">📊</div>
              <p style={{ fontWeight: 600, color: "#2d3748" }}>Drag &amp; drop your Excel timetable here</p>
              <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#718096" }}>
                or click to browse &mdash; supports .xlsx, .xls, .ods
              </p>
            </>
          )}
        </div>
      </div>

      {/* Units */}
      <div className="card">
        <h2>🔍 Step 2 &mdash; Add Your Unit Codes</h2>
        {units.map((u, i) => (
          <div className="unit-input-row" key={i}>
            <input
              type="text"
              className={unitErrors[i] ? "error" : ""}
              value={u}
              onChange={e => updateUnit(i, e.target.value)}
              placeholder="e.g. MMA 410"
              maxLength={7}
              onKeyDown={e => e.key === "Enter" && addUnit()}
            />
            {units.length > 1 && (
              <button className="btn btn-danger" onClick={() => removeUnit(i)}>✕</button>
            )}
          </div>
        ))}
        {unitErrors.some(Boolean) && (
          <p style={{ color: "#c53030", fontSize: "0.85rem", marginBottom: "0.75rem", fontWeight: 500 }}>
            ⚠️ Format: 3 letters, space, 3 digits &mdash; e.g. CCS 310
          </p>
        )}
        <button className="add-unit-btn" onClick={addUnit}>＋ Add another unit</button>

        {error && <div className="alert alert-error" style={{ marginTop: "1rem" }}>❌ {error}</div>}

        <button
          className="btn btn-primary extract-btn"
          onClick={extract}
          disabled={!canExtract || loading}
          suppressHydrationWarning
        >
          {loading ? "⏳ Extracting..." : "🚀 Extract My Timetable"}
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div className="card loading">
          <div className="spinner" />
          <p style={{ fontWeight: 600, color: "#4a5568" }}>Scanning your timetable...</p>
          <p style={{ fontSize: "0.875rem", color: "#718096", marginTop: "0.5rem" }}>This may take a moment</p>
        </div>
      )}

      {result && !loading && (
        <div ref={resultRef}>
          <TimetableResult
            found={result.found}
            notFound={result.notFound}
            onGeneratePDF={generatePDF}
          />
        </div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: "center",
        padding: "1.5rem 0 0.5rem",
        color: "rgba(255,255,255,0.7)",
        fontSize: "0.8rem",
        fontWeight: 500,
      }}>
        <div style={{ marginBottom: "0.25rem", fontSize: "1rem" }}>👨‍💻</div>
        &copy; {new Date().getFullYear()} <strong style={{ color: "#fff" }}>Evans The Developer</strong>. All rights reserved.
      </div>
    </div>
  );
}
