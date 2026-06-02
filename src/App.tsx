import { useEffect, useRef, useState } from "react";
import Splash from "./editor/Splash";
import Editor from "./editor/Editor";
import { useStore } from "./state/store";
import { readAutosave, writeAutosave, clearAutosave } from "./io/autosave";
import { DialogProvider } from "./editor/useDialog";
import { useT } from "./locale/useT";
import type { Dictionary } from "./locale";
import type { UixDocument } from "./model/types";

// Debounce window for autosave writes — long enough that a flurry of edits
// (dragging a slider, typing) collapses into one write, short enough that work
// is rarely more than a second behind.
const AUTOSAVE_DEBOUNCE_MS = 800;

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  // Snapshot of any persisted unsaved work, read ONCE at startup before the
  // autosave subscription below can overwrite it (it only writes after an edit,
  // and there are no edits yet at mount, so this read is safe). null when there
  // is nothing to restore.
  const [restorable, setRestorable] = useState<{ savedAt: number; doc: UixDocument } | null>(
    () => readAutosave(),
  );

  // Prevent page-level pinch/ctrl-wheel zoom so the viewport can own zoom UX.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Autosave: debounce-write the document whenever it changes AND the doc is
  // dirty (a real edit was made). Gating on `dirty` keeps an untouched starter
  // template out of localStorage, so a first-time visitor is never greeted with
  // a "restore previous session" prompt for work they never did.
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useStore.subscribe((state, prev) => {
      if (!state.dirty) return;
      if (state.root === prev.root && state.theme === prev.theme) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        writeAutosave(useStore.getState().documentSnapshot(), Date.now());
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, []);

  // Unsaved-changes guard: warn before unload when the document is dirty. The
  // browser shows its own generic confirm dialog; returnValue must be set.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!useStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <div className="h-full w-full">
      {showSplash ? (
        <Splash onDismiss={() => setShowSplash(false)} />
      ) : (
        <DialogProvider>
        <div className="relative h-full w-full">
          <Editor />
          {restorable && (
            <RestoreBanner
              savedAt={restorable.savedAt}
              onRestore={() => {
                useStore.getState().loadDocument(restorable.doc);
                setRestorable(null);
              }}
              onDismiss={() => {
                clearAutosave();
                setRestorable(null);
              }}
            />
          )}
        </div>
        </DialogProvider>
      )}
    </div>
  );
}

function RestoreBanner({
  savedAt,
  onRestore,
  onDismiss,
}: {
  savedAt: number;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const when = useRef(savedAt ? formatWhen(savedAt, t) : "").current;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-[200] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg border border-sky-500/60 bg-slate-900/95 px-4 py-2.5 text-xs text-slate-200 shadow-2xl">
        <span className="text-base" aria-hidden>
          ⟳
        </span>
        <div className="flex-1 leading-snug">
          <div className="font-semibold text-slate-100">{t.app.restoreTitle}</div>
          <div className="text-[11px] text-slate-400">
            {t.app.restoreBody(when)}
          </div>
        </div>
        <button
          onClick={onRestore}
          className="flex-shrink-0 rounded border border-sky-500 bg-sky-600 px-3 py-1 font-semibold text-white transition hover:bg-sky-500"
        >
          {t.app.restore}
        </button>
        <button
          onClick={onDismiss}
          title={t.app.discardTip}
          className="flex-shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300 transition hover:border-rose-500 hover:text-rose-300"
        >
          {t.app.discard}
        </button>
      </div>
    </div>
  );
}

// Human-friendly relative-ish timestamp ("3 minutes ago", "today at 14:02",
// or a full date) without pulling in a date library. Localized via the passed
// dictionary; the absolute fallback uses the browser's own locale formatting.
function formatWhen(ts: number, t: Dictionary): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return t.app.momentsAgo;
  if (min < 60) return t.app.minutesAgo(min);
  const hr = Math.round(min / 60);
  if (hr < 24) return t.app.hoursAgo(hr);
  return new Date(ts).toLocaleString();
}
