import { useRef, useState, useCallback } from "react";
import {
  PALETTE_GROUPS,
  SYSTEM_TYPE_LIST,
  isKnownPaletteItem,
  type PaletteItem,
} from "../model/palette";
import { useStore } from "../state/store";
import { findSlot } from "../model/operations";
import { resolveAddContainerId } from "./render/snapFlow";
import { useDismissable } from "./useDismissable";
import { useT } from "../locale/useT";
import { localizedGroupLabel, localizedComponentLabel } from "../locale/paletteText";

export default function AddMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedId = useStore((s) => s.selectedSlotId);
  const root = useStore((s) => s.root);
  const attach = useStore((s) => s.attachComponent);
  const t = useT();
  const lang = useStore((s) => s.language);

  // Adding always spawns a NEW element at the bottom of the page (or the bottom
  // of the nearest nested container the selection resolves to) — never onto the
  // selected slot. So nothing is ever "already attached"; every type is offered.
  const destId = resolveAddContainerId(root, selectedId ?? null);
  const destSlot = findSlot(root, destId);
  const destIsRoot = destId === root.id;

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  function add(type: PaletteItem) {
    // The store routes the add to the resolved container (page bottom or nested
    // container) — just pass the current selection through.
    attach(selectedId ?? root.id, type);
    setOpen(false);
  }

  const headerLabel = t.addMenu.addingTo;
  const headerValue = destIsRoot
    ? t.addMenu.bottomOfPage
    : t.addMenu.bottomOf(destSlot?.name ?? t.addMenu.container);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t.addMenu.addTip(headerValue)}
        className="rounded border border-sky-500 bg-sky-600 px-2 py-1 text-white transition hover:bg-sky-500"
      >
        {t.addMenu.addBtn}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {headerLabel}
            </div>
            <div className="truncate text-sm text-slate-100" title={headerValue}>
              {headerValue}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {PALETTE_GROUPS.map((g) => {
              const types = g.types.filter(isKnownPaletteItem);
              return (
                <Section
                  key={g.label}
                  label={localizedGroupLabel(g.label, lang)}
                  hint={g.hint}
                  types={types}
                  onPick={add}
                />
              );
            })}
            <Section
              label={t.addMenu.system}
              hint={t.addMenu.systemHint}
              types={SYSTEM_TYPE_LIST}
              onPick={add}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  hint,
  types,
  onPick,
}: {
  label: string;
  hint?: string;
  types: ReadonlyArray<PaletteItem>;
  onPick: (t: PaletteItem) => void;
}) {
  const tr = useT();
  const lang = useStore((s) => s.language);
  if (types.length === 0) return null;
  // Adding always spawns a fresh element at the destination, so every type is
  // always offered (nothing is ever "already attached").
  return (
    <div className="border-b border-slate-800 px-2 py-2 last:border-b-0">
      <div className="mb-1 flex items-baseline gap-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            title={tr.addMenu.addType(localizedComponentLabel(t, lang))}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 transition hover:border-sky-500 hover:text-sky-200"
          >
            + {localizedComponentLabel(t, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}
