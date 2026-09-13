// Neutralise spreadsheet formula injection. Excel / Google Sheets evaluate a
// cell whose text starts with = + - @ (or a leading tab / carriage return) as
// a formula, so a user-controlled value like =HYPERLINK(...) or a DDE payload
// runs when the exported CSV is opened. Prefix such values with a single
// quote so they render as literal text. Non-strings pass through unchanged.
export function csvSafe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
