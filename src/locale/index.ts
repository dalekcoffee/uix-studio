// Locale registry. Maps a Lang code to its hard-coded dictionary.
//
// `getDict` is the framework-agnostic accessor (used by non-React code such as
// the starter-template generator). React components should use `useT()` instead
// (src/locale/useT.ts), which re-renders on language change.
import { en, type Dictionary } from "./en";
import { ko } from "./ko";
import { es } from "./es";
import { ja } from "./ja";
import { DEFAULT_LANG, type Lang } from "./types";

export type { Dictionary } from "./en";
export type { Lang, LanguageMeta } from "./types";
export { LANGUAGES, DEFAULT_LANG, isLang } from "./types";

export const dictionaries: Record<Lang, Dictionary> = { en, ko, es, ja };

export function getDict(lang: Lang): Dictionary {
  return dictionaries[lang] ?? dictionaries[DEFAULT_LANG];
}
