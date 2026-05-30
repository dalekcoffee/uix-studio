// Snap-mode block-flow engine — editor-only.
//
// Snap mode treats a "container" (the Canvas root, or a nested container like a
// ScrollArea) as a vertical STACK OF ROWS, where a row is a cluster of
// horizontally-adjacent children that share vertical extent (e.g. the three
// keys of a keypad row). This module computes that structure and reflows it
// into a clean stack — consistent gaps, no vertical overlap, large blocks push
// the rest down.
//
// IMPORTANT: nothing here changes the document's shape or the export. The
// "absolute" strategy only writes RectTransform offsets (exactly like the
// store's autoArrange already does); the "layout" strategy only reorders a
// container's children array. Free mode bypasses this engine entirely.
//
// Designed to scale: nested containers are detected via a small registry
// (NESTED_CONTAINER_TYPES). Adding the next container type = one entry there;
// the drag layer and grabbable UI are container-agnostic.

import type { Slot, UixComponentType } from "../../model/types";
import { isStructuralSlot } from "../../model/structural";
import { getLayoutKind } from "./layoutEngine";
import { computeAbsoluteRect } from "./slotRect";
import type { Rect } from "./rectTransform";

// ---------------------------------------------------------------------------
// Container registry
// ---------------------------------------------------------------------------

// Component types that mark a slot as a *nested container* — a sub-region with
// its own internal block flow, rendered with its own (light-purple) grabbables
// and a larger "move the whole thing" outer grabbable. Append future container
// types here; everything downstream is generic.
const NESTED_CONTAINER_TYPES: readonly UixComponentType[] = ["ScrollArea"];

// "absolute": children positioned by raw RectTransform offsets (the Canvas
// root). Reflow writes offsets. "layout": children positioned by layoutEngine
// (ScrollArea & friends). Reflow only reorders the children array — spacing and
// push-down are already handled by the layout engine.
export type ContainerStrategy = "absolute" | "layout";

export interface SnapContainer {
  id: string;
  isRoot: boolean;
  /** A nested container (false for the Canvas root). Drives grabbable styling. */
  nested: boolean;
  strategy: ContainerStrategy;
  /** Container's canvas-space rect. */
  absRect: Rect;
  /** Depth from the root (root = 0). Used to offset outer grabbables leftward. */
  depth: number;
}

export function isNestedContainer(slot: Slot): boolean {
  return slot.components.some((c) => NESTED_CONTAINER_TYPES.includes(c.type));
}

function strategyOf(slot: Slot, isRoot: boolean): ContainerStrategy {
  // The root canvas is absolute. Anything the layout engine manages (a nested
  // container has a layout/scroll component) reflows by child order.
  if (!isRoot && getLayoutKind(slot) !== null) return "layout";
  return "absolute";
}

// Walk the tree and collect every container that hosts reflowable snap content:
// the Canvas root plus any nested containers, each with its strategy and rect.
// Containers are returned root-first (parents before children).
export function getContainers(
  root: Slot,
  canvasSize: { w: number; h: number },
): SnapContainer[] {
  const out: SnapContainer[] = [];
  const visit = (slot: Slot, depth: number) => {
    const isRoot = depth === 0;
    const nested = !isRoot && isNestedContainer(slot);
    if (isRoot || nested) {
      const absRect =
        computeAbsoluteRect(root, slot.id, canvasSize) ??
        { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };
      out.push({
        id: slot.id,
        isRoot,
        nested,
        strategy: strategyOf(slot, isRoot),
        absRect,
        depth,
      });
    }
    for (const c of slot.children) visit(c, depth + 1);
  };
  visit(root, 0);
  return out;
}

export function findContainer(
  root: Slot,
  containerId: string,
  canvasSize: { w: number; h: number },
): SnapContainer | null {
  return getContainers(root, canvasSize).find((c) => c.id === containerId) ?? null;
}

// ---------------------------------------------------------------------------
// Row grouping
// ---------------------------------------------------------------------------

export interface SnapRow {
  /** Child ids in this row, ordered left→right. */
  ids: string[];
  /** Bounding rect of the whole row (canvas-space). */
  rect: Rect;
  /** Original top of the row before any reflow (canvas-space y). */
  top: number;
  /** Row height = tallest member. */
  height: number;
}

export interface RowItem {
  id: string;
  rect: Rect; // canvas-space, current
}

// Two vertical intervals belong to the same row if they overlap by more than
// this fraction of the smaller one's height. 0.5 = "more than half overlapping".
const DEFAULT_OVERLAP_FRAC = 0.5;

