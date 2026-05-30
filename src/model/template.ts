import { v4 as uuid } from "uuid";
import type { Slot, UixComponent } from "./types";
import { isStructuralName } from "./structural";
import { buildBackgroundTrio } from "./background";

function id() {
  return uuid();
}

function c(type: UixComponent["type"], props: Record<string, unknown>): UixComponent {
  return { type, props };
}

function slot(
  name: string,
  components: UixComponent[],
  children: Slot[] = [],
  position?: { x: number; y: number; z: number },
  rotation?: { x: number; y: number; z: number; w: number },
  scale?: { x: number; y: number; z: number },
): Slot {
  return { id: id(), name, locked: false, structural: isStructuralName(name) || undefined, components, children, position, rotation, scale };
}

// ── Anchoring helpers ────────────────────────────────────────────────────────
// All take CSS-style pixel coordinates (Y grows downward) and emit Resonite
// UIX RectTransform props (Y grows upward, offsets relative to anchors). The
// difference between helpers is which CANVAS EDGE the rect stays pinned to as
// the canvas resizes — important so the layout doesn't break when the user
// bumps Canvas size X/Y in the inspector.
//
// `leftMargin` is distance from the canvas's left edge (always grows with X).
// `rightMargin` is distance from the canvas's right edge.
// `topMargin`  / `bottomMargin` are distances from the corresponding edge.
// `height` / `width` are the rect's fixed pixel dimensions.

// Top-anchored: row hugs the top edge with a fixed height. Use for headers,
// labels, control rows that should stay at their authored Y from the top.
function topRT(leftMargin: number, topMargin: number, rightMargin: number, height: number) {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: leftMargin,   y: -(topMargin + height) },
    offsetMax: { x: -rightMargin, y: -topMargin },
    pivot: { x: 0.5, y: 0.5 },
  });
}

// Bottom-anchored: row hugs the bottom edge with a fixed height. Use for
// action button bars or anything that should stay at the bottom even as the
// canvas grows.
function bottomRT(leftMargin: number, bottomMargin: number, rightMargin: number, height: number) {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 0 },
    offsetMin: { x: leftMargin,   y: bottomMargin },
    offsetMax: { x: -rightMargin, y: bottomMargin + height },
    pivot: { x: 0.5, y: 0.5 },
  });
}

function fillRT(): UixComponent {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 0 },
    anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 },
    offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
}

function rgb(r: number, g: number, b: number, a = 1) {
  return { r, g, b, a };
}
const white = () => rgb(0.9, 0.9, 0.9);
const midGray = () => rgb(0.22, 0.22, 0.22);

