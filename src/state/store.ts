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
  setLabelPositionField,
  setSlotChildren,
  toggleLock,
  updateComponentProp,
} from "../model/operations";
import {
  buildRadials,
  type LabelPosition as RadioLabelPosition,
  type Orientation as RadioOrientation,
} from "../editor/render/radioLayout";
import { isStructuralSlot } from "../model/structural";
import { DEFAULT_CONTENT_PADDING, resolvePad } from "../model/padding";
import {
  LABELLED_CONTROL_TYPES,
  STRETCHY_CONTROL_TYPES,
  controlLabelText,
  labelPositionOf,
  type LabelPosition,
} from "../model/controlName";
import { measureLabelWidth } from "../editor/textMeasure";
import { contentMinWidth, compositeResizeMinWidth, compositeRefitInfo, SNAP_GAP } from "../editor/render/contentMin";
import { computeCompositeLayout, DEFAULT_CONTROL_WIDTH, type RTRect } from "../editor/render/compositeLayout";
import { getLayoutKind } from "../editor/render/layoutEngine";
import { INTERACTIVITY_COMPONENTS, isSlotClickable } from "../model/clickable";
import { createStarterTemplate } from "../model/template";
import { getInitialLanguage, writeLanguage } from "../io/languagePref";
import type { Lang } from "../locale/types";
import { localizePanelText } from "../locale/presetText";
import { applyButtonPreset, type ButtonPresetId } from "../model/buttonPresets";
import { findPreset } from "../model/presets";
import { findBackgroundSlots, buildBackgroundTrio } from "../model/background";
import { SYSTEM_ICON_FLAGS } from "../model/systemIcons";
import { buildWidget, buildPopupContent, buildColumn, isWidgetType } from "../model/widgets";
import {
  applyActiveTab,
  retintTabs,
  addTab as addTabTree,
  removeTab as removeTabTree,
  moveTab as moveTabTree,
  setTabLabel as setTabLabelTree,
  setTabsPosition as setTabsPositionTree,
  tabsPositionOf,
  isTabsHost,
  activeTabPageId,
  type TabPosition,
} from "../model/tabs";
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
  applyContainerSurface,
  applyCornerRadius,
  applyHeaderText,
  applyPreset as applyThemePresetValues,
  defaultTheme,
  type Theme,
  type ThemePresetId,
} from "../model/theme";
import { APP_VERSION } from "../version";
import { computeAbsoluteRect, isLayoutManaged, rectToOffsets } from "../editor/render/slotRect";
import { rowBandFor, type RowBand } from "../editor/render/alignAvail";
import { computeChildRect, getRectTransform, type Rect } from "../editor/render/rectTransform";
import {
  containerRows,
  findContainer,
  getContainers,
  groupRows,
  inferSideMargin,
  planFlow,
  reflowAbsolute,
  reflowLayoutOrder,
  resolveAddContainerId,
  rowItemsOf,
  rowsWithout,
  type DropSpec,
  type ReflowResult,
  type SnapRow,
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

// The panel's Canvas.contentPadding (px). Source for nested container padding,
// which inherits HALF this when left on the -1 "auto" sentinel (see resolvePad).
function canvasContentPad(root: Slot): number {
  const cc = root.components.find((c) => c.type === "Canvas");
  return ((cc?.props as { contentPadding?: number } | undefined)?.contentPadding) ?? DEFAULT_CONTENT_PADDING;
}

// Enforce the canvas content margin on SNAP-mode top-level content: ensure every
// WIDE, full-stretch body element keeps a left/right margin of at least
// Canvas.contentPadding. It only ever pushes a side INWARD (never reduces a
// larger intentional inset), so compliant elements — and designed alignments like
// the checklist's two lists (24px), which already exceed the 16px margin — are
// untouched. Exempt: structural chrome, popup cards, full-bleed bars (header/
// footer, flush to an edge), and narrow corner chrome (help/close buttons).
// Returns the same root ref when nothing moves. Applied on snap preset load and
// in autoArrange (covers free→snap swaps + the Auto-arrange button).
function enforceCanvasMargins(root: Slot): Slot {
  const canvas = root.components.find((c) => c.type === "Canvas");
  const W = (canvas?.props as { sizeX?: number } | undefined)?.sizeX ?? 800;
  const Hh = (canvas?.props as { sizeY?: number } | undefined)?.sizeY ?? 600;
  const cp = canvasContentPad(root);
  const parent: Rect = { x: 0, y: 0, w: W, h: Hh };
  let next = root;
  for (const c of root.children) {
    if (isStructuralSlot(c) || isPopupContentSlot(c)) continue;
    const rt = getRectTransform(c);
    const fullStretchX =
      Math.abs(rt.anchorMin.x) < 0.01 && Math.abs(rt.anchorMax.x - 1) < 0.01;
    if (!fullStretchX) continue;
    if (rt.offsetMin.x <= 1) continue; // flush-to-edge bar/chrome — keep its edges
    if (computeChildRect(parent, rt).w < 0.55 * W) continue; // narrow chrome — exempt
    // Clamp each side to a minimum margin of cp; never reduce a larger inset.
    const newMinX = Math.max(rt.offsetMin.x, cp);
    const newMaxX = Math.min(rt.offsetMax.x, -cp);
    if (newMinX !== rt.offsetMin.x)
      next = updateComponentProp(next, c.id, "RectTransform", "offsetMin", { ...rt.offsetMin, x: newMinX });
    if (newMaxX !== rt.offsetMax.x)
      next = updateComponentProp(next, c.id, "RectTransform", "offsetMax", { ...rt.offsetMax, x: newMaxX });
  }
  return next;
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
  // The popup trigger (host) whose dialog card is currently open in the floating
  // edit surface, or null. Editing the popup is an EXPLICIT mode entered via the
  // Inspector's "Edit popup" button — NOT a side effect of selecting the trigger
  // (so the trigger button itself stays selectable/resizable). Cleared by closing
  // the surface or selecting something outside the popup.
  editingPopupId: string | null;
  // Each undo frame snapshots BOTH the tree and the theme, so undoing a theme
  // edit restores the Theme menu's values in lockstep with the re-tinted slots
  // (otherwise the canvas reverts but the menu still shows the new preset).
  history: Snapshot[];
  future: Snapshot[];
  _preDragRoot: Slot | null;
  // Transient: the Tabs host whose active tab was switched by the *immediately
  // preceding* action. Lets consecutive tab-view switches coalesce into ONE undo
  // step (browsing tabs shouldn't flood history). Any real commit clears it.
  _lastTabSwitchHost: string | null;
  // Transient: identifies the field whose value was set by the *immediately
  // preceding* setProp/setProps. While a run of edits keeps hitting the same
  // field (typing in a text box, dragging a slider), they coalesce into ONE undo
  // step instead of one-per-keystroke. Any structural edit / undo / redo / select
  // clears it so the next field edit starts a fresh step.
  _lastEditKey: string | null;
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
  // Whether the "What's New" patch-notes modal is open. Lifted to the store so
  // any surface (toolbar version, Help menu) can open the single shared modal.
  whatsNewOpen: boolean;
  // Selected UI language. UI-only preference: it is NOT part of the document,
  // undo history, or export — it only drives which translation dictionary the
  // editor chrome renders (and which language fresh templates/presets generate
  // their text in). Persisted separately via io/languagePref.ts.
  language: Lang;
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
  // Open a popup trigger's dialog card in the floating edit surface (builds the
  // card first if needed). Entered explicitly from the Inspector.
  editPopup: (hostId: string) => void;
  // Close the popup edit surface (leaves the current selection untouched).
  closePopupEdit: () => void;
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
  // Canvas-level side padding. Bakes the new left/right inset into every
  // top-level body slot's RectTransform (full-bleed bars + structural chrome
  // exempt) and stores the value on the Canvas component. Also the source for
  // nested container padding (which inherits half). Undoable.
  setContentPadding: (padding: number) => void;
  // Tabs editing — driven by the custom Tabs Inspector + click-to-switch canvas
  // routing (see src/model/tabs.ts). hostId is the Tabs host slot; index is the
  // positional tab index.
  setActiveTab: (hostId: string, index: number) => void;
  selectTab: (hostId: string, index: number) => void;
  setTabLabel: (hostId: string, index: number, text: string) => void;
  addTab: (hostId: string) => void;
  removeTab: (hostId: string, index: number) => void;
  moveTab: (hostId: string, index: number, dir: number) => void;
  // Regenerate a radial group's option ring/label slots from an edited list +
  // per-option label position + row/column orientation. The list IS the source
  // of truth (no hand-building option slots); the group row resizes to fit.
  setRadioOptions: (
    groupSlotId: string,
    labels: string[],
    labelPosition: RadioLabelPosition,
    orientation: RadioOrientation,
    initialIndex: number,
  ) => void;
  // Move the tab bar to the top / bottom / left / right of the tabbed group.
  setTabsPosition: (hostId: string, position: TabPosition) => void;
  // Edit a Tabs "Appearance" prop (size or color) AND re-apply it to the live
  // preview: size keys re-lay the bar/pages, color keys re-tint the surfaces, so
  // the panel reflects the change immediately (and stays consistent with export).
  setTabsAppearance: (hostId: string, key: string, value: unknown) => void;
  dragStart: () => void;
  dragApply: (slotId: string, offsetMin: Vec2, offsetMax: Vec2) => void;
  // Re-anchor a labeled composite's internals for a given control width: the
  // control shrinks to `controlWidth` (right-anchored) and the label hugs the
  // remaining space (left), so the label never clips as the wrapper shrinks.
  // Live (off the current root, no history) — paired with dragApply during a
  // resize and folded into the same dragCommit.
  refitComposite: (slotId: string, controlWidth: number) => void;
  // Move a labelled composite's label to the left of, or above, its control.
  // Re-lays the internals, resizes the wrapper height (top grows it downward),
  // and reflows the container so siblings shift. Undoable.
  setLabelPosition: (slotId: string, pos: LabelPosition) => void;
  // Resize a LAYOUT-managed element (a scroll-area / layout row, whose position
  // is owned by the layout so RT offsets are ignored) by writing its
  // LayoutElement preferred size. Live (no history) — folded into dragCommit.
  setLayoutSize: (slotId: string, w: number, h: number) => void;
  // When a container (ScrollArea / Tabs / layout) is resized, cascade the
  // control-shrink to every composite it holds (the label stays full, the input
  // shrinks) so they don't clip. Live (no history) — folded into dragCommit.
  refitContainerComposites: (containerId: string) => void;
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
  // Re-stack a container from the CURRENT (live) tree — used after a snap-mode
  // free resize/move so the new size can't leave the element overlapping its
  // siblings. Unlike reflowLive (which reflows from the pre-drag snapshot), this
  // reads the post-resize sizes. Live (set root, no history); the caller's
  // dragCommit folds it into one undo step.
  reflowContainerNow: (containerId: string) => void;
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
  setWhatsNewOpen: (open: boolean) => void;
  // Switch the UI language. Persists the choice and re-renders the chrome; does
  // NOT touch the open document (so it never clobbers user edits or undo).
  setLanguage: (lang: Lang) => void;
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
  applyThemeContainerSurface: () => void;
  applyThemeButtonA: () => void;
  applyThemeButtonB: () => void;
  applyThemeCornerRadius: () => void;
  applyBranding: () => void;
}

// Returns `id` only if it still resolves to a slot in `root`; otherwise null.
// Used after undo/redo (and structural removes) to drop selections / popup-edit
// bindings that point at a slot the operation deleted.
function validSelection(root: Slot, id: string | null): string | null {
  return id && findSlot(root, id) ? id : null;
}

// One undo/redo frame: the tree plus the theme values that produced it.
interface Snapshot {
  root: Slot;
  theme: Theme;
}

const HISTORY_LIMIT = 100;
const DEFAULT_VIEWPORT: ViewportTransform = { zoom: 1, panX: 0, panY: 0 };

export const useStore = create<State & Actions>((set, get) => {
  function commit(next: Slot) {
    set((s) => {
      // No-op edit (op returned the same root ref): don't pollute history with an
      // empty undo step or flip the dirty flag. Covers add-already-present,
      // rename-to-same, set-same-value, etc.
      if (next === s.root) return {};
      return {
        history: [...s.history, { root: s.root, theme: s.theme }].slice(-HISTORY_LIMIT),
        future: [],
        root: next,
        dirty: true,
        // A genuine structural edit ends any run of coalesced tab-view switches
        // AND any run of coalesced single-field / theme edits.
        _lastTabSwitchHost: null,
        _lastEditKey: null,
      };
    });
  }

  // Like commit, but coalesces consecutive edits to the SAME field into one undo
  // step. The first edit in a run snapshots history; subsequent edits to the same
  // editKey replace the root in place (so one Ctrl+Z reverts the whole edit, not a
  // single keystroke / slider tick). Mirrors the tab-switch coalescing pattern.
  function commitField(next: Slot, editKey: string) {
    set((s) => {
      if (next === s.root) return {};
      const coalesce = s._lastEditKey === editKey;
      return {
        history: coalesce
          ? s.history
          : [...s.history, { root: s.root, theme: s.theme }].slice(-HISTORY_LIMIT),
        future: [],
        root: next,
        dirty: true,
        _lastTabSwitchHost: null,
        _lastEditKey: editKey,
      };
    });
  }

  // Commits a theme edit (and any tree re-tint it produced). Coalesces a run of
  // theme tweaks into ONE undo step (the Theme menu live-applies on every color
  // drag), snapshotting the PRE-run root+theme so a single undo restores both.
  function commitTheme(nextRoot: Slot, nextTheme: Theme) {
    set((s) => {
      const coalesce = s._lastEditKey === "theme";
      return {
        history: coalesce
          ? s.history
          : [...s.history, { root: s.root, theme: s.theme }].slice(-HISTORY_LIMIT),
        future: [],
        root: nextRoot,
        theme: nextTheme,
        dirty: true,
        _lastTabSwitchHost: null,
        _lastEditKey: "theme",
      };
    });
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
      // Offsets must be solved against the PARENT's height. For the root that's
      // the (possibly just-resized) canvas height; for a NESTED container it's
      // the container's OWN height — using the canvas height here solved every
      // nested child's Y against a 1500px-tall parent while it actually lives in
      // a ~360px page, flinging freshly-added (center-anchored) elements far
      // off-page (the add-into-tab / add-into-popup bug). Global fix.
      const parentAbs = { ...container.absRect, h: container.isRoot ? targetH : container.absRect.h };
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
  // Write a full RectTransform (anchors + offsets) onto a slot in one shot.
  function applyRT(root: Slot, slotId: string, rt: RTRect): Slot {
    let r = updateComponentProp(root, slotId, "RectTransform", "anchorMin", rt.anchorMin);
    r = updateComponentProp(r, slotId, "RectTransform", "anchorMax", rt.anchorMax);
    r = updateComponentProp(r, slotId, "RectTransform", "offsetMin", rt.offsetMin);
    r = updateComponentProp(r, slotId, "RectTransform", "offsetMax", rt.offsetMax);
    return r;
  }

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
    const controlH = Math.abs((crt.offsetMax?.y ?? 0) - (crt.offsetMin?.y ?? 0));
    const fontPx = (label.components.find((k) => k.type === "Text")?.props as { size?: number } | undefined)?.size ?? 14;
    const labelW = measureLabelWidth(controlLabelText(slot), fontPx);
    // Top-labelled: re-apply the deterministic stacked layout (label band + the
    // control below). A stretchy control's width is dynamic (anchored full-width
    // → offset width reads 0), so fall back to its authored default.
    if (labelPositionOf(slot) === "top") {
      const stretchy = STRETCHY_CONTROL_TYPES.has(slot.name);
      const cw = controlW || DEFAULT_CONTROL_WIDTH[slot.name] || 80;
      const layout = computeCompositeLayout("top", { stretchy, controlW: cw, controlH, labelW, packed });
      let r = applyRT(root, label.id, layout.label);
      r = applyRT(r, controls[0].id, layout.control);
      return r;
    }
    if (controlW <= 0) return root;
    const lrt = getRectTransform(label);
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

  // Pure re-stack of one absolute/layout container's children (the snap reflow for
  // a single container). Returns the new tree; `reflowContainerNow` wraps it in a
  // set(), and folded-edit paths (e.g. setTabsAppearance pagePadding) call it
  // directly so the reflow lands in the SAME commit as the edit (one undo step,
  // one render) instead of a trailing non-history set().
  function reflowContainerTree(root: Slot, containerId: string): Slot {
    const canvasSize = canvasSizeOf(root);
    const container = findContainer(root, containerId, canvasSize);
    if (!container) return root;
    const items = rowItemsOf(root, container, canvasSize);
    if (items.length === 0) return root;
    const rows = groupRows(items);
    const rowItems: Record<string, Rect> = {};
    for (const it of items) rowItems[it.id] = it.rect;
    const cSlot = findSlot(root, container.id);
    const tabPad =
      cSlot?.components.some((c) => c.type === "TabPage")
        ? resolvePad(
            (findParent(root, container.id)?.components.find((c) => c.type === "Tabs")
              ?.props as { pagePadding?: number } | undefined)?.pagePadding,
            canvasContentPad(root),
          )
        : 0;
    const bounds = {
      left: container.absRect.x + tabPad,
      right: container.absRect.x + container.absRect.w - tabPad,
    };
    const result =
      container.strategy === "absolute"
        ? reflowAbsolute(rows, rowItems, {
            rowGap: get().snap.rowGap,
            colGap: get().snap.colGap,
            anchorY: rows[0].top,
            bottomMargin: APPEND_MARGIN,
            bounds,
            minWidths: minWidthsFor(root, container, canvasSize),
          })
        : reflowLayoutOrder(rows);
    if (container.strategy === "absolute" && result.rects) {
      for (const id of Object.keys(result.rects)) {
        const member = findSlot(root, id);
        const minW = member ? compositeResizeMinWidth(member) : null;
        const rc = result.rects[id];
        if (minW && rc && rc.w < minW) {
          let x = rc.x;
          if (x + minW > bounds.right) x = bounds.right - minW;
          if (x < bounds.left) x = bounds.left;
          result.rects[id] = { ...rc, x, w: minW };
        }
      }
    }
    return fitTabsToContent(applyResultToContainer(root, container, result, canvasSize));
  }

  // A Tabs container has no scroll, so when content is added/moved/resized inside
  // a tab it must GROW to fit (unlike a ScrollArea, which scrolls). Sizes every
  // Tabs host's height to its tallest page's content (all pages share the rect,
  // so any tab's content can drive the height), then re-stacks the canvas so the
  // rows below the now-taller Tabs are pushed down and the canvas grows. Grow-only.
  function fitTabsToContent(root: Slot): Slot {
    const canvasSize = canvasSizeOf(root);
    const hosts: Slot[] = [];
    (function walk(s: Slot) {
      if (s.components.some((c) => c.type === "Tabs")) hosts.push(s);
      for (const c of s.children) walk(c);
    })(root);
    let next = root;
    let changed = false;
    for (const host of hosts) {
      const tabsComp = host.components.find((c) => c.type === "Tabs");
      const pad = resolvePad((tabsComp?.props as { pagePadding?: number })?.pagePadding, canvasContentPad(root));
      const hostRect = computeAbsoluteRect(next, host.id, canvasSize);
      if (!hostRect) continue;
      const pages = host.children.filter((p) => p.components.some((c) => c.type === "TabPage"));
      let contentBottom = hostRect.y;
      for (const page of pages)
        for (const child of page.children) {
          const cr = computeAbsoluteRect(next, child.id, canvasSize);
          if (cr) contentBottom = Math.max(contentBottom, cr.y + cr.h);
        }
      const neededH = Math.ceil(contentBottom - hostRect.y + pad + 6);
      if (neededH > hostRect.h + 0.5) {
        const parent = findParent(next, host.id);
        const parentRect =
          (parent ? computeAbsoluteRect(next, parent.id, canvasSize) : null) ??
          { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
        const rt = getRectTransform(host);
        const { offsetMin, offsetMax } = rectToOffsets(
          { x: hostRect.x, y: hostRect.y, w: hostRect.w, h: neededH },
          parentRect,
          rt.anchorMin,
          rt.anchorMax,
        );
        next = updateComponentProp(next, host.id, "RectTransform", "offsetMin", offsetMin);
        next = updateComponentProp(next, host.id, "RectTransform", "offsetMax", offsetMax);
        changed = true;
      }
    }
    return changed ? snapReflowRoot(next) : root;
  }

  // Place a freshly-added child at the BOTTOM of an ABSOLUTE nested container
  // (a tab page / popup card), full-width and top-anchored — the same shape the
  // container's authored rows use, so it stacks cleanly below its siblings.
  // Without this the widget keeps its centered builder default, and the reflow
  // (which only re-stacks vertically) leaves it floating mid-page / off to the
  // side. No-op for the root (handled by appendChildAtBottom) and for LAYOUT
  // containers (a ScrollArea positions children by order, not RT). Tab-page
  // content insets by the Tabs' pagePadding; other absolute containers use a
  // standard 16px gutter.
  function placeChildAtAbsoluteContainerBottom(root: Slot, containerId: string, childId: string): Slot {
    const container = findSlot(root, containerId);
    if (!container || getLayoutKind(container) !== null) return root; // layout container → skip
    const cs = canvasSizeOf(root);
    const cRect = computeAbsoluteRect(root, containerId, cs);
    const child = findSlot(root, childId);
    if (!cRect || !child) return root;
    const isTabPage = container.components.some((c) => c.type === "TabPage");
    const host = isTabPage ? findParent(root, containerId) : null;
    const pad = isTabPage
      ? resolvePad((host?.components.find((c) => c.type === "Tabs")?.props as { pagePadding?: number } | undefined)?.pagePadding, canvasContentPad(root))
      : 16;
    let bottom = cRect.y + pad;
    for (const sib of container.children) {
      if (sib.id === childId || isStructuralSlot(sib)) continue;
      const r = computeAbsoluteRect(root, sib.id, cs);
      if (r) bottom = Math.max(bottom, r.y + r.h);
    }
    const childRect = computeAbsoluteRect(root, childId, cs);
    const target = {
      x: cRect.x + pad,
      y: bottom + APPEND_GAP,
      w: Math.max(8, cRect.w - 2 * pad),
      h: childRect?.h ?? 40,
    };
    // Full-width, top-anchored (matches the container's authored rows).
    const aMin = { x: 0, y: 1 };
    const aMax = { x: 1, y: 1 };
    const { offsetMin, offsetMax } = rectToOffsets(target, cRect, aMin, aMax);
    let r = updateComponentProp(root, childId, "RectTransform", "anchorMin", aMin);
    r = updateComponentProp(r, childId, "RectTransform", "anchorMax", aMax);
    r = updateComponentProp(r, childId, "RectTransform", "offsetMin", offsetMin);
    r = updateComponentProp(r, childId, "RectTransform", "offsetMax", offsetMax);
    return r;
  }

  // Re-stack the Canvas root after a top-level DUPLICATE so the copy sits
  // directly below the original — never on top of it and never merged side-by-side
  // with whatever element happened to sit just below.
  //
  // Why not reuse snapReflowRoot: that re-derives row order purely from each
  // element's y. The copy starts at the original's exact position, and any attempt
  // to nudge it "into the gap" below the original makes it vertically overlap the
  // NEXT element — groupRows then clusters them into one row and the reflow packs
  // the copy beside that element (the "ended up to the right of my buttons" bug).
  // Instead we group the rows from the layout WITHOUT the copy (so ordering
  // reflects the real design), then splice the copy in as its own row immediately
  // after the row that holds the original, and stack that explicit order. The copy
  // keeps the original's x/width; everything below it is pushed down.
  function reflowRootInsertAfter(root: Slot, originalId: string, copyId: string): Slot {
    root = fitColumnHeights(root);
    const canvasSize = canvasSizeOf(root);
    const rootC = getContainers(root, canvasSize).find((c) => c.isRoot);
    if (!rootC) return root;
    const allItems = rowItemsOf(root, rootC, canvasSize);
    const copyItem = allItems.find((i) => i.id === copyId);
    if (!copyItem) return root;
    const rows = groupRows(allItems.filter((i) => i.id !== copyId));
    const rowItems: Record<string, Rect> = {};
    for (const it of allItems) rowItems[it.id] = it.rect;
    const copyRow: SnapRow = {
      ids: [copyId],
      rect: copyItem.rect,
      top: copyItem.rect.y,
      height: copyItem.rect.h,
    };
    const idx = rows.findIndex((r) => r.ids.includes(originalId));
    if (idx < 0) rows.push(copyRow);
    else rows.splice(idx + 1, 0, copyRow);
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

  // Read the persisted/guessed language synchronously so the very first render
  // and the first-load starter template are already in the right language.
  const initialLanguage = getInitialLanguage();
  const initialRoot = lockRoot(createStarterTemplate(initialLanguage));
  return {
    root: initialRoot,
    selectedSlotId: null,
    editingPopupId: null,
    history: [],
    future: [],
    _preDragRoot: null,
    _lastTabSwitchHost: null,
    _lastEditKey: null,
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
    whatsNewOpen: false,
    language: initialLanguage,
    contextMenu: null,
    renamingSlotId: null,
    theme: defaultTheme(),
    dirty: false,

    select: (id) =>
      set((s) => {
        // Leaving the popup being edited (selecting anything that isn't the
        // trigger, its card, or something inside the card) closes the edit
        // surface — so the modal editor never lingers over an unrelated element.
        if (!s.editingPopupId || id === s.editingPopupId)
          return { selectedSlotId: id, _lastEditKey: null };
        const host = findSlot(s.root, s.editingPopupId);
        const cid = (host?.components.find((c) => c.type === "Popup")?.props as
          | { contentSlotId?: string }
          | undefined)?.contentSlotId;
        const insideCard =
          !!cid && id != null && (id === cid || isDescendant(s.root, cid, id));
        return insideCard
          ? { selectedSlotId: id, _lastEditKey: null }
          : { selectedSlotId: id, editingPopupId: null, _lastEditKey: null };
      }),

    editPopup: (hostId) => {
      // Build the dialog card if it doesn't exist yet, then open the surface.
      get().ensurePopupContent(hostId);
      set({ editingPopupId: hostId, selectedSlotId: hostId });
    },

    closePopupEdit: () => set({ editingPopupId: null }),

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
      // Drop selection / popup-edit binding if they referenced the deleted slot
      // (or, for the popup, a slot now gone from the tree) so neither the
      // Inspector nor the floating popup surface lingers over a ghost.
      const patch: Partial<State> = {};
      if (get().selectedSlotId === id) patch.selectedSlotId = null;
      patch.editingPopupId = validSelection(next, get().editingPopupId);
      set(patch);
    },

    duplicate: (id) => {
      if (get().root.id === id) return;
      const before = get().root;
      { const s = findSlot(before, id); if (s && isStructuralSlot(s)) return; }
      // In snap mode a duplicate must never sit on top of its original. For a
      // top-level (Canvas) element we re-stack so the copy lands directly below
      // the original and everything beneath shifts down. (Inside a layout
      // container — ScrollArea/Column — duplicateSlot already inserts the copy
      // right after the original in child order, so the layout engine spaces them
      // with no overlap and no fix is needed.)
      const atRoot = findParent(before, id)?.id === before.id;
      const snapRootDup = get().editMode === "snap" && atRoot;
      const { root: next, newId } = duplicateSlot(before, id);
      if (!newId) return;
      const result = snapRootDup ? reflowRootInsertAfter(next, id, newId) : next;
      commit(result);
      set({ selectedSlotId: newId });
    },

    alignSlot: (id, axis, mode) => {
      const r = get().root;
      if (r.id === id) return;
      const slot = findSlot(r, id);
      const parent = findParent(r, id);
      if (!slot || !parent) return;
      if (isLayoutManaged(r, id)) return;
      // In snap mode the block-flow engine owns each element's VERTICAL position
      // (stacking order, row bands), so Top/Middle/Bottom are no-ops. The one
      // meaningful vertical op is Stretch = "fill my row's height": grow a short
      // element to match its tallest row sibling (the dead space beside a taller
      // column). It only applies when the element actually shares a row with a
      // taller sibling — otherwise (alone in its row, or already tallest) bail.
      const snapMode = get().editMode === "snap";
      let snapFill: RowBand | null = null;
      if (snapMode && axis === "v") {
        if (mode !== "stretch") return;
        snapFill = rowBandFor(r, id);
        if (!snapFill || snapFill.memberCount <= 1 || snapFill.self.h >= snapFill.band.h - 1)
          return;
      }
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

      // In snap mode an aligned element must respect the same side gutter the
      // snap layout gives its siblings — otherwise it goes flush to the parent
      // edges and breaks the tidy margin (the bug this guards against). Applies
      // to BOTH stretch and the edge alignments (Left/Right/Top/Bottom); Center/
      // Middle are dead-centered so they need no margin. Inferred from the OTHER
      // full-width rows in the same container (excluding this element); free mode
      // keeps the edge-to-edge behavior (margin = 0).
      let margin = 0;
      if (get().editMode === "snap") {
        const container = findContainer(r, parent.id, canvasSize);
        const rows = container
          ? containerRows(r, container, canvasSize).filter((row) => !row.ids.includes(id))
          : [];
        margin = inferSideMargin(rows, {
          left: parentAbs.x,
          right: parentAbs.x + parentAbs.w,
        });
      }
      // Offset from the start edge for an edge alignment: a `margin` inset at the
      // start, the symmetric inset at the end, dead-center for center. Clamped so
      // a near-full element can't be pushed out of the parent.
      const edgeRel = (free: number) =>
        mode === "start" ? Math.min(margin, Math.max(0, free))
        : mode === "end" ? Math.max(0, free - margin)
        : free / 2;

      if (mode === "stretch") {
        if (axis === "h") {
          newAnchorMin.x = 0;
          newAnchorMax.x = 1;
          newRect.x = parentAbs.x + margin;
          newRect.w = Math.max(1, parentAbs.w - 2 * margin);
        } else if (snapMode && snapFill) {
          // Snap: fill the ROW band height, not the whole canvas. Keep current
          // anchors + x/width; only grow vertically to the band. The reflow that
          // follows re-centers row members, but this one is now the tallest, so
          // it stays pinned to the band top and its height sticks.
          newRect.y = snapFill.band.y;
          newRect.h = snapFill.band.h;
        } else {
          newAnchorMin.y = 0;
          newAnchorMax.y = 1;
          newRect.y = parentAbs.y + margin;
          newRect.h = Math.max(1, parentAbs.h - 2 * margin);
        }
      } else if (axis === "h") {
        const free = parentAbs.w - slotAbs.w;
        // Collapse horizontal anchors to a single point at the alignment side
        // so the element stays pinned even if the canvas resizes.
        const a = mode === "start" ? 0 : mode === "end" ? 1 : 0.5;
        newAnchorMin.x = a;
        newAnchorMax.x = a;
        newRect.x = parentAbs.x + edgeRel(free);
      } else {
        const free = parentAbs.h - slotAbs.h;
        // axis "v": "start" = Top, "end" = Bottom in CSS terms.
        // Resonite is Y-up: anchor.y=1 is top edge, 0 is bottom edge.
        const a = mode === "start" ? 1 : mode === "end" ? 0 : 0.5;
        newAnchorMin.y = a;
        newAnchorMax.y = a;
        newRect.y = parentAbs.y + edgeRel(free);
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
      // Snap mode: re-pack after a horizontal align so sibling rows, grabbers and
      // any freed dead space stay consistent. Reflow keeps an in-bounds element's
      // exact x (Case 1 in layoutRowMembers), so the new alignment sticks while
      // the column re-stacks. Root uses the pure reflow folded into the commit; a
      // nested container reflows live after the commit (mirrors the add/resize
      // flow). Free mode is absolute — commit as-is, no reflow needed.
      if (snapMode && parent.id === r.id) {
        commit(snapReflowRoot(next));
      } else if (snapMode) {
        commit(next);
        get().reflowContainerNow(parent.id);
      } else {
        commit(next);
      }
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
      // A new element ALWAYS lands at the bottom of the page (Canvas root), never
      // nested inside the element the user right-clicked — UNLESS the click
      // resolves to a nested container (ScrollArea / Column / popup card), where
      // it lands at the bottom of THAT container instead. resolveAddContainerId
      // walks self-then-ancestors for the nearest container, else the root.
      const parentId = resolveAddContainerId(r, slotId);
      const parentIsRoot = parentId === r.id;
      const snapMode = get().editMode === "snap";
      // Composite controls (Checkbox, Toggle, Slider, …) are multi-slot widgets,
      // not single components. Build the full source-of-truth subtree (matching
      // the Experimental Panel — Box+CheckIcon for a checkbox, Pill+Knob for a
      // toggle, etc.). Adding a bare marker produced a blank/non-functional control.
      //
      // Append to the resolved container: under the Canvas root, drop below
      // existing content (snap mode reflows so the rest stacks cleanly with no
      // overlap; it appends WITHOUT growing the canvas — the reflow grows it). A
      // nested container just pushes to the end of its children = the bottom of
      // its own flow (layout containers position by child order).
      if (isWidgetType(type)) {
        const widget = buildWidget(type, findSlot(r, parentId)?.children.length ?? r.children.length, get().theme.buttonA);
        if (widget) {
          let next: Slot;
          if (parentIsRoot) {
            next = appendChildAtBottom(r, widget, !snapMode);
            if (snapMode) next = snapReflowRoot(next);
          } else {
            next = addChildSlot(r, parentId, widget);
            // Drop it at the bottom of an absolute container (tab page / popup)
            // full-width, so the reflow below stacks it cleanly with the siblings
            // instead of leaving the centered builder default floating mid-page.
            if (snapMode) next = placeChildAtAbsoluteContainerBottom(next, parentId, widget.id);
          }
          commit(next);
          set({ selectedSlotId: widget.id });
          // Adding into a nested container (tab page / scroll area): stack the new
          // element in its flow and grow a Tabs container to fit (folded in).
          if (snapMode && !parentIsRoot) get().reflowContainerNow(parentId);
          return;
        }
      }
      // Past the widget guard, every remaining type is a real single component
      // (widget-only pseudo-types like "Spinner" returned above), so narrow. Each
      // becomes its OWN new slot (one graphic per slot) dropped at the bottom of
      // the resolved container — never attached onto the clicked slot.
      const ct = type as UixComponentType;
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
      let next: Slot;
      if (parentIsRoot) {
        // Append below content, then add the component BEFORE reflowing so the
        // reflow's content-based min-width measures the real control, not a bare
        // slot. Snap appends without growing the canvas (the reflow grows it).
        next = appendChildAtBottom(r, child, !snapMode);
        next = addComponent(next, child.id, ct);
        if (snapMode) next = snapReflowRoot(next);
      } else {
        next = addChildSlot(r, parentId, child);
        next = addComponent(next, child.id, ct);
        if (snapMode) next = placeChildAtAbsoluteContainerBottom(next, parentId, child.id);
      }
      commit(next);
      set({ selectedSlotId: child.id });
      // Stack into the nested container's flow + grow a Tabs container to fit.
      if (snapMode && !parentIsRoot) get().reflowContainerNow(parentId);
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
      commitField(
        updateComponentProp(get().root, slotId, type, key, value),
        `${slotId}:${type}:${key}`,
      ),

    setProps: (slotId, type, entries) => {
      let r = get().root;
      for (const [key, value] of entries) {
        r = updateComponentProp(r, slotId, type, key, value);
      }
      commitField(r, `${slotId}:${type}:${entries.map((e) => e[0]).join(",")}`);
    },

    setContentPadding: (padding) => {
      const root = get().root;
      const canvas = root.components.find((c) => c.type === "Canvas");
      const cur =
        ((canvas?.props as { contentPadding?: number } | undefined)?.contentPadding) ??
        DEFAULT_CONTENT_PADDING;
      const np = Math.max(0, Math.round(padding));
      const delta = np - cur;
      // Always record the new value on the Canvas component.
      let next = updateComponentProp(root, root.id, "Canvas", "contentPadding", np);
      // Re-inset top-level BODY content by the delta. Skipped: structural chrome
      // (backdrop layers stretch with the canvas), the floating popup card, and
      // full-bleed bars (header/footer spanning edge-to-edge, |offset.x| ≈ 0) —
      // those keep their edges. Shifting omin.x/omax.x by ±delta preserves each
      // element's relative inset, so designed alignments (e.g. the checklist's
      // two lists) stay locked together at any padding value.
      if (delta !== 0) {
        for (const child of root.children) {
          if (isStructuralSlot(child)) continue;
          if (isPopupContentSlot(child)) continue;
          const rt = getRectTransform(child);
          if (Math.abs(rt.offsetMin.x) <= 1 && Math.abs(rt.offsetMax.x) <= 1) continue;
          next = updateComponentProp(next, child.id, "RectTransform", "offsetMin", {
            ...rt.offsetMin,
            x: rt.offsetMin.x + delta,
          });
          next = updateComponentProp(next, child.id, "RectTransform", "offsetMax", {
            ...rt.offsetMax,
            x: rt.offsetMax.x - delta,
          });
        }
      }
      commitField(next, `${root.id}:Canvas:contentPadding`);
    },

    setActiveTab: (hostId, index) => commit(applyActiveTab(get().root, hostId, index)),
    selectTab: (hostId, index) => {
      // Switching which tab is shown is a real doc change (activeTab is also the
      // exported initial tab), but BROWSING tabs shouldn't push one undo step per
      // click. Coalesce: the first switch in a run snapshots history; consecutive
      // switches replace the root in place. Any genuine edit (commit/dragCommit)
      // clears _lastTabSwitchHost, so the next switch starts a fresh undo step.
      const s = get();
      const next = applyActiveTab(s.root, hostId, index);
      if (next === s.root) {
        set({ selectedSlotId: hostId });
        return;
      }
      // Coalesce only consecutive switches on the SAME host — switching a tab on
      // a different Tabs group is its own undo step.
      const coalesce = s._lastTabSwitchHost === hostId;
      set({
        root: next,
        selectedSlotId: hostId,
        dirty: true,
        future: [],
        history: coalesce
          ? s.history
          : [...s.history, { root: s.root, theme: s.theme }].slice(-HISTORY_LIMIT),
        _lastTabSwitchHost: hostId,
        _lastEditKey: null,
      });
    },
    setTabLabel: (hostId, index, text) =>
      commit(setTabLabelTree(get().root, hostId, index, text)),
    addTab: (hostId) => {
      const { root } = addTabTree(get().root, hostId);
      commit(root);
      set({ selectedSlotId: hostId });
    },
    removeTab: (hostId, index) => {
      const { root } = removeTabTree(get().root, hostId, index);
      commit(root);
      set({ selectedSlotId: hostId });
    },
    moveTab: (hostId, index, dir) => {
      commit(moveTabTree(get().root, hostId, index, dir));
      set({ selectedSlotId: hostId });
    },
    setTabsPosition: (hostId, position) => {
      commit(setTabsPositionTree(get().root, hostId, position));
      set({ selectedSlotId: hostId });
    },

    setRadioOptions: (groupSlotId, labels, labelPosition, orientation, initialIndex) => {
      const r0 = get().root;
      const group = findSlot(r0, groupSlotId);
      const rg = group?.components.find((c) => c.type === "RadioGroup");
      if (!group || !rg) return;
      const cleaned = labels.map((l) => l ?? "");
      if (cleaned.length === 0) cleaned.push("Option 1");
      const groupId = (rg.props as { groupId?: string }).groupId ?? "group1";
      const idx = Math.min(Math.max(0, initialIndex), cleaned.length - 1);
      const { radials, rowHeight } = buildRadials(cleaned, labelPosition, orientation, groupId, idx);

      // Replace the option-bearing children (old "Radials" wrapper or loose option
      // slots) with the freshly-built cluster; keep the caption + 📚 Value (any
      // child whose subtree carries no Radio marker), preserving their order and
      // dropping the cluster in where the options used to be.
      const hasRadio = (n: Slot): boolean =>
        n.components.some((c) => c.type === "Radio") || n.children.some(hasRadio);
      const isOptionChild = (ch: Slot) => ch.name === "Radials" || hasRadio(ch);
      const kept = group.children.filter((ch) => !isOptionChild(ch));
      const firstRemoved = group.children.findIndex(isOptionChild);
      const insertAt =
        firstRemoved < 0
          ? kept.length
          : group.children.slice(0, firstRemoved).filter((ch) => !isOptionChild(ch)).length;
      const newChildren = [...kept.slice(0, insertAt), radials, ...kept.slice(insertAt)];

      let next = setSlotChildren(r0, groupSlotId, newChildren);
      next = updateComponentProp(next, groupSlotId, "RadioGroup", "options", cleaned.join("\n"));
      next = updateComponentProp(next, groupSlotId, "RadioGroup", "labelPosition", labelPosition);
      next = updateComponentProp(next, groupSlotId, "RadioGroup", "orientation", orientation);
      next = updateComponentProp(next, groupSlotId, "RadioGroup", "initialIndex", idx);

      // Grow/shrink the group row to fit the cluster height (keep its top edge),
      // then reflow so snap siblings shift for the new height.
      const canvasSize = canvasSizeOf(next);
      const groupRect = computeAbsoluteRect(next, groupSlotId, canvasSize);
      const parent = findParent(next, groupSlotId);
      const target = findSlot(next, groupSlotId);
      if (groupRect && target) {
        const parentRect =
          (parent ? computeAbsoluteRect(next, parent.id, canvasSize) : null) ??
          { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
        const rt = getRectTransform(target);
        const { offsetMin, offsetMax } = rectToOffsets(
          { x: groupRect.x, y: groupRect.y, w: groupRect.w, h: rowHeight },
          parentRect,
          rt.anchorMin,
          rt.anchorMax,
        );
        next = updateComponentProp(next, groupSlotId, "RectTransform", "offsetMin", offsetMin);
        next = updateComponentProp(next, groupSlotId, "RectTransform", "offsetMax", offsetMax);
      }

      const snapMode = get().editMode === "snap";
      const parentIsRoot = !parent || parent.id === next.id;
      if (snapMode && parentIsRoot) {
        commit(snapReflowRoot(next));
      } else {
        commit(next);
        if (snapMode && parent) get().reflowContainerNow(parent.id);
      }
      set({ selectedSlotId: groupSlotId });
    },
    setTabsAppearance: (hostId, key, value) => {
      // Geometry props re-lay the bar + pages (setTabsPosition reads tabBarSize /
      // tabSpacing from the props); color props re-tint the surfaces. Either way
      // the preview updates live and matches what the exporter emits.
      const SIZE_KEYS = new Set(["tabBarSize", "tabSpacing"]);
      const COLOR_KEYS = new Set([
        "activeColor", "inactiveColor", "pageColor", "frameColor", "labelColor",
      ]);
      let next = updateComponentProp(get().root, hostId, "Tabs", key, value);
      const host = findSlot(next, hostId);
      if (host && isTabsHost(host)) {
        if (SIZE_KEYS.has(key)) next = setTabsPositionTree(next, hostId, tabsPositionOf(host));
        else if (COLOR_KEYS.has(key)) next = retintTabs(next, hostId);
      }
      // pagePadding is the page content inset: re-flow the active page so the new
      // padding visibly re-lays its content (snap mode; the reflow reads
      // pagePadding for the bounds inset). Folded into THIS tree so it lands in
      // one commit / one undo step (free mode places content absolutely, so the
      // padding just applies to future adds).
      if (key === "pagePadding" && get().editMode === "snap" && host) {
        const pageId = activeTabPageId(host);
        if (pageId) next = reflowContainerTree(next, pageId);
      }
      commit(next);
      set({ selectedSlotId: hostId });
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

    setLayoutSize: (slotId, w, h) => {
      const r = get().root;
      const slot = findSlot(r, slotId);
      if (!slot || !slot.components.some((c) => c.type === "LayoutElement")) return;
      let next = updateComponentProp(r, slotId, "LayoutElement", "preferredWidth", Math.max(8, Math.round(w)));
      next = updateComponentProp(next, slotId, "LayoutElement", "preferredHeight", Math.max(8, Math.round(h)));
      const patch: Partial<State> = { root: next };
      if (get().editMode === "free") patch.freeEditsDirty = true;
      set(patch);
    },

    refitContainerComposites: (containerId) => {
      const r = get().root;
      const canvasSize = canvasSizeOf(r);
      // Locate the actual container (the "Scroll Area" row wraps a "Scroll
      // Viewport" that carries the ScrollArea component).
      const locate = (s: Slot): Slot | null => {
        if (getLayoutKind(s) !== null || s.components.some((c) => c.type === "Tabs")) return s;
        for (const ch of s.children) {
          const f = locate(ch);
          if (f) return f;
        }
        return null;
      };
      const start = findSlot(r, containerId);
      const container = start ? locate(start) : null;
      if (!container) return;
      // The rows whose composites should refit: a Tabs active page's children, or
      // a scroll/layout container's direct children.
      let rows: Slot[];
      if (container.components.some((c) => c.type === "Tabs")) {
        // Refit composites on EVERY tab page (they share the same rect), not just
        // the active one — otherwise the other tabs stay clipped.
        const pages = container.children.filter((c) => c.components.some((k) => k.type === "TabPage"));
        rows = pages.flatMap((p) => p.children);
      } else {
        rows = container.children;
      }
      let next = r;
      for (const row of rows) {
        const fit = compositeRefitInfo(row);
        if (!fit) continue;
        const rowW = computeAbsoluteRect(next, row.id, canvasSize)?.w ?? 0;
        if (rowW <= 0) continue;
        const cmin = Math.min(fit.controlMin, fit.controlNatural);
        const controlW = Math.max(cmin, Math.min(fit.controlNatural, rowW - fit.labelW - SNAP_GAP));
        const control = findSlot(next, fit.controlId);
        if (control) {
          const crt = getRectTransform(control);
          next = updateComponentProp(next, fit.controlId, "RectTransform", "offsetMin", { x: -controlW, y: crt.offsetMin.y });
          next = updateComponentProp(next, fit.controlId, "RectTransform", "offsetMax", { x: 0, y: crt.offsetMax.y });
        }
        const labelSlot = findSlot(next, fit.labelId);
        if (labelSlot) {
          const lrt = getRectTransform(labelSlot);
          next = updateComponentProp(next, fit.labelId, "RectTransform", "offsetMin", { x: 0, y: lrt.offsetMin.y });
          next = updateComponentProp(next, fit.labelId, "RectTransform", "offsetMax", { x: -(controlW + SNAP_GAP), y: lrt.offsetMax.y });
        }
      }
      // Resizing/moving inside a tab can change its content height — grow the
      // Tabs to fit (and re-stack the canvas).
      next = fitTabsToContent(next);
      if (next !== r) set({ root: next });
    },

    refitComposite: (slotId, controlWidth) => {
      const r = get().root;
      const wrapper = findSlot(r, slotId);
      if (!wrapper) return;
      const labelSlot = wrapper.children.find((c) => c.name === "Label");
      const control = wrapper.children.find(
        (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
      );
      if (!control) return;
      // Top-labelled: the control is stacked under the label (stretchy ones track
      // the wrapper width via their anchors), so a width resize needs no per-control
      // offset change — just re-apply the deterministic stacked layout.
      if (labelPositionOf(wrapper) === "top") {
        const crt0 = getRectTransform(control);
        const controlH = Math.abs((crt0.offsetMax?.y ?? 0) - (crt0.offsetMin?.y ?? 0));
        const stretchy = STRETCHY_CONTROL_TYPES.has(wrapper.name);
        const natW = Math.abs((crt0.offsetMax?.x ?? 0) - (crt0.offsetMin?.x ?? 0)) || DEFAULT_CONTROL_WIDTH[wrapper.name] || 80;
        const fontPx = (labelSlot?.components.find((k) => k.type === "Text")?.props as { size?: number } | undefined)?.size ?? 14;
        const labelW = measureLabelWidth(controlLabelText(wrapper), fontPx);
        const layout = computeCompositeLayout("top", { stretchy, controlW: natW, controlH, labelW });
        let topNext = applyRT(r, control.id, layout.control);
        if (labelSlot) topNext = applyRT(topNext, labelSlot.id, layout.label);
        const topPatch: Partial<State> = { root: topNext };
        if (get().editMode === "free") topPatch.freeEditsDirty = true;
        set(topPatch);
        return;
      }
      const cw = Math.max(1, controlWidth);
      // Control: keep its right anchor + vertical offsets; set its width.
      const crt = getRectTransform(control);
      let next = updateComponentProp(r, control.id, "RectTransform", "offsetMin", { x: -cw, y: crt.offsetMin.y });
      next = updateComponentProp(next, control.id, "RectTransform", "offsetMax", { x: 0, y: crt.offsetMax.y });
      // Label: left-anchored, reserving exactly (control + gap) on the right so it
      // fills the rest and never clips.
      if (labelSlot) {
        const lrt = getRectTransform(labelSlot);
        next = updateComponentProp(next, labelSlot.id, "RectTransform", "offsetMin", { x: 0, y: lrt.offsetMin.y });
        next = updateComponentProp(next, labelSlot.id, "RectTransform", "offsetMax", { x: -(cw + SNAP_GAP), y: lrt.offsetMax.y });
      }
      const patch: Partial<State> = { root: next };
      if (get().editMode === "free") patch.freeEditsDirty = true;
      set(patch);
    },

    setLabelPosition: (slotId, pos) => {
      const base = get().root;
      const wrapper = findSlot(base, slotId);
      if (!wrapper || !LABELLED_CONTROL_TYPES.has(wrapper.name)) return;
      // Multi-part composites (Radio Group) keep their authored left layout.
      if (wrapper.components.some((c) => c.type === "RadioGroup")) return;
      if (labelPositionOf(wrapper) === pos) return;
      const label = wrapper.children.find((c) => c.name === "Label");
      const controls = wrapper.children.filter(
        (c) => c !== label && c.components.some((k) => k.type === "RectTransform"),
      );
      if (!label || controls.length !== 1) return;
      const control = controls[0];

      const crt = getRectTransform(control);
      const controlH = Math.abs((crt.offsetMax?.y ?? 0) - (crt.offsetMin?.y ?? 0)) || 28;
      const controlW =
        Math.abs((crt.offsetMax?.x ?? 0) - (crt.offsetMin?.x ?? 0)) ||
        DEFAULT_CONTROL_WIDTH[wrapper.name] || 80;
      const fontPx = (label.components.find((k) => k.type === "Text")?.props as { size?: number } | undefined)?.size ?? 14;
      const labelW = measureLabelWidth(controlLabelText(wrapper), fontPx);
      const stretchy = STRETCHY_CONTROL_TYPES.has(wrapper.name);
      const layout = computeCompositeLayout(pos, { stretchy, controlW, controlH, labelW });

      // Record the position, then re-lay the internals (label + control).
      let next = setLabelPositionField(base, slotId, pos);
      next = applyRT(next, label.id, layout.label);
      next = applyRT(next, control.id, layout.control);

      const parent = findParent(base, slotId);
      const layoutManaged = isLayoutManaged(base, slotId);
      if (layoutManaged) {
        // Inside a ScrollArea / layout, the wrapper's HEIGHT is owned by its
        // LayoutElement (the RT is ignored), so the band only makes room for
        // itself if we grow the LayoutElement — then the layout shifts the rows
        // below it down. Add one if missing (carrying its order index).
        const live = findSlot(next, slotId);
        if (live && !live.components.some((c) => c.type === "LayoutElement")) {
          next = addComponent(next, slotId, "LayoutElement");
          const idx = parent ? parent.children.filter((c) => !isStructuralSlot(c)).findIndex((c) => c.id === slotId) : 0;
          next = updateComponentProp(next, slotId, "LayoutElement", "orderOffset", Math.max(0, idx));
        }
        next = updateComponentProp(next, slotId, "LayoutElement", "preferredHeight", layout.wrapperH);
        next = updateComponentProp(next, slotId, "LayoutElement", "minHeight", layout.wrapperH);
      } else {
        // Absolute placement: resize the wrapper RT, keeping its TOP edge pinned
        // so it grows/shrinks downward (predictable stacking).
        const canvasSize = canvasSizeOf(base);
        const wrapRect = computeAbsoluteRect(base, slotId, canvasSize);
        const parentRect =
          (parent ? computeAbsoluteRect(base, parent.id, canvasSize) : null) ??
          { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
        if (wrapRect) {
          const wrt = getRectTransform(wrapper);
          const newRect = { x: wrapRect.x, y: wrapRect.y, w: wrapRect.w, h: layout.wrapperH };
          const { offsetMin, offsetMax } = rectToOffsets(newRect, parentRect, wrt.anchorMin, wrt.anchorMax);
          next = updateComponentProp(next, slotId, "RectTransform", "offsetMin", offsetMin);
          next = updateComponentProp(next, slotId, "RectTransform", "offsetMax", offsetMax);
        }
      }

      // Snap mode: reflow so siblings shift for the new height. Root-level uses
      // the pure snapReflowRoot (folded into the same commit); a nested container
      // reflows live after the commit (mirrors the add flow).
      const snapMode = get().editMode === "snap";
      const parentIsRoot = !parent || parent.id === base.id;
      if (snapMode && parentIsRoot) {
        commit(snapReflowRoot(next));
      } else {
        commit(next);
        if (snapMode && parent) get().reflowContainerNow(parent.id);
      }
    },

    dragCommit: () => {
      const { _preDragRoot, root, history, theme } = get();
      if (!_preDragRoot) return;
      set({
        history: [...history, { root: _preDragRoot, theme }].slice(-HISTORY_LIMIT),
        future: [],
        _preDragRoot: null,
        root,
        _lastTabSwitchHost: null,
        _lastEditKey: null,
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
        history: [...get().history, { root: base, theme: get().theme }].slice(-HISTORY_LIMIT),
        future: [],
        _preDragRoot: null,
        root: next,
        _lastTabSwitchHost: null,
        _lastEditKey: null,
      });
    },

    undo: () => {
      const { history, root, theme, future, selectedSlotId, editingPopupId } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      set({
        root: prev.root,
        theme: prev.theme,
        history: history.slice(0, -1),
        future: [{ root, theme }, ...future].slice(0, HISTORY_LIMIT),
        _lastTabSwitchHost: null,
        _lastEditKey: null,
        // The restored tree may not contain the previously-selected slot (e.g.
        // undoing an add) — drop a dangling selection / popup-edit binding so the
        // Inspector and the floating popup surface never point at a ghost slot.
        selectedSlotId: validSelection(prev.root, selectedSlotId),
        editingPopupId: validSelection(prev.root, editingPopupId),
      });
    },

    redo: () => {
      const { future, root, theme, history, selectedSlotId, editingPopupId } = get();
      if (future.length === 0) return;
      const [next, ...rest] = future;
      set({
        root: next.root,
        theme: next.theme,
        future: rest,
        history: [...history, { root, theme }].slice(-HISTORY_LIMIT),
        _lastTabSwitchHost: null,
        _lastEditKey: null,
        selectedSlotId: validSelection(next.root, selectedSlotId),
        editingPopupId: validSelection(next.root, editingPopupId),
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
      // Build in the current language: the starter template localizes via
      // getDict().content; every other preset builds English then has its
      // designed text translated by localizePanelText (unknown strings stay
      // English). Slot names + non-text props are untouched.
      const lang = get().language;
      let r = lockRoot(localizePanelText(p.build(lang), lang));
      // Match the editor + export layout mode to the preset's shape. Free-form
      // presets (cards, dialogs, split layouts, the keypad grid) open in Free
      // mode with stackLayout off so their absolute 2D design is preserved;
      // vertical-list panels open in Snap with stackLayout on so they're
      // reorderable in-game. (See PresetDescriptor.freeform.)
      const stack = !p.freeform;
      r = updateComponentProp(r, r.id, "Canvas", "stackLayout", stack);
      // Snap templates must respect the canvas content margin. (Free-form presets
      // keep their hand-placed absolute layout — skipped.) No-op for presets
      // already authored at/inside the margin; fixes any that sit too close.
      if (stack) r = enforceCanvasMargins(r);
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
      const lang = get().language;
      const r = lockRoot(
        localizePanelText(blank ? blank.build(lang) : createStarterTemplate(lang), lang),
      );
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

    reflowContainerNow: (containerId) => {
      // Live re-stack (its own non-history set — callers bracket with
      // dragStart/dragCommit or fold it into their own commit). The actual work
      // lives in reflowContainerTree so folded-edit paths can reuse it.
      set({ root: reflowContainerTree(get().root, containerId) });
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
      // If the drop landed inside a tab page, grow its Tabs container to fit.
      next = fitTabsToContent(next);
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
        // Use the canvas content margin as the edge gutter (instead of inferring
        // it from the current positions) so arranging snaps content to the margin.
        sideMargin: canvasContentPad(r0),
        minWidths: minWidthsFor(r0, rootC, canvasSize),
      });

      // Re-inset any wide full-stretch element that still sits closer than the
      // margin (the reflow leaves full-width elements at their authored width).
      const arranged = applyResultToContainer(r0, rootC, result, canvasSize, true /* fit canvas */);
      commit(enforceCanvasMargins(arranged));
      set({ freeEditsDirty: false });
    },

    toggleOverlays: () => set((s) => ({ showOverlays: !s.showOverlays })),
    toggleLeftPanel: () => set((s) => ({ leftPanelHidden: !s.leftPanelHidden })),
    toggleRightPanel: () => set((s) => ({ rightPanelHidden: !s.rightPanelHidden })),
    setWhatsNewOpen: (open) => set({ whatsNewOpen: open }),
    // UI-only: plain set() (never commit/history) + persist. The open document
    // is intentionally left untouched so switching language can't clobber edits.
    setLanguage: (lang) => {
      writeLanguage(lang);
      set({ language: lang });
    },
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
      // Any manual edit kicks the preset selector into "custom" so the user sees
      // they're no longer on a named preset. Routed through commitTheme so the
      // staged value is part of the same coalesced undo step as the live re-tint
      // that follows it (the Theme menu calls setTheme + apply* together).
      const next = { ...get().theme, ...partial, preset: "custom" as const };
      commitTheme(get().root, next);
    },

    selectThemePreset: (preset) => {
      const next = applyThemePresetValues(preset, get().theme);
      const nextRoot = preset !== "custom" ? applyAllTheme(get().root, next) : get().root;
      // Picking a named preset is a discrete one-click "set + apply" — its own
      // undo step (not coalesced into a prior color tweak), restoring both the
      // tree and the theme values on undo.
      set((s) => ({
        history: [...s.history, { root: s.root, theme: s.theme }].slice(-HISTORY_LIMIT),
        future: [],
        root: nextRoot,
        theme: next,
        dirty: true,
        _lastTabSwitchHost: null,
        _lastEditKey: null,
      }));
    },

    applyThemeAll: () => commitTheme(applyAllTheme(get().root, get().theme), get().theme),
    applyThemeBackground: () =>
      commitTheme(applyBackground(get().root, get().theme.background), get().theme),
    applyThemeHeaderText: () =>
      commitTheme(
        applyHeaderText(get().root, get().theme.headerTextColor, get().theme.headerTextSize),
        get().theme,
      ),
    applyThemeBodyText: () =>
      commitTheme(
        applyBodyText(get().root, get().theme.bodyTextColor, get().theme.bodyTextSize),
        get().theme,
      ),
    applyThemeAccent: () => commitTheme(applyAccent(get().root, get().theme.accent), get().theme),
    applyThemeControlSurface: () =>
      commitTheme(applyControlSurface(get().root, get().theme.controlSurface), get().theme),
    applyThemeContainerSurface: () =>
      commitTheme(applyContainerSurface(get().root, get().theme.containerSurface), get().theme),
    applyThemeButtonA: () => commitTheme(applyButtonA(get().root, get().theme.buttonA), get().theme),
    applyThemeButtonB: () => commitTheme(applyButtonB(get().root, get().theme.buttonB), get().theme),
    applyThemeCornerRadius: () =>
      commitTheme(applyCornerRadius(get().root, get().theme.cornerRadius), get().theme),
    applyBranding: () => {
      const t = get().theme;
      commitTheme(
        applyBranding(get().root, t.backLogoUrl, t.backLogoReason, t.backLogoImageHash),
        t,
      );
    },
  };
});
