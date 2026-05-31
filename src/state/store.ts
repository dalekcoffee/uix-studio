import { create } from "zustand";
import type { Slot, UixComponentType, UixDocument } from "../model/types";
import type { Vec2 } from "../model/components";
import {
  addChildSlot,
  addComponent,
  duplicateSlot,
  findParent,
  findSlot,
  isDescendant,
  moveSlotTo,
  newSlot,
  removeComponent,
  removeSlot,
  renameSlot,
  scaleSlotTree,
  setCanvasSize,
  toggleLock,
  updateComponentProp,
} from "../model/operations";
import { isStructuralSlot } from "../model/structural";
import { LABELLED_CONTROL_TYPES, controlLabelText } from "../model/controlName";
import { measureLabelWidth } from "../editor/textMeasure";
import { contentMinWidth, SNAP_GAP } from "../editor/render/contentMin";
import { INTERACTIVITY_COMPONENTS, isSlotClickable } from "../model/clickable";
import { createStarterTemplate } from "../model/template";
import { applyButtonPreset, type ButtonPresetId } from "../model/buttonPresets";
import { findPreset } from "../model/presets";
import { findBackgroundSlots, buildBackgroundTrio } from "../model/background";
import { SYSTEM_ICON_FLAGS } from "../model/systemIcons";
import { buildWidget, buildPopupContent, buildColumn, isWidgetType } from "../model/widgets";
import type { PaletteItem } from "../model/palette";
import {
  applyAccent,
  applyAll as applyAllTheme,
  applyBackground,
  applyBranding,
  applyBodyText,
  applyButtonA,
  applyButtonB,
  applyControlSurface,
  applyCornerRadius,
  applyHeaderText,
  applyPreset as applyThemePresetValues,
  defaultTheme,
  type Theme,
  type ThemePresetId,
} from "../model/theme";
import { APP_VERSION } from "../version";
import { computeAbsoluteRect, isLayoutManaged, rectToOffsets } from "../editor/render/slotRect";
import { computeChildRect, getRectTransform, type Rect } from "../editor/render/rectTransform";
import {
  findContainer,
  getContainers,
  groupRows,
  planFlow,
  reflowAbsolute,
  reflowLayoutOrder,
  rowItemsOf,
  rowsWithout,
  type DropSpec,
  type ReflowResult,
} from "../editor/render/snapFlow";

export type AlignAxis = "h" | "v";
export type AlignMode = "start" | "center" | "end" | "stretch";
export type EditMode = "snap" | "free";

// Margins (canvas px) used when auto-appending a new element below existing
// content and growing the canvas to fit it.
const APPEND_MARGIN = 24;
const APPEND_GAP = 16;

// A popup's editable content card is a direct child of the Canvas root, but it
// floats centered as an overlay — it must be excluded from the root's vertical
// flow, canvas auto-sizing, and resize re-anchoring.
function isPopupContentSlot(slot: Slot): boolean {
  return slot.components.some((c) => c.type === "PopupContent");
}

// Size every "Column" to its CONTENT height: sum of its children's preferred
// heights + spacing + padding. Without this the column keeps a fixed RT height
// and the layout engine scales the children DOWN to fit as more are added (they
// shrink). The column is top-anchored, so we keep the top edge (offsetMax.y) and
// extend the bottom (offsetMin.y) down. A child with no LayoutElement preferred
// height falls back to a row height. Returns same ref when no column changed.
function fitColumnHeights(root: Slot): Slot {
  const colIds: string[] = [];
  (function find(s: Slot) {
    if (s.name === "Column" && s.components.some((c) => c.type === "VerticalLayout")) colIds.push(s.id);
    s.children.forEach(find);
  })(root);
  if (colIds.length === 0) return root;
  const r: Slot = JSON.parse(JSON.stringify(root));
  for (const id of colIds) {
    const col = findSlot(r, id);
    if (!col) continue;
    const vl = col.components.find((c) => c.type === "VerticalLayout")?.props as
      | { spacing?: number; paddingTop?: number; paddingBottom?: number } | undefined;
    const spacing = vl?.spacing ?? 8;
    let h = (vl?.paddingTop ?? 0) + (vl?.paddingBottom ?? 0);
    col.children.forEach((ch, i) => {
      const le = ch.components.find((c) => c.type === "LayoutElement")?.props as
        | { preferredHeight?: number; minHeight?: number } | undefined;
      const ph = le && (le.preferredHeight ?? -1) > 0
        ? le.preferredHeight!
        : le && (le.minHeight ?? -1) > 0 ? le.minHeight! : 36;
      h += ph + (i > 0 ? spacing : 0);
    });
    const rt = col.components.find((c) => c.type === "RectTransform")?.props as
      | { offsetMin?: { x: number; y: number }; offsetMax?: { x: number; y: number } } | undefined;
    if (rt?.offsetMin && rt?.offsetMax) {
      rt.offsetMin = { ...rt.offsetMin, y: rt.offsetMax.y - h };
    }
  }
  return r;
}

// Unwrap any "Column" (VerticalLayout group) that's been reduced to ≤1 child —
// a column only earns its existence with 2+ stacked elements. A 1-child column
// is replaced in place by its remaining child; a 0-child one is removed. Returns
// the same root ref when nothing changed (so callers can skip a needless reflow).
function dissolveEmptyColumns(root: Slot): Slot {
  let r = root;
  for (;;) {
    let target: Slot | null = null;
    const find = (s: Slot) => {
      if (target) return;
      if (s.name === "Column" && s.components.some((c) => c.type === "VerticalLayout") && s.children.length <= 1) {
        target = s; return;
      }
      s.children.forEach(find);
    };
    find(r);
    if (!target) break;
    const col = target as Slot;
    const parent = findParent(r, col.id);
    if (!parent) break;
    const idx = parent.children.findIndex((c) => c.id === col.id);
    if (col.children.length === 1) r = moveSlotTo(r, col.children[0].id, parent.id, idx);
    r = removeSlot(r, col.id);
  }
  return r;
}

// "Scale contents OFF" resize: change the Canvas size while keeping every FRONT
// element's rendered pixel SIZE constant — the canvas just gains/loses empty
// space around them. Only the Canvas's direct children need re-anchoring;
// keeping each child's size fixed means its descendants (positioned relative to
// it) keep their rendered rects automatically, so no deeper recursion is needed.
//
// STRUCTURAL chrome (Background, Back Cover, Front Backing) is deliberately
// SKIPPED: it's the panel's backdrop and must grow/shrink WITH the canvas, not
// stay pinned. These layers use full-bleed stretch anchors, so leaving their
// offsets untouched lets them (and the back-side logo/credits, which the
// exporter rebuilds from the live canvas size) track the resize. Only the
// front-facing interactive elements stay put and anchored.
//
// `mode` decides where a (front) child moves as the canvas grows/shrinks:
//  - "free": the child follows the centre of its own anchor span, honouring
//    per-element anchoring (well-defined where elements are absolutely placed).
//  - "snap": the child's top-left corner stays fixed in canvas space and new
//    space opens toward the bottom-right — matching the top-down VerticalLayout
//    a snap panel lowers into in Resonite, so in-game editing stays consistent.
function resizeCanvasKeepingSizes(
  base: Slot,
  orig: { w: number; h: number },
  nw: number,
  nh: number,
  mode: EditMode,
): Slot {
  const next = setCanvasSize(base, nw, nh); // deep-clones
  if (orig.w <= 0 || orig.h <= 0) return next;
  const newParent: Rect = { x: 0, y: 0, w: nw, h: nh };
  const oldParent: Rect = { x: 0, y: 0, w: orig.w, h: orig.h };
  for (const child of next.children) {
    // Background layers stretch with the canvas — leave their offsets alone.
    if (isStructuralSlot(child)) continue;
    // The popup card floats centered (anchored 0.5,0.5); leave it untouched so
    // it stays the same size centered regardless of canvas size.
    if (isPopupContentSlot(child)) continue;
    const rtComp = child.components.find((c) => c.type === "RectTransform");
    if (!rtComp) continue;
    const rt = getRectTransform(child);
    const old = computeChildRect(oldParent, rt); // CSS-space local rect (y-down)
    let x: number;
    let y: number;
    if (mode === "snap") {
      // Pin top-left; canvas grows toward bottom-right.
      x = old.x;
      y = old.y;
    } else {
      // Follow the centre of the anchor span on each axis. Anchor centre in
      // CSS space: X = ax*W; Y(top-down) = (1 - ay)*H.
      const ax = (rt.anchorMin.x + rt.anchorMax.x) / 2;
      const ay = (rt.anchorMin.y + rt.anchorMax.y) / 2;
      const dx = old.x + old.w / 2 - ax * orig.w;
      const dy = old.y + old.h / 2 - (1 - ay) * orig.h;
      x = ax * nw + dx - old.w / 2;
      y = (1 - ay) * nh + dy - old.h / 2;
    }
    const { offsetMin, offsetMax } = rectToOffsets(
      { x, y, w: old.w, h: old.h },
      newParent,
      rt.anchorMin,
      rt.anchorMax,
    );
    rtComp.props = { ...rtComp.props, offsetMin, offsetMax };
  }
  return next;
}

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface SnapSettings {
  enabled: boolean;
  size: number;
  // Block-flow spacing: vertical gap between stacked rows. colGap is reserved
  // for future left→right re-packing within a row (not yet applied).
  rowGap: number;
  colGap: number;
}

