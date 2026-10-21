/*
 * Browser-side file download for the CSV exports. Call from event handlers
 * only (it touches `document` and the clock).
 */

/** Offer `csv` as a file named `<name>-<today>.csv`. */
export function downloadCsv(csv: string, name: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
