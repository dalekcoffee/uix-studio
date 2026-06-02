import { useCallback, useRef, useState } from "react";
import { useDismissable } from "./useDismissable";
import { useT } from "../locale/useT";

// A discoverability cheatsheet for the editor's mouse + keyboard interactions.
// Many of these (space-to-pan, double-click-rename, drag-to-reorder) are
// otherwise invisible — there's no other place they're written down. Grouped so
// the list scans quickly. Keep entries in sync with the handlers in Editor.tsx
// (keyboard) and Viewport.tsx / HierarchyTree.tsx (mouse).
//
// The KEY chords ("Ctrl + Z", "Hold Space + drag", …) stay literal — only the
// group labels and descriptions are translated.

interface Shortcut {
  keys: string;
  desc: string;
}
interface ShortcutGroup {
  label: string;
  items: Shortcut[];
}

export default function ShortcutsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);
  const t = useT();

  const GROUPS: ShortcutGroup[] = [
    {
      label: t.shortcuts.navLabel,
      items: [
        { keys: "Hold Space + drag", desc: t.shortcuts.navPanSpace },
        { keys: "Middle-mouse drag", desc: t.shortcuts.navPanMiddle },
        { keys: "Ctrl + scroll", desc: t.shortcuts.navZoom },
        { keys: "Scroll", desc: t.shortcuts.navScroll },
        { keys: "F", desc: t.shortcuts.navFit },
      ],
    },
    {
      label: t.shortcuts.editLabel,
      items: [
        { keys: "Click", desc: t.shortcuts.editSelect },
        { keys: "Click empty space", desc: t.shortcuts.editDeselect },
        { keys: "Drag an element", desc: t.shortcuts.editDrag },
        { keys: "Double-click in Hierarchy", desc: t.shortcuts.editRename },
        { keys: "Drag in Hierarchy", desc: t.shortcuts.editReparent },
      ],
    },
    {
      label: t.shortcuts.kbLabel,
      items: [
        { keys: "Ctrl + Z", desc: t.shortcuts.kbUndo },
        { keys: "Ctrl + Y  /  Ctrl + Shift + Z", desc: t.shortcuts.kbRedo },
        { keys: "Ctrl + D", desc: t.shortcuts.kbDuplicate },
        { keys: "Delete  /  Backspace", desc: t.shortcuts.kbDelete },
        { keys: "[", desc: t.shortcuts.kbToggleHierarchy },
        { keys: "]", desc: t.shortcuts.kbToggleInspector },
      ],
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t.shortcuts.controlsTip}
        aria-label={t.shortcuts.controlsAria}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 transition hover:bg-slate-700 hover:text-slate-100"
      >
        {t.shortcuts.controlsBtn}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.shortcuts.controls}</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              {t.shortcuts.mouseKeyboard}
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
