import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore, type AlignAxis, type AlignMode } from "../state/store";
import { useDialog } from "./useDialog";
import {
  PALETTE_GROUPS,
  SYSTEM_TYPE_LIST,
  isKnownPaletteItem,
  type PaletteItem,
} from "../model/palette";
import { localizedGroupLabel, localizedComponentLabel } from "../locale/paletteText";
import { findSlot } from "../model/operations";
import { isStructuralSlot } from "../model/structural";
import { isLayoutManaged } from "./render/slotRect";
import { alignAvailability } from "./render/alignAvail";
import { resolveAddContainerId } from "./render/snapFlow";
import { useDismissable } from "./useDismissable";
import { useT } from "../locale/useT";
import type { Dictionary } from "../locale";

type AlignKey = keyof Dictionary["align"];

// Glyph + axis/mode stay static; caption/title are dictionary keys resolved at
// render time so the labels and tooltips localize.
const ALIGN_BUTTONS: Array<{ label: string; caption: AlignKey; title: AlignKey; axis: AlignAxis; mode: AlignMode }> = [
  { label: "⇤", caption: "captionLeft", title: "titleLeft", axis: "h", mode: "start" },
  { label: "⇔", caption: "captionCenter", title: "titleCenterH", axis: "h", mode: "center" },
  { label: "⇥", caption: "captionRight", title: "titleRight", axis: "h", mode: "end" },
  { label: "⇿", caption: "captionStretch", title: "titleStretchH", axis: "h", mode: "stretch" },
  { label: "⇡", caption: "captionTop", title: "titleTop", axis: "v", mode: "start" },
  { label: "⇕", caption: "captionMiddle", title: "titleCenterV", axis: "v", mode: "center" },
  { label: "⇣", caption: "captionBottom", title: "titleBottom", axis: "v", mode: "end" },
  { label: "⇳", caption: "captionStretch", title: "titleStretchV", axis: "v", mode: "stretch" },
];

