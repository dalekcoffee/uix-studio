import type { Rect } from "../editor/render/rectTransform";

// Where a popup's dialog card sits relative to the panel.
//
//   "Over"  — centred ON the panel behind a dimming backdrop: a true modal. The
//             panel is greyed out and unusable until the dialog is dismissed.
//   Left / Right / Above / Below — parked just OUTSIDE that panel edge with NO
//             backdrop, so the panel stays lit and usable while the dialog is
//             open. This is what a debug readout wants: you keep working in the
//             tool and watch the dialog beside it.
//
// The same geometry drives the export and the editor's popup editing surface,
// so what you arrange in the editor is where the dialog opens in Resonite.
export type PopupPlacement = "Over" | "Left" | "Right" | "Above" | "Below";

export const POPUP_PLACEMENTS: readonly PopupPlacement[] = [
  "Over",
  "Left",
  "Right",
  "Above",
  "Below",
];

/** Gap (canvas px) between the panel edge and a card parked beside it. */
export const POPUP_PLACEMENT_GAP = 16;

/** Read the placement off a Popup component's props, defaulting to "Over". */
export function popupPlacementOf(props: Record<string, unknown> | undefined): PopupPlacement {
  const p = props?.placement;
  return p === "Left" || p === "Right" || p === "Above" || p === "Below" ? p : "Over";
}

/** "Over" is the only placement that dims (and blocks) the panel behind it. */
export function popupHasBackdrop(placement: PopupPlacement): boolean {
  return placement === "Over";
}

export interface CardRT {
  anchorMin: { x: number; y: number };
  anchorMax: { x: number; y: number };
  offsetMin: { x: number; y: number };
  offsetMax: { x: number; y: number };
}

/**
 * The card's RectTransform for a placement, relative to the modal root (which
 * fills the canvas). Resonite UIX is Y-UP: anchor y=1 is the TOP edge and a
 * positive offset moves up, so "Above" anchors at y=1 with positive offsets and
 * "Below" anchors at y=0 with negative ones.
 *
 * Nothing clips a canvas child to the canvas rect (clipping needs a UIX.Mask),
 * so a card parked outside the panel renders exactly as laid out here.
 */
export function popupCardRT(placement: PopupPlacement, cardW: number, cardH: number): CardRT {
  const gap = POPUP_PLACEMENT_GAP;
  const halfW = cardW / 2;
  const halfH = cardH / 2;
  switch (placement) {
    case "Left":
      return {
        anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
        offsetMin: { x: -(gap + cardW), y: -halfH }, offsetMax: { x: -gap, y: halfH },
      };
    case "Right":
      return {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: gap, y: -halfH }, offsetMax: { x: gap + cardW, y: halfH },
      };
    case "Above":
      return {
        anchorMin: { x: 0.5, y: 1 }, anchorMax: { x: 0.5, y: 1 },
        offsetMin: { x: -halfW, y: gap }, offsetMax: { x: halfW, y: gap + cardH },
      };
    case "Below":
      return {
        anchorMin: { x: 0.5, y: 0 }, anchorMax: { x: 0.5, y: 0 },
        offsetMin: { x: -halfW, y: -(gap + cardH) }, offsetMax: { x: halfW, y: -gap },
      };
    default:
      return {
        anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
        offsetMin: { x: -halfW, y: -halfH }, offsetMax: { x: halfW, y: halfH },
      };
  }
}

/**
 * The same placement expressed as a CSS-space (y-DOWN, editor) delta from the
 * card's authored rect — what the editing surface shifts the lifted card by so
 * it previews where the export will actually put it. "Over" needs no shift: the
 * authored card is already centred on the canvas.
 */
export function popupCardShift(
  placement: PopupPlacement,
  canvasSize: { w: number; h: number },
  cardRect: Rect,
): { x: number; y: number } {
  const gap = POPUP_PLACEMENT_GAP;
  const centredX = (canvasSize.w - cardRect.w) / 2 - cardRect.x;
  const centredY = (canvasSize.h - cardRect.h) / 2 - cardRect.y;
  switch (placement) {
    case "Left":
      return { x: -(gap + cardRect.w) - cardRect.x, y: centredY };
    case "Right":
      return { x: canvasSize.w + gap - cardRect.x, y: centredY };
    case "Above":
      return { x: centredX, y: -(gap + cardRect.h) - cardRect.y };
    case "Below":
      return { x: centredX, y: canvasSize.h + gap - cardRect.y };
    default:
      return { x: 0, y: 0 };
  }
}

/** Which axis a placement needs dead space on ("Over" needs none). */
export function popupShiftAxis(placement: PopupPlacement): "x" | "y" | null {
  if (placement === "Left" || placement === "Right") return "x";
  if (placement === "Above" || placement === "Below") return "y";
  return null;
}
