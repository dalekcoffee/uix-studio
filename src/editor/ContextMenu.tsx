import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore, type AlignAxis, type AlignMode } from "../state/store";
import { type UixComponentType } from "../model/types";
import {
  PALETTE_GROUPS,
  SYSTEM_TYPE_LIST,
  componentLabel,
  isKnownPaletteItem,
  type PaletteItem,
} from "../model/palette";
import { findSlot } from "../model/operations";
import { isStructuralSlot } from "../model/structural";
import { isLayoutManaged } from "./render/slotRect";
import { useDismissable } from "./useDismissable";

const ALIGN_BUTTONS: Array<{ label: string; caption: string; title: string; axis: AlignAxis; mode: AlignMode }> = [
  { label: "⇤", caption: "Left", title: "Align left", axis: "h", mode: "start" },
  { label: "⇔", caption: "Center", title: "Center horizontally", axis: "h", mode: "center" },
  { label: "⇥", caption: "Right", title: "Align right", axis: "h", mode: "end" },
  { label: "⇿", caption: "Stretch", title: "Stretch horizontally", axis: "h", mode: "stretch" },
  { label: "⇡", caption: "Top", title: "Align top", axis: "v", mode: "start" },
  { label: "⇕", caption: "Middle", title: "Center vertically", axis: "v", mode: "center" },
  { label: "⇣", caption: "Bottom", title: "Align bottom", axis: "v", mode: "end" },
  { label: "⇳", caption: "Stretch", title: "Stretch vertically", axis: "v", mode: "stretch" },
];

