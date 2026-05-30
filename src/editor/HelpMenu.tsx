import { useCallback, useRef, useState } from "react";
import { APP_AUTHOR, APP_VERSION, APP_CHANNEL } from "../version";
import { useDismissable } from "./useDismissable";

export default function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="About UIX Studio"
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 transition hover:bg-slate-700 hover:text-slate-100"
      >
        ? Help
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              About
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              UIX Studio
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              v{APP_VERSION}
              {APP_CHANNEL && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                  {APP_CHANNEL}
                </span>
              )}
            </div>
            <div className="mt-2 text-[11px] text-slate-300">
              Slopcoded by{" "}
              <a
                href="https://dalek.coffee"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                {APP_AUTHOR}
              </a>{" "}
              using Claude Code
            </div>
          </div>

          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Disclaimer
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-300">
              UIX Studio is offered <span className="text-amber-300">as-is</span>,
              with no warranty or support. Use at your own risk.
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
              Source available on{" "}
              <a
                href="https://github.com/Dalek-Coffee/UIX-Studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                GitHub
              </a>
              .
            </p>
          </div>

          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Logo Credits
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
                  Pen tool icons
                </a>{" "}
                created by kmg design – Flaticon
              </li>
              <li>
                <a
                  href="https://www.flaticon.com/free-icons/ui"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="ui icons"
                  className="text-sky-300 underline-offset-2 hover:underline"
                >
                  Ui icons
                </a>{" "}
                created by icon_small – Flaticon
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
