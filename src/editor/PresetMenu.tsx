import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { BUILTIN_PRESETS, type PresetDescriptor } from "../model/presets";
import { useDialog } from "./useDialog";

// Category labels keyed by the literal category string on PresetDescriptor.
// Ordered: this controls the section order in the menu.
const CATEGORY_ORDER: PresetDescriptor["category"][] = [
  "panel",
  "form",
  "id-card",
  "tool",
  "dialog",
  "marketing",
  "blank",
];

const CATEGORY_LABELS: Record<PresetDescriptor["category"], string> = {
  panel:     "Panels",
  form:      "Forms",
  "id-card": "ID Cards",
  tool:      "Tools",
  dialog:    "Dialogs",
  marketing: "Marketing",
  blank:     "Start fresh",
};

export default function PresetMenu() {
  const [open, setOpen] = useState(false);
  // Per-category expanded state. Empty set → all collapsed (the default the
  // user asked for). Click a category header to expand it; click again to
  // collapse. State resets each time the menu reopens.
  const [expanded, setExpanded] = useState<Set<PresetDescriptor["category"]>>(
    () => new Set(),
  );
  const ref = useRef<HTMLDivElement>(null);
  const loadPreset = useStore((s) => s.loadPreset);
  const dialog = useDialog();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset all-collapsed state every time the menu reopens, so reopening
  // always shows a tidy overview of categories with counts.
  useEffect(() => {
    if (open) setExpanded(new Set());
  }, [open]);

  async function pick(p: PresetDescriptor) {
    if (
      !await dialog.confirm(
        `Replace the current canvas with the "${p.name}" preset? Any unsaved work will be lost.`,
        { confirmLabel: "Load Preset" },
      )
    ) {
      return;
    }
    loadPreset(p.id);
    setOpen(false);
  }

  function toggleCategory(cat: PresetDescriptor["category"]) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Group presets by category in declaration order within each category.
  const byCategory = new Map<PresetDescriptor["category"], PresetDescriptor[]>();
  for (const p of BUILTIN_PRESETS) {
    const arr = byCategory.get(p.category) ?? [];
    arr.push(p);
    byCategory.set(p.category, arr);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Load a starting preset (replaces the current canvas)"
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
      >
        Presets ▾
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Load a Preset
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              Replaces the current canvas. Save first if you want to keep your work.
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {CATEGORY_ORDER.map((cat) => {
              const list = byCategory.get(cat);
              if (!list || list.length === 0) return null;
              const isOpen = expanded.has(cat);
              return (
                <div key={cat} className="border-b border-slate-800 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-800/40"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      <span className="mr-1.5 inline-block w-2 text-slate-500">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                      {list.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col">
                      {list.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => pick(p)}
                          className="flex flex-col items-start gap-0.5 border-t border-slate-800 px-3 py-2 text-left hover:bg-slate-800/50"
                        >
                          <span className="text-slate-100">{p.name}</span>
                          <span className="text-[10px] leading-snug text-slate-500">
                            {p.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-800 px-3 py-2 text-[10px] leading-snug text-slate-500">
            The reference layouts in <code className="text-slate-400">UIX Template/</code>{" "}
            (Preset Template 1–7, Rocker, Scroll area, …) are .resonitepackage
            exports. Porting them into the editor requires a BSON importer — flag
            this as a follow-up if you want them as one-click presets.
          </div>
        </div>
      )}
    </div>
  );
}
