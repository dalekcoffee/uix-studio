import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { collectWarnings, type DocWarning } from "../model/warnings";
import { listImages, subscribeImageStore } from "../io/imageStore";
import { useDismissable } from "./useDismissable";
import { useT } from "../locale/useT";

export default function WarningsMenu() {
  const root = useStore((s) => s.root);
  const select = useStore((s) => s.select);
  const language = useStore((s) => s.language);
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [imageHashes, setImageHashes] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      listImages().then((all) => {
        if (!cancelled) setImageHashes(new Set(all.map((i) => i.hash)));
      });
    }
    refresh();
    const unsub = subscribeImageStore(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const warnings = useMemo(
    () => collectWarnings(root, imageHashes, language),
    [root, imageHashes, language],
  );

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  if (warnings.length === 0) return null;

  const warningCount = warnings.filter((w) => w.severity === "warning").length;
  const infoCount = warnings.length - warningCount;
  const tone =
    warningCount > 0
      ? "border-amber-500 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
      : "border-sky-500/60 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded border px-2 py-1 text-xs transition ${tone}`}
        title={t.warnings.summary(warningCount, infoCount)}
      >
        ⚠ {warnings.length}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {t.warnings.issues}
            </div>
            <div className="mt-0.5 text-slate-300">
              {warningCount > 0 && (
                <span className="text-amber-300">
                  {t.warnings.warningCount(warningCount)}
                </span>
              )}
              {warningCount > 0 && infoCount > 0 && <span className="text-slate-600"> · </span>}
              {infoCount > 0 && (
                <span className="text-sky-300">
                  {t.warnings.noteCount(infoCount)}
                </span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {t.warnings.exportNote}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {warnings.map((w, i) => (
              <WarningRow
                key={`${w.slotId}:${w.code}:${i}`}
                warning={w}
                onSelect={() => {
                  select(w.slotId);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WarningRow({
  warning,
  onSelect,
}: {
  warning: DocWarning;
  onSelect: () => void;
}) {
  const t = useT();
  const isWarn = warning.severity === "warning";
  return (
    <button
      onClick={onSelect}
      className="flex w-full items-start gap-2 border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800/40"
      title={t.warnings.selectSlot}
    >
      <span
        className={`mt-0.5 inline-block flex-shrink-0 text-sm ${
          isWarn ? "text-amber-300" : "text-sky-300"
        }`}
      >
        {isWarn ? "⚠" : "ⓘ"}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-slate-200">{warning.slotName}</span>
        <span className="text-[10px] leading-snug text-slate-500">
          {warning.message}
        </span>
      </span>
    </button>
  );
}