function verticalOverlap(a: Rect, b: Rect): number {
  return Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
}

// Do a row's members horizontally collide? Scanning left→right, a member that
// starts before the previous one ends means the two cover each other — the
// signature of "dropped on top of" (or a duplicate placed at the same x). A
// legitimate side-by-side row (Button A | gap | Button B, a keypad's 3 keys)
// has no such collision and is left untouched. `slack` ignores hairline touches.
export function rowMembersOverlapX(
  ids: string[],
  rowItems: Record<string, Rect>,
  slack = 1,
): boolean {
  const rects = (ids.map((id) => rowItems[id]).filter(Boolean) as Rect[]).sort(
    (a, b) => a.x - b.x,
  );
  let right = -Infinity;
  for (const r of rects) {
    if (r.x < right - slack) return true;
    right = Math.max(right, r.x + r.w);
  }
  return false;
}

// Collect a container's reflowable children (non-structural) with their current
// canvas-space rects. Structural chrome (Background, Back Cover…) is skipped.
export function rowItemsOf(
  root: Slot,
  container: SnapContainer,
  canvasSize: { w: number; h: number },
): RowItem[] {
  const slot = findSlotShallow(root, container.id);
  if (!slot) return [];
  const items: RowItem[] = [];
  for (const child of slot.children) {
    if (isStructuralSlot(child)) continue;
    const rect = computeAbsoluteRect(root, child.id, canvasSize);
    if (rect) items.push({ id: child.id, rect });
  }
  return items;
}

// Cluster items into rows by vertical overlap. Items are first sorted by top
// edge; each new item either joins the current row (if it overlaps the row's
// running vertical band enough) or starts a new one. Within a row, ids are
// sorted left→right by x.
export function groupRows(items: RowItem[], overlapFrac = DEFAULT_OVERLAP_FRAC): SnapRow[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

  const rows: RowItem[][] = [];
  let cur: RowItem[] = [sorted[0]];
  let band: Rect = { ...sorted[0].rect };

  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    const ov = verticalOverlap(it.rect, band);
    const minH = Math.min(it.rect.h, band.h);
    if (ov > overlapFrac * Math.max(1, minH)) {
      cur.push(it);
      // Grow the band to the union so a wide row keeps absorbing same-line items.
      const top = Math.min(band.y, it.rect.y);
      const bottom = Math.max(band.y + band.h, it.rect.y + it.rect.h);
      band = { x: band.x, y: top, w: band.w, h: bottom - top };
    } else {
      rows.push(cur);
      cur = [it];
      band = { ...it.rect };
    }
  }
  rows.push(cur);

  return rows.map((members) => {
    members.sort((a, b) => a.rect.x - b.rect.x);
    const ids = members.map((m) => m.id);
    const minX = Math.min(...members.map((m) => m.rect.x));
    const minY = Math.min(...members.map((m) => m.rect.y));
    const maxX = Math.max(...members.map((m) => m.rect.x + m.rect.w));
    const maxY = Math.max(...members.map((m) => m.rect.y + m.rect.h));
    return {
      ids,
      rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      top: minY,
      height: maxY - minY,
    };
  });
}

// Convenience: group a container's rows straight from the tree.
export function containerRows(
  root: Slot,
  container: SnapContainer,
  canvasSize: { w: number; h: number },
  overlapFrac = DEFAULT_OVERLAP_FRAC,
): SnapRow[] {
  return groupRows(rowItemsOf(root, container, canvasSize), overlapFrac);
}

// ---------------------------------------------------------------------------
// Reflow
// ---------------------------------------------------------------------------

export interface ReflowOptions {
  rowGap: number;
  /** Gap between members when a row is laid out left→right. */
  colGap?: number;
  /**
   * Anchor the stack at this canvas-space y. Defaults to the topmost row's
   * current top so the panel doesn't jump when reflowed in place.
   */
  anchorY?: number;
  /** Bottom margin to add when reporting how tall the canvas must be. */
  bottomMargin?: number;
  /**
   * Container's horizontal extent (canvas-space). When provided, rows are kept
   * inside it: an element that sits past the right/left edge is pulled back in,
   * and a side-by-side row too wide to fit is shrunk to fit (shrink-to-fit).
   * Without bounds the engine never touches x — legacy behaviour.
   */
  bounds?: { left: number; right: number };
  /**
   * Side gutter (canvas px) that multi-member (side-by-side) rows must respect,
   * so a packed/merged row never hugs the panel edges. A single full-width
   * element is left alone (only hard `bounds` apply to it). Defaults to a value
   * inferred from the container's own wide rows (≈ the design's 16px margin).
   */
  sideMargin?: number;
}

