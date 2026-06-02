// Language/locale primitives for the editor's UI translation layer.
//
// Translations are HARD-CODED per language under src/locale/ (en/ko/es/ja) and
// shipped with the static build — there is no live/online translation. English
// is the source of truth: see en.ts, whose shape (`Dictionary`) every other
// language must structurally match (the TypeScript compiler enforces this).

export type Lang = "en" | "ko" | "es" | "ja";

export interface LanguageMeta {
  /** BCP-47-ish short code, also the localStorage value and dictionary key. */
  code: Lang;
  /** Endonym — the language's own name, shown in the picker (한국어, Español…). */
  label: string;
  /** English name, for tooltips / accessibility. */
  english: string;
}

// Order here is the order shown in the language picker. English first (default),
// then the three Claude-provided translations.
export const LANGUAGES: readonly LanguageMeta[] = [
  { code: "en", label: "English", english: "English" },
  { code: "ko", label: "한국어", english: "Korean" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "ja", label: "日本語", english: "Japanese" },
];

export const DEFAULT_LANG: Lang = "en";

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}
