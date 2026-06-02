import { useCallback, useRef, useState } from "react";
import { APP_AUTHOR, APP_VERSION, APP_CHANNEL } from "../version";
import { useDismissable } from "./useDismissable";
import { useStore } from "../state/store";
import { useT } from "../locale/useT";

export default function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);
  const setWhatsNewOpen = useStore((s) => s.setWhatsNewOpen);
  const t = useT();
  const openWhatsNew = () => {
    setOpen(false);
    setWhatsNewOpen(true);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t.help.helpTip}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 transition hover:bg-slate-700 hover:text-slate-100"
      >
        {t.help.helpBtn}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {t.help.about}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              UIX Studio
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <button
                onClick={openWhatsNew}
                title={t.toolbar.whatsNewTip}
                className="flex items-center gap-1.5 rounded text-sky-300 transition hover:text-sky-200 hover:underline"
              >
                v{APP_VERSION}
                {APP_CHANNEL && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                    {APP_CHANNEL}
                  </span>
                )}
              </button>
              <span className="text-slate-600">·</span>
              <button onClick={openWhatsNew} className="text-sky-300 underline-offset-2 hover:underline">
                {t.help.whatsNew}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-300">
              {t.help.slopcodedBy}{" "}
              <a
                href="https://dalek.coffee"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                {APP_AUTHOR}
              </a>{" "}
              {t.help.usingClaudeCode}
            </div>
          </div>

          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {t.help.disclaimer}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-300">
              {t.help.disclaimerPre}<span className="text-amber-300">{t.help.disclaimerAsIs}</span>{t.help.disclaimerPost}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
              {t.help.sourcePre}{" "}
              <a
                href="https://github.com/dalekcoffee/uix-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                {t.help.github}
              </a>
              .
            </p>
          </div>

          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {t.help.logoCredits}
            </div>
            <ul className="mt-1 space-y-1 text-[11px] text-slate-300">
              <li>
                <a
                  href="https://www.flaticon.com/free-icons/pen-tool"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="pen tool icons"
                  className="text-sky-300 underline-offset-2 hover:underline"
                >
                  {t.help.penToolIcons}
                </a>{" "}
                {t.help.createdBy} kmg design – Flaticon
              </li>
              <li>
                <a
                  href="https://www.flaticon.com/free-icons/ui"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="ui icons"
                  className="text-sky-300 underline-offset-2 hover:underline"
                >
                  {t.help.uiIcons}
                </a>{" "}
                {t.help.createdBy} icon_small – Flaticon
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
