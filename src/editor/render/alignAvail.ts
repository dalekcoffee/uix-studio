import type { Slot } from "../../model/types";
import { findParent } from "../../model/operations";
import { computeAbsoluteRect, isLayoutManaged } from "./slotRect";
import { findContainer, containerRows } from "./snapFlow";
import type { Rect } from "./rectTransform";

// Local mirrors of the align/edit-mode unions (kept here to avoid a store ↔
// render-helper import cycle; structurally identical to the store's types).
type Axis = "h" | "v";
type Mode = "start" | "center" | "end" | "stretch";
type EditModeLike = "snap" | "free";

function canvasSizeOf(root: Slot): { w: number; h: number } {
  const c = root.components.find((c) => c.type === "Canvas");
  const p = c?.props as { sizeX?: number; sizeY?: number } | undefined;
  return { w: p?.sizeX ?? 800, h: p?.sizeY ?? 600 };
}

export interface RowBand {
  /** The whole row's bounding rect — band.y/band.h are the fill target. */
  band: Rect;
  /** This element's current canvas-space rect. */
  self: Rect;
  /** How many elements share this row (1 = the element is alone in its row). */
  memberCount: number;
}

// The snap row a given element belongs to, with the row's full band rect. Used
// both to decide whether vertical-stretch can fill dead space (a short element
// sitting beside a taller sibling) and to perform that fill. Returns null when
// the element isn't a reflowable child of a snap container.
export function rowBandFor(root: Slot, slotId: string): RowBand | null {
  const canvasSize = canvasSizeOf(root);
  const parent = findParent(root, slotId);
  if (!parent) return null;
  const container = findContainer(root, parent.id, canvasSize);
  if (!container) return null;
  const row = containerRows(root, container, canvasSize).find((r) => r.ids.includes(slotId));
  if (!row) return null;
  const self = computeAbsoluteRect(root, slotId, canvasSize);
  if (!self) return null;
  return { band: row.rect, self, memberCount: row.ids.length };
}

// Hairline height differences shouldn't offer/perform a no-op fill.
const FILL_SLACK = 1;

// True when vertical-stretch would actually do something in snap: the element
// shares its row with at least one taller sibling, leaving fillable dead space.
export function canFillRowHeight(root: Slot, slotId: string): boolean {
  const rb = rowBandFor(root, slotId);
  return !!rb && rb.memberCount > 1 && rb.self.h < rb.band.h - FILL_SLACK;
}

export interface AlignAvail {
  disabled: boolean;
  /** Tooltip: the reason when disabled, or the action description when enabled. */
  tip: string;
}

// Single source of truth for whether an align button is enabled and what its
// hover tooltip says. Centralizes the snap-vs-free rules so the Inspector and
// the right-click menu stay in lockstep, and so every disabled state explains
// itself on hover (a hard requirement: no silently-greyed button).
export function alignAvailability(
  root: Slot,
  slotId: string,
  editMode: EditModeLike,
  axis: Axis,
  mode: Mode,
  actionTitle: string,
): AlignAvail {
  if (isLayoutManaged(root, slotId))
    return {
      disabled: true,
      tip: "Positioned automatically by its layout container — alignment is managed for you.",
    };

  // Free mode is absolute: every alignment applies directly.
  if (editMode !== "snap") return { disabled: false, tip: actionTitle };

  // Snap mode: the block flow owns vertical position, so horizontal align is
  // free but the vertical axis is mostly automatic.
  if (axis === "h") return { disabled: false, tip: actionTitle };

  if (mode === "stretch") {
    const rb = rowBandFor(root, slotId);
    if (rb && rb.memberCount > 1 && rb.self.h < rb.band.h - FILL_SLACK)
      return {
        disabled: false,
        tip: "Fill the row's height (match the tallest element beside it)",
      };
    if (rb && rb.memberCount <= 1)
      return {
        disabled: true,
        tip: "Nothing to fill — this element is alone in its row. Put another element beside it first, or use Free mode.",
      };
    return { disabled: true, tip: "Already as tall as its row." };
  }

  return {
    disabled: true,
    tip: "Snap stacks elements top-to-bottom, so vertical position is automatic. Drag to reorder, or switch to Free mode for exact placement.",
  };
}