export default function ContextMenu() {
  const ctx = useStore((s) => s.contextMenu);
  const close = useStore((s) => s.closeContextMenu);
  const root = useStore((s) => s.root);
  const editMode = useStore((s) => s.editMode);
  const attach = useStore((s) => s.attachComponent);
  const alignSlot = useStore((s) => s.alignSlot);
  const duplicate = useStore((s) => s.duplicate);
  const remove = useStore((s) => s.remove);
  const toggleSlotLock = useStore((s) => s.toggleSlotLock);
  const dialog = useDialog();
  const beginRename = useStore((s) => s.beginRename);
  const t = useT();
  const language = useStore((s) => s.language);

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

  // Render one align button. Availability + the hover tooltip come from the
  // shared rule (alignAvailability), and a disabled <button> can't show its own
  // title in Chrome, so a wrapper span carries the tooltip — every greyed button
  // explains itself on hover.
  function renderAlignBtn(b: (typeof ALIGN_BUTTONS)[number]) {
    if (!slot) return null;
    const caption = t.align[b.caption];
    const title = t.align[b.title];
    const { disabled, tip } = alignAvailability(root, slot.id, editMode, b.axis, b.mode, title);
    return (
      <span key={b.title} title={tip} className={`block ${disabled ? "cursor-not-allowed" : ""}`}>
        <button
          aria-label={title}
          disabled={disabled}
          onClick={() => {
            alignSlot(slot.id, b.axis, b.mode);
            close();
          }}
          className="flex w-full flex-col items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-800 py-1 text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-sm leading-none">{b.label}</span>
          <span className="text-[9px] leading-none text-slate-400">{caption}</span>
        </button>
      </span>
    );
  }
  // Adding always spawns a NEW element at the bottom of the page (or the bottom
  // of the nearest nested container the click resolves to) — never onto the
  // clicked slot. So every component is always offered (nothing is "already
  // attached"), and the header names where the new element will land.
  const destId = resolveAddContainerId(root, ctx.slotId ?? null);
  const destSlot = findSlot(root, destId);
  const destIsRoot = destId === root.id;
  const destLabel = destIsRoot
    ? t.addMenu.bottomOfPage
    : t.addMenu.bottomOf(destSlot?.name ?? t.addMenu.container);

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
        // Above the sidebar menus / WhatsNew / mode dialog (z 50–150), but below
        // the confirm/alert dialogs (z 300) a context-menu action may open.
        zIndex: 200,
      }}
      className="w-64 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-xs shadow-2xl"
    >
      {slot ? (
        <div className="border-b border-slate-800 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            {isRoot ? t.contextMenu.canvas : t.contextMenu.slot}
          </div>
          <div className="truncate text-sm text-slate-100" title={slot.name}>
            {slot.name}
          </div>
        </div>
      ) : (
        <div className="border-b border-slate-800 px-3 py-2 text-[10px] text-slate-500">
          {t.contextMenu.selectSlotHint}
        </div>
      )}

      <div className="max-h-[70vh] overflow-y-auto">
        {/* Quick actions — hidden for structural backdrop slots (managed by the
            Background menu, not directly editable). */}
        {slot && !isRoot && !isStructuralSlot(slot) && (
          <Section label={t.contextMenu.quickActions}>
            <div className="grid grid-cols-2 gap-1">
              <ChipBtn
                onClick={() => {
                  beginRename(slot.id);
                  close();
                }}
                title={t.contextMenu.renameTip}
              >
                {t.contextMenu.rename}
              </ChipBtn>
              <ChipBtn
                onClick={() => {
                  duplicate(slot.id);
                  close();
                }}
                title={t.contextMenu.duplicateTip}
              >
                {t.contextMenu.duplicate}
              </ChipBtn>
              <ChipBtn
                onClick={() => {
                  toggleSlotLock(slot.id);
                  close();
                }}
                title={slot.locked ? t.contextMenu.unlockWord : t.contextMenu.lockWord}
              >
                {slot.locked ? t.contextMenu.unlock : t.contextMenu.lock}
              </ChipBtn>
              <ChipBtn
                danger
                onClick={async () => {
                  if (await dialog.confirm(t.dialogs.deleteSlot.messageSlot(slot.name), { destructive: true, confirmLabel: t.dialogs.deleteSlot.confirmLabel })) {
                    remove(slot.id);
                  }
                  close();
                }}
                title={t.contextMenu.deleteTip}
              >
                {t.contextMenu.delete}
              </ChipBtn>
            </div>
          </Section>
        )}

        {/* Align in Parent */}
        {slot && !isRoot && hasRT && !isStructuralSlot(slot) && (
          <Section
            label={t.contextMenu.alignInParent}
            hint={layoutManaged ? t.contextMenu.layoutManaged : undefined}
          >
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              {t.contextMenu.horizontal}
            </div>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {ALIGN_BUTTONS.filter((b) => b.axis === "h").map((b) =>
                renderAlignBtn(b),
              )}
            </div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              {t.contextMenu.vertical}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {ALIGN_BUTTONS.filter((b) => b.axis === "v").map((b) =>
                renderAlignBtn(b),
              )}
            </div>
          </Section>
        )}

        {/* Add Component — always lands as a new element at the bottom of the
            page (or the nearest nested container), never onto this slot. */}
        {slot && (
          <>
            <div className="border-b border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">
              {t.contextMenu.newElementsAddTo} <span className="text-slate-300">{destLabel}</span>
            </div>
            {PALETTE_GROUPS.map((g) => (
              <AddSection
                key={g.label}
                label={t.contextMenu.addGroup(localizedGroupLabel(g.label, language))}
                hint={g.hint}
                types={g.types.filter(isKnownPaletteItem)}
                onPick={addComponent}
              />
            ))}
            <AddSection
              label={t.contextMenu.addSystem}
              hint={t.contextMenu.rarelyNeeded}
              types={SYSTEM_TYPE_LIST}
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
  onPick,
}: {
  label: string;
  hint?: string;
  types: ReadonlyArray<PaletteItem>;
  onPick: (t: PaletteItem) => void;
}) {
  const tr = useT();
  const lang = useStore((s) => s.language);
  // Adding always spawns a fresh element at the destination, so every type is
  // always offered (nothing is ever "already attached").
  return (
    <Section label={label} hint={hint}>
      <div className="flex flex-wrap gap-1">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            title={tr.addMenu.addType(localizedComponentLabel(t, lang))}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 transition hover:border-sky-500 hover:text-sky-200"
          >
            + {localizedComponentLabel(t, lang)}
          </button>
        ))}
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