export interface ReflowResult {
  /** Target canvas-space rects per child id (absolute strategy only). */
  rects: Record<string, Rect>;
  /** Flattened child order top→bottom, left→right — used by the layout strategy. */
  order: string[];
  /** Canvas height needed to fit the stack (absolute root only). */
  contentBottom: number;
}

const DEFAULT_SIDE_MARGIN = 16; // matches the template's standard row gutter

// Infer the design's side gutter from the container's own wide rows. Each
// full-width-ish row reveals the intended left/right inset; the median is robust
// to one stray edge-hugging row (the very thing we're about to fix). Falls back
// to the template default when there's nothing to learn from.
function inferSideMargin(
  rows: SnapRow[],
  bounds: { left: number; right: number },
): number {
  const full = bounds.right - bounds.left;
  const insets: number[] = [];
  for (const row of rows) {
    if (row.rect.w < full * 0.5) continue; // narrow rows don't reveal the margin
    insets.push(Math.max(0, row.rect.x - bounds.left));
    insets.push(Math.max(0, bounds.right - (row.rect.x + row.rect.w)));
  }
  if (insets.length === 0) return DEFAULT_SIDE_MARGIN;
  insets.sort((a, b) => a - b);
  const median = insets[Math.floor(insets.length / 2)];
  return Math.min(Math.max(median, 0), full * 0.2);
}

// Position one row's members at vertical band top `bandTop`, returning their
// target rects, their flattened order, and the vertical extent the row consumes
// (so the caller can advance `y`). This is the single place that decides x —
// shared by reflowAbsolute (auto-arrange / add) and planFlow (live drag).
//
// `bounds` is the hard container extent (nothing ever leaves it). `margin` is
// the side gutter that MULTI-MEMBER rows respect (a single full-width element is
// only hard-clamped, never gutter-shrunk — it may be an intentional banner).
//
// Cases:
//  1. In-bounds & gutter-compliant, no merge/collision → keep exact x and the
//     vertical offset within the row band (a centered label stays centered).
//  2. A multi-member row that violates the gutter (hugs/overflows an edge) →
//     uniformly scale its x-layout into the [margin, width-margin] content band,
//     anchored at the left gutter. Preserves the row's column proportions and
//     each member's vertical position — just reclaims the side margins. This is
//     what lets auto-arrange tidy a side-by-side row that sits too close to the
//     edges, and keeps a fresh side-by-side merge off the panel edges.
//  3. Re-pack (members merged / collide) → lay members left→right with colGap,
//     vertically centered, within the content band; if they can't fit, shrink
//     every width proportionally (shrink-to-fit).
//  4. A single element past the hard edge → shrink (if wider than the container)
//     or translate minimally back inside; no gutter applied.
function layoutRowMembers(
  ids: string[],
  rowItems: Record<string, Rect>,
  bandTop: number,
  colGap: number,
  bounds: { left: number; right: number } | undefined,
  forceRepack: boolean,
  margin = 0,
): { rects: Record<string, Rect>; order: string[]; height: number } {
  const rects: Record<string, Rect> = {};
  const order: string[] = [];
  const present = ids.filter((id) => rowItems[id]);
  if (present.length === 0) return { rects, order, height: 0 };

  const memberRects = present.map((id) => rowItems[id]);
  const rowHeight = Math.max(...memberRects.map((r) => r.h));
  const minY = Math.min(...memberRects.map((r) => r.y));
  const maxY = Math.max(...memberRects.map((r) => r.y + r.h));
  const minX = Math.min(...memberRects.map((r) => r.x));
  const maxX = Math.max(...memberRects.map((r) => r.x + r.w));

  const sumW = memberRects.reduce((s, r) => s + r.w, 0);
  const gaps = (present.length - 1) * colGap;
  const naturalW = sumW + gaps;
  const TOL = 0.5; // ignore hairline rounding when deciding "out of bounds"
  const multi = present.length > 1;

  const hardL = bounds ? bounds.left : -Infinity;
  const hardR = bounds ? bounds.right : Infinity;
  // The content band: gutter only applies to multi-member rows.
  const m = bounds && multi ? margin : 0;
  const contentL = hardL + m;
  const contentR = hardR - m;
  const availW = contentR - contentL;

  // Case 3: explicit re-pack (merge) or horizontal collision → pack left→right
  // inside the content band, shrinking to fit if necessary.
  if (forceRepack) {
    let scale = 1;
    let startX = bounds ? Math.max(contentL, Math.min(minX, contentR - naturalW)) : minX;
    if (bounds && naturalW > availW + TOL) {
      scale = sumW > 0 ? Math.max(0, availW - gaps) / sumW : 1;
      startX = contentL;
    }
    let x = startX;
    for (const id of ids) {
      const r = rowItems[id];
      if (!r) continue;
      const w = r.w * scale;
      rects[id] = { x, y: bandTop + (rowHeight - r.h) / 2, w, h: r.h };
      order.push(id);
      x += w + colGap;
    }
    return { rects, order, height: rowHeight };
  }

  // Case 2: a clean multi-member row that breaks the gutter (hugs/overflows an
  // edge) → uniformly scale its layout into the content band, preserve y.
  if (bounds && multi && (minX < contentL - TOL || maxX > contentR + TOL)) {
    const span = Math.max(1, maxX - minX);
    const scale = Math.min(1, availW / span);
    for (const id of ids) {
      const r = rowItems[id];
      if (!r) continue;
      rects[id] = {
        x: contentL + (r.x - minX) * scale,
        y: bandTop + (r.y - minY),
        w: r.w * scale,
        h: r.h,
      };
      order.push(id);
    }
    return { rects, order, height: maxY - minY };
  }

  // Case 4: single element wider than the hard container → shrink to it.
  if (bounds && !multi && maxX - minX > hardR - hardL + TOL) {
    const scale = (hardR - hardL) / (maxX - minX);
    for (const id of ids) {
      const r = rowItems[id];
      if (!r) continue;
      rects[id] = { x: hardL, y: bandTop + (r.y - minY), w: r.w * scale, h: r.h };
      order.push(id);
    }
    return { rects, order, height: maxY - minY };
  }

  // Case 1: in-bounds (or translate a unit minimally back inside the hard edge),
  // preserving exact x and intentional spacing.
  let shift = 0;
  if (bounds && minX < hardL - TOL) shift = hardL - minX;
  else if (bounds && maxX > hardR + TOL) shift = hardR - maxX;
  for (const id of ids) {
    const r = rowItems[id];
    if (!r) continue;
    rects[id] = { x: r.x + shift, y: bandTop + (r.y - minY), w: r.w, h: r.h };
    order.push(id);
  }
  return { rects, order, height: maxY - minY };
}