interface State {
  root: Slot;
  selectedSlotId: string | null;
  history: Slot[];
  future: Slot[];
  _preDragRoot: Slot | null;
  collapsed: Record<string, boolean>;
  viewport: ViewportTransform;
  snap: SnapSettings;
  // "snap" (default): dragging a slot reorders it among its siblings, shifting
  // the others out of the way like a block editor. "free": classic absolute
  // drag (move to any x/y).
  editMode: EditMode;
  // When resizing the Canvas: false = keep every element's pixel size fixed and
  // only add/remove empty canvas space (re-anchored per edit mode); true = scale
  // every child proportionally so the whole panel grows/shrinks uniformly.
  scaleCanvasContents: boolean;
  // Non-null only while a Canvas resize handle is being dragged. Snapshot of the
  // viewport display, captured at drag start, that the Viewport pins for the
  // whole drag instead of recomputing each frame:
  //  - scale: the zoom — FREEZES zoom-to-fit so growing the canvas extends the
  //    panel in the drag direction instead of shrinking it to re-fit (which read
  //    as the panel "narrowing").
  //  - halfW/halfH: the centering half-extents — pins the preview's top-left in
  //    place so the panel grows down/right tracking the cursor 1:1, rather than
  //    expanding symmetrically about the centre (which made handles lag at half
  //    speed). Matches the resize model, which normalises the canvas origin to 0,0.
  // Cleared on drag end → the viewport re-fits and re-centres the final size once.
  canvasResizeView: { scale: number; halfW: number; halfH: number } | null;
  // Non-null while a drag is actively in progress (past the start threshold).
  // Lets the renderer animate gracefully: a snap-mode "flow" drag GLIDES blocks
  // into their new slots (transition on every slot) instead of teleporting,
  // while absolute "free"/"canvas" drags omit the transition so the manipulated
  // slot tracks the cursor 1:1 with no lag. Editor-only; cleared on drag end.
  liveDrag: { kind: "flow" | "free-move" | "free-resize" | "canvas-resize"; slotId: string } | null;
  // Set true whenever a free-mode move/resize edits a slot's position. Snap mode
  // reads this to warn before auto-arranging away manual free-mode positioning.
  // Reset to false whenever the user enters free mode (fresh slate) or after a
  // snap reflow consumes it.
  freeEditsDirty: boolean;
  showOverlays: boolean;
  leftPanelHidden: boolean;
  rightPanelHidden: boolean;
  contextMenu: { x: number; y: number; slotId: string | null } | null;
  // When set, the HierarchyTree row for this slot opens its inline rename editor
  // (the same one double-click uses). Lets the context-menu "Rename" action
  // drive the tree's editor. Cleared once the row consumes it.
  renamingSlotId: string | null;
  theme: Theme;
  // True when the document has unsaved changes since the last load / explicit
  // "Save Project". Drives the beforeunload guard and gates autosave (we only
  // persist — and only offer to restore — once the user has actually edited
  // something, so an untouched starter template never prompts a restore).
  dirty: boolean;
}

