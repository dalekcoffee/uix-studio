import type { Slot } from "../../model/types";
import {
  LABELLED_CONTROL_TYPES,
  STRETCHY_CONTROL_TYPES,
  controlLabelText,
  labelPositionOf,
  type LabelPosition,
} from "../../model/controlName";
import { getLayoutKind } from "./layoutEngine";
import { isStructuralSlot } from "../../model/structural";
import { DEFAULT_CONTENT_PADDING, SCROLLBAR_GUTTER, resolvePad } from "../../model/padding";
import { measureLabelWidth } from "../textMeasure";
import { compositeMinWidth } from "./compositeLayout";

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

// True when the slot itself, or anything in its subtree, is a layout / scroll /
// tabs container. Lets contentMinWidth treat a WRAPPER of a container (the
// "Scroll Area" row = a header Label + a "Scroll Viewport" child that carries the
// ScrollArea) as a container too — otherwise the wrapper reports its full
// authored width and can never be placed side-by-side.
function hasContainerInSubtree(s: Slot): boolean {
  if (getLayoutKind(s) !== null) return true;
  if (s.components.some((c) => c.type === "Tabs")) return true;
  return s.children.some(hasContainerInSubtree);
}

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

// Natural-based no-clip min for a single-control labelled composite — a "Label"
// child + exactly one control child — recognised STRUCTURALLY so purpose-named
// rows ("Brightness", "Theme", scroll/tab content) count too, not just rows whose
// slot name is in LABELLED_CONTROL_TYPES. Mirrors the LABELLED single-control case
// in contentMinWidth: label text + gap + the control's natural width (top-label →
// the wider of the stacked pieces). Returns null when the slot isn't that shape.
function singleControlCompositeMin(slot: Slot): number | null {
  const labelSlot = slot.children.find((c) => c.name === "Label");
  if (!labelSlot) return null;
  const controls = slot.children.filter(
    (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
  );
  if (controls.length !== 1) return null;
  const labelW = measureLabelWidth(controlLabelText(slot), labelFontPx(labelSlot));
  const cw = rtWidth(controls[0]) || controlMinFor(slot.name);
  if (labelPositionOf(slot) === "top") {
    return compositeMinWidth("top", {
      stretchy: STRETCHY_CONTROL_TYPES.has(slot.name),
      labelW,
      controlW: cw,
      controlMin: controlMinFor(slot.name),
    });
  }
  return labelW > 0 ? labelW + SNAP_GAP + cw : cw;
}

// The pieces a single-control labeled composite (Text Field, Reference Field,
// Slider, …) needs to resize WITHOUT clipping its label: the measured label
// text width, the control's minimum affordance, and the control's natural
// (current) width. Returns null for non-composites and for MULTI-part composites
// (Radio Group / keypad), which keep their authored layout. Used by the resize
// handler to clamp the width and shrink the CONTROL (not the label).
export interface CompositeFit {
  labelId: string | null;
  controlId: string;
  labelW: number;
  controlMin: number;
  controlNatural: number;
  position: LabelPosition;
  stretchy: boolean;
}
export function labeledCompositeFit(slot: Slot): CompositeFit | null {
  if (!LABELLED_CONTROL_TYPES.has(slot.name)) return null;
  // A Radio Group's "control" is a Radials CONTAINER whose options are absolutely
  // positioned (they don't reflow), so it must never be shrunk — treat it as
  // fixed-layout (the floor comes from compositeResizeMinWidth instead).
  if (slot.components.some((c) => c.type === "RadioGroup")) return null;
  const labelSlot = slot.children.find((c) => c.name === "Label");
  const controls = slot.children.filter(
    (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
  );
  if (controls.length !== 1) return null; // multi-part composite — leave its layout alone
  const control = controls[0];
  const labelW = labelSlot
    ? measureLabelWidth(controlLabelText(slot), labelFontPx(labelSlot))
    : 0;
  return {
    labelId: labelSlot?.id ?? null,
    controlId: control.id,
    labelW,
    controlMin: controlMinFor(slot.name),
    controlNatural: rtWidth(control) || controlMinFor(slot.name),
    position: labelPositionOf(slot),
    stretchy: STRETCHY_CONTROL_TYPES.has(slot.name),
  };
}

// Minimum WRAPPER width a labeled composite may be resized to without its label
// clipping or its controls overlapping. For a single-control composite the
// control can shrink, so the floor is label + gap + control minimum; for a
// MULTI-part composite (Radio Group / keypad — fixed internal layout) the floor
// is the label's reserved control band + the label text. null = not a labeled
// composite (no special floor; the resize keeps the flat MIN_SIZE).
export function compositeResizeMinWidth(slot: Slot): number | null {
  if (!LABELLED_CONTROL_TYPES.has(slot.name)) return null;
  const labelSlot = slot.children.find((c) => c.name === "Label");
  const labelW = labelSlot
    ? measureLabelWidth(controlLabelText(slot), labelFontPx(labelSlot))
    : 0;
  const controls = slot.children.filter(
    (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
  );
  // Fixed-layout = a Radio Group (Radials container with absolutely-positioned
  // options) or any multi-child composite. Its control(s) CAN'T shrink, so the
  // floor must keep their NATURAL width plus the label band.
  const fixedLayout = slot.components.some((c) => c.type === "RadioGroup") || controls.length !== 1;
  if (!fixedLayout) {
    const controlW = rtWidth(controls[0]) || controlMinFor(slot.name);
    const cmin = Math.min(controlMinFor(slot.name), controlW);
    return compositeMinWidth(labelPositionOf(slot), {
      stretchy: STRETCHY_CONTROL_TYPES.has(slot.name),
      labelW,
      controlW,
      controlMin: cmin,
    });
  }
  const controlNatural =
    controls.length >= 1 ? Math.max(...controls.map((c) => rtWidth(c))) : controlMinFor(slot.name);
  return Math.max(labelReserve(labelSlot) + labelW, controlNatural);
}

// Minimum size a CONTAINER (ScrollArea / layout / Tabs) may be resized to: big
// enough to hold its biggest nested element. minW = widest child's needed width
// (composite-min, or natural for non-composites) + padding; minH = tallest
// child's height + padding (+ the tab bar for Tabs). Resolvers give live child
// rects. Returns null for non-containers.
export function containerResizeMin(
  slot: Slot,
  heightOf: (s: Slot) => number,
  canvasPad: number = DEFAULT_CONTENT_PADDING,
): { minW: number; minH: number } | null {
  // The resized slot may BE the container, or WRAP it (the "Scroll Area" row
  // holds a "Scroll Viewport" child that carries the ScrollArea component). Find
  // the actual scroll/tabs/layout container within the slot's subtree.
  const isContainer = (s: Slot) => getLayoutKind(s) !== null || s.components.some((c) => c.type === "Tabs");
  const locate = (s: Slot): Slot | null => {
    if (isContainer(s)) return s;
    for (const ch of s.children) {
      const f = locate(ch);
      if (f) return f;
    }
    return null;
  };
  const container = locate(slot);
  if (!container) return null;
  slot = container;
  const isTabs = slot.components.some((c) => c.type === "Tabs");
  // A child's needed width: its composite min if it's a named composite, else a
  // STRUCTURAL composite min (label text + gap + control width) — scroll rows are
  // named by function ("Volume", "Mode") so they miss the name check, and their
  // own width is the (circular) full container width, so neither of those works.
  const childMinW = (el: Slot): number => {
    const named = compositeResizeMinWidth(el);
    if (named != null) return named;
    const labelSlot = el.children.find((c) => c.name === "Label");
    const controls = el.children.filter(
      (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
    );
    if (labelSlot && controls.length >= 1) {
      const labelW = measureLabelWidth(controlLabelText(el), labelFontPx(labelSlot));
      const controlW = Math.max(...controls.map((c) => rtWidth(c)));
      if (controls.length === 1) {
        return compositeMinWidth(labelPositionOf(el), {
          stretchy: STRETCHY_CONTROL_TYPES.has(el.name),
          labelW,
          controlW: controlW || ABS_FLOOR,
          controlMin: controlMinFor(el.name),
        });
      }
      return labelW + SNAP_GAP + controlW;
    }
    return ABS_FLOOR; // not full width — that's circular for force-expanded rows
  };

  let elements: Slot[] = [];
  let pad = CONTAINER_PAD;
  let extraH = 0;
  let extraW = 0; // scrollbar gutter on the width axis (vertical ScrollArea)
  let floorW = 0;
  if (isTabs) {
    const tp = (slot.components.find((c) => c.type === "Tabs")?.props ?? {}) as Record<string, unknown>;
    pad = resolvePad(tp.pagePadding as number | undefined, canvasPad);
    extraH = (tp.tabBarSize as number) ?? 40;
    const bar = slot.children.find((c) => c.children.some((g) => g.components.some((k) => k.type === "TabButton")));
    const tabCount = bar ? bar.children.filter((g) => g.components.some((k) => k.type === "TabButton")).length : 0;
    floorW = tabCount * 64; // each tab needs a readable minimum
    // Every tab page shares the same rect, so the container must fit the widest
    // content across ALL tabs (not just the active one) — else switching tabs
    // would clip.
    const pages = slot.children.filter((c) => c.components.some((k) => k.type === "TabPage"));
    elements = pages.flatMap((p) => p.children.filter((c) => !isStructuralSlot(c)));
  } else {
    const sa = slot.components.find((c) => c.type === "ScrollArea");
    if (sa) {
      const sap = sa.props as Record<string, unknown>;
      pad = resolvePad(sap.padding as number | undefined, canvasPad);
      if ((sap.showScrollbar as boolean) ?? true) extraW = SCROLLBAR_GUTTER;
    }
    elements = slot.children.filter((c) => !isStructuralSlot(c));
  }

  let minW = floorW;
  let minH = 0;
  for (const el of elements) {
    minW = Math.max(minW, childMinW(el));
    minH = Math.max(minH, Math.max(0, heightOf(el)));
  }
  return { minW: Math.round(minW + 2 * pad + extraW), minH: Math.round(minH + 2 * pad + extraH) };
}

// Like labeledCompositeFit but STRUCTURAL (works for rows named by function —
// "Volume", "Mode" — that miss the LABELLED_CONTROL_TYPES name check). Returns
// the label + single right-anchored control of a shrinkable composite, or null
// for fixed-layout (Radio Group) and non-composites. Used to cascade the
// control-shrink to a container's children when the container is resized.
export interface RefitInfo {
  labelId: string;
  controlId: string;
  labelW: number;
  controlMin: number;
  controlNatural: number;
}
export function compositeRefitInfo(slot: Slot): RefitInfo | null {
  if (slot.components.some((c) => c.type === "RadioGroup")) return null; // fixed layout
  const labelSlot = slot.children.find((c) => c.name === "Label");
  if (!labelSlot) return null;
  const controls = slot.children.filter(
    (c) => c !== labelSlot && c.components.some((k) => k.type === "RectTransform"),
  );
  if (controls.length !== 1) return null;
  const control = controls[0];
  const controlNatural = rtWidth(control);
  if (controlNatural <= 0) return null;
  return {
    labelId: labelSlot.id,
    controlId: control.id,
    labelW: measureLabelWidth(controlLabelText(slot), labelFontPx(labelSlot)),
    controlMin: controlMinFor(slot.name),
    controlNatural,
  };
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
      // ↗/value/× buttons) clips. Top-labelled composites stack instead, so the
      // floor is the wider of the two pieces.
      const cw = rtWidth(controls[0]) || controlMinFor(slot.name);
      const position = labelPositionOf(slot);
      if (position === "top") {
        return clamp(compositeMinWidth("top", {
          stretchy: STRETCHY_CONTROL_TYPES.has(slot.name),
          labelW,
          controlW: cw,
          controlMin: controlMinFor(slot.name),
        }));
      }
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

  // Tabs host: an absolute container whose pages overlap one rect; it carries a
  // frame Image, so without this it would hit the IMAGE_MIN floor below and
  // over-shrink — the cause of "only tab 1's labels clip" (the Tabs shrinks past
  // where its widest controls fit, and the tab with the widest controls clips
  // first). Min = the widest inner row across ALL pages (switching tabs mustn't
  // clip), each measured as its own content min PLUS the chrome around it (page
  // edge + row margin + any side tab bar) = natural - the row's current width.
  // Rows are recognised structurally so purpose-named rows count too.
  const tabsComp = slot.components.find((c) => c.type === "Tabs");
  if (tabsComp) {
    let need = 0;
    for (const page of slot.children) {
      if (!page.components.some((c) => c.type === "TabPage")) continue;
      for (const el of page.children) {
        if (isStructuralSlot(el)) continue;
        const rowMin = singleControlCompositeMin(el) ?? contentMinWidth(el, widthOf);
        const rowW = widthOf(el);
        const chrome = rowW > 0 ? Math.max(0, natural - rowW) : 0;
        need = Math.max(need, rowMin + chrome);
      }
    }
    // Keep a readable strip for a horizontal (top/bottom) tab bar even when the
    // content is tiny — each tab needs room for its label.
    const pos = ((tabsComp.props as Record<string, unknown>).tabPosition as string) ?? "top";
    if (pos === "top" || pos === "bottom") {
      const bar = slot.children.find((ch) =>
        ch.children.some((g) => g.components.some((k) => k.type === "TabButton")),
      );
      const n = bar
        ? bar.children.filter((g) => g.components.some((k) => k.type === "TabButton")).length
        : 0;
      need = Math.max(need, n * 64);
    }
    return clamp(need > 0 ? need : natural);
  }

  // Container WRAPPER — a slot whose container sits on a CHILD, not itself (the
  // "Scroll Area" row = a header Label + a "Scroll Viewport" child carrying the
  // ScrollArea). The getLayoutKind branch above only checks the slot's OWN
  // components, so without this the wrapper falls through to `natural` and can
  // never go side-by-side (the "can't move the Scroll Area beside the Tabs" bug).
  // Its min is the widest child's content min (the children are full-width, so no
  // extra padding on top of what each child already reserves).
  if (slot.children.some(hasContainerInSubtree)) {
    let maxChild = 0;
    for (const c of slot.children) {
      if (isStructuralSlot(c)) continue;
      maxChild = Math.max(maxChild, contentMinWidth(c, widthOf));
    }
    return clamp(maxChild > 0 ? maxChild : natural);
  }

  // Structural single-control composite (a "Label" child + exactly one control
  // child), regardless of the slot's NAME — so purpose-named rows ("Volume",
  // "Brightness", "Theme", scroll/tab content) report a real content min (label +
  // gap + control) instead of their full authored width, and can therefore shrink
  // to sit beside another element. LABELLED-named composites were already handled
  // above; this catches the function-named ones.
  const structuralMin = singleControlCompositeMin(slot);
  if (structuralMin != null) return clamp(structuralMin);

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
