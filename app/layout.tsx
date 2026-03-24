import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exam Timetable Extractor",
  description: "Extract your exam schedule from the official timetable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