// Stack rows top→bottom with a uniform rowGap. A clean side-by-side row is
// shifted as a unit (preserving intentional spacing — keypad columns, Button A |
// Button B); a row whose members horizontally collide (stacked-on-top /
// duplicate at the same x) is re-packed so they sit side-by-side; and — when
// `opts.bounds` is given — any row that pokes past the container edge is pulled
// back in, shrinking to fit if it's too wide. Because a row's height is its
// tallest member, a large block naturally pushes the rows below it down.
//
// `rowItems` maps id → current rect (needed to preserve x/h while shifting y).
export function reflowAbsolute(
  rows: SnapRow[],
  rowItems: Record<string, Rect>,
  opts: ReflowOptions,
): ReflowResult {
  const rects: Record<string, Rect> = {};
  const order: string[] = [];
  const colGap = opts.colGap ?? 12;
  const margin = opts.bounds ? opts.sideMargin ?? inferSideMargin(rows, opts.bounds) : 0;
  let y = opts.anchorY ?? (rows[0]?.top ?? 0);

  for (const row of rows) {
    const collide = row.ids.length > 1 && rowMembersOverlapX(row.ids, rowItems);
    const res = layoutRowMembers(row.ids, rowItems, y, colGap, opts.bounds, collide, margin);
    if (res.order.length === 0) continue;
    Object.assign(rects, res.rects);
    order.push(...res.order);
    y += res.height + opts.rowGap;
  }

  const contentBottom = (y - opts.rowGap) + (opts.bottomMargin ?? 0);
  return { rects, order, contentBottom };
}

// Layout-managed containers don't need offsets — the layout engine positions
// children. Reflow here is purely the new top→bottom, left→right child order.
export function reflowLayoutOrder(rows: SnapRow[]): ReflowResult {
  const order: string[] = [];
  for (const row of rows) for (const id of row.ids) order.push(id);
  return { rects: {}, order, contentBottom: 0 };
}

// ---------------------------------------------------------------------------
// Snap fitness — is this layout a poor fit for block-flow editing?
// ---------------------------------------------------------------------------

