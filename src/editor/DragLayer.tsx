import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { findParent, findSlot, isDescendant } from "../model/operations";
import { controlDisplayName } from "../model/controlName";
import type { Slot } from "../model/types";
import { getRectTransform, type Rect } from "./render/rectTransform";
import { computeAbsoluteRect, isLayoutManaged, rectToOffsets } from "./render/slotRect";
import {
  computeDrop,
  containerRows,
  detectColumnDrop,
  findContainer,
  getContainers,
  groupRows,
  inferSideMargin,
  planFlow,
  memberMinWidth,
  rowFitsSideBySide,
  rowItemsOf,
  rowsWithout,
  TALL_FACTOR,
  type DropSpec,
  type SnapContainer,
  type SnapRow,
} from "./render/snapFlow";
import { contentMinWidth } from "./render/contentMin";
import { dragController } from "./dragController";
import { DRAG_GLIDE } from "./render/renderSlot";

type HandleId = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";
const HANDLES: readonly HandleId[] = ["tl", "t", "tr", "r", "br", "b", "bl", "l"];

// Fraction of a nested single-column container's width, at each side, that reads
// as "drop BESIDE it" (resolving to the parent). The middle band drops INSIDE.
// Generous on purpose — a single column's left/right strips are dead space, and
// threading the old thin flank to drop beside a wide ScrollArea was the pain.
const BESIDE_FRAC = 0.3;

const HANDLE_CURSORS: Record<HandleId, string> = {
  tl: "nwse-resize",
  t: "ns-resize",
  tr: "nesw-resize",
  r: "ew-resize",
  br: "nwse-resize",
  b: "ns-resize",
  bl: "nesw-resize",
  l: "ew-resize",
};

const H = 8; // handle size px (in screen space)
const MIN_SIZE = 12; // minimum slot dimension in canvas-space px

// Left-gutter grab rails (screen px, just outside the canvas left edge).
const NEAR_RAIL = -22; // inner per-row grips
const FAR_RAIL = -46; // outer "whole nested container" grips
const RAIL_W = 20;
// External (editor) scrollbar for scrollable fields — sits just outside the
// field's right edge so it never collides with the right resize handles.
const SCROLLBAR_GAP = 6; // px right of the field's right edge
const SCROLLBAR_W = 14;
// Grip colours form one language across the editor: BLUE = an element (any row
// grip — top-level or nested), PURPLE = a nested area/section (the big outer
// grip on the left and the scrollbar rail on the right).
const BLUE = "rgba(56,189,248,";
const PURPLE = "rgba(168,85,247,";
// The dark dots inside every grip. Reused as the scrollbar thumb colour so the
// rail (purple, like the left grabber) + dark thumb read as one family.
const DOT_COLOR = "#0b1220";
const DOT_COLOR_HOVER = "#334155";

type DragMode = "free-move" | "free-resize" | "canvas-resize" | "flow";

// A snap block-flow drag: moving element(s) within their container, or across
// containers (pull in/out of a scroll area).
interface FlowState {
  draggedIds: string[];
  sourceContainerId: string;
  sourceRows: SnapRow[];
  sourceRowItems: Record<string, Rect>;
  // false for multi-element row drags and layout containers (single column):
  // those only ever reorder rows, never merge elements side-by-side.
  allowInto: boolean;
  // True when the source container positions children by RectTransform offsets
  // (the Canvas root) rather than a layout engine. Only then can a single
  // element be nudged horizontally through its row's dead space (a layout
  // container would just override the x), so it gates the in-row nudge.
  absolute: boolean;
  // Snapshot geometry captured at drag start, for stable cross-container
  // hit-testing regardless of live reflow.
  snapshotRoot: Slot;
  containers: SnapContainer[];
  // Set while the cursor is over a DIFFERENT container than the source — the
  // pending reparent applied on drop.
  pending: { targetContainerId: string; drop: DropSpec } | null;
  // Set while a single-element drag is sliding horizontally through its row's
  // dead space WITHOUT reordering (canvas-space target rect). Cleared the
  // moment a genuine reorder happens. Committed (with anchor pinning) on drop.
  nudgeRect: Rect | null;
  // Set while the cursor is over a side-by-side merge that was REJECTED for lack
  // of room (kept stacked instead). Read on drop to offer "widen panel to fit".
  widenContext: { rowIds: string[]; draggedIds: string[]; containerId: string } | null;
  // Per-id CONTENT-based minimum widths for this container's members, captured at
  // drag start. Drives the feasibility gate + dead-space trimming so roomy
  // canvases pack side-by-side instead of refusing. See contentMinWidth.
  minWidths: Record<string, number>;
  // Set while the cursor is in the dead space beside a TALL element — drop will
  // stack the dragged element into a vertical column with the short member(s).
  columnPending: { shortIds: string[]; place: "top" | "bottom" } | null;
}

interface DragState {
  kind: "move" | HandleId;
  mode: DragMode;
  startMouseX: number;
  startMouseY: number;
  // Viewport zoom captured at drag start. mousemove MUST keep using this value
  // rather than the live `scale` prop: a canvas-resize drag changes canvasSize,
  // which makes zoom-to-fit recompute `scale` mid-drag — feeding the new scale
  // back into the delta math creates a runaway loop (the canvas balloons and the
  // panel appears to "narrow" once it outgrows the viewport). Pinning the scale
  // keeps startMouse and the live pointer in the same coordinate space.
  startScale: number;
  startRect: Rect;
  parentAbsRect: Rect;
  anchorMin: { x: number; y: number };
  anchorMax: { x: number; y: number };
  slotId: string;
  // A move/flow drag stays "armed" (not started) until the pointer moves past
  // DRAG_THRESHOLD, so a plain click selects (and shows resize handles) without
  // kicking off a drag. Handle/canvas resizes start immediately.
  started: boolean;
  flow?: FlowState;
}

// Screen px the pointer must travel before an armed move/flow drag actually
// begins. Below this, mousedown→up is treated as a click (select only).
const DRAG_THRESHOLD = 4;

// A grabbable rail handle.
interface Grip {
  key: string;
  kind: "row" | "container";
  // The container whose children get reordered (the PARENT, for a container grip).
  containerId: string;
  ids: string[];
  rect: Rect; // canvas-space span the grip covers
  nested: boolean; // purple when true (a nested container's inner row grip)
  railX: number;
}

// Which popup card (if any) is currently being edited, plus every popup card in
// the document. A popup's content card is a Canvas-root child carrying a
// PopupContent component; it renders only as a centered overlay WHILE its popup
// is being edited (see PopupEditOverlay), and is hidden otherwise. The snap
// engine, however, registers it as a nested container regardless — so without
// scoping, its child grips pile onto the same left rail as the main canvas's
// grips and the two interleave (the "overlapping grabber" problem). We keep grip
// visibility in lockstep with what's actually drawn.
interface PopupScope {
  cardIds: string[];
  activeCardId: string | null;
}

// Should a container's grips be shown given the current popup-edit scope?
//  - no popups in the doc        → always (unchanged behaviour)
//  - editing a popup             → only containers inside THAT card
//  - not editing any popup       → everything EXCEPT popup-card subtrees
function gripInScope(root: Slot, scope: PopupScope, containerId: string): boolean {
  if (scope.cardIds.length === 0) return true;
  const inCard = (cid: string) =>
    containerId === cid || isDescendant(root, cid, containerId);
  if (scope.activeCardId) return inCard(scope.activeCardId);
  return !scope.cardIds.some(inCard);
}

function boundingRect(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function handlePos(rect: Rect, h: HandleId, scale: number): { x: number; y: number } {
  const l = rect.x * scale;
  const t = rect.y * scale;
  const r = (rect.x + rect.w) * scale;
  const b = (rect.y + rect.h) * scale;
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const map: Record<HandleId, { x: number; y: number }> = {
    tl: { x: l, y: t },
    t: { x: cx, y: t },
    tr: { x: r, y: t },
    r: { x: r, y: cy },
    br: { x: r, y: b },
    b: { x: cx, y: b },
    bl: { x: l, y: b },
    l: { x: l, y: cy },
  };
  return map[h];
}

function applyDrag(drag: DragState, dx: number, dy: number): Rect {
  let { x, y, w, h } = drag.startRect;
  switch (drag.kind) {
    case "move":
      x += dx;
      y += dy;
      break;
    case "tl":
      x += dx; y += dy; w -= dx; h -= dy;
      break;
    case "t":
      y += dy; h -= dy;
      break;
    case "tr":
      y += dy; w += dx; h -= dy;
      break;
    case "r":
      w += dx;
      break;
    case "br":
      w += dx; h += dy;
      break;
    case "b":
      h += dy;
      break;
    case "bl":
      x += dx; w -= dx; h += dy;
      break;
    case "l":
      x += dx; w -= dx;
      break;
  }
  return { x, y, w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) };
}

function snapRect(rect: Rect, kind: DragState["kind"], grid: number): Rect {
  if (grid <= 0) return rect;
  const r = (v: number) => Math.round(v / grid) * grid;
  let { x, y, w, h } = rect;
  if (kind === "move") {
    x = r(x);
    y = r(y);
  } else {
    if (kind === "tl" || kind === "l" || kind === "bl") {
      const right = x + w;
      x = r(x);
      w = right - x;
    }
    if (kind === "tl" || kind === "t" || kind === "tr") {
      const bottom = y + h;
      y = r(y);
      h = bottom - y;
    }
    if (kind === "tr" || kind === "r" || kind === "br") {
      w = r(x + w) - x;
    }
    if (kind === "bl" || kind === "b" || kind === "br") {
      h = r(y + h) - y;
    }
  }
  return { x, y, w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) };
}

