import { useEffect, useState } from "react";
import { APP_AUTHOR, APP_VERSION, APP_CHANNEL } from "../version";
import { useT } from "../locale/useT";

interface Props {
  onDismiss: () => void;
}

// The editor is a three-column desktop layout (hierarchy │ viewport │ inspector)
// that relies on precise dragging — cramped and frustrating on a phone. Below
// these thresholds we keep the splash up as a small-screen warning instead of
// auto-advancing into the editor.
const MIN_WIDTH = 943;
const MIN_HEIGHT = 552;

export default function Splash({ onDismiss }: Props) {
  const t = useT();
  const [fading, setFading] = useState(false);
  const [dims, setDims] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  // Track viewport size so rotating a phone to landscape (or resizing) re-evaluates
  // the gate live — once it's big enough, the normal auto-advance kicks in.
  useEffect(() => {
    function check() {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  const tooSmall = dims.w < MIN_WIDTH || dims.h < MIN_HEIGHT;
  const portrait = dims.h > dims.w;

  // Auto-advance ONLY on adequately-sized screens. On a small screen the splash
  // turns into the warning and waits for an explicit "Continue anyway" tap.
  useEffect(() => {
    if (tooSmall) return;
    const t1 = window.setTimeout(() => setFading(true), 1800);
    const t2 = window.setTimeout(() => onDismiss(), 2400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [tooSmall, onDismiss]);

  return (
    <div
      // Click-anywhere-to-continue only when the screen is big enough; on a small
      // screen we require the explicit button so the warning is actually read.
      onClick={tooSmall ? undefined : onDismiss}
      className={`flex h-full w-full flex-col items-center overflow-y-auto bg-slate-950 px-6 py-10 text-center transition-opacity duration-500 ${
        tooSmall ? "cursor-default" : "cursor-pointer"
      } ${fading ? "opacity-0" : "opacity-100"}`}
    >
      {/* m-auto centers the column vertically when it fits and lets it scroll
          when the warning makes it taller than a short landscape viewport. */}
      <div className="m-auto flex flex-col items-center">
        <img
          src="./UIX%20Studio.png"
          alt="UIX Studio"
          className={tooSmall ? "h-28 w-28" : "h-40 w-40"}
          draggable={false}
        />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-100">
          UIX Studio
        </h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
          {t.splash.version} {APP_VERSION}
          {APP_CHANNEL && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              {APP_CHANNEL}
            </span>
          )}
        </p>

        {tooSmall ? (
          <div className="mt-8 flex max-w-sm flex-col items-center gap-4">
            <div className="text-4xl" aria-hidden>
              📱
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">
              {t.screenGate.title}
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">{t.screenGate.body}</p>
            {portrait && (
              <p className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs leading-relaxed text-sky-200">
                <span className="mr-1" aria-hidden>
                  ↻
                </span>
                {t.screenGate.rotateHint}
              </p>
            )}
            <p className="text-[11px] uppercase tracking-widest text-slate-500">
              {t.screenGate.screenInfo(dims.w, dims.h, MIN_WIDTH, MIN_HEIGHT)}
            </p>
            <button
              onClick={onDismiss}
              className="mt-1 rounded-lg border border-slate-600 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 shadow-lg transition hover:border-sky-500 hover:bg-slate-700 hover:text-white"
            >
              {t.screenGate.continueAnyway}
            </button>
          </div>
        ) : (
          <>
            <a
              href="https://dalek.coffee"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-10 flex items-center gap-2 text-xs text-slate-500 transition hover:text-sky-300"
            >
              <img
                src="./Dalek.png"
                alt={APP_AUTHOR}
                className="h-6 w-6 rounded-full ring-1 ring-slate-700"
                draggable={false}
              />
              <span className="text-white">{t.toolbar.slopcodedBy(APP_AUTHOR)}</span>
            </a>
            <p className="mt-6 text-[10px] uppercase tracking-widest text-slate-600">
              {t.splash.clickToContinue}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
