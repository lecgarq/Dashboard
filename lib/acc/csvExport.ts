import * as XLSX from "xlsx";

/**
 * RFC4180-escaped CSV download with UTF-8 BOM for Excel compatibility.
 *
 * Why xlsx (not hand-rolled):
 *   - `XLSX.utils.json_to_sheet` + `sheet_to_csv` handles RFC4180 quote/comma/newline
 *     escaping correctly. Hand-rolled escape is a bug factory (Pitfall — see 04-RESEARCH.md).
 *
 * Why the BOM ("﻿"):
 *   - Excel mis-detects UTF-8 without it; non-ASCII characters render as Mojibake.
 *
 * Browser-only: guards `typeof window === "undefined"` early-return so server-side
 * import (e.g. Server Component accidentally calling this) is a no-op rather than a crash.
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, string | number | null | undefined>[]
): void {
  if (typeof window === "undefined") return;

  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" });
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
