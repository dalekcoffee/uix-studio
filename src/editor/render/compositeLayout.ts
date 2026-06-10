import type { LabelPosition } from "../../model/controlName";
import { SNAP_GAP } from "./contentMin";

// Pure geometry for a labelled composite's internals (the "Label" child + its
// single control child) in either label position. The single source of truth
// shared by the store (reanchor / refit / setLabelPosition), so the editor's
// preview, the resize floors, and the toggle action never drift.
//
// RectTransform convention here matches the rest of the app: Y is UP (anchor
// y=1 is the top edge, a negative offset.y moves DOWN from that edge).

// Top-label band geometry.
export const LABEL_BAND_H = 20;   // height of the label band above the control
export const COMPOSITE_GAP_V = 6; // gap between the label band and the control
// Canonical composite row height — every widget builder / preset uses 36, so a
// composite toggled back to "left" restores to this.
export const COMPOSITE_ROW_H = 36;

// Default control widths (mirror the widget builders in src/model/widgets.ts).
// Used to restore a sensible width when switching a stretchy control top→left:
// a full-width-anchored control reports width 0, so we fall back to this.
export const DEFAULT_CONTROL_WIDTH: Record<string, number> = {
  Slider: 200,
  "Progress Bar": 200,
  "Text Field": 280,
  "Float Field": 280,
  "Integer Field": 280,
  Dropdown: 200,
  "Reference Field": 280,
  "Color Picker": 100,
  Toggle: 60,
  Checkbox: 28,
};

interface Vec2 { x: number; y: number; }
export interface RTRect {
  anchorMin: Vec2;
  anchorMax: Vec2;
  offsetMin: Vec2;
  offsetMax: Vec2;
}
export interface CompositeLayout {
  label: RTRect;
  control: RTRect;
  wrapperH: number;
}

export interface CompositeLayoutInput {
  stretchy: boolean;   // control stretches full-width under a top label
  controlW: number;    // the control's natural pixel width
  controlH: number;    // the control's pixel height
  labelW: number;      // measured label text width
  packed?: boolean;    // left mode only: row-mate → hug the control on the right
}

// Resolve the label + control RectTransforms (and the wrapper height) for the
// given label position. Deterministic and reversible — same inputs always yield
// the same layout, so toggling left↔top is idempotent.
export function computeCompositeLayout(
  position: LabelPosition,
  { stretchy, controlW, controlH, labelW, packed = false }: CompositeLayoutInput,
): CompositeLayout {
  if (position === "top") {
    // Label: a full-width band hugging the wrapper's top edge.
    const label: RTRect = {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: -LABEL_BAND_H }, offsetMax: { x: 0, y: 0 },
    };
    // Control: sits directly below the label band.
    const top = -(LABEL_BAND_H + COMPOSITE_GAP_V);
    const bottom = top - controlH;
    const control: RTRect = stretchy
      ? {
          // Full width: stretch x-anchors, zero x-offsets.
          anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: bottom }, offsetMax: { x: 0, y: top },
        }
      : {
          // Natural width, left-aligned.
          anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0, y: 1 },
          offsetMin: { x: 0, y: bottom }, offsetMax: { x: controlW, y: top },
        };
    return { label, control, wrapperH: LABEL_BAND_H + COMPOSITE_GAP_V + controlH };
  }

  // Left mode — the classic layout. Control is right-anchored at its fixed
  // width, vertically centered; label spans full height to its left.
  const control: RTRect = {
    anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
    offsetMin: { x: -controlW, y: -controlH / 2 }, offsetMax: { x: 0, y: controlH / 2 },
  };
  const reserve = controlW + SNAP_GAP;
  const label: RTRect =
    packed && labelW > 0
      ? {
          // Packed row-mate: a tight right-anchored box hugging the control.
          anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: -(reserve + labelW), y: 0 }, offsetMax: { x: -reserve, y: 0 },
        }
      : {
          // Alone: stretch from the left edge, reserving the control band on the right.
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 }, offsetMax: { x: -reserve, y: 0 },
        };
  return { label, control, wrapperH: COMPOSITE_ROW_H };
}

// Vertical progress-bar layout — the label is a top band and the control (the
// bar Track) FILLS the area below it (full width, full remaining height). Fill
// anchors mean the track auto-scales when the wrapper is resized taller, so no
// per-resize recompute is needed. `controlH` only seeds the natural wrapper
// height for a fresh convert; once placed, the wrapper height is user-driven.
export function verticalBarLayout(controlH: number): CompositeLayout {
  const label: RTRect = {
    anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: -LABEL_BAND_H }, offsetMax: { x: 0, y: 0 },
  };
  const control: RTRect = {
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: -(LABEL_BAND_H + COMPOSITE_GAP_V) },
  };
  return { label, control, wrapperH: LABEL_BAND_H + COMPOSITE_GAP_V + controlH };
}

// Default narrow column width for a vertical progress bar (the wrapper width a
// horizontal bar collapses to when toggled vertical).
export const VERTICAL_BAR_WIDTH = 64;
// Default track height for a fresh vertical-bar convert.
export const VERTICAL_BAR_HEIGHT = 220;

// No-clip MINIMUM wrapper width for a single-control composite in either label
// position. Left = label + gap + control (they sit side-by-side). Top = the
// wider of the two stacked pieces (a stretchy control floors at its min; a
// natural one keeps its width).
export function compositeMinWidth(
  position: LabelPosition,
  { stretchy, labelW, controlW, controlMin }: { stretchy: boolean; labelW: number; controlW: number; controlMin: number },
): number {
  if (position === "top") {
    return Math.max(labelW, stretchy ? controlMin : controlW);
  }
  return labelW + SNAP_GAP + controlMin;
}
