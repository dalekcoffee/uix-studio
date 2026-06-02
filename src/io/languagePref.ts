// Best-effort persistence of the UI language preference to localStorage. This
// is a UI-only setting (NOT part of the document, undo history, or export), so
// it lives in its own versioned key rather than in the autosave envelope.
//
// Mirrors the defensive style of autosave.ts: every access is wrapped so a full
// / disabled storage (private mode) can never break startup or editing.

import { DEFAULT_LANG, isLang, type Lang } from "../locale/types";

const KEY = "uixstudio.language.v1";

export function writeLanguage(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* quota exceeded / storage disabled — ignore */
  }
}

// Read a previously chosen language, or null if none/invalid.
export function readLanguage(): Lang | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  return isLang(raw) ? raw : null;
}

// Map a browser locale (navigator.language, e.g. "ko-KR") to a supported Lang,
// or null when none of ours match.
function guessFromBrowser(): Lang | null {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of langs) {
      const base = (tag || "").toLowerCase().split("-")[0];
      if (isLang(base)) return base;
    }
  } catch {
    /* navigator unavailable — ignore */
  }
  return null;
}

// The language to start in: an explicit prior choice wins; otherwise fall back
// to a best-effort guess from the browser, then English. Read synchronously at
// store init so the very first render (and the first-load starter template) is
// already in the right language.
export function getInitialLanguage(): Lang {
  return readLanguage() ?? guessFromBrowser() ?? DEFAULT_LANG;
}
