// React hook returning the active language's dictionary. Reads `language` from
// the store, so any component using it re-renders when the user switches
// languages. Usage:
//
//   const t = useT();
//   <button title={t.toolbar.saveProjectTip}>{t.toolbar.saveProject}</button>
import { useStore } from "../state/store";
import { getDict, type Dictionary } from "./index";

export function useT(): Dictionary {
  const lang = useStore((s) => s.language);
  return getDict(lang);
}
