import type { Slot } from "../../model/types";
import { LABELLED_CONTROL_TYPES, controlLabelText } from "../../model/controlName";
import { getLayoutKind } from "./layoutEngine";
import { isStructuralSlot } from "../../model/structural";
import { measureLabelWidth } from "../textMeasure";

// Content-based MINIMUM usable width (canvas px) for snap side-by-side layout.
// Unlike a fraction of the (often dead-space-heavy) authored width, this is the
// space the element's CONTENT actually needs: measured label text + the
// control's affordance + breathing room. It is the floor for trimming and the
// gate for "does this fit, or must we widen the canvas?". Always clamped to the
// element's current width (a min can't exceed natural).
//
// `widthOf(slot)` returns a slot's current rendered width (callers pass a
// computeAbsoluteRect-backed resolver) — used both as the clamp and to size
// container/leaf fallbacks.

// Breathing room between a label and its control, and between row members. Matches
// the snap engine's side gutter so spacing reads consistently.
export const SNAP_GAP = 16;
const CONTAINER_PAD = 12;
const ABS_FLOOR = 48;
// A wide image/placeholder may shrink to this so it can sit beside another
// element; small images keep their size (the result is clamped to ≤ natural).
const IMAGE_MIN = 160;

// Minimum affordance width for the CONTROL portion of a labeled composite, keyed
// by the widget's slot name. "Comfortable, not cramped" — variable-content
// controls (dropdown value, text input) keep working room since the value can
// change at runtime.
const CONTROL_MIN: Record<string, number> = {
  Dropdown: 110,
  Slider: 100,
  "Progress Bar": 100,
  "Text Field": 70,
  "Float Field": 70,
  "Integer Field": 70,
  Toggle: 40,
  Checkbox: 36,
  "Color Picker": 48,
  "Reference Field": 120,
  "Radio Group": 160,
};

function labelFontPx(labelSlot: Slot | undefined): number {
  const txt = labelSlot?.components.find((c) => c.type === "Text");
  const size = (txt?.props as { size?: number } | undefined)?.size;
  return typeof size === "number" && size > 0 ? size : 14;
}

export function controlMinFor(slotName: string): number {
  return CONTROL_MIN[slotName] ?? 80;
}

// Width a slot reserves via its RectTransform x-offsets (right-anchored fixed
// controls: offsetMax.x - offsetMin.x). 0 if unreadable.
function rtWidth(slot: Slot | undefined): number {
  const rt = slot?.components.find((c) => c.type === "RectTransform")?.props as
    | { offsetMin?: { x: number }; offsetMax?: { x: number } } | undefined;
  if (!rt?.offsetMin || !rt?.offsetMax) return 0;
  return Math.abs(rt.offsetMax.x - rt.offsetMin.x);
}
// The right margin a left-stretched label reserves (its offsetMax.x, negative).
function labelReserve(labelSlot: Slot | undefined): number {
  const rt = labelSlot?.components.find((c) => c.type === "RectTransform")?.props as
    | { offsetMax?: { x: number } } | undefined;
  return rt?.offsetMax ? Math.abs(rt.offsetMax.x) : 0;
}

export function contentMinWidth(slot: Slot, widthOf: (s: Slot) => number): number {
  const natural = Math.max(0, widthOf(slot));
  const clamp = (m: number) => Math.min(natural || m, Math.max(ABS_FLOOR, m));

  // Labeled composite (Dropdown, Slider, Text Field, …): label text + control.
  // CRITICAL: this MUST match how the element is actually laid out when trimmed
  // (store.reanchorLabeledComposite), or the gate will let it shrink past the
  // point where its label/control clips.
  if (LABELLED_CONTROL_TYPES.has(slot.name)) {
    const labelSlot = slot.children.find((c) => c.name === "Label");
    const labelW = measureLabelWidth(controlLabelText(slot), labelFontPx(labelSlot));
    const controls = slot.children.filter(
      (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
    );
    if (controls.length === 1) {
      // Re-anchored: the control keeps its NATURAL width and the label hugs it.
      // So the minimum = label text + gap + the control's real width (not a flat
      // guess) — otherwise a control with rich internals (Reference field's
      // ↗/value/× buttons) clips.
      const cw = rtWidth(controls[0]) || controlMinFor(slot.name);
      return clamp(labelW > 0 ? labelW + SNAP_GAP + cw : cw);
    }
    // Multi-part composite (Mode radio group, …) is NOT re-anchored — it keeps its
    // authored layout, so its no-clip minimum is the label's reserved area + the
    // label text. Shrinking below that clips the label and the options.
    const reserve = labelReserve(labelSlot);
    return clamp(Math.max(reserve + labelW, controlMinFor(slot.name)));
  }

  // Container (Scroll Area / layout): driven by its widest child's content-min.
  if (getLayoutKind(slot)) {
    let maxChild = 0;
    const visit = (s: Slot) => {
      for (const c of s.children) {
        if (isStructuralSlot(c)) continue;
        maxChild = Math.max(maxChild, contentMinWidth(c, widthOf));
      }
    };
    visit(slot);
    return clamp(maxChild > 0 ? maxChild + 2 * CONTAINER_PAD : natural);
  }

  // Lone text (heading / paragraph) → its measured text width.
  const txt = slot.components.find((c) => c.type === "Text");
  if (txt && slot.children.length === 0) {
    const content = (txt.props as { content?: string }).content ?? "";
    const size = (txt.props as { size?: number }).size ?? 14;
    return clamp(measureLabelWidth(content, size) || natural);
  }

  // Images / placeholders → a modest floor so a wide image CAN shrink to sit
  // beside another element (otherwise a full-width image can never be placed
  // side-by-side). Small icons stay their authored size (clamp keeps min ≤ natural).
  if (slot.components.some((c) => c.type === "Image")) {
    return clamp(IMAGE_MIN);
  }

  // Everything else (buttons, unknown composites) keeps its authored width.
  return natural;
}
