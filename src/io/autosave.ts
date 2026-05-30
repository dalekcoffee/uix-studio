// Best-effort local autosave of the working document to localStorage, so a
// reload / crash / accidental tab-close doesn't wipe unsaved work. This is NOT
// a substitute for the explicit "Save Project" (.uixstudio.json) export — it's
// a safety net. Writes are debounced by the caller and only happen once the
// user has actually edited something (see the store's `dirty` flag), so a brand
// new visitor who never touches the starter template gets no restore prompt.

import type { UixDocument } from "../model/types";
import { parseDocument } from "./importNative";

const KEY = "uixstudio.autosave.v1";

interface AutosaveEnvelope {
  savedAt: number;
  doc: UixDocument;
}

// Persist the document. Best-effort: storage may be full or disabled (private
// mode), in which case we silently skip — autosave must never break editing.
export function writeAutosave(doc: UixDocument, savedAt: number): void {
  try {
    const env: AutosaveEnvelope = { savedAt, doc };
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    /* quota exceeded / storage disabled — ignore */
  }
}

// Read + validate any persisted document. Returns null when absent or corrupt
// (a malformed blob must never crash startup — it just means "no restore").
export function readAutosave(): { savedAt: number; doc: UixDocument } | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as { savedAt?: unknown; doc?: unknown };
    if (!env || typeof env !== "object" || typeof env.doc !== "object" || env.doc === null) {
      return null;
    }
    const doc = parseDocument(env.doc);
    return { savedAt: typeof env.savedAt === "number" ? env.savedAt : 0, doc };
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
