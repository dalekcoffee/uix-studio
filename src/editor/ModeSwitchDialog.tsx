import { useEffect } from "react";

// Visual confirmation shown when switching between Snap and Free layout modes.
// Replaces the old wall-of-text window.confirm() dialogs: the difference is an
// export-format implication (reorderable-in-game vs absolute coordinates) that
// reads far better as a side-by-side picture than as a paragraph of caveats.

type Mode = "snap" | "free";

interface Props {
  target: Mode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ModeSwitchDialog({ target, onConfirm, onCancel }: Props) {
  // Esc cancels, Enter confirms — standard modal affordances.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div
      className="absolute inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-[460px] max-w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-slate-100">
          Switch to {target === "snap" ? "Snap" : "Free"} mode?
        </div>
        <p className="mt-1 text-xs leading-snug text-slate-400">
          {target === "snap"
            ? "Snap arranges elements into stacked rows and reflows them. Manual positions you set in Free mode may shift. In return, the exported panel stays reorderable inside Resonite."
            : "Free lets you place every element at exact coordinates — great for precise designs. But the exported panel can no longer be rearranged in-game: reordering its slots in Resonite won't move anything."}
        </p>

        {/* Side-by-side illustration; the target mode is highlighted. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ModeCard mode="snap" active={target === "snap"} />
          <ModeCard mode="free" active={target === "free"} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded border border-sky-500 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
          >
            Switch to {target === "snap" ? "Snap" : "Free"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({ mode, active }: { mode: Mode; active: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2.5 transition ${
        active
          ? "border-sky-500 bg-sky-500/10"
          : "border-slate-800 bg-slate-950/40 opacity-70"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-xs">{mode === "snap" ? "▤" : "✥"}</span>
        <span className="text-xs font-semibold text-slate-100">
          {mode === "snap" ? "Snap" : "Free"}
        </span>
        {active && (
          <span className="ml-auto rounded bg-sky-500/20 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-sky-200">
            Switching to
          </span>
        )}
      </div>
      {/* Mini panel mock */}
      <div className="relative h-20 overflow-hidden rounded border border-slate-700 bg-slate-800/60">
        {mode === "snap" ? (
          <div className="flex h-full flex-col gap-1.5 p-2">
            <div className="h-3 rounded-sm bg-slate-500/70" />
            <div className="h-3 rounded-sm bg-slate-500/70" />
            <div className="h-3 rounded-sm bg-slate-500/70" />
          </div>
        ) : (
          <>
            <div className="absolute left-2 top-2 h-4 w-16 rounded-sm bg-slate-500/70" />
            <div className="absolute right-2 top-6 h-3 w-10 rounded-sm bg-slate-500/70" />
            <div className="absolute bottom-2 left-6 h-5 w-12 rounded-sm bg-slate-500/70" />
          </>
        )}
      </div>
      <div className="mt-1.5 text-[10px] leading-snug text-slate-400">
        {mode === "snap"
          ? "Stacked rows · reorderable in Resonite"
          : "Exact positions · fixed once exported"}
      </div>
    </div>
  );
}