// True when snap mode offers little (and may even mangle the layout): only one
// movable row to reorder, or several elements that overlap in 2D (layered /
// corner-decorated designs like ID cards). Used to nudge the user toward Free
// mode. `rows` and `overlaps` are returned for messaging/debugging.
export function snapFitness(
  root: Slot,
  canvasSize: { w: number; h: number },
): { rows: number; overlaps: number; complex: boolean } {
  const rootC = getContainers(root, canvasSize).find((c) => c.isRoot);
  if (!rootC) return { rows: 0, overlaps: 0, complex: false };
  const items = rowItemsOf(root, rootC, canvasSize);
  const rows = groupRows(items).length;
  let overlaps = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].rect;
      const b = items[j].rect;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0 && ox * oy > 0.3 * Math.min(a.w * a.h, b.w * b.h)) {
        overlaps++;
      }
    }
  }
  const complex = items.length > 0 && (rows <= 1 || overlaps >= 2);
  return { rows, overlaps, complex };
}

// ---------------------------------------------------------------------------
// Drag planning — turn a cursor position into a drop, then a drop into a reflow
// ---------------------------------------------------------------------------

// Where dragged element(s) will land within a container.
export interface DropSpec {
  // Insert position among the *remaining* rows (rows with the dragged ids
  // removed): 0..remaining.length.
  rowIndex: number;
  // true = merge the dragged element into remaining[rowIndex] (side-by-side);
  // false = drop as its own new row at rowIndex.
  intoRow: boolean;
  // Insert position within the target row (when intoRow), 0..row.ids.length.
  colIndex: number;
}

// Remove ids from a set of rows; drop rows that become empty. Returns new rows
// (rects/heights recomputed from rowItems for the survivors).
export function rowsWithout(
  rows: SnapRow[],
  ids: string[],
  rowItems: Record<string, Rect>,
): SnapRow[] {
  const drop = new Set(ids);
  const out: SnapRow[] = [];
  for (const row of rows) {
    const kept = row.ids.filter((id) => !drop.has(id));
    if (kept.length === 0) continue;
    const rects = kept.map((id) => rowItems[id]).filter(Boolean) as Rect[];
    const minY = Math.min(...rects.map((r) => r.y));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    out.push({
      ids: kept,
      rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      top: minY,
      height: maxY - minY,
    });
  }
  return out;
}

// Decide where a cursor drops, given the remaining rows (snapshot geometry).
// `allowInto` is false for row-grip drags and layout containers (single column):
// those only ever reorder rows, never merge side-by-side.
//
// Into-row only triggers in the middle band of a row (INTO_BAND), so the edges
// stay reserved for "drop between rows" — otherwise it's impossible to place an
// element on its own line next to a tall neighbour.
const INTO_BAND = 0.6;
// Grace band (canvas px) at a row's left/right edge that still counts as a
// "drop beside it" — you don't have to land the cursor pixel-perfectly past the
// edge. Also used by the drag layer to inset a single-column container's hitbox
// so its flanks resolve to "beside the container" instead of "inside" it.
export const SIDE_DROP_GRACE = 40;
export function computeDrop(
  remaining: SnapRow[],
  rowItems: Record<string, Rect>,
  cursorX: number,
  cursorY: number,
  allowInto: boolean,
  grace = SIDE_DROP_GRACE,
): DropSpec {
  // Between-rows index: how many rows sit (by center) above the cursor.
  let between = 0;
  for (const row of remaining) {
    if (cursorY > row.top + row.height / 2) between++;
    else break;
  }

  if (allowInto) {
    for (let i = 0; i < remaining.length; i++) {
      const row = remaining[i];
      // Anywhere within the row's FULL vertical extent, a cursor clearly past
      // the row's right (or left) edge means "drop beside it" — right means
      // right, left means left. This lets you place an element next to a tall
      // section (the Scroll Area) by aiming at its flank, even up at its top or
      // bottom edge where the between-rows band would otherwise win.
      if (cursorY >= row.top && cursorY <= row.top + row.height) {
        const rects = row.ids.map((id) => rowItems[id]).filter(Boolean) as Rect[];
        if (rects.length) {
          const rowLeft = Math.min(...rects.map((r) => r.x));
          const rowRight = Math.max(...rects.map((r) => r.x + r.w));
          // Grace is at least `grace` px but scales up to a fraction of the row,
          // so the right/left "drop beside" zones on a wide row are easy to hit.
          // Clamped under half the row so the two bands never overlap (a tiny
          // element would otherwise be all-grace and ambiguous).
          const rowW = rowRight - rowLeft;
          const g = Math.min(Math.max(grace, rowW * 0.2), Math.max(0, rowW / 2 - 1));
          if (cursorX > rowRight - g) return { rowIndex: i, intoRow: true, colIndex: row.ids.length };
          if (cursorX < rowLeft + g) return { rowIndex: i, intoRow: true, colIndex: 0 };
        }
      }
      // Otherwise, only the middle band merges side-by-side; the inner top/bottom
      // edges stay reserved for "drop between rows" (start a new line).
      const pad = (row.height * (1 - INTO_BAND)) / 2;
      if (cursorY >= row.top + pad && cursorY <= row.top + row.height - pad) {
        // Column position: how many members sit (by center-x) left of the cursor.
        let col = 0;
        for (const id of row.ids) {
          const r = rowItems[id];
          if (r && cursorX > r.x + r.w / 2) col++;
          else break;
        }
        return { rowIndex: i, intoRow: true, colIndex: col };
      }
    }
  }
  return { rowIndex: between, intoRow: false, colIndex: 0 };
}

