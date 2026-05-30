import type { Slot } from "../../model/types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RectTransformProps {
  anchorMin: { x: number; y: number };
  anchorMax: { x: number; y: number };
  offsetMin: { x: number; y: number };
  offsetMax: { x: number; y: number };
  pivot: { x: number; y: number };
}

export const DEFAULT_RT: RectTransformProps = {
  anchorMin: { x: 0, y: 0 },
  anchorMax: { x: 1, y: 1 },
  offsetMin: { x: 0, y: 0 },
  offsetMax: { x: 0, y: 0 },
  pivot: { x: 0.5, y: 0.5 },
};

export function getRectTransform(slot: Slot): RectTransformProps {
  const c = slot.components.find((c) => c.type === "RectTransform");
  if (!c) return DEFAULT_RT;
  return c.props as unknown as RectTransformProps;
}

// UIX uses Y-up math coordinates with origin at parent's bottom-left.
// We translate to CSS (Y-down, origin at parent's top-left) for preview rendering.
export function computeChildRect(parent: Rect, rt: RectTransformProps): Rect {
  const left = rt.anchorMin.x * parent.w + rt.offsetMin.x;
  const right = rt.anchorMax.x * parent.w + rt.offsetMax.x;
  const topFromBottom = rt.anchorMax.y * parent.h + rt.offsetMax.y;
  const bottomFromBottom = rt.anchorMin.y * parent.h + rt.offsetMin.y;
  // Flip into CSS top-down distances from parent's top:
  const top = parent.h - topFromBottom;
  const bottom = parent.h - bottomFromBottom;
  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}