interface Actions {
  select: (id: string | null) => void;
  addChild: (parentId: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  alignSlot: (id: string, axis: AlignAxis, mode: AlignMode) => void;
  rename: (id: string, name: string) => void;
  // Open the hierarchy's inline rename editor for a slot (used by the context
  // menu). Reveals the row first: selects it, expands its ancestors, un-hides
  // the left panel. clearRenaming() resets the flag once the row enters editing.
  beginRename: (id: string) => void;
  clearRenaming: () => void;
  reparent: (id: string, newParentId: string, index: number) => void;
  toggleSlotLock: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  // `type` may be a widget-only pseudo-type (e.g. "Spinner") — those are always
  // routed through the buildWidget branch below and never hit the bare-component
  // paths, so the non-widget code can safely treat `type` as a UixComponentType.
  attachComponent: (slotId: string, type: PaletteItem) => void;
  detachComponent: (slotId: string, type: UixComponentType) => void;
  // Convert a graphic between static and clickable in one undo step. Clickable
  // adds a plain (transparent — no tint drift) Button whose resting color
  // mirrors the Image's tint; static removes the Button. The image's visual
  // settings are untouched either way, so conversion is lossless.
  setImageClickable: (slotId: string, clickable: boolean) => void;
  // Set a backdrop face's background. target "both" writes Front Backing (front
  // face) + Back Cover (back face); "front"/"back" write one. A color spec
  // drives the Image tint; an image spec drives customImageHash + fit. Both
  // mark the face `backgroundKind` so the Theme apply leaves it alone. For
  // target "both" with an image spec, returns {ok:false, reason:"mismatch"}
  // WITHOUT committing when the two faces already hold DIFFERENT images and
  // force isn't set, so the caller can confirm before overwriting.
  setBackground: (
    target: "both" | "front" | "back",
    spec:
      | { kind: "color"; color: { r: number; g: number; b: number; a: number } }
      | { kind: "image"; hash: string },
    opts?: { force?: boolean },
  ) => { ok: boolean; reason?: "mismatch" | "no-background" };
  // Set the background layout mode (fit/stretch/full) on the targeted face(s).
  setBackgroundFit: (target: "both" | "front" | "back", fit: "fit" | "stretch" | "full") => void;
  // Frame a "full" (cover) background: focal point (0..1) + zoom (≥1) on the
  // targeted face(s). Pass {live:true} during a drag (no history); bracket the
  // gesture with dragStart()/dragCommit() for a single undo step.
  setBackgroundCrop: (
    target: "both" | "front" | "back",
    crop: { focus?: { x: number; y: number }; zoom?: number },
    opts?: { live?: boolean },
  ) => void;
  // Set the FRONT panel transparency by driving the alpha of the front-visible
  // backdrop stack — the Front Backing AND the shared Background slot, which
  // blend together from the front (mirrors how the Frosted theme dims the whole
  // front stack). The Back Cover is the rear OCCLUDER (clamped opaque at export),
  // so it is never faded here. alpha 1 = solid, 0 = fully clear. Pass {live:true}
  // during a drag (no history); bracket the gesture with dragStart()/dragCommit().
  setBackgroundOpacity: (
    target: "both" | "front" | "back",
    alpha: number,
    opts?: { live?: boolean },
  ) => void;
  // Inject the Background chrome trio on a document that lacks it (old saves).
  ensureBackgroundTrio: () => void;
  applyButtonPreset: (slotId: string, preset: ButtonPresetId) => void;
  setProp: (slotId: string, type: UixComponentType, key: string, value: unknown) => void;
  setProps: (slotId: string, type: UixComponentType, entries: [string, unknown][]) => void;
  dragStart: () => void;
  dragApply: (slotId: string, offsetMin: Vec2, offsetMax: Vec2) => void;
  dragCommit: () => void;
  // Commit a snap-mode in-row horizontal nudge: place the element at `target`
  // and pin it horizontally (collapse anchors to its centre fraction, like
  // Align-in-parent) so it holds position when the canvas resizes. One undo
  // step; reflows from the pre-drag snapshot so siblings stay untouched.
  nudgeCommit: (slotId: string, target: Rect) => void;
  // Mark a drag as live (or clear with null) so the renderer can glide vs track.
  setLiveDrag: (d: State["liveDrag"]) => void;
  undo: () => void;
  redo: () => void;
  loadDocument: (doc: UixDocument) => void;
  loadPreset: (presetId: string) => void;
  documentSnapshot: () => UixDocument;
  reset: () => void;
  // Clear the unsaved-changes flag — called after an explicit "Save Project" so
  // the beforeunload guard stops warning until the next edit.
  markClean: () => void;
  setViewport: (v: Partial<ViewportTransform>) => void;
  resetViewport: () => void;
  setSnap: (s: Partial<SnapSettings>) => void;
  setEditMode: (mode: EditMode) => void;
  setScaleCanvasContents: (on: boolean) => void;
  // Pin (snapshot) / release (null) the viewport display during a Canvas resize.
  setCanvasResizeView: (view: { scale: number; halfW: number; halfH: number } | null) => void;
  // Live-resize the Canvas during a handle drag. Recomputes from the pre-drag
  // snapshot each call (no compounding); scales contents too when
  // scaleCanvasContents is on. Bracket with dragStart()/dragCommit().
  resizeCanvasLive: (w: number, h: number) => void;
  // Reflow siblings under `parentId` to the given order, snapping each to the
  // supplied canvas-space rect. Live (no history) — bracket with
  // dragStart()/dragCommit() so the whole gesture is one undo step. Used by
  // snap-mode drag to shift blocks out of the way as the cursor moves.
  reorderLive: (parentId: string, orderedIds: string[], rectById: Record<string, Rect>) => void;
  // Snap-mode block-flow apply. Given a precomputed ReflowResult (target rects +
  // child order, produced by snapFlow against the pre-drag snapshot), apply it
  // to `containerId`: absolute containers (Canvas root) get RectTransform
  // offsets + a canvas grow; layout containers (ScrollArea…) get a child-order
  // reorder. Always reflows from _preDragRoot so repeated moves don't compound.
  // Bracket with dragStart()/dragCommit() for one undo step.
  reflowLive: (containerId: string, result: ReflowResult) => void;
  // Cross-container flow drop: reparent the dragged element(s) into
  // targetContainerId at the given drop, then reflow BOTH the target and the
  // source container so each lays out cleanly. Live (off _preDragRoot) — bracket
  // with dragStart()/dragCommit(). Powers pull-in/pull-out of scroll areas.
  flowReparent: (draggedIds: string[], targetContainerId: string, drop: DropSpec) => void;
  // Ensure a popup host (a slot carrying a Popup component) has an editable
  // content card. If its Popup.contentSlotId is missing or stale, build a
  // PopupContent container from the Popup's title/body/dismiss strings + current
  // theme, append it as a centered Canvas-root child, and link it. No-op if the
  // content slot already exists. One undoable commit. Called when entering popup
  // editing (selecting the host).
  ensurePopupContent: (hostId: string) => void;
  // Stack the dragged element into a vertical Column beside a TALL element: group
  // the short member(s) + the dragged element into a VerticalLayout column (or add
  // to an existing one), placed where the short member was. `place` = where the
  // dragged element lands in the column. One undoable commit; reflows after.
  groupIntoColumn: (shortIds: string[], draggedId: string, place: "top" | "bottom") => void;
  // Unwrap any Column reduced to ≤1 child (after an element was dragged out).
  // No-op + no history entry when nothing changed. Reflows after.
  dissolveColumns: () => void;
  // Widen the canvas just enough to place `draggedIds` side-by-side with the
  // members of the row they were dropped beside (`rowIds`), then perform the
  // merge. Used by the "widen panel to fit" affordance when a side-by-side was
  // rejected for lack of room. Only the absolute root canvas is widened. One
  // undoable commit.
  widenCanvasAndMerge: (containerId: string, rowIds: string[], draggedIds: string[]) => void;
  // Restore the live root to the pre-drag snapshot WITHOUT clearing it (so the
  // drag can continue). Used when a flow drag's cursor leaves the source
  // container — the source's live reflow is undone before previewing the target.
  restorePreDrag: () => void;
  // Clear the free-mode dirty flag (after a confirmed snap reflow).
  clearFreeEdits: () => void;
  // Abort an in-progress drag: restore the pre-drag snapshot without adding a
  // history entry.
  cancelDrag: () => void;
  // Tidy the top-level (non-structural) rows into a clean vertical stack in
  // their current top→bottom order, removing overlaps and normalizing gaps.
  // One undoable commit. Grows the canvas to fit.
  autoArrange: () => void;
  toggleOverlays: () => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  openContextMenu: (x: number, y: number, slotId: string | null) => void;
  closeContextMenu: () => void;
  // Theme actions. setTheme stores values without touching the tree;
  // applyThemeAll / applyThemePart push values into matching slots and
  // commit() to history so it can be undone.
  setTheme: (partial: Partial<Theme>) => void;
  selectThemePreset: (preset: ThemePresetId) => void;
  applyThemeAll: () => void;
  applyThemeBackground: () => void;
  applyThemeHeaderText: () => void;
  applyThemeBodyText: () => void;
  applyThemeAccent: () => void;
  applyThemeControlSurface: () => void;
  applyThemeButtonA: () => void;
  applyThemeButtonB: () => void;
  applyThemeCornerRadius: () => void;
  applyBranding: () => void;
}

const HISTORY_LIMIT = 100;
const DEFAULT_VIEWPORT: ViewportTransform = { zoom: 1, panX: 0, panY: 0 };

export const useStore = create<State & Actions>((set, get) => {
  function commit(next: Slot) {
    set((s) => ({
      history: [...s.history, s.root].slice(-HISTORY_LIMIT),
      future: [],
      root: next,
      dirty: true,
    }));
  }

  // The Canvas slot owns the panel-wide setup (Canvas + RectTransform +
  // BoxCollider, plus cross-component ID wiring). We start it locked so the
  // user doesn't accidentally drop a Text/Image straight on it — those should
  // live on their own child slots. The user can still unlock from the
  // Hierarchy if they really need to edit it.
  function lockRoot(slot: Slot): Slot {
    if (slot.locked) return slot;
    return { ...slot, locked: true };
  }

  function collectAllSlotIds(slot: Slot, out: string[] = []): string[] {
    out.push(slot.id);
    for (const c of slot.children) collectAllSlotIds(c, out);
    return out;
  }

  function canvasSizeOf(root: Slot): { w: number; h: number } {
    const c = root.components.find((c) => c.type === "Canvas");
    const p = c?.props as { sizeX?: number; sizeY?: number } | undefined;
    return { w: p?.sizeX ?? 800, h: p?.sizeY ?? 600 };
  }

  // Reorder a container's children to match `order` (the snap block-flow's
  // top→bottom, left→right sequence), leaving any non-listed (structural)
  // children pinned in their original array slots. Clones, so it's safe to call
  // on a history snapshot. Mirrors the reorderLive interleave pattern.
  function reorderContainerChildren(root: Slot, containerId: string, order: string[]): Slot {
    if (order.length === 0) return root;
    const r: Slot = JSON.parse(JSON.stringify(root));
    const c = findSlot(r, containerId);
    if (!c) return root;
    const orderSet = new Set(order);
    const byId = new Map(c.children.map((ch) => [ch.id, ch] as const));
    const queue = [...order];
    c.children = c.children.map((ch) =>
      orderSet.has(ch.id) && queue.length ? byId.get(queue.shift()!)! : ch,
    );
    // Layout containers (ScrollArea, *Layout) position children by their
    // LayoutElement.orderOffset, NOT array order (the layout engine re-sorts by
    // it). So a bare array reorder is INVISIBLE in the preview — the dragged
    // block snaps back to its old slot and never glides. Renumber orderOffset to
    // match the new array order so the layout engine reflects the reorder. This
    // field is editor-only (the exporter derives order from hierarchy index, not
    // this), so syncing it has no effect on the exported package.
    c.children.forEach((ch, i) => {
      const le = ch.components.find((cmp) => cmp.type === "LayoutElement");
      if (le) (le.props as { orderOffset?: number }).orderOffset = i;
    });
    return r;
  }

  // Apply a ReflowResult to a container: write RectTransform offsets + grow the
  // canvas for absolute containers; reorder children for both. Returns the new
  // root. Shared by reflowLive / flowReparent / autoArrange.
  function applyResultToContainer(
    next: Slot,
    container: { id: string; strategy: "absolute" | "layout"; isRoot: boolean; absRect: Rect },
    result: ReflowResult,
    canvasSize: { w: number; h: number },
    // When true, resize the root canvas to EXACTLY fit the arranged content
    // (shrink as well as grow) so a tidy-up leaves no trailing dead space.
    // Live drags pass false: grow-only, so the canvas never jumps smaller out
    // from under the cursor mid-gesture.
    fitCanvas = false,
  ): Slot {
    if (container.strategy === "absolute") {
      // Resize the canvas FIRST so offsets are computed against the FINAL parent
      // height. Otherwise anchored children (top/stretch anchors) re-derive
      // against a different canvas than the one the offsets were solved for and
      // drift/inflate. parentAbs therefore carries the final height.
      const fitH = Math.ceil(result.contentBottom);
      const targetH = !container.isRoot
        ? canvasSize.h
        : fitCanvas
          ? fitH // fit exactly (shrink or grow)
          : fitH > canvasSize.h
            ? fitH // grow only
            : canvasSize.h;
      if (targetH !== canvasSize.h) next = setCanvasSize(next, canvasSize.w, targetH);
      const parentAbs = { ...container.absRect, h: targetH };
      for (const id of Object.keys(result.rects)) {
        const slot = findSlot(next, id);
        const target = result.rects[id];
        if (!slot || !target) continue;
        const rt = getRectTransform(slot);
        const { offsetMin, offsetMax } = rectToOffsets(target, parentAbs, rt.anchorMin, rt.anchorMax);
        next = updateComponentProp(next, id, "RectTransform", "offsetMin", offsetMin);
        next = updateComponentProp(next, id, "RectTransform", "offsetMax", offsetMax);
      }
      // Layer 2 — dead-space trim: group the arranged members into rows; a
      // labeled composite that shares a row with others gets its label hugged to
      // the control (compact), a lone one is restored to the spread layout. This
      // collapses the empty space between a label and its control when packed
      // side-by-side, and reverses it when an element is alone again.
      const items = Object.keys(result.rects).map((id) => ({ id, rect: result.rects[id] }));
      for (const row of groupRows(items)) {
        const packed = row.ids.length > 1;
        for (const id of row.ids) next = reanchorLabeledComposite(next, id, packed);
      }
    }
    return reorderContainerChildren(next, container.id, result.order);
  }

  // Re-lay a labeled composite's internals for the given wrapper state: when
  // `packed` (side-by-side), the label becomes a tight right-anchored box hugging
  // the control with dead space to its left; when alone, the authored spread
  // layout (label stretches from the left edge to just before the control) is
  // restored. Only the simple "Label + one control" shape is handled; multi-part
  // composites (Radio Group, keypad) are left untouched. Deterministic from the
  // control's width + measured label text, so it's idempotent and reversible.
  function reanchorLabeledComposite(root: Slot, slotId: string, packed: boolean): Slot {
    const slot = findSlot(root, slotId);
    if (!slot || !LABELLED_CONTROL_TYPES.has(slot.name)) return root;
    const label = slot.children.find((c) => c.name === "Label");
    if (!label) return root;
    const controls = slot.children.filter(
      (c) => c !== label && c.components.some((k) => k.type === "RectTransform"),
    );
    if (controls.length !== 1) return root; // skip multi-part composites
    const crt = getRectTransform(controls[0]);
    const controlW = Math.abs((crt.offsetMax?.x ?? 0) - (crt.offsetMin?.x ?? 0));
    if (controlW <= 0) return root;
    const lrt = getRectTransform(label);
    const fontPx = (label.components.find((k) => k.type === "Text")?.props as { size?: number } | undefined)?.size ?? 14;
    const labelW = measureLabelWidth(controlLabelText(slot), fontPx);
    const reserve = controlW + SNAP_GAP;
    const aMin = { x: packed && labelW > 0 ? 1 : 0, y: lrt.anchorMin.y };
    const aMax = { x: 1, y: lrt.anchorMax.y };
    const oMin = { x: packed && labelW > 0 ? -(reserve + labelW) : 0, y: lrt.offsetMin.y };
    const oMax = { x: -reserve, y: lrt.offsetMax.y };
    let r = updateComponentProp(root, label.id, "RectTransform", "anchorMin", aMin);
    r = updateComponentProp(r, label.id, "RectTransform", "anchorMax", aMax);
    r = updateComponentProp(r, label.id, "RectTransform", "offsetMin", oMin);
    r = updateComponentProp(r, label.id, "RectTransform", "offsetMax", oMax);
    return r;
  }

  // Build the content-based minimum-width map for a container's members, used to
  // trim dead space (not squish) and to gate "does this fit side-by-side?".
  function minWidthsFor(
    root: Slot,
    container: { id: string },
    canvasSize: { w: number; h: number },
  ): Record<string, number> {
    const c = findSlot(root, container.id);
    if (!c) return {};
    const widthOf = (s: Slot) => computeAbsoluteRect(root, s.id, canvasSize)?.w ?? 0;
    const out: Record<string, number> = {};
    for (const child of c.children) {
      if (isStructuralSlot(child) || isPopupContentSlot(child)) continue;
      out[child.id] = contentMinWidth(child, widthOf);
    }
    return out;
  }

  // CSS-top Y of the lowest edge of any non-structural top-level content. Used
  // to know where to drop a freshly added element.
  function bottomOfContent(root: Slot, canvasSize: { w: number; h: number }): number {
    let maxBottom = APPEND_MARGIN;
    for (const child of root.children) {
      if (isStructuralSlot(child)) continue;
      if (isPopupContentSlot(child)) continue; // centered overlay, not in flow
      const r = computeAbsoluteRect(root, child.id, canvasSize);
      if (r) maxBottom = Math.max(maxBottom, r.y + r.h);
    }
    return maxBottom;
  }

  // Repositions a slot's RectTransform to a top-anchored, horizontally-centered
  // row sitting at CSS-top `top`, preserving the slot's current width/height.
  // Returns the slot's height so the caller can grow the canvas if needed.
  function placeRowAtTop(child: Slot, top: number): number {
    const rt = child.components.find((c) => c.type === "RectTransform");
    if (!rt) return 0;
    const p = rt.props as Record<string, any>;
    const w =
      Math.abs((p.offsetMax?.x ?? 100) - (p.offsetMin?.x ?? -100)) || 200;
    const h = Math.abs((p.offsetMax?.y ?? 75) - (p.offsetMin?.y ?? -75)) || 150;
    rt.props = {
      ...p,
      anchorMin: { x: 0.5, y: 1 },
      anchorMax: { x: 0.5, y: 1 },
      offsetMin: { x: -w / 2, y: -(top + h) },
      offsetMax: { x: w / 2, y: -top },
      pivot: { x: 0.5, y: 0.5 },
    };
    return h;
  }

  // Drop a freshly built child at the bottom of existing content and grow the
  // canvas to fit. Returns the root with the child added.
  //
  // `grow` (default true) controls the canvas-fit step. The snap path passes
  // false: growing the canvas here would slide bottom/centre-anchored siblings
  // (e.g. a bottom-anchored "Buttons" row) DOWN into the new element's vertical
  // band, so the subsequent groupRows would wrongly cluster them and re-pack the
  // newcomer off-canvas. Leaving the canvas untouched keeps every sibling at its
  // designed position; snapReflowRoot then reads stable rects and grows the
  // canvas itself via the reflow's contentBottom.
  function appendChildAtBottom(root: Slot, child: Slot, grow = true): Slot {
    const canvasSize = canvasSizeOf(root);
    const top = bottomOfContent(root, canvasSize) + APPEND_GAP;
    const h = placeRowAtTop(child, top);
    let next = addChildSlot(root, root.id, child);
    const needed = top + h + APPEND_MARGIN;
    if (grow && needed > canvasSize.h) {
      // Grow the canvas DOWNWARD to fit the new bottom row — but via
      // resizeCanvasKeepingSizes, NOT raw setCanvasSize. A bare setCanvasSize only
      // changes the canvas dimensions; any child anchored to the full canvas
      // (anchorMin 0,0 / anchorMax 1,1 — exactly what every preset's `rectRT`
      // helper emits) then STRETCHES with it, so a 40px pill balloons into a giant
      // blob and the whole scene "explodes" on add. resizeCanvasKeepingSizes
      // re-derives each child's offsets so it keeps its pixel size. "snap" =
      // top-left pinning, which is what we always want for an append (the canvas
      // only ever extends at the bottom, so existing content should stay put) —
      // independent of the editor's actual Snap/Free mode.
      next = resizeCanvasKeepingSizes(next, canvasSize, canvasSize.w, needed, "snap");
    }
    return next;
  }

  // Snap-mode tidy after adding (or duplicating) top-level content: reflow the
  // root's non-structural rows into a clean, overlap-free vertical stack using
  // the SAME engine as auto-arrange and live drag. Without this, a freshly
  // appended element only sits below the *current* bottom — when the canvas
  // grows, anchored siblings shift and can end up under it, so the user had to
  // grab-and-nudge the new element to trigger a reflow. Grow-only (fitCanvas
  // false) so a plain add never shrinks a canvas the user sized on purpose.
  // Free mode skips this (callers guard on editMode) — absolute placement and
  // intentional overlaps are the user's to manage there.
  function snapReflowRoot(root: Slot): Slot {
    root = fitColumnHeights(root); // columns size to their content before reflow
    const canvasSize = canvasSizeOf(root);
    const rootC = getContainers(root, canvasSize).find((c) => c.isRoot);
    if (!rootC) return root;
    const items = rowItemsOf(root, rootC, canvasSize);
    if (items.length === 0) return root;
    const rows = groupRows(items);
    const rowItems: Record<string, Rect> = {};
    for (const it of items) rowItems[it.id] = it.rect;
    const result = reflowAbsolute(rows, rowItems, {
      rowGap: get().snap.rowGap,
      colGap: get().snap.colGap,
      anchorY: rows[0].top,
      bottomMargin: APPEND_MARGIN,
      bounds: { left: rootC.absRect.x, right: rootC.absRect.x + rootC.absRect.w },
      minWidths: minWidthsFor(root, rootC, canvasSize),
    });
    return applyResultToContainer(root, rootC, result, canvasSize);
  }

  // Default collapse state — root expanded so the user sees the Canvas's
  // immediate children, every nested slot collapsed. Real templates have ~30
  // slots that fully expanded would dwarf the panel and bury the actual
  // top-level structure; collapsed-by-default keeps the hierarchy scannable.
  function defaultCollapsed(root: Slot): Record<string, boolean> {
    const ids = collectAllSlotIds(root);
    const map: Record<string, boolean> = {};
    for (let i = 1; i < ids.length; i++) map[ids[i]] = true;
    return map;
  }

  const initialRoot = lockRoot(createStarterTemplate());
  return {
    root: initialRoot,
    selectedSlotId: null,
    history: [],
    future: [],
    _preDragRoot: null,
    collapsed: defaultCollapsed(initialRoot),
    viewport: { ...DEFAULT_VIEWPORT },
    snap: { enabled: false, size: 8, rowGap: 12, colGap: 12 },
    editMode: "snap",
    scaleCanvasContents: true,
    canvasResizeView: null,
    liveDrag: null,
    freeEditsDirty: false,
    showOverlays: true,
    leftPanelHidden: false,
    rightPanelHidden: false,
    contextMenu: null,
    renamingSlotId: null,
    theme: defaultTheme(),
    dirty: false,

    select: (id) => set({ selectedSlotId: id }),

    addChild: (parentId) => {
      const child = newSlot("Slot");
      child.components.push({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 },
          anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 },
          offsetMax: { x: 0, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const next = addChildSlot(get().root, parentId, child);
      commit(next);
      set({ selectedSlotId: child.id });
    },

    remove: (id) => {
      if (get().root.id === id) return;
      // Structural backdrop slots are hidden from the tree and managed by the
      // Background menu — never deletable via keyboard/context menu.
      { const s = findSlot(get().root, id); if (s && isStructuralSlot(s)) return; }
      const next = removeSlot(get().root, id);
      commit(next);
      if (get().selectedSlotId === id) set({ selectedSlotId: null });
    },

    duplicate: (id) => {
      if (get().root.id === id) return;
      { const s = findSlot(get().root, id); if (s && isStructuralSlot(s)) return; }
      const { root: next, newId } = duplicateSlot(get().root, id);
      if (!newId) return;
      commit(next);
      set({ selectedSlotId: newId });
    },

    alignSlot: (id, axis, mode) => {
      const r = get().root;
      if (r.id === id) return;
      const slot = findSlot(r, id);
      const parent = findParent(r, id);
      if (!slot || !parent) return;
      if (isLayoutManaged(r, id)) return;
      const canvasComp = r.components.find((c) => c.type === "Canvas");
      const cp = canvasComp?.props as { sizeX?: number; sizeY?: number } | undefined;
      const canvasSize = { w: cp?.sizeX ?? 800, h: cp?.sizeY ?? 600 };
      const parentAbs = computeAbsoluteRect(r, parent.id, canvasSize);
      const slotAbs = computeAbsoluteRect(r, id, canvasSize);
      if (!parentAbs || !slotAbs) return;
      const rt = getRectTransform(slot);
      const newAnchorMin = { ...rt.anchorMin };
      const newAnchorMax = { ...rt.anchorMax };
      const newRect = { ...slotAbs };

      if (mode === "stretch") {
        if (axis === "h") {
          newAnchorMin.x = 0;
          newAnchorMax.x = 1;
          newRect.x = parentAbs.x;
          newRect.w = parentAbs.w;
        } else {
          newAnchorMin.y = 0;
          newAnchorMax.y = 1;
          newRect.y = parentAbs.y;
          newRect.h = parentAbs.h;
        }
      } else if (axis === "h") {
        const free = parentAbs.w - slotAbs.w;
        const rel = mode === "start" ? 0 : mode === "end" ? free : free / 2;
        // Collapse horizontal anchors to a single point at the alignment side
        // so the element stays pinned even if the canvas resizes.
        const a = mode === "start" ? 0 : mode === "end" ? 1 : 0.5;
        newAnchorMin.x = a;
        newAnchorMax.x = a;
        newRect.x = parentAbs.x + rel;
      } else {
        const free = parentAbs.h - slotAbs.h;
        const rel = mode === "start" ? 0 : mode === "end" ? free : free / 2;
        // axis "v": "start" = Top, "end" = Bottom in CSS terms.
        // Resonite is Y-up: anchor.y=1 is top edge, 0 is bottom edge.
        const a = mode === "start" ? 1 : mode === "end" ? 0 : 0.5;
        newAnchorMin.y = a;
        newAnchorMax.y = a;
        newRect.y = parentAbs.y + rel;
      }

      const { offsetMin, offsetMax } = rectToOffsets(
        newRect,
        parentAbs,
        newAnchorMin,
        newAnchorMax,
      );
      let next = updateComponentProp(r, id, "RectTransform", "anchorMin", newAnchorMin);
      next = updateComponentProp(next, id, "RectTransform", "anchorMax", newAnchorMax);
      next = updateComponentProp(next, id, "RectTransform", "offsetMin", offsetMin);
      next = updateComponentProp(next, id, "RectTransform", "offsetMax", offsetMax);
      commit(next);
    },

    rename: (id, name) => commit(renameSlot(get().root, id, name)),

    beginRename: (id) => {
      // Expand the ancestor chain so the target row is rendered in the tree.
      const r = get().root;
      { const s = findSlot(r, id); if (s && isStructuralSlot(s)) return; }
      const collapsed = { ...get().collapsed };
      let p = findParent(r, id);
      while (p) {
        delete collapsed[p.id];
        p = findParent(r, p.id);
      }
      set({ renamingSlotId: id, selectedSlotId: id, collapsed, leftPanelHidden: false });
    },

    clearRenaming: () => set({ renamingSlotId: null }),

    reparent: (id, newParentId, index) => {
      if (id === newParentId) return;
      if (isDescendant(get().root, id, newParentId)) return;
      commit(moveSlotTo(get().root, id, newParentId, index));
    },

    toggleSlotLock: (id) => commit(toggleLock(get().root, id)),

    toggleCollapsed: (id) =>
      set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),

    collapseAll: () => {
      const ids = collectAllSlotIds(get().root);
      const map: Record<string, boolean> = {};
      // Don't collapse the root — collapsing it would hide the whole tree.
      for (let i = 1; i < ids.length; i++) map[ids[i]] = true;
      set({ collapsed: map });
    },

    expandAll: () => set({ collapsed: {} }),

    attachComponent: (slotId, type) => {
      const r = get().root;
      const targetIsRoot = !slotId || slotId === r.id;
      // Composite controls (Checkbox, Toggle, Slider, …) are multi-slot widgets,
      // not single components. Build the full source-of-truth subtree (matching
      // the Experimental Panel — Box+CheckIcon for a checkbox, Pill+Knob for a
      // toggle, etc.) and nest it under the target. Adding a bare marker
      // produced a blank/non-functional control.
      if (isWidgetType(type)) {
        const parentId = targetIsRoot ? r.id : slotId!;
        const widget = buildWidget(type, findSlot(r, parentId)?.children.length ?? r.children.length, get().theme.buttonA);
        if (widget) {
          // Under the Canvas, drop the widget below existing content. On a
          // normal slot, just nest it as-is. Snap mode reflows so the new
          // element shifts the others into a clean stack instead of relying on
          // anchors (which can leave it overlapping); it appends WITHOUT growing
          // the canvas (the reflow grows it) — see appendChildAtBottom.
          const snapMode = targetIsRoot && get().editMode === "snap";
          let next = targetIsRoot
            ? appendChildAtBottom(r, widget, !snapMode)
            : addChildSlot(r, parentId, widget);
          if (snapMode) next = snapReflowRoot(next);
          commit(next);
          set({ selectedSlotId: widget.id });
          return;
        }
      }
      // Past the widget guard, every remaining type is a real single component
      // (widget-only pseudo-types like "Spinner" returned above), so narrow.
      const ct = type as UixComponentType;
      // If the user is adding a component while the Canvas (root) is selected
      // or nothing is selected, create a fresh child slot to hold it instead
      // of polluting the Canvas slot itself. Matches the user-facing rule:
      // "the Canvas is locked — components go on their own slots". The new slot
      // is appended below existing content (200×150 row) and the canvas grows
      // to fit — so a burst of adds stacks downward instead of piling up at the
      // center.
      if (targetIsRoot) {
        const child = newSlot(ct === "Spacer" ? "Spacer" : ct);
        if (ct === "Spacer") {
          // A thin, near-full-width row: invisible filler that reserves height.
          const w = Math.max(40, canvasSizeOf(r).w - 48);
          child.components.push({
            type: "RectTransform",
            props: {
              anchorMin: { x: 0.5, y: 0.5 },
              anchorMax: { x: 0.5, y: 0.5 },
              offsetMin: { x: -w / 2, y: -16 },
              offsetMax: { x: w / 2, y: 16 },
              pivot: { x: 0.5, y: 0.5 },
            },
          });
        } else {
          child.components.push({
            type: "RectTransform",
            props: {
              anchorMin: { x: 0.5, y: 0.5 },
              anchorMax: { x: 0.5, y: 0.5 },
              offsetMin: { x: -100, y: -75 },
              offsetMax: { x: 100, y: 75 },
              pivot: { x: 0.5, y: 0.5 },
            },
          });
        }
        const snapMode = get().editMode === "snap";
        // Snap mode appends without growing the canvas (the reflow grows it),
        // so anchored siblings don't slide into the newcomer's band.
        let next = appendChildAtBottom(r, child, !snapMode);
        next = addComponent(next, child.id, ct);
        if (snapMode) next = snapReflowRoot(next);
        commit(next);
        set({ selectedSlotId: child.id });
        return;
      }
      commit(addComponent(r, slotId, ct));
    },

    detachComponent: (slotId, type) => commit(removeComponent(get().root, slotId, type)),

    setImageClickable: (slotId, clickable) => {
      const r0 = get().root;
      const slot = findSlot(r0, slotId);
      if (!slot) return;
      if (clickable === isSlotClickable(slot)) return; // already in requested state
      if (clickable) {
        // addComponent attaches a Button (and only injects a transparent Image
        // if the slot lacks one). Sync the Button's resting color to the
        // graphic's tint so the two never disagree.
        let next = addComponent(r0, slotId, "Button");
        const image = findSlot(next, slotId)?.components.find((c) => c.type === "Image");
        const tint = (image?.props as { tint?: unknown } | undefined)?.tint;
        if (tint) next = updateComponentProp(next, slotId, "Button", "normalColor", tint);
        // A clickable graphic must not read as a "drop image here" placeholder,
        // so auto-remove it. The manual flag is left untouched so a hand-removed
        // placeholder stays removed across clickable toggles.
        next = updateComponentProp(next, slotId, "Image", "placeholderRemoved", true);
        commit(next);
      } else {
        // Make static = strip every interactivity component and the URL prop,
        // so close/popup/link graphics fully revert. One undo step.
        let next = r0;
        for (const t of INTERACTIVITY_COMPONENTS) next = removeComponent(next, slotId, t);
        if (slot.components.some((c) => c.type === "Image")) {
          next = updateComponentProp(next, slotId, "Image", "hyperlinkUrl", "");
          next = updateComponentProp(next, slotId, "Image", "hyperlinkReason", "");
          // Reverting to static returns the placeholder — unless the user
          // removed it by hand (placeholderUserRemoved), which always wins.
          const img = slot.components.find((c) => c.type === "Image");
          const userRemoved = (img?.props as { placeholderUserRemoved?: unknown } | undefined)?.placeholderUserRemoved === true;
          if (!userRemoved) {
            next = updateComponentProp(next, slotId, "Image", "placeholderRemoved", false);
          }
        }
        commit(next);
      }
    },

    setBackground: (target, spec, opts) => {
      const r0 = get().root;
      const { background, frontBacking, backCover } = findBackgroundSlots(r0);
      if (!frontBacking && !backCover) return { ok: false, reason: "no-background" };
      const facesFor = (t: typeof target) =>
        (t === "front" ? [frontBacking] : t === "back" ? [backCover] : [frontBacking, backCover]).filter(
          (s): s is NonNullable<typeof s> => !!s,
        );
      const targets = facesFor(target);
      const clearFlags = SYSTEM_ICON_FLAGS.map((f) => [f, false] as [string, unknown]);
      let next = r0;
      if (spec.kind === "image") {
        // Mismatch guard only when applying ONE image to BOTH faces that
        // already differ — overwriting would discard a deliberate front≠back.
        if (target === "both" && !opts?.force) {
          const hashOf = (s: typeof frontBacking) =>
            ((s?.components.find((c) => c.type === "Image")?.props as { customImageHash?: string } | undefined)
              ?.customImageHash) ?? "";
          const fHash = hashOf(frontBacking);
          const bHash = hashOf(backCover);
          if (fHash && bHash && fHash !== bHash) return { ok: false, reason: "mismatch" };
        }
        for (const s of targets) {
          const img = s.components.find((c) => c.type === "Image");
          next = updateComponentProp(next, s.id, "Image", "customImageHash", spec.hash);
          next = updateComponentProp(next, s.id, "Image", "backgroundKind", spec.hash ? "image" : undefined);
          // Default a freshly-applied background image to "full" (cover);
          // preserve an existing fit choice on re-apply.
          if (spec.hash && (img?.props as { backgroundFit?: unknown } | undefined)?.backgroundFit === undefined) {
            next = updateComponentProp(next, s.id, "Image", "backgroundFit", "full");
          }
          // A stray system-icon flag would otherwise win over the custom image.
          if (spec.hash) for (const [k, v] of clearFlags) next = updateComponentProp(next, s.id, "Image", k, v);
        }
      } else {
        // Solid color → the Image tint, and clear any image so the color shows.
        for (const s of targets) {
          next = updateComponentProp(next, s.id, "Image", "tint", spec.color);
          next = updateComponentProp(next, s.id, "Image", "customImageHash", "");
          next = updateComponentProp(next, s.id, "Image", "backgroundKind", "color");
        }
        // Keep the shared Background slot's tint (color AND alpha) in lockstep
        // with the FRONT face: once the front is translucent it blends over this
        // slot, so a mismatched tint would muddy the see-through look. Color-only
        // (no backgroundKind), so a later Theme switch still repaints it. Skipped
        // for the back-only target (the rear occluder doesn't blend with this).
        if (target !== "back" && background) {
          next = updateComponentProp(next, background.id, "Image", "tint", spec.color);
        }
      }
      commit(next);
      return { ok: true };
    },

    setBackgroundFit: (target, fit) => {
      const r0 = get().root;
      const { frontBacking, backCover } = findBackgroundSlots(r0);
      const faces = (target === "front" ? [frontBacking] : target === "back" ? [backCover] : [frontBacking, backCover]);
      let next = r0;
      for (const s of faces) {
        if (!s) continue;
        next = updateComponentProp(next, s.id, "Image", "backgroundFit", fit);
      }
      commit(next);
    },

    setBackgroundCrop: (target, crop, opts) => {
      const r0 = get().root;
      const { frontBacking, backCover } = findBackgroundSlots(r0);
      const faces = (target === "front" ? [frontBacking] : target === "back" ? [backCover] : [frontBacking, backCover]);
      let next = r0;
      for (const s of faces) {
        if (!s) continue;
        if (crop.focus) next = updateComponentProp(next, s.id, "Image", "backgroundFocus", crop.focus);
        if (typeof crop.zoom === "number") next = updateComponentProp(next, s.id, "Image", "backgroundZoom", crop.zoom);
      }
      // Live (mid-drag) updates skip history; the gesture is bracketed by
      // dragStart()/dragCommit() so the whole drag is one undo step.
      if (opts?.live) set({ root: next });
      else commit(next);
    },

    setBackgroundOpacity: (target, alpha, opts) => {
      // The Back Cover is the rear occluder (clamped opaque at export); only the
      // front stack is fade-able. "back" is a no-op.
      if (target === "back") return;
      const a = Math.max(0, Math.min(1, alpha));
      const r0 = get().root;
      const { background, frontBacking } = findBackgroundSlots(r0);
      const frontTint = (frontBacking?.components.find((c) => c.type === "Image")?.props as
        | { tint?: { r: number; g: number; b: number; a: number } }
        | undefined)?.tint;
      if (!frontBacking || !frontTint) return;
      // Front Backing carries the front color + new alpha; the shared Background
      // slot is kept in lockstep (same color AND alpha) so the translucent front
      // reads as one uniform pane rather than two mismatched tints blended.
      const tint = { ...frontTint, a };
      let next = updateComponentProp(r0, frontBacking.id, "Image", "tint", tint);
      if (background) next = updateComponentProp(next, background.id, "Image", "tint", tint);
      if (opts?.live) set({ root: next });
      else commit(next);
    },

    ensureBackgroundTrio: () => {
      const r0 = get().root;
      if (findBackgroundSlots(r0).background) return; // already present
      // Inject as the FIRST child of the Canvas root so it renders behind all
      // existing content (matches buildBlank / the flagship layout).
      const trio = buildBackgroundTrio();
      const next: typeof r0 = { ...r0, children: [trio, ...r0.children] };
      commit(next);
    },

    applyButtonPreset: (slotId, preset) =>
      commit(applyButtonPreset(get().root, slotId, preset)),

    setProp: (slotId, type, key, value) =>
      commit(updateComponentProp(get().root, slotId, type, key, value)),

    setProps: (slotId, type, entries) => {
      let r = get().root;
      for (const [key, value] of entries) {
        r = updateComponentProp(r, slotId, type, key, value);
      }
      commit(r);
    },

    dragStart: () => {
      set({ _preDragRoot: get().root });
    },

    setLiveDrag: (d) => set({ liveDrag: d }),

    dragApply: (slotId, offsetMin, offsetMax) => {
      let r = get().root;
      r = updateComponentProp(r, slotId, "RectTransform", "offsetMin", offsetMin);
      r = updateComponentProp(r, slotId, "RectTransform", "offsetMax", offsetMax);
      // A free-mode move/resize sets arbitrary positions snap can't represent;
      // mark dirty so switching back to snap warns before auto-arranging.
      const patch: Partial<State> = { root: r };
      if (get().editMode === "free") patch.freeEditsDirty = true;
      set(patch);
    },

    dragCommit: () => {
      const { _preDragRoot, root, history } = get();
      if (!_preDragRoot) return;
      set({
        history: [...history, _preDragRoot].slice(-HISTORY_LIMIT),
        future: [],
        _preDragRoot: null,
        root,
      });
    },

    nudgeCommit: (slotId, target) => {
      const base = get()._preDragRoot ?? get().root;
      const canvasSize = canvasSizeOf(base);
      const slot = findSlot(base, slotId);
      if (!slot) {
        set({ _preDragRoot: null });
        return;
      }
      const parent = findParent(base, slotId);
      const parentAbs =
        (parent ? computeAbsoluteRect(base, parent.id, canvasSize) : null) ??
        { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
      const rt = getRectTransform(slot);
      // Pin horizontally to a single collapsed anchor at the element's centre
      // fraction — the freeform generalisation of Align-in-parent's centre mode
      // (alignSlot) — so it holds its place proportionally on canvas resize.
      // Vertical anchoring is row-managed in snap mode; leave it untouched.
      const a = parentAbs.w > 0 ? (target.x + target.w / 2 - parentAbs.x) / parentAbs.w : 0.5;
      const newAnchorMin = { x: a, y: rt.anchorMin.y };
      const newAnchorMax = { x: a, y: rt.anchorMax.y };
      const { offsetMin, offsetMax } = rectToOffsets(target, parentAbs, newAnchorMin, newAnchorMax);
      let next = updateComponentProp(base, slotId, "RectTransform", "anchorMin", newAnchorMin);
      next = updateComponentProp(next, slotId, "RectTransform", "anchorMax", newAnchorMax);
      next = updateComponentProp(next, slotId, "RectTransform", "offsetMin", offsetMin);
      next = updateComponentProp(next, slotId, "RectTransform", "offsetMax", offsetMax);
      set({
        history: [...get().history, base].slice(-HISTORY_LIMIT),
        future: [],
        _preDragRoot: null,
        root: next,
      });
    },

    undo: () => {
      const { history, root, future } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      set({
        root: prev,
        history: history.slice(0, -1),
        future: [root, ...future].slice(0, HISTORY_LIMIT),
      });
    },

    redo: () => {
      const { future, root, history } = get();
      if (future.length === 0) return;
      const [next, ...rest] = future;
      set({
        root: next,
        future: rest,
        history: [...history, root].slice(-HISTORY_LIMIT),
      });
    },

    loadDocument: (doc) => {
      set({
        root: doc.root,
        selectedSlotId: null,
        history: [],
        future: [],
        _preDragRoot: null,
        collapsed: defaultCollapsed(doc.root),
        theme: doc.theme ?? defaultTheme(),
        dirty: false,
      });
    },

    loadPreset: (presetId) => {
      const p = findPreset(presetId);
      if (!p) return;
      let r = lockRoot(p.build());
      // Match the editor + export layout mode to the preset's shape. Free-form
      // presets (cards, dialogs, split layouts, the keypad grid) open in Free
      // mode with stackLayout off so their absolute 2D design is preserved;
      // vertical-list panels open in Snap with stackLayout on so they're
      // reorderable in-game. (See PresetDescriptor.freeform.)
      const stack = !p.freeform;
      r = updateComponentProp(r, r.id, "Canvas", "stackLayout", stack);
      set({
        root: r,
        selectedSlotId: null,
        history: [],
        future: [],
        _preDragRoot: null,
        collapsed: defaultCollapsed(r),
        editMode: stack ? "snap" : "free",
        freeEditsDirty: false,
        dirty: false,
      });
    },

    documentSnapshot: () => ({
      schemaVersion: 1,
      appVersion: APP_VERSION,
      root: get().root,
      theme: get().theme,
    }),

    markClean: () => set({ dirty: false }),

    reset: () => {
      // "New" starts from the blank canvas (which now carries the dark
      // Background chrome trio), not the flagship demo. Fall back to the
      // flagship if the blank preset ever goes missing.
      const blank = findPreset("blank");
      const r = lockRoot(blank ? blank.build() : createStarterTemplate());
      set({
        root: r,
        selectedSlotId: null,
        history: [],
        future: [],
        _preDragRoot: null,
        collapsed: defaultCollapsed(r),
        theme: defaultTheme(),
        dirty: false,
      });
    },

    setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
    resetViewport: () => set({ viewport: { ...DEFAULT_VIEWPORT } }),
    setSnap: (s2) => set((s) => ({ snap: { ...s.snap, ...s2 } })),
    // Entering free mode starts a fresh "dirty" slate so the next snap switch
    // only warns about edits made during THIS free session. (The snap→free
    // confirmation itself lives in the Viewport toggle.)
    setEditMode: (mode) =>
      set(mode === "free" ? { editMode: mode, freeEditsDirty: false } : { editMode: mode }),
    setScaleCanvasContents: (on) => set({ scaleCanvasContents: on }),
    setCanvasResizeView: (view) => set({ canvasResizeView: view }),

    resizeCanvasLive: (w, h) => {
      // Always recompute from the pre-drag snapshot so repeated mousemove calls
      // don't compound the scale factor. dragStart() must have run first.
      const base = get()._preDragRoot ?? get().root;
      const orig = canvasSizeOf(base);
      const nw = Math.max(40, Math.round(w));
      const nh = Math.max(40, Math.round(h));
      let next: Slot;
      if (get().scaleCanvasContents && orig.w > 0 && orig.h > 0) {
        // Proportional: every descendant grows/shrinks with the canvas so the
        // whole panel looks identical, just larger/smaller.
        next = setCanvasSize(scaleSlotTree(base, nw / orig.w, nh / orig.h), nw, nh);
      } else {
        // Fixed-size: elements keep their pixel size; the canvas just gains or
        // loses empty space (re-anchored per edit mode).
        next = resizeCanvasKeepingSizes(base, orig, nw, nh, get().editMode);
      }
      set({ root: next });
    },

    reorderLive: (parentId, orderedIds, rectById) => {
      // Always reflow from the pre-drag snapshot so repeated moves don't
      // accumulate; if there's no snapshot yet, fall back to the live root.
      const base = get()._preDragRoot ?? get().root;
      const canvasSize = canvasSizeOf(base);
      const parentAbs =
        computeAbsoluteRect(base, parentId, canvasSize) ??
        { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
      let next = base;
      // Snap each moved row to its target canvas-space rect (offsets recomputed
      // against the row's own anchors so anchoring behavior is preserved).
      for (const id of orderedIds) {
        const slot = findSlot(next, id);
        const target = rectById[id];
        if (!slot || !target) continue;
        const rt = getRectTransform(slot);
        const { offsetMin, offsetMax } = rectToOffsets(
          target,
          parentAbs,
          rt.anchorMin,
          rt.anchorMax,
        );
        next = updateComponentProp(next, id, "RectTransform", "offsetMin", offsetMin);
        next = updateComponentProp(next, id, "RectTransform", "offsetMax", offsetMax);
      }
      // Reorder the parent's children array to match the new vertical order,
      // leaving non-reordered (e.g. structural) children pinned in place. Look
      // each id up in a precomputed map — do NOT call queue.shift() inside a
      // .find() predicate (it would consume the queue once per comparison).
      const parent = findSlot(next, parentId);
      if (parent) {
        const byId = new Map(parent.children.map((c) => [c.id, c]));
        const queue = [...orderedIds];
        const reorderSet = new Set(orderedIds);
        parent.children = parent.children.map((c) =>
          reorderSet.has(c.id) ? byId.get(queue.shift()!)! : c,
        );
      }
      set({ root: next });
    },

    reflowLive: (containerId, result) => {
      // Always reflow from the pre-drag snapshot so repeated moves never
      // compound (offsets are absolute targets; reorder is recomputed fresh).
      const base = get()._preDragRoot ?? get().root;
      const canvasSize = canvasSizeOf(base);
      const container = findContainer(base, containerId, canvasSize);
      if (!container) return;
      set({ root: applyResultToContainer(base, container, result, canvasSize) });
    },

    flowReparent: (draggedIds, targetContainerId, drop) => {
      const base = get()._preDragRoot ?? get().root;
      const canvasSize = canvasSizeOf(base);
      const target = findContainer(base, targetContainerId, canvasSize);
      if (!target) return;
      const sourceParent = findParent(base, draggedIds[0]);
      const { rowGap, colGap } = get().snap;

      // Group the target's EXISTING (non-dragged) rows, then plan where the
      // dragged element(s) land. Synthesize a rect for each dragged id from its
      // current size (x clamped into the target) so planFlow can place it.
      const targetItems = rowItemsOf(base, target, canvasSize).filter(
        (it) => !draggedIds.includes(it.id),
      );
      const targetRowItems: Record<string, Rect> = {};
      for (const it of targetItems) targetRowItems[it.id] = it.rect;
      const targetRows = groupRows(targetItems);
      for (const id of draggedIds) {
        const sr = computeAbsoluteRect(base, id, canvasSize);
        if (!sr) continue;
        const x = Math.max(
          target.absRect.x,
          Math.min(sr.x, target.absRect.x + target.absRect.w - sr.w),
        );
        targetRowItems[id] = { x, y: sr.y, w: sr.w, h: sr.h };
      }
      // Content-based mins for target members + the incoming dragged element(s).
      const repWidthOf = (s: Slot) =>
        computeAbsoluteRect(base, s.id, canvasSize)?.w ?? targetRowItems[s.id]?.w ?? 0;
      const targetMin: Record<string, number> = {};
      for (const id of [...targetItems.map((it) => it.id), ...draggedIds]) {
        const sl = findSlot(base, id);
        if (sl) targetMin[id] = contentMinWidth(sl, repWidthOf);
      }
      const result = planFlow(targetRows, targetRowItems, draggedIds, drop, {
        rowGap,
        colGap,
        anchorY: targetRows[0]?.top ?? target.absRect.y,
        bottomMargin: APPEND_MARGIN,
        bounds:
          target.strategy === "absolute"
            ? { left: target.absRect.x, right: target.absRect.x + target.absRect.w }
            : undefined,
        minWidths: targetMin,
      });

      // Reparent each dragged id into the target (append; order fixed below).
      let next = base;
      for (const id of draggedIds) {
        const t = findSlot(next, targetContainerId);
        if (!t) continue;
        next = moveSlotTo(next, id, targetContainerId, t.children.length);
      }
      // Lay out the target with the dragged element(s) now in place.
      const targetAfter = findContainer(next, targetContainerId, canvasSize);
      if (targetAfter) next = applyResultToContainer(next, targetAfter, result, canvasSize);

      // Reflow the source container too, so it closes the gap the element left.
      if (sourceParent && sourceParent.id !== targetContainerId) {
        const src = findContainer(next, sourceParent.id, canvasSize);
        if (src) {
          const srcItems = rowItemsOf(next, src, canvasSize);
          const srcRowItems: Record<string, Rect> = {};
          for (const it of srcItems) srcRowItems[it.id] = it.rect;
          const srcRows = groupRows(srcItems);
          if (srcRows.length) {
            const srcResult =
              src.strategy === "absolute"
                ? reflowAbsolute(srcRows, srcRowItems, {
                    rowGap,
                    colGap,
                    anchorY: srcRows[0].top,
                    bottomMargin: APPEND_MARGIN,
                    bounds: { left: src.absRect.x, right: src.absRect.x + src.absRect.w },
                    minWidths: minWidthsFor(next, src, canvasSize),
                  })
                : reflowLayoutOrder(srcRows);
            next = applyResultToContainer(next, src, srcResult, canvasSize);
          }
        }
      }
      set({ root: next });
    },

    restorePreDrag: () => {
      const p = get()._preDragRoot;
      if (p) set({ root: p });
    },

    clearFreeEdits: () => set({ freeEditsDirty: false }),

    cancelDrag: () => {
      const p = get()._preDragRoot;
      if (p) set({ root: p, _preDragRoot: null });
    },

    ensurePopupContent: (hostId) => {
      const r0 = get().root;
      const host = findSlot(r0, hostId);
      const popup = host?.components.find((c) => c.type === "Popup");
      if (!host || !popup) return;
      const props = popup.props as {
        title?: string; body?: string; dismissLabel?: string; contentSlotId?: string;
      };
      // Already linked to a live content slot → nothing to do.
      if (props.contentSlotId && findSlot(r0, props.contentSlotId)) return;

      const theme = get().theme;
      const canvasSize = canvasSizeOf(r0);
      const cardW = Math.min(Math.max(canvasSize.w - 32, 260), 600);
      const cardH = Math.min(Math.max(canvasSize.h - 32, 160), 320);
      const content = buildPopupContent({
        title: (props.title ?? "Heads up").trim() || "Heads up",
        body: (props.body ?? "").trim() || "Your message here.",
        dismissLabel: (props.dismissLabel ?? "Dismiss").trim() || "Dismiss",
        cardW, cardH,
        surface: theme.controlSurface,
        headerColor: theme.headerTextColor,
        bodyColor: theme.bodyTextColor,
        buttonColor: theme.buttonA,
      });
      // Append the card as a direct Canvas-root child (centered overlay) and
      // link it. Both helpers clone, so r0 stays untouched.
      let next = addChildSlot(r0, r0.id, content);
      next = updateComponentProp(next, hostId, "Popup", "contentSlotId", content.id);
      commit(next);
    },

    widenCanvasAndMerge: (containerId, rowIds, draggedIds) => {
      const r0 = get().root;
      const canvasSize = canvasSizeOf(r0);
      const c0 = findContainer(r0, containerId, canvasSize);
      // Only the absolute root canvas has a user-resizable width.
      if (!c0 || !c0.isRoot || c0.strategy !== "absolute") return;
      const colGap = get().snap.colGap;
      // Natural widths of every element that will share the row.
      const members = [...rowIds, ...draggedIds];
      const widths = members
        .map((id) => computeAbsoluteRect(r0, id, canvasSize)?.w ?? 0)
        .filter((w) => w > 0);
      if (widths.length < 2) return;
      // Size the canvas so the merged row fits at NATURAL widths within a fixed
      // gutter. We pass this same gutter explicitly to planFlow below so the
      // merge isn't re-squished by an inferred margin (the other, still-narrow
      // rows would otherwise inflate inferSideMargin and shrink the merged row).
      const GUTTER = 16;
      const needContent = widths.reduce((s, w) => s + w, 0) + (widths.length - 1) * colGap;
      const newW = Math.ceil(Math.max(canvasSize.w, needContent + 2 * GUTTER + 4));

      // Widen the canvas, keeping every element's pixel size (re-anchor only).
      let next = resizeCanvasKeepingSizes(r0, canvasSize, newW, canvasSize.h, get().editMode);
      const newSize = { w: newW, h: canvasSize.h };

      // Merge: drop the dragged element(s) into the target row at its right end.
      const rootC = getContainers(next, newSize).find((c) => c.id === containerId);
      if (!rootC) { commit(next); return; }
      const items = rowItemsOf(next, rootC, newSize);
      const rowItems: Record<string, Rect> = {};
      items.forEach((it) => (rowItems[it.id] = it.rect));
      const rows = groupRows(items);
      const remaining = rowsWithout(rows, draggedIds, rowItems);
      const targetIdx = remaining.findIndex((r) => rowIds.some((id) => r.ids.includes(id)));
      const drop: DropSpec = targetIdx >= 0
        ? { rowIndex: targetIdx, intoRow: true, colIndex: remaining[targetIdx].ids.length }
        : { rowIndex: remaining.length, intoRow: false, colIndex: 0 };
      const result = planFlow(rows, rowItems, draggedIds, drop, {
        rowGap: get().snap.rowGap,
        colGap,
        anchorY: rows[0]?.top ?? rootC.absRect.y,
        bottomMargin: APPEND_MARGIN,
        bounds: { left: rootC.absRect.x, right: rootC.absRect.x + rootC.absRect.w },
        sideMargin: GUTTER,
        minWidths: minWidthsFor(next, rootC, newSize),
      });
      next = applyResultToContainer(next, rootC, result, newSize);
      commit(next);
    },

    groupIntoColumn: (shortIds, draggedId, place) => {
      let r = get().root;
      const canvasSize = canvasSizeOf(r);
      const dragged = findSlot(r, draggedId);
      const shorts = shortIds.map((id) => findSlot(r, id)).filter(Boolean) as Slot[];
      if (!dragged || shorts.length === 0) return;

      // If the short side is ALREADY a column (VerticalLayout), just move the
      // dragged element into it at the requested end.
      if (shorts.length === 1 && shorts[0].components.some((c) => c.type === "VerticalLayout")) {
        const colId = shorts[0].id;
        // Capture the dragged element's natural height BEFORE the move so the
        // column can size to content (else it has no preferred height inside).
        const draggedH = computeAbsoluteRect(r, draggedId, canvasSize)?.h ?? 36;
        r = moveSlotTo(r, draggedId, colId, place === "top" ? 0 : findSlot(r, colId)!.children.length);
        const col = findSlot(r, colId)!;
        col.children.forEach((ch, i) => {
          let le = ch.components.find((c) => c.type === "LayoutElement");
          if (!le) {
            le = { type: "LayoutElement", props: { minWidth: -1, minHeight: ch.id === draggedId ? draggedH : 36, preferredWidth: -1, preferredHeight: ch.id === draggedId ? draggedH : 36, flexibleWidth: -1, flexibleHeight: -1, orderOffset: i } };
            ch.components.push(le);
          }
          (le.props as { orderOffset?: number }).orderOffset = i;
        });
        commit(snapReflowRoot(r)); // snapReflowRoot calls fitColumnHeights → grows the column
        return;
      }

      // Build a new column from the short member(s) + the dragged element.
      const ordered = place === "top" ? [dragged, ...shorts] : [...shorts, dragged];
      const column = buildColumn(ordered.map((s) => JSON.parse(JSON.stringify(s)) as Slot));
      // Position the column where the short member(s) were (beside the tall one),
      // so the subsequent reflow groups [column, tall] into one side-by-side row.
      const rects = shorts
        .map((s) => computeAbsoluteRect(r, s.id, canvasSize))
        .filter(Boolean) as Rect[];
      const left = Math.min(...rects.map((b) => b.x));
      const top = Math.min(...rects.map((b) => b.y));
      const width = Math.max(...rects.map((b) => b.x + b.w)) - left;
      const childH = rects[0]?.h ?? 36;
      const height = ordered.length * (childH + 8);
      const colRT = column.components.find((c) => c.type === "RectTransform")!;
      const anchorMin = { x: 0, y: 1 };
      const anchorMax = { x: 0, y: 1 };
      const { offsetMin, offsetMax } = rectToOffsets(
        { x: left, y: top, w: width, h: height },
        { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h },
        anchorMin,
        anchorMax,
      );
      colRT.props = { anchorMin, anchorMax, offsetMin, offsetMax, pivot: { x: 0.5, y: 0.5 } };
      // Remove the originals, add the column, then reflow to tidy the row.
      for (const id of [...shortIds, draggedId]) r = removeSlot(r, id);
      r = addChildSlot(r, r.id, column);
      commit(snapReflowRoot(r));
    },

    dissolveColumns: () => {
      const r0 = get().root;
      const d = dissolveEmptyColumns(r0);
      if (d === r0) return;
      commit(snapReflowRoot(d));
    },

    autoArrange: () => {
      const r0 = fitColumnHeights(get().root); // columns size to content first
      const canvasSize = canvasSizeOf(r0);
      const rootC = getContainers(r0, canvasSize).find((c) => c.isRoot);
      if (!rootC) return;
      // Group the top-level rows (the keypad's 3 keys collapse into one row,
      // etc.) and reflow into a clean vertical stack via the shared engine, so
      // the button and the live drag use identical math.
      const items = rowItemsOf(r0, rootC, canvasSize);
      if (items.length === 0) return;
      const rows = groupRows(items);
      const rowItems: Record<string, Rect> = {};
      for (const it of items) rowItems[it.id] = it.rect;
      const result = reflowAbsolute(rows, rowItems, {
        rowGap: get().snap.rowGap,
        colGap: get().snap.colGap,
        anchorY: rows[0].top,
        bottomMargin: APPEND_MARGIN,
        bounds: { left: rootC.absRect.x, right: rootC.absRect.x + rootC.absRect.w },
        minWidths: minWidthsFor(r0, rootC, canvasSize),
      });

      commit(applyResultToContainer(r0, rootC, result, canvasSize, true /* fit canvas */));
      set({ freeEditsDirty: false });
    },

    toggleOverlays: () => set((s) => ({ showOverlays: !s.showOverlays })),
    toggleLeftPanel: () => set((s) => ({ leftPanelHidden: !s.leftPanelHidden })),
    toggleRightPanel: () => set((s) => ({ rightPanelHidden: !s.rightPanelHidden })),
    openContextMenu: (x, y, slotId) => {
      // If the user right-clicks a slot, also select it so the Inspector
      // moves to that slot — matches the expectation that right-click on a
      // hierarchy/canvas item brings up the menu *for that item*. Skip this
      // for the Canvas root: right-clicking empty space (which falls through
      // to root) shouldn't yank selection away from whatever the user was
      // editing — and the menu's "add" actions auto-create a child anyway.
      if (slotId && slotId !== get().root.id) set({ selectedSlotId: slotId });
      set({ contextMenu: { x, y, slotId } });
    },
    closeContextMenu: () => set({ contextMenu: null }),

    setTheme: (partial) => {
      // Any manual edit kicks the preset selector into "custom" so the user
      // sees that they're no longer on a named preset.
      set((s) => ({ theme: { ...s.theme, ...partial, preset: "custom" }, dirty: true }));
    },

    selectThemePreset: (preset) => {
      const next = applyThemePresetValues(preset, get().theme);
      set({ theme: next });
      if (preset !== "custom") {
        // Picking a named preset is a one-click "set + apply": the new theme
        // values are pushed onto the tree immediately so the user sees the
        // change without a second click.
        commit(applyAllTheme(get().root, next));
      }
    },

    applyThemeAll: () => commit(applyAllTheme(get().root, get().theme)),
    applyThemeBackground: () => commit(applyBackground(get().root, get().theme.background)),
    applyThemeHeaderText: () =>
      commit(applyHeaderText(get().root, get().theme.headerTextColor, get().theme.headerTextSize)),
    applyThemeBodyText: () =>
      commit(applyBodyText(get().root, get().theme.bodyTextColor, get().theme.bodyTextSize)),
    applyThemeAccent: () => commit(applyAccent(get().root, get().theme.accent)),
    applyThemeControlSurface: () => commit(applyControlSurface(get().root, get().theme.controlSurface)),
    applyThemeButtonA: () => commit(applyButtonA(get().root, get().theme.buttonA)),
    applyThemeButtonB: () => commit(applyButtonB(get().root, get().theme.buttonB)),
    applyThemeCornerRadius: () => commit(applyCornerRadius(get().root, get().theme.cornerRadius)),
    applyBranding: () => {
      const t = get().theme;
      commit(applyBranding(get().root, t.backLogoUrl, t.backLogoReason, t.backLogoImageHash));
    },
  };
});
