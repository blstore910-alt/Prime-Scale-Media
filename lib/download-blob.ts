// ─────────────────────────────────────────────────────────────────────
// Hand a file to the browser, in a way every browser accepts
// ─────────────────────────────────────────────────────────────────────
// Four screens each wrote their own version of this, and three of them
// wrote the broken one: an anchor that is never added to the document,
// clicked, and then an object URL revoked on the very next line.
//
// Firefox ignores a click on a detached anchor outright, and revoking
// synchronously races the download in every browser. So "Download CSV"
// did nothing at all, silently, on controls whose entire job is to hand
// somebody their own figures -- and a silent nothing reads as "there was
// nothing to export".
//
// One function, so the next export cannot get it wrong.
// ─────────────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A tick, not the next line: the browser needs the URL to survive long
  // enough to start reading from it.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * A CSV, with the byte-order mark Excel needs.
 *
 * Without it, a European Windows Excel opens a name carrying an accent
 * as mojibake -- and these files are read by the customer's own
 * bookkeeper, not by us.
 */
export function downloadCsv(csv: string, filename: string): void {
  const body = csv.startsWith("\ufeff") ? csv : "\ufeff" + csv;
  downloadBlob(
    new Blob([body], { type: "text/csv;charset=utf-8;" }),
    filename,
  );
}
