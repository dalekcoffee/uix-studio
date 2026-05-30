import { useRef, useState, useCallback } from "react";
import { type UixComponentType } from "../model/types";
import {
  PALETTE_GROUPS,
  SYSTEM_TYPE_LIST,
  componentLabel,
  isKnownPaletteItem,
  type PaletteItem,
} from "../model/palette";
import { useStore } from "../state/store";
import { findSlot } from "../model/operations";
import { useDismissable } from "./useDismissable";

export default function AddMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedId = useStore((s) => s.selectedSlotId);
  const root = useStore((s) => s.root);
  const attach = useStore((s) => s.attachComponent);

  const slot = selectedId ? findSlot(root, selectedId) : null;
  // No selection (or Canvas root selected) → adding will spawn a fresh child
  // slot under the Canvas. Treat the menu's "already attached" set as empty
  // in that case since the new slot starts blank.
  const autoCreate = !slot || slot.id === root.id;
  const present = new Set(autoCreate ? [] : (slot?.components.map((c) => c.type) ?? []));

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  function add(type: PaletteItem) {
    // Auto-create branches inside the store when the slotId is the root id
    // (or empty). Otherwise targets the selected slot.
    attach(autoCreate ? root.id : slot!.id, type);
    setOpen(false);
  }

  const headerLabel = autoCreate ? "Adding to" : "Add component to";
  const headerValue = autoCreate ? "new slot under Canvas" : slot!.name;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={
          autoCreate
            ? "Add a new slot under the Canvas with the chosen component"
            : `Add a component to “${slot!.name}”`
        }
        className="rounded border border-sky-500 bg-sky-600 px-2 py-1 text-white transition hover:bg-sky-500"
      >
        + Add ▾
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
                  label={g.label}
                  hint={g.hint}
                  types={types}
                  present={present}
                  onPick={add}
                />
              );
            })}
            <Section
              label="System"
              hint="Plumbing — rarely needed manually"
              types={SYSTEM_TYPE_LIST}
              present={present}
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
  present,
  onPick,
}: {
  label: string;
  hint?: string;
  types: ReadonlyArray<PaletteItem>;
  present: Set<UixComponentType>;
  onPick: (t: PaletteItem) => void;
}) {
  if (types.length === 0) return null;
  return (
    <div className="border-b border-slate-800 px-2 py-2 last:border-b-0">
      <div className="mb-1 flex items-baseline gap-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {types.map((t) => {
          // Widget-only items (e.g. Spinner) aren't component types, so they're
          // never "already attached" — always offered.
          const already = present.has(t as UixComponentType);
          return (
            <button
              key={t}
              onClick={() => !already && onPick(t)}
              disabled={already}
              title={already ? `${componentLabel(t)} is already attached to this slot` : `Add ${componentLabel(t)}`}
              className={`rounded border px-2 py-1 transition ${
                already
                  ? "cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-sky-500 hover:text-sky-200"
              }`}
            >
              {already ? "✓ " : "+ "}
              {componentLabel(t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
