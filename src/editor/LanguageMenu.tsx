import { useCallback, useRef, useState } from "react";
import { useStore } from "../state/store";
import { LANGUAGES } from "../locale";
import { useT } from "../locale/useT";
import { useDismissable } from "./useDismissable";

// Toolbar language picker. A small globe dropdown listing every supported
// language by its endonym (한국어, Español, 日本語…). Switching is a UI-only
// preference (store.setLanguage) — it re-renders the editor chrome and is
// persisted to localStorage, but never touches the open document.
export default function LanguageMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);
  const t = useT();
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t.language.tip}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 transition hover:bg-slate-700 hover:text-slate-100"
      >
        <span aria-hidden>🌐</span>
        <span>{current.label}</span>
        <span className="text-[10px] text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-48 overflow-hidden rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="flex flex-col py-1">
            {LANGUAGES.map((l) => {
              const active = l.code === language;
              return (
                <button
                  key={l.code}
                  onClick={() => {
                    setLanguage(l.code);
                    setOpen(false);
                  }}
                  title={l.english}
                  className={`flex items-center justify-between px-3 py-1.5 text-left transition ${
                    active
                      ? "bg-sky-500/15 text-sky-200"
                      : "text-slate-200 hover:bg-slate-800 hover:text-sky-200"
                  }`}
                >
                  <span>{l.label}</span>
                  {active && <span aria-hidden className="text-sky-300">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-800 px-3 py-1.5 text-[10px] leading-snug text-slate-500">
            {t.language.caveat}
          </div>
        </div>
      )}
    </div>
  );
}
