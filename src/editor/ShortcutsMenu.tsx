import { useCallback, useRef, useState } from "react";
import { useDismissable } from "./useDismissable";

// A discoverability cheatsheet for the editor's mouse + keyboard interactions.
// Many of these (space-to-pan, double-click-rename, drag-to-reorder) are
// otherwise invisible — there's no other place they're written down. Grouped so
// the list scans quickly. Keep entries in sync with the handlers in Editor.tsx
// (keyboard) and Viewport.tsx / HierarchyTree.tsx (mouse).

interface Shortcut {
  keys: string;
  desc: string;
}
interface ShortcutGroup {
  label: string;
  items: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    label: "Canvas navigation",
    items: [
      { keys: "Hold Space + drag", desc: "Pan around the canvas" },
      { keys: "Middle-mouse drag", desc: "Pan around the canvas" },
      { keys: "Ctrl + scroll", desc: "Zoom in / out" },
      { keys: "Scroll", desc: "Pan vertically (Shift = horizontal)" },
      { keys: "F", desc: "Recenter & fit the canvas" },
    ],
  },
  {
    label: "Selecting & editing",
    items: [
      { keys: "Click", desc: "Select an element" },
      { keys: "Click empty space", desc: "Deselect" },
      { keys: "Drag an element", desc: "Move it (Free) or reorder it (Snap)" },
      { keys: "Double-click in Hierarchy", desc: "Rename a layer" },
      { keys: "Drag in Hierarchy", desc: "Reparent / reorder layers" },
    ],
  },
  {
    label: "Keyboard",
    items: [
      { keys: "Ctrl + Z", desc: "Undo" },
      { keys: "Ctrl + Y  /  Ctrl + Shift + Z", desc: "Redo" },
      { keys: "Ctrl + D", desc: "Duplicate selected element" },
      { keys: "Delete  /  Backspace", desc: "Delete selected element" },
      { keys: "[", desc: "Toggle the Hierarchy panel" },
      { keys: "]", desc: "Toggle the Inspector panel" },
    ],
  },
];

export default function ShortcutsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Mouse & keyboard controls"
        aria-label="Controls and keyboard shortcuts"
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 transition hover:bg-slate-700 hover:text-slate-100"
      >
        ⌨ Controls
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Controls</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              Mouse &amp; keyboard
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {GROUPS.map((g) => (
              <div key={g.label} className="border-b border-slate-800 px-3 py-2 last:border-b-0">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {g.label}
                </div>
                <ul className="flex flex-col gap-1">
                  {g.items.map((s) => (
                    <li key={s.keys + s.desc} className="flex items-baseline gap-2">
                      <kbd className="flex-shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                        {s.keys}
                      </kbd>
                      <span className="text-[11px] leading-snug text-slate-400">{s.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