// Stateful controls (Checkbox / Slider<float> / Toggle / Radio / TextField+
// TextEditor) require additional FrooxEngine types + cross-field UUID wiring
// to be implemented in the exporter. They each need their own dedicated
// iteration to reverse-engineer their preset in `UIX Template/`. Until those
// land, the default template intentionally omits non-functional mock controls
// — including a Checkbox row, Toggle switch, Slider, Radio group, Progress
// bar, and color Swatches — to avoid implying interactivity that doesn't work.
// Button A / Button B / Close are real working Buttons (with ColorDriver →
// SmoothValue<colorX> → Image.Tint hover/press animation).
export function createStarterTemplate(): Slot {
  // ── Header bar (full width, 56px at top) ──────────────────────────────────
  // The Icon (top-left) and Close (top-right) slots use a child slot for the
  // icon glyph image, so the rounded background tint and the icon sprite can
  // coexist (only one Image per slot).
  const iconGlyph = slot("Icon Glyph", [
    fillRT(),
    c("Image", { tint: white(), iconTint: rgb(0.58, 0.44, 0.85), preserveAspect: true, spriteUrl: "", useHelpIcon: true }),
  ]);
  // Help icon slot — clicking it pops up a configurable "About this panel"
  // dialog. Button gives hover/press color feedback; Popup is lowered to a
  // FrooxEngine.Hyperlink with an empty URL at export, which Resonite renders
  // as a confirmation dialog showing the Reason (title + body) on click.
  // serializeSlot auto-injects a sibling BoxCollider so the click actually
  // raycasts. Title/body/dismiss-label are editable from the Inspector.
  const iconSlot = slot("Icon", [
    fillRT(),
    c("Image", { tint: rgb(0.25, 0.25, 0.25), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: rgb(0.25, 0.25, 0.25), highlightColor: rgb(0.35, 0.35, 0.35), pressColor: rgb(0.15, 0.15, 0.15), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("Popup", { title: "About this panel", body: "Replace this with your panel's description. Edit the Popup component on the Icon slot to change the title and body.", dismissLabel: "Got it" }),
    c("LayoutElement", { minWidth: 40, minHeight: 40, preferredWidth: 40, preferredHeight: -1, flexibleWidth: -1, flexibleHeight: -1, orderOffset: 0 }),
  ], [iconGlyph]);

  const titleSlot = slot("Title", [
    fillRT(),
    c("Text", { content: "Example title", size: 18, color: white(), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
    c("LayoutElement", { minWidth: -1, minHeight: -1, preferredWidth: -1, preferredHeight: -1, flexibleWidth: 1, flexibleHeight: -1, orderOffset: 1 }),
  ]);

  // Loading spinner — sits between the title and the close button. The exporter
  // gives it a boolean "📚 Value" slot (named "Loading Spinner") that drives the
  // arc's Enabled field, so you can show/hide it in-game without deactivating
  // the slot — surrounding header items keep their place (no reflow).
  const spinnerSlot = slot("Loading Spinner", [
    fillRT(),
    c("Image", { tint: rgb(0.272, 0.567, 0.842), preserveAspect: true, spriteUrl: "", useSpinnerIcon: true }),
    c("LayoutElement", { minWidth: 56, minHeight: 56, preferredWidth: 56, preferredHeight: -1, flexibleWidth: -1, flexibleHeight: -1, orderOffset: 2 }),
  ]);

  // Close button: rounded gray background with the Close icon as a child slot.
  // (The icon goes on a child Image because the parent's Image is the colored
  // background; one Image per slot.)
  const closeGlyph = slot("Close Glyph", [
    fillRT(),
    c("Image", { tint: white(), iconTint: rgb(0.9, 0.25, 0.25), preserveAspect: true, spriteUrl: "", useCloseIcon: true }),
  ]);
  // Close button background is a neutral gray so the red-tinted X icon reads
  // clearly against it. (A red background would camouflage the red X.) Users
  // can still set any background tint they want in the Inspector.
  const closeGray = rgb(0.25, 0.25, 0.25);
  const closeSlot = slot("Close", [
    fillRT(),
    c("Image", { tint: closeGray, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: closeGray, highlightColor: rgb(0.35, 0.35, 0.35), pressColor: rgb(0.15, 0.15, 0.15), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    // Close marker → serializeSlot appends a ButtonDestroy component. Clicking
    // the X destroys the panel's outer grabbable root (FindObjectRoot=true).
    c("Close", { findObjectRoot: true }),
    c("LayoutElement", { minWidth: 40, minHeight: 40, preferredWidth: 40, preferredHeight: -1, flexibleWidth: -1, flexibleHeight: -1, orderOffset: 2 }),
  ], [closeGlyph]);

  const headerSlot = slot("Header", [
    topRT(0, 0, 0, 56),
    // matchPanelCorners: round the header to the panel's absolute corner radius
    // (not one proportional to the 56px bar height) so its top corners line up
    // with the rounded canvas — especially once a wallpaper sits behind the dark
    // header. cornerRadius stays as the editor-preview / non-rounded fallback.
    // See _panelCornerFixedSizePx in exportBrson.
    c("Image", { tint: rgb(0.082, 0.082, 0.082), preserveAspect: false, spriteUrl: "", cornerRadius: 30, matchPanelCorners: true }),
    c("HorizontalLayout", { spacing: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 8, paddingBottom: 8, horizontalAlign: "Left", verticalAlign: "Top", forceExpandWidth: false, forceExpandHeight: true }),
  ], [iconSlot, titleSlot, spinnerSlot, closeSlot]);

  // ── Body paragraph ────────────────────────────────────────────────────────
  // Lorem ipsum sample text directly below the header. Replaces the old
  // single-line "Example header" label so users can immediately see what a
  // multi-line static text block looks like (and the Text component's
  // word-wrap behaviour). Top-aligned so the first line sits flush below
  // the header.
  const bodyTextSlot = slot("Body Text", [
    topRT(16, 64, 16, 64),
    c("Text", {
      content:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
        "Sed do eiusmod tempor incididunt ut labore et dolore magna " +
        "aliqua. Ut enim ad minim veniam, quis nostrud exercitation.",
      size: 13,
      color: rgb(0.72, 0.72, 0.76),
      horizontalAlign: "Left",
      verticalAlign: "Top",
      autoSize: false,
    }),
  ]);

  // ── Checkbox row ───────────────────────────────────────────────────────────
  // Two-slot Checkbox:
  //   parent "Box"       — colored background Image only (no Button, no Checkbox)
  //   child  "Check Icon" — fills parent, holds the check-sprite Image + Button +
  //                          Checkbox marker. Exporter wires this slot with a
  //                          BooleanValueDriver<colorX> targeting Image.Tint
  //                          (transparent ↔ opaque), no SmoothValue hover.
  // The check sprite has a transparent background, so when its tint goes
  // transparent only the parent's blue background is visible; when opaque, the
  // checkmark glyph appears over it.
  const checkIcon = slot("Check Icon", [
    fillRT(),
    c("Image", { tint: white(), preserveAspect: true, spriteUrl: "", useCheckIcon: true }),
    c("Button", { normalColor: white(), highlightColor: white(), pressColor: rgb(0.8, 0.8, 0.8), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
    c("Checkbox", { initialState: true }),
  ]);
  const checkboxBox = slot("Box", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -28, y: -14 }, offsetMax: { x: 0, y: 14 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "" }),
  ], [checkIcon]);
  const checkboxLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -40, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Enable feature", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const checkboxRow = slot("Checkbox", [
    topRT(16, 136, 16, 36),
  ], [checkboxBox, checkboxLabel]);

  // ── Toggle row ─────────────────────────────────────────────────────────────
  // Sliding-knob toggle:
  //   parent "Pill" — RT 60×32 (2:1 pill), Image (color-driven between
  //                   offColor #242424 and onColor accent blue), Button,
  //                   Toggle marker. Serializer adds BooleanValueDriver<colorX>
  //                   for the tint + ValueMultiDriver<bool> broadcasting state
  //                   + UIX.Checkbox flipping the MultiDriver.Value.
  //   child  "Knob" — RT centered (AnchorMin=AnchorMax=(0.5,0.5)) with offsets
  //                   that the serializer's 2 BooleanValueDriver<float2>s flip
  //                   between off (knob on left) and on (knob on right). White
  //                   circle 26×26 inside the 60×32 pill, 4px inset from edges.
  const toggleKnob = slot("Knob", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
      offsetMin: { x: -27, y: -13 }, offsetMax: { x: -1, y: 13 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // cornerRadius 100 → full pill; at width≈height that reads as a circle,
    // which is what we want for the knob.
    c("Image", { tint: rgb(0.95, 0.95, 0.95), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Knob", {
      offOffsetMin: { x: -27, y: -13 },
      offOffsetMax: { x: -1,  y:  13 },
      onOffsetMin:  { x:  1,  y: -13 },
      onOffsetMax:  { x: 27,  y:  13 },
    }),
  ]);
  const togglePill = slot("Pill", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -60, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.141, 0.141, 0.141), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: white(), highlightColor: white(), pressColor: rgb(0.8, 0.8, 0.8), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
    c("Toggle", {
      initialState: false,
      offColor: rgb(0.141, 0.141, 0.141),
      onColor:  rgb(0.18, 0.36, 0.60),
    }),
  ], [toggleKnob]);
  const toggleLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -72, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Online", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const toggleRow = slot("Toggle", [
    topRT(16, 184, 16, 36),
  ], [togglePill, toggleLabel]);

  // ── Slider row ─────────────────────────────────────────────────────────────
  // Single-slot Slider: the slot itself is the track (Image background + Slider
  // marker). At export the serializer expands this into UIX.Slider<float> plus
  // a synthetic "Fill" child slot driven by the Slider's HandleAnchorMaxDrive.
  // The track is 200px wide × 16px tall, anchored to the left at the row's
  // vertical center. Label sits to the right of the track.
  const sliderTrack = slot("Track", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -200, y: -8 }, offsetMax: { x: 0, y: 8 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Slider", {
      value: 0.6,
      min: 0,
      max: 1,
      direction: "Horizontal",
      integers: false,
      power: 1,
      fillColor: rgb(0.18, 0.36, 0.6),
      clamp: true,
      requireInitialPress: true,
    }),
  ]);
  const sliderLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -212, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Volume", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const sliderRow = slot("Slider", [
    topRT(16, 232, 16, 36),
  ], [sliderTrack, sliderLabel]);

  // ── Text Field row ─────────────────────────────────────────────────────────
  // The TextField marker, when paired with an Image and RT on the same slot,
  // expands at export time into UIX.TextField + TextEditor + a synthetic
  // child "Text" slot (the editable Text component). The whole slot becomes
  // a real Resonite text input — click it and type.
  const textFieldInputSlot = slot("Input", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -280, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.12, 0.12, 0.12), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("TextField", {
      placeholder: "",
      textContent: "Edit me",
      textAlign: "Center",
      fontSize: 16,
      textColor: rgb(0.9, 0.9, 0.9),
      placeholderColor: rgb(0.45, 0.45, 0.45),
      backgroundTint: rgb(0.12, 0.12, 0.12),
    }),
  ]);
  const textFieldLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -292, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Text", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const textFieldRow = slot("Text Field", [
    topRT(16, 280, 16, 36),
  ], [textFieldInputSlot, textFieldLabel]);

  // ── Float input row ────────────────────────────────────────────────────────
  const floatInputSlot = slot("Input", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -280, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.12, 0.12, 0.12), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("TextField", {
      placeholder: "",
      textContent: "",
      fontSize: 16,
      textColor: rgb(0.9, 0.9, 0.9),
      placeholderColor: rgb(0.45, 0.45, 0.45),
      backgroundTint: rgb(0.12, 0.12, 0.12),
      fieldType: "float",
      textAlign: "Center",
    }),
  ]);
  const floatLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -292, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Float", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const floatFieldRow = slot("Float Field", [
    topRT(16, 328, 16, 36),
  ], [floatInputSlot, floatLabel]);

  // ── Integer input row ──────────────────────────────────────────────────────
  const intInputSlot = slot("Input", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -280, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.12, 0.12, 0.12), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("TextField", {
      placeholder: "",
      textContent: "",
      fontSize: 16,
      textColor: rgb(0.9, 0.9, 0.9),
      placeholderColor: rgb(0.45, 0.45, 0.45),
      backgroundTint: rgb(0.12, 0.12, 0.12),
      fieldType: "int",
      textAlign: "Center",
    }),
  ]);
  const intLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -292, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Integer", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const intFieldRow = slot("Integer Field", [
    topRT(16, 376, 16, 36),
  ], [intInputSlot, intLabel]);

  // ── Radio group row ────────────────────────────────────────────────────────
  // Three mutually-exclusive options. Each radio slot has its own Image
  // (circular via usePillSprite on a 24×24 square), Button, and Radio marker
  // carrying its index. The first radio (Auto) starts selected — its index 0
  // is also the initial value of the group's shared ValueField<int>.
  function makeRadioOption(
    name: string,
    labelText: string,
    rightPx: number,
    widthPx: number,
    index: number,
    initiallySelected: boolean,
  ): Slot {
    const dotColor = rgb(0.95, 0.95, 0.95);
    // Each radio's button is anchored to the LEFT of the wrapper slot (which
    // is itself constrained horizontally below), so child offsets are relative
    // to the option's own local space.
    const radioBox = slot(name, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
        offsetMin: { x: 0, y: -12 }, offsetMax: { x: 24, y: 12 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.18, 0.18, 0.18), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: rgb(0.18, 0.18, 0.18), highlightColor: rgb(0.30, 0.30, 0.30), pressColor: rgb(0.10, 0.10, 0.10), disabledColor: rgb(0.25, 0.25, 0.25), hoverVibrate: false }),
      c("Radio", { groupId: "mode", index, initiallySelected, selectedColor: dotColor }),
    ]);
    const radioLabel = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 30, y: 0 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: labelText, size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    // Wrapper is sized to just this option's area, anchored to the row's
    // RIGHT edge so the cluster of radios sits on the right while the
    // "Mode" label hugs the left.
    return slot(`Radio ${name}`, [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: -(rightPx + widthPx), y: 0 }, offsetMax: { x: -rightPx, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ], [radioBox, radioLabel]);
  }
  // Row label — "Mode" sits on the left of the row, mirroring the
  // label-left / control-right convention used by all other rows.
  const radioGroupLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -252, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Mode", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  // Three options stacked against the right edge of the row. rightPx is the
  // gap from the row's right edge; widths and gaps stay the same as before
  // — just measured from the right side now.
  // [Auto (90)] 8 [On (72)] 8 [Off (72)] | right edge
  // "Radials" container — groups the three option slots under one tidy parent
  // so the end user sees [Label, Radials, 📚 Value] instead of three loose
  // radio slots. Sized to the RIGHT cluster (250px = the span the three options
  // occupy) rather than the full row, so its rect doesn't overlap the left-hand
  // "Mode" label (a full-row identity rect triggered a false-positive overlap
  // warning even though the container draws nothing). The options are anchored
  // to this container's right edge — which still coincides with the row's right
  // edge — so they keep their exact positions. Radio wiring is keyed by groupId,
  // not hierarchy, so the container changes nothing functionally.
  const radials = slot("Radials", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: -250, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
  ], [
    makeRadioOption("Auto", "Auto", 160, 90, 0, true),
    makeRadioOption("On",   "On",   80,  72, 1, false),
    makeRadioOption("Off",  "Off",  0,   72, 2, false),
  ]);
  const radioGroupRow = slot("Radio Group", [
    topRT(16, 424, 16, 36),
    // RadioGroup marker — puts the shared ValueField<int> on this parent
    // slot at export. Initial index 0 → "Auto" starts selected.
    c("RadioGroup", { groupId: "mode", initialIndex: 0 }),
  ], [
    radioGroupLabel,
    radials,
  ]);

  // ── Progress Bar row ───────────────────────────────────────────────────────
  // Static visual progress indicator: a thin pill-shaped track with a colored
  // fill child anchored to `value / max` of the track length. The exporter
  // lowers the ProgressBar marker into a synthetic "Fill" child slot — no
  // drivers or UIX.Slider involved, so the bar is read-only at runtime
  // (a Resonite script can drive Fill.RT.AnchorMax after import).
  const progressBarTrack = slot("Track", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -200, y: -6 }, offsetMax: { x: 0, y: 6 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("ProgressBar", {
      value: 0.4,
      min: 0,
      max: 1,
      direction: "Horizontal",
      fillColor: rgb(0.18, 0.36, 0.6),
    }),
  ]);
  const progressBarLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -212, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Progress", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const progressBarRow = slot("Progress Bar", [
    topRT(16, 472, 16, 36),
  ], [progressBarTrack, progressBarLabel]);

  // ── Dropdown row ───────────────────────────────────────────────────────────
  // The trigger slot is a pill-shaped button showing the current selection.
  // The exporter lowers the Dropdown marker into a ValueField<int> + a
  // spawn-window popup with one button per option. Each option button writes
  // its index AND its label string back into the trigger, so the visible
  // label always reflects the most recently chosen option.
  const dropdownTrigger = slot("Trigger", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -200, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.14, 0.16, 0.20), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: rgb(0.14, 0.16, 0.20), highlightColor: rgb(0.22, 0.26, 0.32), pressColor: rgb(0.10, 0.12, 0.16), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("Dropdown", {
      options: "Low\nMedium\nHigh",
      initialIndex: 1,
      optionFillColor:  rgb(0.14, 0.16, 0.20),
      optionLabelColor: white(),
    }),
  ]);
  const dropdownLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -212, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Quality", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const dropdownRow = slot("Dropdown", [
    topRT(16, 520, 16, 36),
  ], [dropdownTrigger, dropdownLabel]);

  // ── Reference Field row ────────────────────────────────────────────────────
  // ReferenceField marker — at export the host slot is lowered into a
  // horizontal layout with a drop-target field (shows italic "null" when
  // empty) and a ∅ clear button. In Resonite, drag any element onto the
  // field to set the reference; click ∅ to clear.
  const refFieldControl = slot("Field", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -280, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("ReferenceField", {
      fieldColor:  rgb(0.024, 0.028, 0.036, 1),
      buttonColor: rgb(0.024, 0.028, 0.036, 1),
      textColor:   rgb(0.88, 0.88, 0.88, 1),
    }),
  ]);
  const refFieldLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -292, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Reference", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const refFieldRow = slot("Reference Field", [
    topRT(16, 568, 16, 36),
  ], [refFieldControl, refFieldLabel]);

  // ── Color Picker row ───────────────────────────────────────────────────────
  // ColorPicker marker on the swatch — at export the host slot is lowered into
  // an Image (whose Tint shows the current color) + a Button + a
  // FrooxEngine.ButtonEditColorX whose Target is that Tint. Clicking the swatch
  // opens Resonite's native color picker overlay; the chosen colorX writes
  // straight back into the Tint (Continuous) and is mirrored into the exposed
  // "📚 Value" colorX variable. No ProtoFlux required.
  const colorPickerSwatch = slot("Swatch", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -100, y: -14 }, offsetMax: { x: 0, y: 14 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.18, 0.36, 0.6), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: rgb(0.18, 0.36, 0.6), highlightColor: rgb(0.18, 0.36, 0.6), pressColor: rgb(0.18, 0.36, 0.6), disabledColor: rgb(0.18, 0.36, 0.6), hoverVibrate: false }),
    c("ColorPicker", { initialColor: rgb(0.18, 0.36, 0.6), alpha: true, hdr: false }),
  ]);
  const colorPickerLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -112, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Color Picker", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const colorPickerRow = slot("Color Picker", [
    topRT(16, 616, 16, 36),
  ], [colorPickerSwatch, colorPickerLabel]);

  // ── Scroll Area row ────────────────────────────────────────────────────────
  // ScrollArea marker — at export the host slot becomes a Resonite UIX
  // viewport (Mask + ScrollRect + ContentSizeFitter + VerticalLayout). The
  // items below are real interactive controls (slider, text field, radio
  // group, dropdown) so the user can verify they behave identically inside
  // the scrollable region and outside it. Each row uses LayoutElement so the
  // ScrollArea's auto-stacking VerticalLayout sizes them; their interior
  // structure mirrors the outer-panel rows but anchored child slots are
  // relative to whatever rect the layout assigns. Component groupIds /
  // states are intentionally distinct from the outer instances so the two
  // copies don't sync. Total stacked height > viewport height ⇒ scrolling
  // is meaningful.

  // Helper: a row wrapper sized to a fixed pixel height via LayoutElement.
  // Anchored child slots inside use the row's own rect as origin.
  function scrollRow_(name: string, heightPx: number, components: UixComponent[], children: Slot[], orderIdx: number): Slot {
    return slot(name, [
      fillRT(),
      c("LayoutElement", {
        minWidth: -1, preferredWidth: -1, flexibleWidth: -1,
        minHeight: heightPx, preferredHeight: heightPx, flexibleHeight: -1,
        orderOffset: orderIdx,
      }),
      ...components,
    ], children);
  }
  // Label that hugs the LEFT of a row, leaving `rightReserve` px for the
  // control(s) anchored on the right.
  function leftLabel(text: string, rightReserve: number): Slot {
    return slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: -rightReserve, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: text, size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
  }

  // Reusable helpers for common scroll-area row types.
  function scrollSliderRow_(name: string, label: string, value: number, orderIdx: number): Slot {
    const track = slot("Track", [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: -200, y: -8 }, offsetMax: { x: 0, y: 8 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Slider", { value, min: 0, max: 1, direction: "Horizontal", integers: false, power: 1, fillColor: rgb(0.18, 0.36, 0.6), clamp: true, requireInitialPress: true }),
    ]);
    return scrollRow_(name, 36, [], [track, leftLabel(label, 212)], orderIdx);
  }
  function scrollProgressRow_(name: string, label: string, value: number, orderIdx: number): Slot {
    const track = slot("Track", [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: -200, y: -6 }, offsetMax: { x: 0, y: 6 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("ProgressBar", { value, min: 0, max: 1, direction: "Horizontal", fillColor: rgb(0.18, 0.36, 0.6) }),
    ]);
    return scrollRow_(name, 36, [], [track, leftLabel(label, 212)], orderIdx);
  }
  function scrollDropdownRow_(name: string, label: string, options: string, initialIndex: number, orderIdx: number): Slot {
    const trigger = slot("Trigger", [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: -200, y: -16 }, offsetMax: { x: 0, y: 16 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.14, 0.16, 0.20), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: rgb(0.14, 0.16, 0.20), highlightColor: rgb(0.22, 0.26, 0.32), pressColor: rgb(0.10, 0.12, 0.16), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
      c("Dropdown", { options, initialIndex, optionFillColor: rgb(0.14, 0.16, 0.20), optionLabelColor: white() }),
    ]);
    return scrollRow_(name, 36, [], [trigger, leftLabel(label, 212)], orderIdx);
  }

  // 1) Volume slider
  const scrollVolumeRow = scrollSliderRow_("Volume",     "Volume",     0.30, 0);
  // 2) Text input
  const scrollTextInput = slot("Input", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -280, y: -16 }, offsetMax: { x: 0, y: 16 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.12, 0.12, 0.12), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("TextField", {
      placeholder: "", textContent: "Edit me",
      textAlign: "Center",
      fontSize: 16, textColor: rgb(0.9, 0.9, 0.9),
      placeholderColor: rgb(0.45, 0.45, 0.45),
      backgroundTint: rgb(0.12, 0.12, 0.12),
    }),
  ]);
  const scrollTextRow = scrollRow_("Text Field", 36, [], [scrollTextInput, leftLabel("Text", 292)], 1);

  // 3) Mode radio group — unique groupId
  function makeScrollRadioOption(
    name: string, labelText: string, rightPx: number, widthPx: number,
    index: number, initiallySelected: boolean,
  ): Slot {
    const dotColor = rgb(0.95, 0.95, 0.95);
    const radioBox = slot(name, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
        offsetMin: { x: 0, y: -12 }, offsetMax: { x: 24, y: 12 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.18, 0.18, 0.18), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: rgb(0.18, 0.18, 0.18), highlightColor: rgb(0.30, 0.30, 0.30), pressColor: rgb(0.10, 0.10, 0.10), disabledColor: rgb(0.25, 0.25, 0.25), hoverVibrate: false }),
      c("Radio", { groupId: "scroll-mode", index, initiallySelected, selectedColor: dotColor }),
    ]);
    const labelInner = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 30, y: 0 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: labelText, size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    return slot(`Radio ${name}`, [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: -(rightPx + widthPx), y: 0 }, offsetMax: { x: -rightPx, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ], [radioBox, labelInner]);
  }
  // Same "Radials" grouping as the non-scroll Radio Group above — inside and
  // outside the scroll area are structurally identical; this row just happens
  // to live in the scrollable content. Sized to the right cluster (250px) so it
  // doesn't overlap the "Mode" label (see the outer Radials note above).
  const scrollRadials = slot("Radials", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: -250, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
  ], [
    makeScrollRadioOption("Auto", "Auto", 160, 90, 0, true),
    makeScrollRadioOption("On", "On", 80, 72, 1, false),
    makeScrollRadioOption("Off", "Off", 0, 72, 2, false),
  ]);
  const scrollModeRow = scrollRow_(
    "Mode", 36,
    [c("RadioGroup", { groupId: "scroll-mode", initialIndex: 0 })],
    [leftLabel("Mode", 252), scrollRadials],
    2,
  );

  // 4–11) More rows so the viewport has meaningful content to scroll through.
  const scrollDropdownRow  = scrollDropdownRow_("Dropdown",   "Quality",    "Low\nMedium\nHigh",            1,  3);
  const scrollBrightRow    = scrollSliderRow_  ("Brightness",  "Brightness", 0.70,                           4);
  const scrollContrastRow  = scrollSliderRow_  ("Contrast",    "Contrast",   0.50,                           5);
  const scrollSatRow       = scrollSliderRow_  ("Saturation",  "Saturation", 0.60,                           6);
  const scrollGammaRow     = scrollSliderRow_  ("Gamma",       "Gamma",      0.45,                           7);
  const scrollUploadRow    = scrollProgressRow_("Upload",      "Upload",     0.30,                           8);
  const scrollDownloadRow  = scrollProgressRow_("Download",    "Download",   0.75,                           9);
  const scrollResRow       = scrollDropdownRow_("Resolution",  "Resolution", "720p\n1080p\n1440p\n4K",       1, 10);
  const scrollFormatRow    = scrollDropdownRow_("Format",      "Format",     "PNG\nJPEG\nWebP\nEXR",         0, 11);

  const scrollHeaderLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: -20 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Scroll Area", size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const scrollAreaSlot = slot("Scroll Viewport", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: -24 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("ScrollArea", {
      direction: "Vertical",
      backgroundTint:      rgb(0.10, 0.11, 0.14, 1),
      spacing: 8, padding: 8,
      showScrollbar: true,
      scrollbarTrackTint:  rgb(0.15, 0.17, 0.21, 1),
      scrollbarThumbTint:  rgb(0.55, 0.60, 0.68, 1),
    }),
  ], [scrollVolumeRow, scrollTextRow, scrollModeRow, scrollDropdownRow, scrollBrightRow, scrollContrastRow, scrollSatRow, scrollGammaRow, scrollUploadRow, scrollDownloadRow, scrollResRow, scrollFormatRow]);
  const scrollRow = slot("Scroll Area", [
    topRT(16, 668, 16, 250),
  ], [scrollHeaderLabel, scrollAreaSlot]);

  // ── Image placeholder ──────────────────────────────────────────────────────
  // Fixed 16:9 rect: canvas width=800 → usable width=768px → height=432px.
  // Positioned 16px below the scroll area (ends at 918) → topMargin=934.
  // Canvas height bumped to 1448 to fit the taller image + buttons below.
  const imagePlaceholderSlot = slot("Image Placeholder", [
    topRT(16, 934, 16, 432),
    c("Image", { tint: white(), preserveAspect: false, spriteUrl: "", useImagePlaceholder: true }),
  ]);

  // ── Two buttons at bottom ──────────────────────────────────────────────────
  const btnALabelSlot = slot("Label", [
    fillRT(),
    c("Text", { content: "Button A", size: 16, color: white(), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);
  const btnBLabelSlot = slot("Label", [
    fillRT(),
    c("Text", { content: "Button B", size: 16, color: white(), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);

  const btnA = slot("Button A", [
    fillRT(),
    c("Image", { tint: rgb(0.18, 0.36, 0.6), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: rgb(0.18, 0.36, 0.6), highlightColor: rgb(0.24, 0.48, 0.78), pressColor: rgb(0.12, 0.24, 0.44), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("LayoutElement", { minWidth: -1, minHeight: -1, preferredWidth: -1, preferredHeight: -1, flexibleWidth: 1, flexibleHeight: -1, orderOffset: 0 }),
  ], [btnALabelSlot]);

  const btnB = slot("Button B", [
    fillRT(),
    c("Image", { tint: midGray(), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: midGray(), highlightColor: rgb(0.32, 0.32, 0.32), pressColor: rgb(0.1, 0.1, 0.1), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("LayoutElement", { minWidth: -1, minHeight: -1, preferredWidth: -1, preferredHeight: -1, flexibleWidth: 1, flexibleHeight: -1, orderOffset: 1 }),
  ], [btnBLabelSlot]);

  const buttonsRowSlot = slot("Buttons", [
    bottomRT(16, 16, 16, 52),
    c("HorizontalLayout", { spacing: 12, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, horizontalAlign: "Left", verticalAlign: "Top", forceExpandWidth: true, forceExpandHeight: true }),
  ], [btnA, btnB]);

  // ── Canvas background (first child = renders behind everything) ───────────
  // The Background + Back Cover + Front Backing chrome is shared with the blank
  // canvas via buildBackgroundTrio (src/model/background.ts) so the two can't
  // drift. See that module for the front/back layering rationale.
  const backgroundSlot = buildBackgroundTrio();

  // ── Root canvas ────────────────────────────────────────────────────────────
  return slot("Canvas", [
    c("Canvas", { sizeX: 800, sizeY: 1448, pixelScale: 0.0005, acceptPhysicalTouch: true, backgroundColor: { r: 0.051, g: 0.051, b: 0.051, a: 1 }, rounded: true, backLogoHyperlinkUrl: "https://uix.dalek.coffee", backLogoHyperlinkReason: "Check out the tool! :D" }),
    fillRT(),
  ], [
    backgroundSlot,
    headerSlot,
    bodyTextSlot,
    checkboxRow,
    toggleRow,
    sliderRow,
    textFieldRow,
    floatFieldRow,
    intFieldRow,
    radioGroupRow,
    progressBarRow,
    dropdownRow,
    refFieldRow,
    colorPickerRow,
    scrollRow,
    imagePlaceholderSlot,
    buttonsRowSlot,
  ]);
}
