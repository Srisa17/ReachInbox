import { parse } from "csv-parse/sync";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accepts either a CSV (any column layout — we scan every cell) or a plain
 * text file with one address per line, and returns the de-duplicated,
 * validated list of email addresses found in it.
 */
export function parseLeadsFile(buffer: Buffer, filename: string): string[] {
  const text = buffer.toString("utf-8");
  const found = new Set<string>();

  const isCsv = filename.toLowerCase().endsWith(".csv") || text.includes(",");

  if (isCsv) {
    try {
      const rows: string[][] = parse(text, {
        skip_empty_lines: true,
        relax_column_count: true,
      });
      for (const row of rows) {
        for (const cell of row) {
          const trimmed = cell.trim();
          if (EMAIL_REGEX.test(trimmed)) found.add(trimmed.toLowerCase());
        }
      }
      if (found.size > 0) return Array.from(found);
    } catch {
      // fall through to line-based parsing below
    }
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (EMAIL_REGEX.test(trimmed)) found.add(trimmed.toLowerCase());
  }

  return Array.from(found);
}
