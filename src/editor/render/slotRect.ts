import type { Slot } from "../../model/types";
import { findParent } from "../../model/operations";
import { computeChildRect, getRectTransform, type Rect } from "./rectTransform";
import { getLayoutKind, layoutChildren } from "./layoutEngine";

export function computeAbsoluteRect(
  root: Slot,
  targetId: string,
  canvasSize: { w: number; h: number },
): Rect | null {
  function traverse(slot: Slot, slotAbsRect: Rect): Rect | null {
    if (slot.id === targetId) return slotAbsRect;

    const containerRect: Rect = { x: 0, y: 0, w: slotAbsRect.w, h: slotAbsRect.h };
    const layoutKind = getLayoutKind(slot);
    const layoutRects = layoutChildren(containerRect, slot, layoutKind);

    for (let i = 0; i < slot.children.length; i++) {
      const child = slot.children[i];
      const childLocalRect =
        layoutRects
          ? layoutRects[i]
          : computeChildRect(containerRect, getRectTransform(child));
      const found = traverse(child, {
        x: slotAbsRect.x + childLocalRect.x,
        y: slotAbsRect.y + childLocalRect.y,
        w: childLocalRect.w,
        h: childLocalRect.h,
      });
      if (found) return found;
    }
    return null;
  }

  return traverse(root, { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h });
}

export function isLayoutManaged(root: Slot, slotId: string): boolean {
  const parent = findParent(root, slotId);
  if (!parent) return false;
  return getLayoutKind(parent) !== null;
}

// Given a target canvas-space rect and parent's canvas-space rect, compute
// new RectTransform offsets while preserving the current anchors.
export function rectToOffsets(
  newRect: Rect,
  parentAbsRect: Rect,
  anchorMin: { x: number; y: number },
  anchorMax: { x: number; y: number },
) {
  const localLeft = newRect.x - parentAbsRect.x;
  const localTop = newRect.y - parentAbsRect.y;
  const localRight = localLeft + newRect.w;
  const localBottom = localTop + newRect.h;
  const pw = parentAbsRect.w;
  const ph = parentAbsRect.h;
  return {
    offsetMin: {
      x: localLeft - anchorMin.x * pw,
      y: ph - localBottom - anchorMin.y * ph,
    },
    offsetMax: {
      x: localRight - anchorMax.x * pw,
      y: ph - localTop - anchorMax.y * ph,
    },
  };
}
