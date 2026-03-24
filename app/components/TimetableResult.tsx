"use client";
import { useState } from "react";

interface ExamEntry {
  unit: string;
  unitName: string;
  date: string;
  time: string;
  venue: string;
}

interface Props {
  found: ExamEntry[];
  notFound: string[];
  onGeneratePDF: () => void;
}

export default function TimetableResult({ found, notFound, onGeneratePDF }: Props) {
  const [showDownload, setShowDownload] = useState(false);

  function downloadCSV() {
    setShowDownload(false);
    const header = "Unit,Date,Time,Venue\n";
    const rows = found.map(e => `"${e.unit}","${e.date}","${e.time}","${e.venue}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my_exam_timetable.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePDF() {
    setShowDownload(false);
    onGeneratePDF();
  }

  if (found.length === 0) {
    return (
      <div className="card" style={{ animation: "fadeInUp 0.45s ease-out" }}>
        <div className="empty-state">
          <span className="icon">📭</span>
          <p style={{ fontWeight: 700, fontSize: "1rem", color: "#2d3748", marginBottom: "0.35rem" }}>
            No exams found
          </p>
          <p style={{ fontSize: "0.875rem" }}>None of the requested units were found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ animation: "fadeInUp 0.45s ease-out" }}>
      <div className="results-header">
        <div>
          <h2>🎓 Your Exam Schedule</h2>
          <p style={{ color: "#718096", fontSize: "0.8rem", marginTop: "0.2rem" }}>
            {found.length} exam{found.length !== 1 ? "s" : ""} found
            {notFound.length > 0 ? ` · ${notFound.length} not found` : ""}
          </p>
        </div>
        <div className="results-actions">
          <div style={{ position: "relative" }}>
            <button
              className="btn btn-success"
              onClick={() => setShowDownload(v => !v)}
            >
              ⬇️ Download ▾
            </button>
            {showDownload && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)",
                background: "#fff", border: "2px solid #e2e8f0",
                borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                minWidth: "160px", zIndex: 100, overflow: "hidden",
              }}>
                <button onClick={handlePDF} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  width: "100%", padding: "0.75rem 1rem",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "0.875rem", fontWeight: 600, color: "#2d3748",
                  borderBottom: "1px solid #e2e8f0",
                }}>
                  🖨️ Download PDF
                </button>
                <button onClick={downloadCSV} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  width: "100%", padding: "0.75rem 1rem",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "0.875rem", fontWeight: 600, color: "#2d3748",
                }}>
                  📄 Download CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="doc-wrap">
        <div className="doc-sheet">
          <div className="doc-title-block">
            <div className="doc-title">EXAM TIMETABLE</div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="doc-table">
              <thead>
                <tr>
                  <th className="doc-th doc-th-date">Date</th>
                  <th className="doc-th">Time</th>
                  <th className="doc-th">Unit Code</th>
                  <th className="doc-th">Venue</th>
                </tr>
              </thead>
              <tbody>
                {found.map((e, i) => (
                  <tr key={i} className={i % 2 === 0 ? "doc-tr-even" : "doc-tr-odd"}>
                    <td className="doc-td-date">{e.date}</td>
                    <td className="doc-td-cell" style={{ whiteSpace: "nowrap", fontWeight: 600, color: "#2d3748" }}>{e.time}</td>
                    <td className="doc-td-cell">
                      <span className="doc-entry-unit">{e.unit}</span>
                      {e.unitName && (
                        <div style={{ fontSize: "0.72rem", color: "#718096", marginTop: "0.2rem", fontWeight: 500 }}>
                          {e.unitName}
                        </div>
                      )}
                    </td>
                    <td className="doc-td-cell" style={{ color: "#4a5568", fontWeight: 500 }}>{e.venue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="doc-footer">
            Generated by Exam Timetable Extractor &nbsp;·&nbsp; {found.length} exam{found.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
