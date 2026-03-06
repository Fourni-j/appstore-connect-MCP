/**
 * Parse a TSV (tab-separated values) string into an array of objects.
 * First row is treated as headers.
 */
export function parseTSV(tsv: string): Record<string, string>[] {
  const lines = tsv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t");
    if (values.length === 0 || (values.length === 1 && values[0].trim() === "")) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() ?? "";
    }
    rows.push(row);
  }

  return rows;
}