export default function ContextMenu() {
  const ctx = useStore((s) => s.contextMenu);
  const close = useStore((s) => s.closeContextMenu);
  const root = useStore((s) => s.root);
  const attach = useStore((s) => s.attachComponent);
  const alignSlot = useStore((s) => s.alignSlot);
  const duplicate = useStore((s) => s.duplicate);
  const remove = useStore((s) => s.remove);
  const toggleSlotLock = useStore((s) => s.toggleSlotLock);
  const beginRename = useStore((s) => s.beginRename);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Clamp the menu inside the viewport — the requested x/y might land near
  // the right or bottom edge.
  useLayoutEffect(() => {
    if (!ctx || !menuRef.current) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(ctx.x, vw - r.width - 8);
    const top = Math.min(ctx.y, vh - r.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [ctx]);

  // Standard click-outside / Escape dismiss — same as the dropdown menus.
  useDismissable(!!ctx, close, menuRef);

  // Right-click elsewhere closes the menu UNLESS an app-level handler already
  // preventDefault'd the contextmenu (Viewport / RenderedSlot / HierarchyTree
  // all do). Those handlers will then re-open this menu at the new position;
  // closing here first would race them and nuke the new state.
  useEffect(() => {
    if (!ctx) return;
    function onContextMenuElsewhere(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (!menuRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("contextmenu", onContextMenuElsewhere);
    return () => {
      document.removeEventListener("contextmenu", onContextMenuElsewhere);
    };
  }, [ctx, close]);

  if (!ctx) return null;

  const slot = ctx.slotId ? findSlot(root, ctx.slotId) : null;
  const isRoot = slot?.id === root.id;
  const hasRT = !!slot?.components.some((c) => c.type === "RectTransform");
  const layoutManaged = slot ? isLayoutManaged(root, slot.id) : false;
  // When targeting the Canvas root, the store routes attachComponent to a
  // fresh child slot. Mirror that intent here: pretend nothing is attached so
  // every component is offered, and label the section accordingly.
  const autoCreate = isRoot;
  const present = new Set(
    autoCreate ? [] : (slot?.components.map((c) => c.type) ?? []),
  );

  function addComponent(t: PaletteItem) {
    if (!slot) return;
    attach(slot.id, t);
    close();
  }

  return (
    <div
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: pos?.left ?? ctx.x,
        top: pos?.top ?? ctx.y,
        visibility: pos ? "visible" : "hidden",
        zIndex: 9999,
      }}
      className="w-64 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-xs shadow-2xl"
    >
      {slot ? (
        <div className="border-b border-slate-800 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            {autoCreate ? "Adding to" : "Slot"}
          </div>
          <div
            className="truncate text-sm text-slate-100"
            title={autoCreate ? "new slot under Canvas" : slot.name}
          >
            {autoCreate ? "new slot under Canvas" : slot.name}
          </div>
        </div>
      ) : (
        <div className="border-b border-slate-800 px-3 py-2 text-[10px] text-slate-500">
          Select a slot to add components or align it.
        </div>
      )}

      <div className="max-h-[70vh] overflow-y-auto">
        {/* Quick actions — hidden for structural backdrop slots (managed by the
            Background menu, not directly editable). */}
        {slot && !isRoot && !isStructuralSlot(slot) && (
          <Section label="Quick Actions">
            <div className="grid grid-cols-2 gap-1">
              <ChipBtn
                onClick={() => {
                  beginRename(slot.id);
                  close();
                }}
                title="Rename (or double-click in the hierarchy)"
              >
                ✎ Rename
              </ChipBtn>
              <ChipBtn
                onClick={() => {
                  duplicate(slot.id);
                  close();
                }}
                title="Duplicate (Ctrl+D)"
              >
                ⎘ Duplicate
              </ChipBtn>
              <ChipBtn
                onClick={() => {
                  toggleSlotLock(slot.id);
                  close();
                }}
                title={slot.locked ? "Unlock" : "Lock"}
              >
                {slot.locked ? "🔓 Unlock" : "🔒 Lock"}
              </ChipBtn>
              <ChipBtn
                danger
                onClick={() => {
                  if (confirm(`Delete slot "${slot.name}" and its children?`)) {
                    remove(slot.id);
                  }
                  close();
                }}
                title="Delete (Del)"
              >
                ✕ Delete
              </ChipBtn>
            </div>
          </Section>
        )}

        {/* Align in Parent */}
        {slot && !isRoot && hasRT && !isStructuralSlot(slot) && (
          <Section
            label="Align in Parent"
            hint={layoutManaged ? "Layout-managed — disabled" : undefined}
          >
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              Horizontal
            </div>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {ALIGN_BUTTONS.filter((b) => b.axis === "h").map((b) => (
                <button
                  key={b.title}
                  disabled={layoutManaged}
                  title={b.title}
                  aria-label={b.title}
                  onClick={() => {
                    alignSlot(slot.id, b.axis, b.mode);
                    close();
                  }}
                  className="flex flex-col items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-800 py-1 text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-sm leading-none">{b.label}</span>
                  <span className="text-[9px] leading-none text-slate-400">{b.caption}</span>
                </button>
              ))}
            </div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              Vertical
            </div>
            <div className="grid grid-cols-4 gap-1">
              {ALIGN_BUTTONS.filter((b) => b.axis === "v").map((b) => (
                <button
                  key={b.title}
                  disabled={layoutManaged}
                  title={b.title}
                  aria-label={b.title}
                  onClick={() => {
                    alignSlot(slot.id, b.axis, b.mode);
                    close();
                  }}
                  className="flex flex-col items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-800 py-1 text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-sm leading-none">{b.label}</span>
                  <span className="text-[9px] leading-none text-slate-400">{b.caption}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Add Component */}
        {slot && (
          <>
            {PALETTE_GROUPS.map((g) => (
              <AddSection
                key={g.label}
                label={`Add ${g.label}`}
                hint={g.hint}
                types={g.types.filter(isKnownPaletteItem)}
                present={present}
                onPick={addComponent}
              />
            ))}
            <AddSection
              label="Add System"
              hint="rarely needed"
              types={SYSTEM_TYPE_LIST}
              present={present}
              onPick={addComponent}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-800 px-3 py-2 last:border-b-0">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function AddSection({
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
  return (
    <Section label={label} hint={hint}>
      <div className="flex flex-wrap gap-1">
        {types.map((t) => {
          // Widget-only items (e.g. Spinner) aren't component types → never
          // "already attached", always offered.
          const already = present.has(t as UixComponentType);
          return (
            <button
              key={t}
              onClick={() => !already && onPick(t)}
              disabled={already}
              title={already ? `${componentLabel(t)} is already attached` : `Add ${componentLabel(t)}`}
              className={`rounded border px-2 py-0.5 text-[11px] transition ${
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
    </Section>
  );
}

function ChipBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded border px-2 py-1 text-[11px] transition ${
        danger
          ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-rose-500 hover:text-rose-300"
          : "border-slate-700 bg-slate-800 text-slate-200 hover:border-sky-500 hover:text-sky-200"
      }`}
    >
      {children}
    </button>
  );
}