// Build the post-drag arrangement and reflow it into target rects + order.
// `repack` rows (the one the dragged element merged into, or any whose
// membership changed) are laid left→right with colGap; untouched rows just shift
// vertically as a unit, preserving their internal x (so e.g. keypad column
// spacing survives a pure row reorder).
export function planFlow(
  sourceRows: SnapRow[],
  rowItems: Record<string, Rect>,
  draggedIds: string[],
  drop: DropSpec,
  opts: ReflowOptions,
): ReflowResult {
  const remaining = rowsWithout(sourceRows, draggedIds, rowItems);

  // Assemble the final ordered rows, tracking which need horizontal re-packing.
  interface FinalRow { ids: string[]; repack: boolean; oldTop: number }
  const draggedRects = draggedIds.map((id) => rowItems[id]).filter(Boolean) as Rect[];
  const draggedTop = draggedRects.length ? Math.min(...draggedRects.map((r) => r.y)) : 0;
  // Keep dragged ids in their own left→right order.
  const draggedOrdered = [...draggedIds].sort(
    (a, b) => (rowItems[a]?.x ?? 0) - (rowItems[b]?.x ?? 0),
  );

  const final: FinalRow[] = remaining.map((r) => ({ ids: r.ids, repack: false, oldTop: r.top }));

  if (drop.intoRow && final[drop.rowIndex]) {
    const row = final[drop.rowIndex];
    const at = Math.max(0, Math.min(drop.colIndex, row.ids.length));
    row.ids = [...row.ids.slice(0, at), ...draggedOrdered, ...row.ids.slice(at)];
    row.repack = true;
  } else {
    const at = Math.max(0, Math.min(drop.rowIndex, final.length));
    final.splice(at, 0, { ids: draggedOrdered, repack: false, oldTop: draggedTop });
  }

  // Stack vertically. Re-pack the row the drag merged INTO, and any untouched
  // row whose members collide horizontally (a pre-existing stacked overlap), so
  // a flow drag never leaves elements covering each other — and, with bounds,
  // never flings a too-big merge off the right edge (it shrinks to fit instead).
  const rects: Record<string, Rect> = {};
  const order: string[] = [];
  const anchorY = opts.anchorY ?? (sourceRows[0]?.top ?? 0);
  const colGap = opts.colGap ?? 12;
  const margin = opts.bounds ? opts.sideMargin ?? inferSideMargin(sourceRows, opts.bounds) : 0;
  let y = anchorY;

  for (const fr of final) {
    const collide = fr.ids.length > 1 && rowMembersOverlapX(fr.ids, rowItems);
    const res = layoutRowMembers(fr.ids, rowItems, y, colGap, opts.bounds, fr.repack || collide, margin);
    if (res.order.length === 0) continue;
    Object.assign(rects, res.rects);
    order.push(...res.order);
    y += res.height + opts.rowGap;
  }

  const contentBottom = y - opts.rowGap + (opts.bottomMargin ?? 0);
  return { rects, order, contentBottom };
}

// ---------------------------------------------------------------------------
// Local: a shallow findSlot that doesn't pull the operations module's clone
// machinery (we only read here).
// ---------------------------------------------------------------------------
function findSlotShallow(root: Slot, id: string): Slot | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const found = findSlotShallow(c, id);
    if (found) return found;
  }
  return null;
}
