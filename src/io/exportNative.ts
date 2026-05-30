import type { UixDocument } from "../model/types";

export function exportNativeFile(doc: UixDocument): Blob {
  const json = JSON.stringify(doc, null, 2);
  return new Blob([json], { type: "application/json" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
