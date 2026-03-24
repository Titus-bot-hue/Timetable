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
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF();

    // Dark background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 297, "F");
    doc.setTextColor(99, 102, 241);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("EXAM TIMETABLE", 105, 20, { align: "center" });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated by Exam Timetable Extractor`, 105, 28, { align: "center" });

    autoTable(doc, {
      startY: 36,
      head: [["Date", "Time", "Unit Code", "Venue"]],
      body: result.found.map(e => [e.date, e.time, "", e.venue]),
      theme: "grid",
      styles: {
        fillColor: [30, 41, 59],
        textColor: [226, 232, 240],
        lineColor: [51, 65, 85],
        fontSize: 9,
        cellPadding: 3,
        valign: "middle",
        minCellHeight: 18,
      },
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 4,
      },
      alternateRowStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 38 },
        2: { cellWidth: 50, halign: "center" },
        3: { cellWidth: "auto" },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const entry = result.found[data.row.index];
          if (!entry?.unitName) return;
          const { x, y, width, height } = data.cell;
          // Clear and redraw cell background
          doc.setFillColor(
            data.row.index % 2 === 0 ? 30 : 15,
            data.row.index % 2 === 0 ? 41 : 23,
            data.row.index % 2 === 0 ? 59 : 42
          );
          doc.rect(x, y, width, height, "F");
          const pad = 3;
          const usableW = width - pad * 2;
          // Unit code — bold white, centered
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(226, 232, 240);
          doc.text(entry.unit, x + width / 2, y + pad + 5, { align: "center" });
          // Unit name — wrapped, smaller, muted
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          const lines = doc.splitTextToSize(entry.unitName, usableW) as string[];
          const lineH = 3.5;
          lines.slice(0, 3).forEach((line: string, i: number) => {
            doc.text(line, x + width / 2, y + pad + 10 + i * lineH, { align: "center" });
          });
        }
      },
    });

    if (result.notFound.length > 0) {
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setTextColor(251, 191, 36);
      doc.setFontSize(9);
      doc.text(`Not found: ${result.notFound.join(", ")}`, 14, finalY);
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