interface Props {
  scale: number;
  canvasSize: { w: number; h: number };
  // Lift vector (canvas units) applied while a popup is being edited, so the
  // popup's grips/overlays move into the dead space with the floating card. Null
  // when not editing a popup. Applied as a transform on the layer's measuring
  // container, so getBoundingClientRect shifts with it and the pointer→canvas
  // mapping stays correct WITHOUT any per-site delta compensation. (During popup
  // editing every grip/overlay this layer draws is popup-scoped — see
  // popupScope — so a single container-level transform is sufficient.)
  popupShift?: { x: number; y: number } | null;
}

// Where a flow drag will land — drawn as an amber bar (horizontal between rows,
// vertical when inserting between columns of a row).
interface DropIndicator {
  vertical: boolean;
  rect: Rect; // canvas-space
  // A "you're aiming here, but it won't fit" preview (an infeasible side-by-side
  // merge). Rendered as a striped amber bar instead of the solid one, and on
  // release the drag is cancelled + the "Widen panel to fit" warning is shown.
  warn?: boolean;
}

export default function DragLayer({ scale, canvasSize, popupShift }: Props) {
  const root = useStore((s) => s.root);
  const selectedId = useStore((s) => s.selectedSlotId);
  const select = useStore((s) => s.select);
  const dragStart = useStore((s) => s.dragStart);
  const dragApply = useStore((s) => s.dragApply);
  const dragCommit = useStore((s) => s.dragCommit);
  const snap = useStore((s) => s.snap);
  const editMode = useStore((s) => s.editMode);
  const resizeCanvasLive = useStore((s) => s.resizeCanvasLive);
  const setCanvasResizeView = useStore((s) => s.setCanvasResizeView);
  const reflowLive = useStore((s) => s.reflowLive);
  const nudgeCommit = useStore((s) => s.nudgeCommit);
  const flowReparent = useStore((s) => s.flowReparent);
  const restorePreDrag = useStore((s) => s.restorePreDrag);
  const cancelDrag = useStore((s) => s.cancelDrag);
  const setLiveDrag = useStore((s) => s.setLiveDrag);
  const duplicate = useStore((s) => s.duplicate);
  const remove = useStore((s) => s.remove);
  const toggleSlotLock = useStore((s) => s.toggleSlotLock);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const widenCanvasAndMerge = useStore((s) => s.widenCanvasAndMerge);
  const groupIntoColumn = useStore((s) => s.groupIntoColumn);
  const dissolveColumns = useStore((s) => s.dissolveColumns);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  // True while the selection box should GLIDE with its block (snap-flow reorder
  // within a container). False when it must track the cursor 1:1 — a free move /
  // resize, a canvas resize, or a cross-container ghost — so it never lags.
  const [boxGlide, setBoxGlide] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  // Highlighted container when a cross-container drop is pending.
  const [targetHighlight, setTargetHighlight] = useState<Rect | null>(null);
  // Live scroll metrics per scrollable container (keyed by container slot id),
  // so child grips follow the scrolled items AND the external purple scrollbar
  // can size/position its thumb. top/scrollH/clientH are in canvas px (the
  // canvas is CSS-transform scaled, which doesn't change these values).
  const [scrollInfo, setScrollInfo] = useState<
    Record<string, { top: number; scrollH: number; clientH: number }>
  >({});
  // When a MULTI-element row grip is clicked (not dragged), a small picker lets
  // the user choose which element in that row to edit. (left/top in scaled
  // canvas-wrapper px, matching the grip coordinate space.)
  const [rowPicker, setRowPicker] = useState<{ ids: string[]; left: number; top: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // After a side-by-side drop was rejected for lack of room, offer to widen the
  // panel and place the elements side-by-side anyway. Cleared on the next drag.
  const [widenToast, setWidenToast] = useState<{ rowIds: string[]; draggedIds: string[]; containerId: string } | null>(null);

  const selectedSlot = useMemo(
    () => (selectedId ? findSlot(root, selectedId) : null),
    [root, selectedId],
  );
  const locked = !!selectedSlot?.locked;
  const layoutManaged = useMemo(
    () => (selectedId ? isLayoutManaged(root, selectedId) : false),
    [root, selectedId],
  );

  const storedRect = useMemo(
    () => (selectedId ? computeAbsoluteRect(root, selectedId, canvasSize) : null),
    [root, selectedId, canvasSize],
  );

  const displayRect = previewRect ?? storedRect;

  // The selection overlay (box / chip / handles) is rendered in this layer, a
  // SIBLING of the scrolled content — so it doesn't move when a scroll container
  // scrolls, leaving the box stranded over the wrong row. Offset it by the
  // scrollTop of every ancestor scroll container so it rides with its element,
  // and hide it once the element scrolls out of the container's visible band
  // (otherwise the box floats over the header / neighbouring rows). Mirrors the
  // grip rail's scroll-follow + clamp logic. No-op for elements outside any
  // scroll area (offsetY 0, band null).
  const overlay = useMemo(() => {
    if (!displayRect) return null;
    if (!selectedId) return { rect: displayRect, visible: true };
    const byId = new Map(getContainers(root, canvasSize).map((c) => [c.id, c] as const));
    let offsetY = 0;
    let band: { top: number; bottom: number } | null = null;
    let p = findParent(root, selectedId);
    while (p) {
      const c = byId.get(p.id);
      if (c && c.nested) {
        offsetY += scrollInfo[c.id]?.top ?? 0;
        const top = c.absRect.y;
        const bottom = c.absRect.y + c.absRect.h;
        band = band
          ? { top: Math.max(band.top, top), bottom: Math.min(band.bottom, bottom) }
          : { top, bottom };
      }
      p = findParent(root, p.id);
    }
    const rect = offsetY ? { ...displayRect, y: displayRect.y - offsetY } : displayRect;
    const cy = rect.y + rect.h / 2;
    const visible = !band || (cy >= band.top && cy <= band.bottom);
    return { rect, visible };
  }, [displayRect, selectedId, root, canvasSize, scrollInfo]);
  const oRect = overlay?.rect ?? null;
  const overlayVisible = !!overlay?.visible;

  // Resolve a slot to the row member that should actually be dragged in snap
  // mode. A labelled control is a wrapper row (the direct child of a container)
  // holding a Label + the control as nested leaves; only the wrapper is a
  // container "member" the flow engine can reflow. Grabbing a leaf (the label
  // text or the control itself) must therefore drag its member ancestor — the
  // child of the nearest registered snap container along the path. Without this,
  // grabbing a leaf passes a non-member id to beginFlow, which finds no row rect
  // and silently no-ops (the user could only grab the wrapper's bare "gap").
  // Returns the container id plus the member id (which may equal slotId when the
  // slot is itself a direct child of a container).
  const resolveSnapMember = useCallback(
    (slotId: string): { containerId: string; memberId: string } | null => {
      const ids = new Set(getContainers(root, canvasSize).map((c) => c.id));
      let child = slotId;
      let p = findParent(root, slotId);
      while (p) {
        if (ids.has(p.id)) return { containerId: p.id, memberId: child };
        child = p.id;
        p = findParent(root, p.id);
      }
      return null;
    },
    [root, canvasSize],
  );

  // Resolve which popup card (if any) the selection puts us "inside", so grips
  // can be scoped to the visible surface (the editing card, or the main canvas).
  const popupScope = useMemo<PopupScope>(() => {
    const cardIds = root.children
      .filter((c) => c.components.some((cc) => cc.type === "PopupContent"))
      .map((c) => c.id);
    if (cardIds.length === 0 || !selectedId) return { cardIds, activeCardId: null };
    const sel = findSlot(root, selectedId);
    const popup = sel?.components.find((c) => c.type === "Popup");
    let activeCardId: string | null = null;
    if (popup) {
      // Selection is a popup trigger → its linked content card is being edited.
      const cid = (popup.props as { contentSlotId?: string }).contentSlotId;
      if (cid && cardIds.includes(cid)) activeCardId = cid;
    } else {
      // Selection is the card itself or something inside it.
      activeCardId =
        cardIds.find((cid) => cid === selectedId || isDescendant(root, cid, selectedId)) ?? null;
    }
    return { cardIds, activeCardId };
  }, [root, selectedId]);

  // While a popup floats in the dead space, its grips should HUG the card's left
  // edge rather than sit on the canvas's left gutter (the default rail), so they
  // read as belonging to the floating card and not the panel behind it. This is
  // the card's left x in canvas units; the grip render adds it (×scale) so the
  // rail lands just left of the card. Render-only — the pointer math keys off the
  // layer's container transform (popupShift), not individual grip positions, so
  // shifting where grips DRAW doesn't disturb dragging.
  const popupCardLeftX = useMemo(() => {
    if (!popupShift || !popupScope.activeCardId) return null;
    return computeAbsoluteRect(root, popupScope.activeCardId, canvasSize)?.x ?? null;
  }, [popupShift, popupScope.activeCardId, root, canvasSize]);

  // Two-tier grabbables: per-row inner grips (blue at top level, light purple
  // inside a nested container) + a larger light-purple outer grip that moves the
  // whole nested-container *section*. Editor-only — never exported.
  const grips = useMemo<Grip[]>(() => {
    if (editMode !== "snap") return [];
    const containers = getContainers(root, canvasSize);
    const containerIds = new Set(containers.map((c) => c.id));

    // For each nested container, build its outer "whole section" grip. The grip
    // moves the *section row* — the child of the nearest real container (root or
    // another nested container) that the nested container lives under — so it
    // works whether the scroll area is a direct child or wrapped in a section
    // slot. That section row's own inner grip is suppressed (the outer grip
    // covers it), which also prevents the rail collision a wrapper would cause.
    const outerGrips: Grip[] = [];
    // realContainerId -> set of section-row ids whose inner grip to skip
    const sectionRows = new Map<string, Set<string>>();
    for (const n of containers.filter((c) => c.nested)) {
      let child = n.id;
      let p = findParent(root, n.id);
      while (p && !containerIds.has(p.id)) {
        child = p.id;
        p = findParent(root, p.id);
      }
      if (!p) continue; // no real container ancestor (shouldn't happen)
      const sectionRect = computeAbsoluteRect(root, child, canvasSize);
      if (!sectionRect) continue;
      if (!sectionRows.has(p.id)) sectionRows.set(p.id, new Set());
      sectionRows.get(p.id)!.add(child);
      outerGrips.push({
        key: `section-${n.id}`,
        kind: "container",
        containerId: p.id,
        ids: [child],
        rect: sectionRect,
        nested: true,
        railX: FAR_RAIL,
      });
    }

    const out: Grip[] = [];
    for (const c of containers) {
      const skip = sectionRows.get(c.id) ?? new Set<string>();
      const rows = containerRows(root, c, canvasSize);
      for (const row of rows) {
        // Skip the section row — moved by its outer grip instead — but ONLY when
        // the row is purely the section. If something else got placed beside the
        // section (e.g. an image dropped to the right of a ScrollArea), keep a row
        // grip so that sibling stays grabbable instead of being swallowed.
        if (row.ids.length && row.ids.every((id) => skip.has(id))) continue;
        let rect = row.rect;
        if (c.nested) {
          // Offset by the container's live scroll, then clamp to its visible
          // band — so grips ride with the scrolled items and rows scrolled out
          // of view get no grip.
          const sy = scrollInfo[c.id]?.top ?? 0;
          const top = Math.max(rect.y - sy, c.absRect.y);
          const bottom = Math.min(rect.y + rect.h - sy, c.absRect.y + c.absRect.h);
          if (bottom - top < 6) continue;
          rect = { ...rect, y: top, h: bottom - top };
        }
        // Members that are themselves a nested container (e.g. a Column beside an
        // image) already have their OWN purple "section" grip — don't also give
        // them a blue per-member handle (that's the duplicate "extra blue tab").
        const memberIds = row.ids.filter((id) => !skip.has(id));
        if (memberIds.length > 1) {
          const ordered = [...memberIds].sort(
            (a, b) =>
              (computeAbsoluteRect(root, a, canvasSize)?.x ?? 0) -
              (computeAbsoluteRect(root, b, canvasSize)?.x ?? 0),
          );
          // A normal same-height side-by-side row (e.g. a header: icon + title +
          // close) collapses to ONE grip that reorders the WHOLE row; individual
          // elements there stay draggable by their body, and CLICKING the grip
          // opens the element picker. The EXCEPTION — kept as one handle PER
          // MEMBER — is an asymmetric row where one element is much TALLER than
          // the rest (a full-height image beside short controls): there the small
          // members need their own rail grips to stay individually grabbable.
          const heights = ordered
            .map((id) => computeAbsoluteRect(root, id, canvasSize)?.h ?? 0)
            .sort((a, b) => b - a);
          const tallDisparity = heights.length > 1 && heights[0] >= TALL_FACTOR * heights[1];
          if (tallDisparity) {
            // One handle per member (the rail band split into left→right
            // segments), so any single element can be grabbed and pulled out.
            const seg = rect.h / ordered.length;
            ordered.forEach((id, idx) => {
              out.push({
                key: `rowmem-${c.id}-${id}`,
                kind: "row",
                containerId: c.id,
                ids: [id],
                rect: { ...rect, y: rect.y + idx * seg, h: seg },
                nested: c.nested,
                railX: NEAR_RAIL,
              });
            });
          } else {
            // Collapse: one grip spanning the row band. ids = every member, so a
            // drag reorders the whole row (reorderOnly) and a click opens the
            // picker (see the grip's onMouseDown / onMouseUp click handling).
            out.push({
              key: `row-${c.id}-${ordered.join("-")}`,
              kind: "row",
              containerId: c.id,
              ids: ordered,
              rect,
              nested: c.nested,
              railX: NEAR_RAIL,
            });
          }
        } else if (memberIds.length === 1) {
          // Single grabbable member (others, if any, are nested containers with
          // their own purple grip).
          out.push({
            key: `row-${c.id}-${memberIds[0]}`,
            kind: "row",
            containerId: c.id,
            ids: memberIds,
            rect,
            nested: c.nested,
            railX: NEAR_RAIL,
          });
        }
        // memberIds.length === 0 → every member is a nested container (covered by
        // its purple section grip); emit no blue handle.
      }
    }
    // Outer (parent) grips first so the inner child grips render ON TOP of them.
    // Scope to the visible surface: hide popup-card grips unless that popup is
    // being edited, and hide the main canvas's grips while it is.
    return [...outerGrips, ...out].filter((g) => gripInScope(root, popupScope, g.containerId));
  }, [editMode, root, canvasSize, scrollInfo, popupScope]);

  // External purple scrollbars: one per scrollable nested container, in the
  // right gutter just outside the field. Editor-only — the in-game scrollbar is
  // built at export time and previewed (statically) inside the box separately.
  // NOT gated to snap mode: a scroll field needs a working scroll control in
  // BOTH modes (the snap GRIPS stay snap-only, but the scrollbar is a content
  // control, not a layout grabber — you still need to scroll a field in Free).
  const scrollbars = useMemo(() => {
    const out: {
      id: string;
      left: number;
      trackTop: number;
      trackH: number;
      thumbTop: number;
      thumbH: number;
    }[] = [];
    for (const c of getContainers(root, canvasSize)) {
      if (!c.nested) continue;
      if (!gripInScope(root, popupScope, c.id)) continue; // match grip visibility
      const info = scrollInfo[c.id];
      if (!info || info.scrollH <= info.clientH + 1) continue; // not scrollable
      const trackTop = c.absRect.y * scale;
      const trackH = c.absRect.h * scale;
      const thumbH = Math.max(18, (info.clientH / info.scrollH) * trackH);
      const maxScroll = info.scrollH - info.clientH;
      const frac = maxScroll > 0 ? info.top / maxScroll : 0;
      out.push({
        id: c.id,
        // Hang off the CANVAS right edge in its own tab (mirroring the left
        // grabber rail), not at the field's inner edge — keeps it clear of the
        // content and the resize handles.
        left: canvasSize.w * scale + SCROLLBAR_GAP,
        trackTop,
        trackH,
        thumbTop: trackTop + frac * (trackH - thumbH),
        thumbH,
      });
    }
    return out;
  }, [editMode, root, canvasSize, scrollInfo, scale, popupScope]);

  // Drag the external scrollbar thumb to scroll its field (sets the editor
  // scroll div's scrollTop; the scroll listener then refreshes the thumb).
  const beginScrollDrag = useCallback(
    (containerId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = document.querySelector<HTMLElement>(
        `[data-scroll-container="${containerId}"]`,
      );
      if (!el) return;
      const startY = e.clientY;
      const startTop = el.scrollTop;
      const onMove = (ev: MouseEvent) => {
        const trackH = el.clientHeight * scale;
        const thumbH = Math.max(18, (el.clientHeight / el.scrollHeight) * trackH);
        const maxScroll = el.scrollHeight - el.clientHeight;
        const travel = trackH - thumbH;
        const dScroll = travel > 0 ? ((ev.clientY - startY) / travel) * maxScroll : 0;
        el.scrollTop = Math.max(0, Math.min(maxScroll, startTop + dScroll));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [scale],
  );

  // Start a snap block-flow drag for the given element(s) within a container.
  const beginFlow = useCallback(
    (
      draggedIds: string[],
      sourceContainerId: string,
      clientX: number,
      clientY: number,
      allowIntoOverride?: boolean,
      selectId?: string,
    ) => {
      setWidenToast(null); // a new drag supersedes any pending widen offer
      const container = findContainer(root, sourceContainerId, canvasSize);
      if (!container) return;
      const items = rowItemsOf(root, container, canvasSize);
      const rowItemsMap: Record<string, Rect> = {};
      for (const it of items) rowItemsMap[it.id] = it.rect;
      const rows = groupRows(items);
      // Content-based minimum width per member, captured now (stable for the drag).
      const widthOf = (s: Slot) =>
        rowItemsMap[s.id]?.w ?? computeAbsoluteRect(root, s.id, canvasSize)?.w ?? 0;
      const minWidths: Record<string, number> = {};
      for (const it of items) {
        const sl = findSlot(root, it.id);
        if (sl) minWidths[it.id] = contentMinWidth(sl, widthOf);
      }
      const dRects = draggedIds.map((id) => rowItemsMap[id]).filter(Boolean) as Rect[];
      if (dRects.length === 0 || rows.length === 0) return;
      const startRect = boundingRect(dRects);

      // Single-element drags select immediately, so a click (or micro-drag that
      // never passes the threshold) selects and reveals resize handles. A
      // multi-element row grip defers: a click on it opens the row element
      // picker (below) instead of arbitrarily grabbing the first element.
      // selectId lets a body-drag select the grabbed leaf (label/control) while
      // dragging its member row, so click-to-resize still targets the leaf.
      if (selectId) select(selectId);
      else if (draggedIds.length === 1) select(draggedIds[0]);

      const containerEl = containerRef.current!;
      const bounds = containerEl.getBoundingClientRect();
      const mx = (clientX - bounds.left) / scale;
      const my = (clientY - bounds.top) / scale;

      dragRef.current = {
        kind: "move",
        mode: "flow",
        startMouseX: mx,
        startMouseY: my,
        startScale: scale,
        startRect,
        parentAbsRect: container.absRect,
        anchorMin: { x: 0, y: 0 },
        anchorMax: { x: 0, y: 0 },
        slotId: draggedIds[0],
        started: false, // armed; dragStart() fires once the pointer moves
        flow: {
          draggedIds,
          sourceContainerId,
          sourceRows: rows,
          sourceRowItems: rowItemsMap,
          allowInto:
            allowIntoOverride ??
            (container.strategy === "absolute" && draggedIds.length === 1),
          absolute: container.strategy === "absolute",
          snapshotRoot: root,
          containers: getContainers(root, canvasSize),
          pending: null,
          nudgeRect: null,
          widenContext: null,
          minWidths,
          columnPending: null,
        },
      };
    },
    [root, canvasSize, scale, select],
  );

  // Start a free/canvas drag (or delegate a snap move to beginFlow).
  const beginDrag = useCallback(
    (slotId: string, kind: "move" | HandleId, clientX: number, clientY: number) => {
      const slot = findSlot(root, slotId);
      if (!slot) return;
      const stored = computeAbsoluteRect(root, slotId, canvasSize);
      if (!stored) return;
      const thisIsRoot = slotId === root.id;

      let mode: DragMode;
      if (thisIsRoot) {
        if (kind === "move") return; // canvas isn't draggable; handles resize it
        mode = "canvas-resize";
      } else {
        if (slot.locked) return;
        if (kind === "move") {
          if (editMode === "snap") {
            // Reorder within the nearest container via block flow. Grabbing a
            // nested leaf (label/control) drags its member row but keeps the
            // leaf selected, so click-to-select-and-resize still targets it.
            const m = resolveSnapMember(slotId);
            if (m) {
              beginFlow([m.memberId], m.containerId, clientX, clientY, undefined, slotId);
              return;
            }
            if (isLayoutManaged(root, slotId)) return;
            mode = "free-move";
          } else {
            if (isLayoutManaged(root, slotId)) return;
            mode = "free-move";
          }
        } else {
          // Resize via handles (both modes) — not for layout-managed slots.
          if (isLayoutManaged(root, slotId)) return;
          mode = "free-resize";
        }
      }

      const parentSlot = findParent(root, slotId);
      const parentAbsRect = parentSlot
        ? computeAbsoluteRect(root, parentSlot.id, canvasSize)!
        : { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
      const rtProps = getRectTransform(slot);

      const containerEl = containerRef.current!;
      const bounds = containerEl.getBoundingClientRect();
      const mx = (clientX - bounds.left) / scale;
      const my = (clientY - bounds.top) / scale;

      // Starting any drag selects its object (so a click / micro-drag selects).
      select(slotId);

      // Resizes (handles / canvas) start immediately; a free MOVE is armed and
      // only starts once the pointer passes the threshold (so a click selects).
      const startNow = kind !== "move";
      dragRef.current = {
        kind,
        mode,
        startMouseX: mx,
        startMouseY: my,
        startScale: scale,
        startRect: { ...stored },
        parentAbsRect,
        anchorMin: rtProps.anchorMin,
        anchorMax: rtProps.anchorMax,
        slotId,
        started: startNow,
      };
      if (startNow) {
        dragStart();
        setLiveDrag({ kind: mode, slotId });
        setBoxGlide(false); // resizes track the cursor — no glide on the box
        setPreviewRect({ ...stored });
        // Pin the viewport display for the whole canvas resize: freeze the zoom
        // and the centering origin so the panel grows in the drag direction (1:1
        // with the cursor) instead of shrinking/recentring to re-fit each frame.
        if (mode === "canvas-resize")
          setCanvasResizeView({
            scale,
            halfW: (canvasSize.w * scale) / 2,
            halfH: (canvasSize.h * scale) / 2,
          });
      }
    },
    [root, canvasSize, scale, editMode, dragStart, beginFlow, resolveSnapMember, select, setCanvasResizeView, setLiveDrag],
  );

  // Overlay/handle entry point: drag the currently-selected slot.
  const startDrag = useCallback(
    (e: React.MouseEvent, kind: "move" | HandleId) => {
      if (!selectedId || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      beginDrag(selectedId, kind, e.clientX, e.clientY);
    },
    [selectedId, beginDrag],
  );

  // renderSlot grab-to-drag: start a move on any slot directly (snap mode).
  useEffect(() => {
    dragController.begin = (slotId, x, y) => beginDrag(slotId, "move", x, y);
    return () => {
      dragController.begin = null;
    };
  }, [beginDrag]);

  // Track each scrollable container's scroll offset so child grips ride along
  // with the items (and only show for items currently in view), AND so the
  // external scrollbar can size/position its thumb. Runs in BOTH modes — the
  // scrollbar (and a selected element's scroll-follow) needs live metrics in
  // Free too, not just Snap. Re-attach when the tree changes (scroll DOM nodes
  // may be added/removed). scrollTop is in canvas units (the canvas is
  // CSS-transform scaled, which doesn't affect it).
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-container]"),
    );
    if (els.length === 0) return;
    const read = () => {
      const next: Record<string, { top: number; scrollH: number; clientH: number }> = {};
      for (const el of els) {
        const id = el.getAttribute("data-scroll-container");
        if (id) next[id] = { top: el.scrollTop, scrollH: el.scrollHeight, clientH: el.clientHeight };
      }
      setScrollInfo((prev) => {
        const keys = Object.keys(next);
        const same =
          keys.length === Object.keys(prev).length &&
          keys.every(
            (k) =>
              prev[k] &&
              prev[k].top === next[k].top &&
              prev[k].scrollH === next[k].scrollH &&
              prev[k].clientH === next[k].clientH,
          );
        return same ? prev : next;
      });
    };
    read();
    els.forEach((el) => el.addEventListener("scroll", read, { passive: true }));
    return () => els.forEach((el) => el.removeEventListener("scroll", read));
  }, [editMode, root, canvasSize]);

  // Dismiss the row element picker on an outside click or Escape.
  useEffect(() => {
    if (!rowPicker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setRowPicker(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRowPicker(null);
    };
    // Defer the mousedown listener so the click that opened it doesn't close it.
    const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [rowPicker]);

  // Close the picker when the tree changes out from under it (e.g. a reorder).
  useEffect(() => {
    setRowPicker(null);
  }, [root]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const drag = dragRef.current;
      const bounds = containerRef.current.getBoundingClientRect();
      // Use the scale captured at drag start, NOT the live `scale` — see the
      // note on DragState.startScale (zoom-to-fit feedback during canvas resize).
      const ds = drag.startScale;
      const mx = (e.clientX - bounds.left) / ds;
      const my = (e.clientY - bounds.top) / ds;
      const dx = mx - drag.startMouseX;
      const dy = my - drag.startMouseY;

      // Armed move/flow drag: do nothing until the pointer clears the threshold,
      // then begin for real (snapshot + show the selection box). This is what
      // lets a plain click select an element (and reveal its resize handles)
      // instead of immediately dragging it.
      if (!drag.started) {
        if (Math.hypot(dx, dy) * ds < DRAG_THRESHOLD) return;
        drag.started = true;
        dragStart();
        setLiveDrag({ kind: drag.mode, slotId: drag.slotId });
        setPreviewRect({ ...drag.startRect });
        setRowPicker(null); // a real drag dismisses the element picker
        // Select the dragged object as feedback (multi-row drags weren't
        // selected on mousedown).
        if (drag.flow) select(drag.flow.draggedIds[0]);
      }

      // Snap block-flow: reorder element(s) within their container, with the
      // rest of the stack reflowing live to open the gap and push large blocks
      // down. (Cross-container reparenting is a follow-up step.)
      if (drag.mode === "flow" && drag.flow) {
        const f = drag.flow;

        // Deepest container actually under the cursor (raw rect; stable snapshot
        // geometry), excluding the dragged element's own subtree.
        const hovered =
          f.containers
            .filter((c) => {
              const r = c.absRect;
              if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) return false;
              if (f.draggedIds.includes(c.id)) return false;
              if (f.draggedIds.some((id) => isDescendant(f.snapshotRoot, id, c.id))) return false;
              return true;
            })
            .sort((a, b) => b.depth - a.depth)[0] ?? null;

        // Around-a-container: a nested layout container (ScrollArea) is BIG, so it
        // used to swallow any drag passing over it into a cross-container "drop
        // inside" (which restores the source — the element appears stuck — and
        // shows no reorder preview). Instead, place the dragged element at ROOT
        // relative to it (above / below / beside), resolving to the parent so it
        // lands at root with a live preview. Skipped for the drag's own source
        // container so reordering inside it (and dragging a child OUT) stays free.
        //
        // Zone model is SIZE-AWARE: a small element that can fit INSIDE keeps the
        // outer-thirds-with-inside-center model. But a BIG element (e.g. a
        // full-width image) can't go inside and — crucially — you grab it near its
        // center, so the cursor sits over the container's CENTER; the thirds model
        // then never reads "right". For a too-big element we instead pick the side
        // by the DOMINANT offset from the container's center (push it right → right,
        // push down → below), with no inside zone — so a side is always reachable.
        let target = hovered;
        let rel:
          | { containerId: string; place: "left" | "right" | "above" | "below" }
          | null = null;
        if (
          hovered &&
          hovered.nested &&
          hovered.strategy === "layout" &&
          hovered.id !== f.sourceContainerId
        ) {
          const r = hovered.absRect;
          const fits = drag.startRect.w <= r.w + 1 && drag.startRect.h <= r.h + 1;
          let place: "left" | "right" | "above" | "below" | null;
          if (fits) {
            const fx = (mx - r.x) / Math.max(1, r.w);
            const fy = (my - r.y) / Math.max(1, r.h);
            // A VerticalLayout "column" (the stack beside a tall image) is
            // addressed by precise INTERNAL index — you want to drop at its top,
            // middle, or bottom — so its whole vertical interior reads as "inside"
            // and computeDrop picks the slot by cursor Y (top included). Carving
            // fractional above/below bands here buried a tall column's first child
            // center inside the "above" zone, making the column TOP unreachable
            // (the reported bug). To place an element ABOVE/BELOW a column at root,
            // drag clear of its vertical extent — the normal root flow handles it.
            // Other layout containers (ScrollArea) keep their tuned 4-way zones.
            const isColumn = findSlot(f.snapshotRoot, hovered.id)?.components.some(
              (c) => c.type === "VerticalLayout",
            );
            place =
              fx <= BESIDE_FRAC
                ? "left"
                : fx >= 1 - BESIDE_FRAC
                  ? "right"
                  : !isColumn && fy <= BESIDE_FRAC
                    ? "above"
                    : !isColumn && fy >= 1 - BESIDE_FRAC
                      ? "below"
                      : null; // interior → drop inside (index chosen by computeDrop)
          } else {
            // Raw pixel offset from center (not normalized) → symmetric 45° wedges,
            // so "I pushed it right" reads as right even on a wide-short container.
            const dx = mx - (r.x + r.w / 2);
            const dy = my - (r.y + r.h / 2);
            place =
              Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "above" : "below";
          }
          if (place) {
            const parent =
              f.containers
                .filter(
                  // c is an ANCESTOR of hovered → isDescendant(root, c, hovered).
                  (c) => c.id !== hovered.id && isDescendant(f.snapshotRoot, c.id, hovered.id),
                )
                .sort((a, b) => b.depth - a.depth)[0] ?? null;
            if (parent) {
              rel = { containerId: hovered.id, place };
              target = parent;
            }
          }
        }

        // Element-position fallback for BESIDE. The cursor-based zones above only
        // fire when the cursor is OVER the container — but with a big element you
        // grab near its center and drop it in the empty space to the container's
        // SIDE, so the cursor is beyond the container and `hovered` is the root.
        // Here we instead look at where the dragged element's BODY is: if it's too
        // big to sit inside a nested container yet vertically overlaps it (i.e.
        // it's on the same line), place it beside — left/right by the element's
        // center vs the container's center. Robust to cursor Y / grab point. Only
        // for non-fitting elements so small ones can still drop INSIDE.
        if (!rel && f.draggedIds.length === 1) {
          const dr = {
            x: drag.startRect.x + dx,
            y: drag.startRect.y + dy,
            w: drag.startRect.w,
            h: drag.startRect.h,
          };
          let best: SnapContainer | null = null;
          let bestOv = 0;
          for (const c of f.containers) {
            if (!c.nested || c.strategy !== "layout" || c.id === f.sourceContainerId) continue;
            if (f.draggedIds.some((id) => id === c.id || isDescendant(f.snapshotRoot, id, c.id)))
              continue;
            const cr = c.absRect;
            if (dr.w <= cr.w + 1 && dr.h <= cr.h + 1) continue; // small enough to go inside
            const vov = Math.min(dr.y + dr.h, cr.y + cr.h) - Math.max(dr.y, cr.y);
            if (vov > 0.4 * Math.min(dr.h, cr.h) && vov > bestOv) {
              best = c;
              bestOv = vov;
            }
          }
          if (best) {
            const parent =
              f.containers
                .filter((c) => c.id !== best!.id && isDescendant(f.snapshotRoot, c.id, best!.id))
                .sort((a, b) => b.depth - a.depth)[0] ?? null;
            if (parent) {
              const elemCx = dr.x + dr.w / 2;
              const contCx = best.absRect.x + best.absRect.w / 2;
              rel = { containerId: best.id, place: elemCx >= contCx ? "right" : "left" };
              target = parent;
            }
          }
        }

        // Build a "place this relative to container X" drop within a row set:
        // above/below it as its own row, or beside it (merge into its row).
        // The container's component slot may sit DEEP inside a root-level wrapper
        // (a ScrollArea is a subtree), so match the row member that equals OR
        // contains the container, not just an exact id.
        const relDrop = (rows: SnapRow[]): DropSpec | null => {
          if (!rel) return null;
          const isOrContains = (mid: string) =>
            mid === rel!.containerId || isDescendant(f.snapshotRoot, mid, rel!.containerId);
          const ci = rows.findIndex((r) => r.ids.some(isOrContains));
          if (ci < 0) return null;
          if (rel.place === "above") return { rowIndex: ci, intoRow: false, colIndex: 0 };
          if (rel.place === "below") return { rowIndex: ci + 1, intoRow: false, colIndex: 0 };
          const j = rows[ci].ids.findIndex(isOrContains);
          return { rowIndex: ci, intoRow: true, colIndex: rel.place === "right" ? j + 1 : j };
        };

        if (target && target.id !== f.sourceContainerId) {
          // Cross-container: ghost follows the cursor; source is restored (no
          // live reflow); the target is highlighted with a drop bar. The actual
          // reparent happens on drop.
          restorePreDrag();
          setBoxGlide(false); // ghost rides the cursor — no glide lag
          setPreviewRect({
            ...drag.startRect,
            x: drag.startRect.x + dx,
            y: drag.startRect.y + dy,
          });
          const tItems = rowItemsOf(f.snapshotRoot, target, canvasSize).filter(
            (it) => !f.draggedIds.includes(it.id),
          );
          const tMap: Record<string, Rect> = {};
          for (const it of tItems) tMap[it.id] = it.rect;
          const tRows = groupRows(tItems);
          const drop =
            relDrop(tRows) ?? computeDrop(tRows, tMap, mx, my, target.strategy === "absolute");
          f.pending = { targetContainerId: target.id, drop };
          setTargetHighlight(target.absRect);
          const intoRowAt = drop.intoRow ? tRows[drop.rowIndex] : null;
          if (intoRowAt) {
            // Side-by-side drop into an existing row → vertical bar at the column
            // boundary (right means right).
            const ids = intoRowAt.ids;
            let barX: number;
            if (drop.colIndex >= ids.length) {
              const r = tMap[ids[ids.length - 1]];
              barX = (r ? r.x + r.w : intoRowAt.rect.x + intoRowAt.rect.w) + snap.colGap / 2;
            } else {
              const r = tMap[ids[drop.colIndex]];
              barX = (r ? r.x : intoRowAt.rect.x) - snap.colGap / 2;
            }
            setDropIndicator({
              vertical: true,
              rect: { x: barX - 2, y: intoRowAt.top, w: 4, h: intoRowAt.height },
            });
          } else {
            const last = tRows[tRows.length - 1];
            const bandY =
              tRows.length === 0
                ? target.absRect.y + 6
                : drop.rowIndex >= tRows.length
                  ? last.top + last.height + snap.rowGap / 2
                  : tRows[drop.rowIndex].top - snap.rowGap / 2;
            setDropIndicator({
              vertical: false,
              rect: { x: target.absRect.x + 4, y: bandY - 2, w: target.absRect.w - 8, h: 4 },
            });
          }
          return;
        }

        // Same-container reorder / merge (live reflow). The blocks glide into
        // their new slots, so the selection box glides with them.
        f.pending = null;
        setTargetHighlight(null);
        const remaining = rowsWithout(f.sourceRows, f.draggedIds, f.sourceRowItems);
        // Dead-space-beside-a-tall-element → STACK into a vertical column. Takes
        // priority over the normal row drop. Shows a box where the column forms;
        // committed on mouseup by groupIntoColumn.
        const colDrop = f.absolute
          ? detectColumnDrop(
              remaining,
              f.sourceRowItems,
              mx,
              my,
              f.draggedIds.length,
              // A member is a column when its slot carries a VerticalLayout — then
              // dropping into the dead space beside its taller sibling extends it,
              // even if that sibling is under the TALL_FACTOR ratio.
              (id) =>
                findSlot(f.snapshotRoot, id)?.components.some((c) => c.type === "VerticalLayout") ??
                false,
            )
          : null;
        if (colDrop) {
          f.columnPending = { shortIds: colDrop.shortIds, place: colDrop.place };
          f.nudgeRect = null;
          setBoxGlide(false);
          // Indicator: the short column's x-extent, in the gap above/below it.
          const sr = colDrop.shortIds.map((id) => f.sourceRowItems[id]).filter(Boolean) as Rect[];
          const T = f.sourceRowItems[colDrop.tallId];
          const left = Math.min(...sr.map((r) => r.x));
          const right = Math.max(...sr.map((r) => r.x + r.w));
          const yTop = colDrop.place === "top" ? T.y : Math.max(...sr.map((r) => r.y + r.h));
          const yBot = colDrop.place === "top" ? Math.min(...sr.map((r) => r.y)) : T.y + T.h;
          setDropIndicator({ vertical: false, rect: { x: left, y: yTop, w: right - left, h: Math.max(4, yBot - yTop) } });
          setPreviewRect({ x: left, y: my - drag.startRect.h / 2, w: right - left, h: drag.startRect.h });
          return;
        }
        f.columnPending = null;
        const pab = drag.parentAbsRect;
        const flowBounds = f.absolute ? { left: pab.x, right: pab.x + pab.w } : undefined;
        const planOpts = {
          rowGap: snap.rowGap,
          colGap: snap.colGap,
          anchorY: f.sourceRows[0].top,
          bottomMargin: 24,
          bounds: flowBounds,
          minWidths: f.minWidths,
        };
        // Feasibility gate: a side-by-side merge is only allowed if the dragged
        // element + the target row's members fit at their CONTENT minimums (dead
        // space trimmed). Otherwise the drop is downgraded to "between rows"
        // (stack). availW mirrors planFlow's content band (bounds minus gutter).
        const sideMargin = flowBounds ? inferSideMargin(f.sourceRows, flowBounds) : 0;
        const availW = flowBounds ? flowBounds.right - flowBounds.left - 2 * sideMargin : Infinity;
        const minOf = (id: string) => f.minWidths[id] ?? memberMinWidth(f.sourceRowItems[id]?.w ?? 0);
        const canMerge = (rowIndex: number) => {
          const r = remaining[rowIndex];
          if (!r) return true;
          const mins = [...r.ids, ...f.draggedIds].map(minOf);
          return rowFitsSideBySide(mins, snap.colGap, availW);
        };
        // A DIRECT merge into a real element row wins over the "place beside a
        // container" rel. Color Picker / Reference sit right above the big Scroll
        // Area; without this, dragging to their RIGHT half lands in the Scroll
        // Area's "beside-right" zone and gets hijacked (the reported "left works,
        // right doesn't"). rel only applies when the cursor isn't over a mergeable
        // element (it's in the container's flank / a gap → computeDrop is "between").
        const direct = computeDrop(
          remaining, f.sourceRowItems, mx, my, f.allowInto, undefined, canMerge,
        );
        let drop: DropSpec;
        if (direct.intoRow) {
          rel = null;
          drop = direct;
        } else {
          drop = relDrop(remaining) ?? direct;
        }
        // Detect a merge the user reached for but that won't fit, so the commit
        // handler can offer to widen the panel. Compare the ungated drop (what the
        // cursor aims at) to the gated one (what we'll actually do).
        const rawDrop = f.allowInto
          ? computeDrop(remaining, f.sourceRowItems, mx, my, true)
          : drop;
        f.widenContext =
          !!flowBounds && rawDrop.intoRow && !drop.intoRow && !rel
            ? { rowIds: remaining[rawDrop.rowIndex]?.ids ?? [], draggedIds: f.draggedIds, containerId: f.sourceContainerId }
            : null;

        // Infeasible side-by-side merge: the user is aiming to drop BESIDE an
        // element, but it won't fit at content-minimum widths. Rather than
        // silently doing something else (a stack / nudge) with no feedback,
        // PREVIEW the intent — restore the pre-drag layout (no churn), let the
        // dragged ghost ride the cursor, and show the yellow vertical drop bar at
        // the column boundary it WOULD land on, drawn striped to signal "won't
        // fit". On release the move is cancelled and the amber "Widen panel to
        // fit" toast stands as the next action (see mouseup).
        if (f.widenContext) {
          restorePreDrag();
          setBoxGlide(false);
          f.nudgeRect = null;
          f.pending = null;
          f.columnPending = null;
          const row = remaining[rawDrop.rowIndex];
          if (row) {
            let barX: number;
            if (rawDrop.colIndex >= row.ids.length) {
              const r = f.sourceRowItems[row.ids[row.ids.length - 1]];
              barX = (r ? r.x + r.w : row.rect.x + row.rect.w) + snap.colGap / 2;
            } else {
              const r = f.sourceRowItems[row.ids[rawDrop.colIndex]];
              barX = (r ? r.x : row.rect.x) - snap.colGap / 2;
            }
            setDropIndicator({ vertical: true, warn: true, rect: { x: barX - 2, y: row.top, w: 4, h: row.height } });
          } else {
            setDropIndicator(null);
          }
          setPreviewRect({ ...drag.startRect, x: drag.startRect.x + dx, y: drag.startRect.y + dy });
          return;
        }

        let result = planFlow(f.sourceRows, f.sourceRowItems, f.draggedIds, drop, planOpts);

        // Single-element travel inside an absolute container, when the cursor
        // hasn't (yet) crossed a neighbour's midpoint. Three outcomes, in order:
        //  • pushing past the dead space toward a row neighbour → SWAP with it so
        //    it moves out of the way (reorder + repack) — "push when close";
        //  • a shared-row element dragged between rows → SPLIT into its own new
        //    row (the flat order may be unchanged, so we must not treat it as a
        //    no-op nudge — this is what let the image finally drop to a new row);
        //  • otherwise → in-row NUDGE: glide through the dead space, clamped so it
        //    never overlaps, for fine positioning / lone-element drag-to-align.
        const origOrder = f.sourceRows.flatMap((r) => r.ids);
        const reordered =
          result.order.length !== origOrder.length ||
          result.order.some((id, i) => id !== origOrder[i]);
        // `rel` is a deliberate "place beside/around a container" drop — always
        // reflow it, never treat it as an in-row nudge (the flat order may be
        // unchanged when the element was already adjacent to the container).
        if (!reordered && !rel && f.absolute && f.draggedIds.length === 1) {
          const id = f.draggedIds[0];
          const startR = f.sourceRowItems[id];
          if (startR) {
            const srcRow = f.sourceRows.find((r) => r.ids.includes(id));
            const shared = !!srcRow && srcRow.ids.length > 1;
            const desiredX = startR.x + dx;

            // Immediate left/right neighbours within the source row.
            let leftN: { id: string; rect: Rect } | null = null;
            let rightN: { id: string; rect: Rect } | null = null;
            if (srcRow) {
              const ordered = [...srcRow.ids].sort(
                (a, b) => (f.sourceRowItems[a]?.x ?? 0) - (f.sourceRowItems[b]?.x ?? 0),
              );
              const idx = ordered.indexOf(id);
              const li = idx > 0 ? ordered[idx - 1] : null;
              const ri = idx < ordered.length - 1 ? ordered[idx + 1] : null;
              if (li && f.sourceRowItems[li]) leftN = { id: li, rect: f.sourceRowItems[li] };
              if (ri && f.sourceRowItems[ri]) rightN = { id: ri, rect: f.sourceRowItems[ri] };
            }

            // Dead space = the gap between neighbours (and the container walls).
            const leftClamp = leftN ? leftN.rect.x + leftN.rect.w + snap.colGap : -Infinity;
            const rightClamp = rightN ? rightN.rect.x - snap.colGap - startR.w : Infinity;
            const minX = Math.max(pab.x, leftClamp);
            const maxX = Math.min(pab.x + pab.w - startR.w, rightClamp);

            // Bump = pushed past the NEIGHBOUR clamp specifically (not just the
            // wall, so a far neighbour isn't yanked when you hit the edge).
            const bumpId =
              rightN && desiredX > rightClamp
                ? rightN.id
                : leftN && desiredX < leftClamp
                  ? leftN.id
                  : null;
            const splittingOut = shared && !drop.intoRow && !bumpId;

            // A shared row that can't sit side-by-side within the container — too
            // wide (needs shrink-to-fit) or the dragged element hangs off an edge.
            // This is the big-image-vs-ScrollArea case: a tall image overlaps the
            // ScrollArea so they group into ONE row, the image already rightmost,
            // so dragging it right is no reorder → it used to NUDGE (clamp, never
            // repack) and look stuck. Reflow instead so it shrinks-to-fit / snaps.
            const srcRowW = srcRow
              ? srcRow.ids.reduce((s, sid) => s + (f.sourceRowItems[sid]?.w ?? 0), 0) +
                Math.max(0, srcRow.ids.length - 1) * snap.colGap
              : 0;
            const rowOverflows =
              shared &&
              (srcRowW > pab.w + 1 ||
                startR.x < pab.x - 1 ||
                startR.x + startR.w > pab.x + pab.w + 1);

            if (bumpId) {
              // Build the swap drop directly so it's robust to the cursor's exact
              // Y within the row band.
              const remRowIdx = remaining.findIndex((r) => r.ids.includes(bumpId));
              if (remRowIdx >= 0) {
                const j = remaining[remRowIdx].ids.indexOf(bumpId);
                drop = {
                  rowIndex: remRowIdx,
                  intoRow: true,
                  colIndex: bumpId === rightN?.id ? j + 1 : j,
                };
                result = planFlow(f.sourceRows, f.sourceRowItems, f.draggedIds, drop, planOpts);
              }
              // fall through to the reflow path (glide + indicator).
            } else if (!splittingOut && !rowOverflows) {
              const nx = maxX >= minX ? Math.max(minX, Math.min(desiredX, maxX)) : startR.x;
              const target: Rect = { x: nx, y: startR.y, w: startR.w, h: startR.h };
              f.nudgeRect = target;
              setBoxGlide(false); // track the cursor 1:1 horizontally — no glide lag
              setDropIndicator(null);
              reflowLive(f.sourceContainerId, {
                rects: { [id]: target },
                order: result.order,
                contentBottom: result.contentBottom,
              });
              setPreviewRect(target);
              return;
            }
            // splittingOut / rowOverflows → fall through to the reflow path
            // (creates a new row, or shrink-to-fits the overflowing row).
          }
        }

        // A genuine reorder / split / bump-swap — glide blocks into place.
        f.nudgeRect = null;
        setBoxGlide(true);
        reflowLive(f.sourceContainerId, result);

        const dr = f.draggedIds.map((id) => result.rects[id]).filter(Boolean) as Rect[];
        if (dr.length) {
          const bb = boundingRect(dr);
          setPreviewRect(bb);
          setDropIndicator(
            drop.intoRow
              ? { vertical: true, rect: { x: bb.x - 3, y: bb.y, w: 4, h: bb.h } }
              : { vertical: false, rect: { x: bb.x, y: bb.y - 2, w: bb.w, h: 4 } },
          );
        }
        return;
      }

      if (drag.mode === "canvas-resize") {
        let newRect = applyDrag(drag, dx, dy);
        if (snap.enabled) newRect = snapRect(newRect, drag.kind, snap.size);
        newRect = { ...newRect, x: 0, y: 0 };
        setBoxGlide(false);
        setPreviewRect(newRect);
        resizeCanvasLive(newRect.w, newRect.h);
        return;
      }

      // Free move / resize (classic absolute drag). Tracks the cursor 1:1.
      let newRect = applyDrag(drag, dx, dy);
      if (snap.enabled) newRect = snapRect(newRect, drag.kind, snap.size);
      setBoxGlide(false);
      setPreviewRect(newRect);
      const { offsetMin, offsetMax } = rectToOffsets(
        newRect,
        drag.parentAbsRect,
        drag.anchorMin,
        drag.anchorMax,
      );
      dragApply(drag.slotId, offsetMin, offsetMax);
    }

    function onMouseUp() {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setLiveDrag(null);
      setBoxGlide(false);
      setPreviewRect(null);
      setDropIndicator(null);
      setTargetHighlight(null);
      // Release the pinned viewport (no-op unless this was a canvas resize); the
      // viewport re-fits and re-centres the final canvas size once.
      if (drag.mode === "canvas-resize") setCanvasResizeView(null);

      // Never crossed the threshold → it was a click, not a drag.
      if (!drag.started) {
        const f = drag.flow;
        // Multi-element row grip click → open a picker to choose which element
        // to edit (pre-select the first). Single-element rows & body clicks
        // already selected on mousedown.
        if (f && f.draggedIds.length > 1) {
          select(f.draggedIds[0]);
          setRowPicker({
            ids: f.draggedIds,
            left: Math.max(2, drag.startRect.x * scale + 4),
            top: drag.startRect.y * scale,
          });
        }
        return;
      }

      if (drag.mode === "flow" && drag.flow) {
        const f = drag.flow;
        // Offer "widen panel to fit" if the last hover was a side-by-side merge
        // rejected for lack of room.
        setWidenToast(f.widenContext ?? null);
        if (f.widenContext) {
          // The release happened over an infeasible merge (a preview-only hover —
          // see the mousemove short-circuit). Cancel the move: restore the
          // pre-drag layout and clear the drag. The amber toast (set above) is the
          // feedback + the "Widen panel to fit" next step.
          cancelDrag();
          return;
        }
        if (f.columnPending) {
          // Stack into a vertical column beside the tall element. Reset the live
          // preview to the pre-drag tree first, then group (its own undo step).
          restorePreDrag();
          groupIntoColumn(f.columnPending.shortIds, f.draggedIds[0], f.columnPending.place);
          return;
        }
        if (f.pending) {
          // Cross-container drop: reparent + reflow both sides as one undo step.
          flowReparent(f.draggedIds, f.pending.targetContainerId, f.pending.drop);
          dragCommit();
        } else if (f.nudgeRect && f.draggedIds.length === 1) {
          // In-row horizontal nudge: pin the element (collapse anchors) and
          // commit. nudgeCommit handles the history push itself.
          nudgeCommit(f.draggedIds[0], f.nudgeRect);
        } else {
          // Reorder / spacing tidy — one undo step.
          dragCommit();
        }
        // If the drag pulled an element OUT of a column and left it with ≤1
        // child, unwrap that column (no-op otherwise).
        dissolveColumns();
        return;
      }

      dragCommit();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [
    scale,
    canvasSize,
    select,
    dragStart,
    dragApply,
    dragCommit,
    resizeCanvasLive,
    setCanvasResizeView,
    reflowLive,
    nudgeCommit,
    flowReparent,
    restorePreDrag,
    setLiveDrag,
    snap.enabled,
    snap.size,
    snap.rowGap,
    snap.colGap,
  ]);

  const isRootSelected = selectedSlot?.id === root.id;
  const CHIP_HEIGHT = 28;
  const CHIP_GAP = 12;
  const aboveY = oRect ? oRect.y * scale - CHIP_HEIGHT - CHIP_GAP : 0;
  const belowY = oRect ? (oRect.y + oRect.h) * scale + CHIP_GAP : 0;
  const chipY = aboveY >= 0 ? aboveY : belowY;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        // While editing a popup, lift the whole overlay layer into the dead space
        // with the floating card. Transforms feed into getBoundingClientRect, so
        // the pointer→canvas math below needs no other change.
        transform: popupShift
          ? `translate(${popupShift.x * scale}px, ${popupShift.y * scale}px)`
          : undefined,
      }}
    >
      {/* Block-flow grab rails (snap mode). Blue = top-level rows; light purple =
          rows inside a nested container and its larger outer "move whole
          section" grip. Editor-only — never exported. */}
      {grips.map((g) => {
        // Consistent colour language: PURPLE = a nested area/section (the big
        // outer grip + the right scrollbar), BLUE = the elements themselves
        // (every row grip, top-level or inside a nested container). The blue
        // inner grips sit ON TOP of the purple section bar, so give them a
        // stronger resting opacity for clear contrast against it.
        const isContainer = g.kind === "container";
        const onPurpleBar = g.kind === "row" && g.nested;
        const base = isContainer ? PURPLE : BLUE;
        const restA = onPurpleBar ? "0.7)" : "0.4)";
        const hoverA = isContainer ? "0.9)" : "0.98)";
        // The outer grip extends right under the near rail so it reads as one
        // continuous bar behind the child grips (which draw on top).
        const width = isContainer ? NEAR_RAIL + RAIL_W - g.railX : RAIL_W;
        // For a floating popup, hug the card's left edge instead of the canvas
        // gutter so the grabbers read as part of the popup, not the panel.
        const railLeft =
          popupCardLeftX != null ? popupCardLeftX * scale - RAIL_W : g.railX;
        const railWidth = popupCardLeftX != null ? RAIL_W : width;
        return (
          <div
            key={g.key}
            data-grip-kind={g.kind}
            data-grip-container={g.containerId}
            data-grip-ids={g.ids.join(",")}
            data-grip-nested={g.nested ? "1" : "0"}
            title={
              g.kind === "container"
                ? "Drag to move this whole section"
                : g.ids.length > 1
                  ? "Drag to move this row · click to pick an element to edit"
                  : "Drag to move this block · click to select"
            }
            onMouseDown={(e) => {
              if (e.button !== 0 || dragController.spaceHeld) return;
              e.preventDefault();
              e.stopPropagation();
              // A SINGLE-element row grip behaves like grabbing the element body:
              // it can be dropped side-by-side (merge into a row) — passing
              // `undefined` lets beginFlow enable merging for a 1-element absolute
              // drag. The section (container) grip and MULTI-element row grips stay
              // reorder-only (allowInto=false): moving a whole 3-button row or a
              // scroll-area section into another row should never merge them.
              const reorderOnly = g.kind === "container" || g.ids.length > 1;
              beginFlow(g.ids, g.containerId, e.clientX, e.clientY, reorderOnly ? false : undefined);
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = base + hoverA;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = base + restA;
            }}
            style={{
              position: "absolute",
              left: railLeft,
              top: g.rect.y * scale,
              width: railWidth,
              height: g.rect.h * scale,
              borderRadius: "5px 0 0 5px",
              background: base + restA,
              boxShadow: `0 0 0 1px ${base}0.45)`,
              pointerEvents: "all",
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="8"
              height="14"
              viewBox="0 0 8 14"
              style={{ pointerEvents: "none", opacity: 0.85 }}
              aria-hidden="true"
            >
              {[2.5, 7, 11.5].map((cy) =>
                [2.5, 5.5].map((cx) => (
                  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill={DOT_COLOR} />
                )),
              )}
            </svg>
          </div>
        );
      })}

      {/* External editor scrollbars — purple rail just outside each scrollable
          field's right edge, so it never collides with the resize handles. The
          functional scrollbar for the website preview only; the in-game
          scrollbar is previewed statically INSIDE the box (renderSlot). */}
      {scrollbars.map((sb) => (
        <div
          key={`sb-${sb.id}`}
          style={{
            position: "absolute",
            left: sb.left,
            top: sb.trackTop,
            width: SCROLLBAR_W,
            height: sb.trackH,
            // Tab hanging off the canvas: flat inner (left) edge, rounded outer
            // (right) corners — mirrors the left grab rail's "5px 0 0 5px". Same
            // purple fill as the left grabber rail.
            borderRadius: "0 6px 6px 0",
            background: PURPLE + "0.4)",
            boxShadow: `0 0 0 1px ${PURPLE}0.45)`,
            pointerEvents: "all",
          }}
          title="Scroll this field (editor only — the in-game scrollbar is unchanged)"
        >
          <div
            onMouseDown={(e) => beginScrollDrag(sb.id, e)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = DOT_COLOR_HOVER;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = DOT_COLOR;
            }}
            style={{
              position: "absolute",
              left: 2,
              right: 2,
              top: sb.thumbTop - sb.trackTop,
              height: sb.thumbH,
              borderRadius: (SCROLLBAR_W - 4) / 2,
              // Same dark colour as the grip dots on the left.
              background: DOT_COLOR,
              cursor: "grab",
            }}
          />
        </div>
      ))}

      {/* Row element picker — choose which element of a multi-element row to
          edit (opened by clicking, not dragging, that row's grip). */}
      {rowPicker && (
        <div
          ref={pickerRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: rowPicker.left,
            top: rowPicker.top,
            zIndex: 60,
            minWidth: 150,
            maxWidth: 240,
            padding: 4,
            borderRadius: 6,
            background: "rgba(15, 23, 42, 0.97)",
            border: "1px solid #334155",
            boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
            pointerEvents: "all",
            userSelect: "none",
          }}
        >
          <div
            style={{
              padding: "2px 6px 4px",
              fontSize: 10,
              color: "#94a3b8",
              borderBottom: "1px solid #1e293b",
              marginBottom: 3,
            }}
          >
            {rowPicker.ids.length} elements here — pick one to edit
          </div>
          {rowPicker.ids.map((id) => {
            const sl = findSlot(root, id);
            const active = selectedId === id;
            return (
              <button
                key={id}
                onClick={() => {
                  select(id);
                  setRowPicker(null);
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(56,189,248,0.12)";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: active ? "#e0f2fe" : "#cbd5e1",
                  background: active ? "rgba(56,189,248,0.22)" : "transparent",
                }}
              >
                {sl ? controlDisplayName(sl) : id.slice(0, 8)}
              </button>
            );
          })}
        </div>
      )}

      {/* "Won't fit" offer — the last drop tried a side-by-side merge that was
          kept stacked for lack of room. One click widens the panel and places
          them side-by-side. Pinned bottom-center of the viewport. */}
      {widenToast && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px 8px 12px",
            borderRadius: 8,
            background: "rgba(28, 20, 6, 0.97)",
            border: "1px solid rgba(245, 158, 11, 0.5)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            pointerEvents: "all",
            userSelect: "none",
            fontSize: 12,
            color: "#fcd34d",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 600 }}>⚠ Not enough width to fit side-by-side.</span>
          <button
            onClick={() => {
              widenCanvasAndMerge(widenToast.containerId, widenToast.rowIds, widenToast.draggedIds);
              setWidenToast(null);
            }}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid rgba(245, 158, 11, 0.6)",
              background: "rgba(245, 158, 11, 0.2)",
              color: "#fde68a",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ⤢ Widen panel to fit
          </button>
          <button
            onClick={() => setWidenToast(null)}
            title="Dismiss"
            style={{
              padding: "2px 6px",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "rgba(252, 211, 77, 0.75)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Target container highlight (pending cross-container drop) */}
      {targetHighlight && (
        <div
          style={{
            position: "absolute",
            left: targetHighlight.x * scale,
            top: targetHighlight.y * scale,
            width: targetHighlight.w * scale,
            height: targetHighlight.h * scale,
            border: "2px dashed rgba(196,181,253,0.9)",
            background: "rgba(196,181,253,0.10)",
            borderRadius: 6,
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Drop indicator — where a flow drag will land */}
      {dropIndicator && (
        <div
          style={{
            position: "absolute",
            left: dropIndicator.rect.x * scale,
            top: dropIndicator.rect.y * scale,
            width: dropIndicator.rect.w * scale,
            height: dropIndicator.rect.h * scale,
            // Solid amber for a normal drop; striped amber for a "won't fit"
            // preview (an infeasible side-by-side merge) so it reads as tentative.
            background: dropIndicator.warn
              ? "repeating-linear-gradient(45deg, #f59e0b, #f59e0b 4px, rgba(245,158,11,0.3) 4px, rgba(245,158,11,0.3) 8px)"
              : "#f59e0b",
            borderRadius: 2,
            boxShadow: "0 0 8px rgba(245,158,11,0.9)",
            pointerEvents: "none",
            // Slide between gaps as the insertion point moves (same-container
            // reorder only — boxGlide is off for cross-container hops).
            transition: boxGlide ? "left 150ms cubic-bezier(0.22,0.61,0.36,1), top 150ms cubic-bezier(0.22,0.61,0.36,1)" : undefined,
          }}
        />
      )}

      {oRect && overlayVisible && selectedId && (
        <>
          {/* Selection box / move target */}
          <div
            style={{
              position: "absolute",
              left: oRect.x * scale,
              top: oRect.y * scale,
              width: oRect.w * scale,
              height: oRect.h * scale,
              boxSizing: "border-box",
              border: "2px solid #38bdf8",
              pointerEvents: isRootSelected || locked ? "none" : "all",
              cursor: locked ? "default" : editMode === "snap" ? "grab" : "move",
              transition: boxGlide ? DRAG_GLIDE : undefined,
            }}
            onMouseDown={(e) => startDrag(e, "move")}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openContextMenu(e.clientX, e.clientY, selectedId);
            }}
          />

          {/* Floating contextual action chip (skip on root) */}
          {!isRootSelected && (
            <div
              style={{
                position: "absolute",
                left: oRect.x * scale,
                top: chipY,
                pointerEvents: "all",
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "3px 4px",
                borderRadius: 6,
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid #334155",
                boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
                fontSize: 12,
                color: "#cbd5e1",
                userSelect: "none",
                transition: boxGlide ? DRAG_GLIDE : undefined,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <ChipBtn title="Duplicate (Ctrl+D)" onClick={() => duplicate(selectedId)}>
                ⎘
              </ChipBtn>
              <ChipBtn
                title={locked ? "Unlock" : "Lock"}
                onClick={() => toggleSlotLock(selectedId)}
              >
                {locked ? "🔓" : "🔒"}
              </ChipBtn>
              <ChipBtn title="Delete (Del)" danger onClick={() => remove(selectedId)}>
                ✕
              </ChipBtn>
              <span style={{ marginLeft: 4, fontSize: 10, color: "#64748b" }}>
                {Math.round(oRect.w)}×{Math.round(oRect.h)}
              </span>
            </div>
          )}

          {/* Canvas chip */}
          {isRootSelected && (
            <div
              style={{
                position: "absolute",
                left: oRect.x * scale,
                top: chipY,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 6,
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid #334155",
                boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
                fontSize: 11,
                color: "#cbd5e1",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              <span>Canvas {Math.round(oRect.w)}×{Math.round(oRect.h)}</span>
              <span style={{ fontSize: 10, color: "#64748b" }}>drag handles to resize</span>
            </div>
          )}

          {/* Layout-managed hint — resizing is Inspector-only; moving uses grips */}
          {layoutManaged && !locked && (
            <div
              style={{
                position: "absolute",
                left: oRect.x * scale,
                top: oRect.y * scale - 18,
                fontSize: 10,
                color: "rgba(196,181,253,0.8)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              In a container — drag the purple grip to reorder; resize via Inspector
            </div>
          )}

          {/* Resize handles (canvas root + free, non-layout slots) */}
          {(isRootSelected || (!locked && !layoutManaged)) &&
            HANDLES.map((h) => {
              const pos = handlePos(oRect, h, scale);
              return (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    left: pos.x - H / 2,
                    top: pos.y - H / 2,
                    width: H,
                    height: H,
                    background: "#38bdf8",
                    border: "1px solid #0d0d0d",
                    cursor: HANDLE_CURSORS[h],
                    boxSizing: "border-box",
                    pointerEvents: "all",
                    borderRadius: 1,
                    transition: boxGlide ? DRAG_GLIDE : undefined,
                  }}
                  onMouseDown={(e) => startDrag(e, h)}
                />
              );
            })}
        </>
      )}
    </div>
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
      title={title}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        color: danger ? "#fca5a5" : "#cbd5e1",
        cursor: "pointer",
        padding: "2px 6px",
        borderRadius: 3,
        font: "inherit",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger
          ? "rgba(244,63,94,0.15)"
          : "rgba(56,189,248,0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
