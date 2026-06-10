import { v4 as uuid } from "uuid";
import type { Slot, UixComponent, UixComponentType } from "./types";
import type { PaletteItem } from "./palette";
import type { Color } from "./theme";

// ─────────────────────────────────────────────────────────────────────────────
// Standalone "widget" builders for the Add menu.
//
// Composite controls (Checkbox, Toggle, Slider, …) are NOT single components —
// they are multi-slot subtrees: a Checkbox needs a background Box + a Check-Icon
// child carrying the marker; a Toggle needs a Pill + a sliding Knob child. The
// exporter only wires their real FrooxEngine behaviour when those sibling slots
// and components are present (hasBoolToggle = marker && Button && Image, etc.).
// Adding a bare marker produced an empty/blank control.
//
// These builders reproduce the EXACT control subtrees authored in the
// Experimental Panel (src/model/template.ts) — that template is the canonical
// source of truth. Values here mirror it 1:1 so an added control looks and
// behaves identically to the ones in the flagship preset. If the template's
// control structure changes, update these to match.
// ─────────────────────────────────────────────────────────────────────────────

function c(type: UixComponentType, props: Record<string, unknown>): UixComponent {
  return { type, props };
}

function s(name: string, components: UixComponent[], children: Slot[] = []): Slot {
  return { id: uuid(), name, locked: false, components, children };
}

function rgb(r: number, g: number, b: number, a = 1) {
  return { r, g, b, a };
}
const white = () => rgb(0.9, 0.9, 0.9);

function fillRT(): UixComponent {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
}

// A left-hugging label that reserves `rightReserve` px on the right for the
// control(s). Mirrors the row-label convention used throughout the template.
function leftLabel(text: string, rightReserve: number): Slot {
  return s("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: -rightReserve, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: text, size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
}

// A control anchored to the row's right edge, `widthPx` wide and `heightPx`
// tall, vertically centered. `extraComponents`/`children` carry the control's
// markers + nested slots.
function rightControl(
  name: string,
  widthPx: number,
  heightPx: number,
  components: UixComponent[],
  children: Slot[] = [],
): Slot {
  return s(name, [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -widthPx, y: -heightPx / 2 }, offsetMax: { x: 0, y: heightPx / 2 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    ...components,
  ], children);
}

// The widget wrapper — a row centered on the canvas, cascaded down-right per
// existing sibling so repeated adds don't stack exactly on top of each other.
function wrap(
  name: string,
  widthPx: number,
  heightPx: number,
  cascade: number,
  children: Slot[],
  extraComponents: UixComponent[] = [],
): Slot {
  const i = cascade % 8;
  const dx = i * 20;
  const dy = -i * 20;
  const hw = widthPx / 2;
  const hh = heightPx / 2;
  return s(name, [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
      offsetMin: { x: -hw + dx, y: -hh + dy }, offsetMax: { x: hw + dx, y: hh + dy },
      pivot: { x: 0.5, y: 0.5 },
    }),
    ...extraComponents,
  ], children);
}

// Standard interactive-button color set used by the template's controls.
function btn(normal: ReturnType<typeof rgb>): UixComponent {
  return c("Button", {
    normalColor: normal,
    highlightColor: white(),
    pressColor: rgb(0.8, 0.8, 0.8),
    disabledColor: rgb(0.5, 0.5, 0.5),
    hoverVibrate: false,
  });
}

// ── Per-control builders (mirror src/model/template.ts) ─────────────────────

function buildCheckbox(cascade: number): Slot {
  // Box (dark bg) → Check Icon (white check sprite + Button + Checkbox marker).
  const checkIcon = s("Check Icon", [
    fillRT(),
    c("Image", { tint: white(), preserveAspect: true, spriteUrl: "", useCheckIcon: true }),
    btn(white()),
    c("Checkbox", { initialState: true }),
  ]);
  const box = rightControl("Box", 28, 28, [
    c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "" }),
  ], [checkIcon]);
  return wrap("Checkbox", 220, 36, cascade, [box, leftLabel("Enable feature", 40)]);
}

function buildToggle(cascade: number): Slot {
  // Pill (color-driven) → Knob (white circle that slides on/off).
  const knob = s("Knob", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
      offsetMin: { x: -27, y: -13 }, offsetMax: { x: -1, y: 13 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.95, 0.95, 0.95), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Knob", {
      offOffsetMin: { x: -27, y: -13 }, offOffsetMax: { x: -1, y: 13 },
      onOffsetMin:  { x: 1, y: -13 },   onOffsetMax:  { x: 27, y: 13 },
    }),
  ]);
  const pill = rightControl("Pill", 60, 32, [
    c("Image", { tint: rgb(0.141, 0.141, 0.141), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    btn(white()),
    c("Toggle", { initialState: false, offColor: rgb(0.141, 0.141, 0.141), onColor: rgb(0.18, 0.36, 0.60) }),
  ], [knob]);
  return wrap("Toggle", 220, 36, cascade, [pill, leftLabel("Online", 72)]);
}

function buildSlider(cascade: number): Slot {
  const track = rightControl("Track", 200, 16, [
    c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Slider", { value: 0.6, min: 0, max: 1, direction: "Horizontal", integers: false, power: 1, fillColor: rgb(0.18, 0.36, 0.6), clamp: true, requireInitialPress: true }),
  ]);
  return wrap("Slider", 340, 36, cascade, [track, leftLabel("Volume", 212)]);
}

function buildProgressBar(cascade: number): Slot {
  const track = rightControl("Track", 200, 12, [
    c("Image", { tint: rgb(0.129, 0.149, 0.149), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("ProgressBar", { value: 0.4, min: 0, max: 1, direction: "Horizontal", fillColor: rgb(0.18, 0.36, 0.6) }),
  ]);
  return wrap("Progress Bar", 340, 36, cascade, [track, leftLabel("Progress", 212)]);
}

// Audio waveform visualizer (no label child — a pure visual, like the Spinner).
// Defaults to a wide cyan trace; the exporter lowers the marker into a
// UIX.RectMesh<AudioSourceWaveformMesh>. Link it to an "Audio source" Reference
// Field via the Waveform's audioLinkId in the inspector to make it live.
function buildWaveform(cascade: number): Slot {
  return wrap("Waveform", 360, 120, cascade, [], [
    c("Waveform", { color: rgb(0.36, 0.84, 0.94), points: 256, thickness: 4, historyLength: 0.5 }),
  ]);
}

// Avatar + name geometry for a User Profile card, shared by the widget builder
// and the store's setUserProfileLayout so the editor toggle and a freshly-added
// card always agree. Anchor-based (size-independent) so it scales with the card.
export const USER_PROFILE_AVATAR = 48;
export function userProfileLayout(pos: "left" | "above" | "right"): {
  avatar: Record<string, unknown>;
  name: Record<string, unknown>;
  nameAlign: "Left" | "Center" | "Right";
} {
  const A = USER_PROFILE_AVATAR, PAD = 12, GAP = 12;
  if (pos === "above") {
    return {
      avatar: { anchorMin: { x: 0.5, y: 1 }, anchorMax: { x: 0.5, y: 1 }, offsetMin: { x: -A / 2, y: -(PAD + A) }, offsetMax: { x: A / 2, y: -PAD }, pivot: { x: 0.5, y: 0.5 } },
      name:   { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, offsetMin: { x: PAD, y: PAD }, offsetMax: { x: -PAD, y: -(PAD + A + GAP) }, pivot: { x: 0.5, y: 0.5 } },
      nameAlign: "Center",
    };
  }
  if (pos === "right") {
    return {
      avatar: { anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 }, offsetMin: { x: -(PAD + A), y: -A / 2 }, offsetMax: { x: -PAD, y: A / 2 }, pivot: { x: 0.5, y: 0.5 } },
      name:   { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, offsetMin: { x: PAD, y: 0 }, offsetMax: { x: -(PAD + A + GAP), y: 0 }, pivot: { x: 0.5, y: 0.5 } },
      nameAlign: "Right",
    };
  }
  return {
    avatar: { anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 }, offsetMin: { x: PAD, y: -A / 2 }, offsetMax: { x: PAD + A, y: A / 2 }, pivot: { x: 0.5, y: 0.5 } },
    name:   { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, offsetMin: { x: PAD + A + GAP, y: 0 }, offsetMax: { x: -PAD, y: 0 }, pivot: { x: 0.5, y: 0.5 } },
    nameAlign: "Left",
  };
}

// User Profile card — a rounded surface with an avatar (circular image
// placeholder) and a name label. Editor-only marker (skipped at export). The
// avatar position (left/above/right) is re-laid by setUserProfileLayout.
function buildUserProfile(cascade: number): Slot {
  const lay = userProfileLayout("left");
  // Plain neutral circle (NOT the image placeholder — the placeholder injects an
  // overlay glyph child that would sit on top of the fetched profile picture). The
  // exporter points this Image.Sprite at the live CloudUserInfo profile texture.
  const avatar = s("Avatar", [
    c("RectTransform", lay.avatar),
    c("Image", { tint: rgb(0.3, 0.33, 0.38), preserveAspect: true, spriteUrl: "", cornerRadius: 100, placeholderRemoved: true }),
  ]);
  const name = s("Name", [
    c("RectTransform", lay.name),
    c("Text", { content: "Username", size: 16, color: white(), horizontalAlign: lay.nameAlign, verticalAlign: "Middle", autoSize: false }),
  ]);
  return wrap("User Profile", 260, 80, cascade, [avatar, name], [
    c("Image", { tint: rgb(0.13, 0.15, 0.18), preserveAspect: false, spriteUrl: "", cornerRadius: 14, placeholderRemoved: true }),
    c("UserProfile", { avatarPosition: "left" }),
  ]);
}

function buildDropdown(cascade: number): Slot {
  const trigger = rightControl("Trigger", 200, 32, [
    c("Image", { tint: rgb(0.14, 0.16, 0.20), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: rgb(0.14, 0.16, 0.20), highlightColor: rgb(0.22, 0.26, 0.32), pressColor: rgb(0.10, 0.12, 0.16), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("Dropdown", { options: "Low\nMedium\nHigh", initialIndex: 1, optionFillColor: rgb(0.14, 0.16, 0.20), optionLabelColor: white() }),
  ]);
  return wrap("Dropdown", 340, 36, cascade, [trigger, leftLabel("Quality", 212)]);
}

function buildColorPicker(cascade: number, buttonA?: Color): Slot {
  // Swatch (Image showing the current color + Button + ColorPicker marker). The
  // exporter wires a ButtonEditColorX onto this slot so clicking opens
  // Resonite's native color picker, writing the result back into the swatch
  // Image.Tint (and the exposed "📚 Value" colorX variable).
  // Default the swatch to the active theme's Button A color so a freshly added
  // picker matches the panel out of the box; the user can recolor it freely in
  // the Inspector (ColorPicker → Initial Color). Falls back to the dark theme's
  // Button A when no theme is threaded in (e.g. template/standalone callers).
  const initial = buttonA ?? rgb(0.18, 0.36, 0.6, 1);
  const swatch = rightControl("Swatch", 100, 28, [
    c("Image", { tint: initial, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: initial, highlightColor: initial, pressColor: initial, disabledColor: initial, hoverVibrate: false }),
    c("ColorPicker", { initialColor: initial, alpha: true, hdr: false }),
  ]);
  return wrap("Color Picker", 340, 36, cascade, [swatch, leftLabel("Color Picker", 112)]);
}

function buildTextField(cascade: number): Slot {
  const input = rightControl("Input", 280, 32, [
    c("Image", { tint: rgb(0.12, 0.12, 0.12), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("TextField", {
      placeholder: "", textContent: "Edit me", textAlign: "Center", fontSize: 16,
      textColor: rgb(0.9, 0.9, 0.9), placeholderColor: rgb(0.45, 0.45, 0.45),
      backgroundTint: rgb(0.12, 0.12, 0.12),
    }),
  ]);
  return wrap("Text Field", 400, 36, cascade, [input, leftLabel("Text", 292)]);
}

function buildReferenceField(cascade: number): Slot {
  const field = rightControl("Field", 280, 32, [
    c("ReferenceField", {
      fieldColor: rgb(0.024, 0.028, 0.036, 1),
      buttonColor: rgb(0.024, 0.028, 0.036, 1),
      textColor: rgb(0.88, 0.88, 0.88, 1),
    }),
  ]);
  return wrap("Reference Field", 400, 36, cascade, [field, leftLabel("Reference", 292)]);
}

// One radio option: a circular outer ring (Image + Button + Radio marker) with
// the selected dot child synthesized by the exporter, plus an inline label.
function radioOption(name: string, label: string, groupId: string, rightPx: number, widthPx: number, index: number, selected: boolean): Slot {
  const ring = s(name, [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
      offsetMin: { x: 0, y: -12 }, offsetMax: { x: 24, y: 12 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: rgb(0.18, 0.18, 0.18), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: rgb(0.18, 0.18, 0.18), highlightColor: rgb(0.30, 0.30, 0.30), pressColor: rgb(0.10, 0.10, 0.10), disabledColor: rgb(0.25, 0.25, 0.25), hoverVibrate: false }),
    c("Radio", { groupId, index, initiallySelected: selected, selectedColor: rgb(0.95, 0.95, 0.95) }),
  ]);
  const inner = s("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 30, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: label, size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  return s(`Radio ${name}`, [
    c("RectTransform", {
      anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: -(rightPx + widthPx), y: 0 }, offsetMax: { x: -rightPx, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
  ], [ring, inner]);
}

function buildRadio(cascade: number): Slot {
  // A single radio option still needs a RadioGroup marker (holds the shared
  // ValueField<int>) on its parent so it functions as a one-item group.
  return wrap("Radio", 220, 36, cascade, [
    leftLabel("Option", 40),
    radioOption("Option", "", "group1", 0, 24, 0, true),
  ], [c("RadioGroup", { groupId: "group1", initialIndex: 0 })]);
}

function buildRadioGroup(cascade: number): Slot {
  return wrap("Radio Group", 420, 36, cascade, [
    leftLabel("Mode", 252),
    radioOption("Auto", "Auto", "mode", 160, 90, 0, true),
    radioOption("On", "On", "mode", 80, 72, 1, false),
    radioOption("Off", "Off", "mode", 0, 72, 2, false),
  ], [c("RadioGroup", { groupId: "mode", initialIndex: 0 })]);
}

function buildSpinner(cascade: number): Slot {
  // A standalone loading indicator: a single square slot with an Image carrying
  // the useSpinnerIcon flag. The exporter (hasSpinner branch) replaces the
  // Image with an animated procedural OutlinedArc and appends a boolean
  // "📚 Value" slot that drives the arc's Enabled field — so the spinner can be
  // shown/hidden in-game without deactivating the slot (no layout reflow).
  // Mirrors the Loading Spinner in src/model/template.ts.
  return wrap("Loading Spinner", 64, 64, cascade, [], [
    c("Image", { tint: rgb(0.272, 0.567, 0.842), preserveAspect: true, spriteUrl: "", useSpinnerIcon: true }),
  ]);
}

function buildScrollArea(cascade: number): Slot {
  // A vertical scroll viewport with enough stacked text rows to overflow the
  // viewport so scrolling is meaningful. Each row carries a LayoutElement so the
  // exporter's auto-stacking VerticalLayout sizes them.
  const rows: Slot[] = [];
  for (let i = 0; i < 8; i++) {
    rows.push(s(`Item ${i + 1}`, [
      fillRT(),
      c("LayoutElement", { minWidth: -1, preferredWidth: -1, flexibleWidth: -1, minHeight: 32, preferredHeight: 32, flexibleHeight: -1, orderOffset: i }),
      c("Image", { tint: rgb(0.12, 0.12, 0.12), preserveAspect: false, spriteUrl: "", cornerRadius: 8 }),
    ], [
      s("Label", [
        fillRT(),
        c("Text", { content: `Item ${i + 1}`, size: 14, color: white(), horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]));
  }
  const viewport = s("Scroll Viewport", [
    fillRT(),
    c("ScrollArea", {
      direction: "Vertical",
      backgroundTint: rgb(0.10, 0.11, 0.14, 1),
      spacing: 8, padding: 8,
      showScrollbar: true,
      scrollbarTrackTint: rgb(0.15, 0.17, 0.21, 1),
      scrollbarThumbTint: rgb(0.55, 0.60, 0.68, 1),
    }),
  ], rows);
  return wrap("Scroll Area", 300, 200, cascade, [viewport]);
}

// A tabbed container: a Tab Bar (Horizontal/Vertical layout of TabButton slots)
// followed by N full-rect TabPage slots, exactly one visible at a time. Mirrors
// the structure the exporter lowers into shared-ValueField<int> + per-button
// ButtonValueSet<int> + per-page ValueEqualityDriver<int>→Active wiring. Index
// is positional (array order) for both buttons and pages, so reordering is a
// pure swap. The editor shows only the page at Tabs.activeTab (see the TabPage
// gate in the render layer); inactive pages overlap it but are hidden.
function buildTabs(cascade: number): Slot {
  const TAB_COUNT = 3;
  const barSize = 40;   // tab strip height
  const overlap = 8;    // content panel tucks under the bar this much → the
                        // active tab's rounded bottom hides behind the body
                        // (folder-tab connection, no gap/notch)
  const edge = 6;       // content inset from the frame edges (frame = thin border)
  const spacing = 3;
  const pad = 12;       // ≈ half the canvas margin — inner page padding
  // Active tab shares the content color so the selected tab MERGES into the
  // body; inactive tabs recede; the frame is the darker card behind everything.
  const contentColor  = rgb(0.16, 0.18, 0.23, 1);
  const inactiveColor = rgb(0.11, 0.12, 0.15, 1);
  const frameColor    = rgb(0.09, 0.10, 0.13, 1);
  const labelColor    = rgb(0.95, 0.95, 0.95, 1);

  // One tab button in the bar. Layout-sized (flexibleWidth/Height = 1 so tabs
  // share the bar evenly). Label in a child slot (one graphic per slot). The
  // active tab is tinted contentColor (matching the body); in-game the exporter
  // drives this tint by selection.
  const tabButton = (i: number, label: string, active: boolean): Slot =>
    s(`Tab ${i + 1}`, [
      fillRT(),
      c("Image", { tint: active ? contentColor : inactiveColor, preserveAspect: false, spriteUrl: "", cornerRadius: 8 }),
      c("Button", { normalColor: active ? contentColor : inactiveColor, highlightColor: rgb(0.22, 0.25, 0.32), pressColor: rgb(0.10, 0.11, 0.14), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
      c("TabButton", {}),
      c("LayoutElement", { minWidth: -1, minHeight: -1, preferredWidth: -1, preferredHeight: -1, flexibleWidth: 1, flexibleHeight: 1, orderOffset: i }),
    ], [
      s("Label", [
        fillRT(),
        c("Text", { content: label, size: 14, color: labelColor, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);

  // One page: the content panel. Sides/bottom inset by `edge` (frame shows as a
  // border); top extends UP into the bar by `overlap` so the active tab tucks
  // behind it. The page is a later sibling than the bar, so it draws over the
  // tab bottoms. Absolute container (TabPage marker, no layout) → full
  // side-by-side snap dragging inside. Ships a centered placeholder label.
  const page = (i: number, label: string): Slot =>
    s(`Page ${i + 1}`, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: edge, y: edge }, offsetMax: { x: -edge, y: -(barSize - overlap) },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: contentColor, preserveAspect: false, spriteUrl: "", cornerRadius: 8 }),
      c("TabPage", {}),
    ], [
      s("Label", [
        c("RectTransform", {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: pad, y: pad }, offsetMax: { x: -pad, y: -pad },
          pivot: { x: 0.5, y: 0.5 },
        }),
        c("Text", { content: `${label} content`, size: 16, color: labelColor, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);

  const bar = s("Tab Bar", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: -barSize }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("HorizontalLayout", {
      spacing, paddingTop: 5, paddingBottom: 0, paddingLeft: 6, paddingRight: 6,
      horizontalAlign: "Center", verticalAlign: "Top",
      forceExpandWidth: true, forceExpandHeight: true,
    }),
  ], Array.from({ length: TAB_COUNT }, (_, i) => tabButton(i, `Tab ${i + 1}`, i === 0)));

  const pages = Array.from({ length: TAB_COUNT }, (_, i) => page(i, `Tab ${i + 1}`));

  return wrap("Tabs", 380, 260, cascade, [bar, ...pages], [
    // Frame: the card the whole tabbed group sits on (drawn behind bar + pages).
    c("Image", { tint: frameColor, preserveAspect: false, spriteUrl: "", cornerRadius: 12 }),
    c("Tabs", {
      orientation: "Horizontal", activeTab: 0,
      tabBarSize: barSize, tabSpacing: spacing, pagePadding: pad,
      activeColor: contentColor, inactiveColor, pageColor: contentColor, frameColor, labelColor,
    }),
  ]);
}

// Build the editable content card for a popup dialog. Returns a center-anchored
// ABSOLUTE container slot (PopupContent marker, no layout component) holding a
// Title text, a Body text, and a Dismiss button — laid out to match the
// exporter's synthesized card (buildPopupModalSlot in exportBrson.ts) so a
// freshly-edited popup looks identical to the legacy one, but every piece is now
// a real draggable slot (full side-by-side support, like the Canvas root).
//
// The returned slot is meant to be appended as a direct child of the Canvas root
// and rendered as a centered overlay (see ensurePopupContent in store.ts and the
// popup overlay in renderSlot.tsx). The RectTransform here is the FINAL centered
// rect — callers don't reposition it.
export interface PopupContentOpts {
  title: string;
  body: string;
  dismissLabel: string;
  cardW: number;
  cardH: number;
  surface?: Color;
  headerColor?: Color;
  bodyColor?: Color;
  buttonColor?: Color;
}

export function buildPopupContent(opts: PopupContentOpts): Slot {
  const surface     = opts.surface     ?? rgb(0.12, 0.12, 0.12, 1);
  const headerColor = opts.headerColor ?? rgb(0.95, 0.95, 0.95, 1);
  const bodyColor   = opts.bodyColor   ?? rgb(0.82, 0.82, 0.82, 1);
  const buttonColor = opts.buttonColor ?? rgb(0.18, 0.36, 0.6, 1);
  const { cardW, cardH } = opts;

  // Band geometry mirrors buildPopupModalSlot's scaling so the default layout is
  // pixel-identical to the synthesized (legacy) modal at any card size.
  const padV       = Math.min(16, Math.round(cardH * 0.06));
  const padH       = Math.min(24, Math.round(cardW * 0.06));
  const gap        = Math.min(8,  Math.round(cardH * 0.04));
  const titleBandH = Math.min(40, Math.round(cardH * 0.16));
  const btnBandH   = Math.min(40, Math.round(cardH * 0.16));
  const btnHalfW   = Math.min(56, Math.round(cardW * 0.18));
  const titleSize  = Math.min(22, Math.max(13, Math.round(cardH * 0.085)));
  const bodySize   = Math.min(16, Math.max(11, Math.round(cardH * 0.065)));
  const okSize     = Math.min(16, Math.max(12, Math.round(cardH * 0.07)));

  const title = s("Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: padH, y: -(padV + titleBandH) }, offsetMax: { x: -padH, y: -padV },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: opts.title, size: titleSize, color: headerColor, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);

  const body = s("Body", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: padH, y: padV + btnBandH + gap * 2 }, offsetMax: { x: -padH, y: -(padV + titleBandH + gap) },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: opts.body, size: bodySize, color: bodyColor, horizontalAlign: "Left", verticalAlign: "Top", autoSize: false }),
  ]);

  // Dismiss button — bottom-center band. Button + Image on the slot, label text
  // in a child slot (one graphic per slot). PopupDismiss marks it so the
  // exporter wires its Active-toggle to close the modal.
  const dismiss = s("Dismiss", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0 }, anchorMax: { x: 0.5, y: 0 },
      offsetMin: { x: -btnHalfW, y: padV }, offsetMax: { x: btnHalfW, y: padV + btnBandH },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: buttonColor, preserveAspect: false, spriteUrl: "", cornerRadius: 8 }),
    btn(buttonColor),
    c("PopupDismiss", {}),
  ], [
    s("Label", [
      fillRT(),
      c("Text", { content: opts.dismissLabel, size: okSize, color: white(), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
    ]),
  ]);

  return s("Popup Dialog", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
      offsetMin: { x: -cardW / 2, y: -cardH / 2 }, offsetMax: { x: cardW / 2, y: cardH / 2 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: surface, preserveAspect: false, spriteUrl: "", cornerRadius: 16 }),
    c("PopupContent", {}),
  ], [title, body, dismiss]);
}

// A "Column": an invisible VerticalLayout group that stacks short elements in
// the dead space beside a TALL element (e.g. Color Picker + Reference stacked to
// the left of a full-height Image). Exports as a VerticalLayout nested inside the
// row's HorizontalLayout. Each child carries a LayoutElement (preferred height
// from its current rect) so the layout engine sizes + orders it; orderOffset is
// re-numbered by array order. Created/dissolved by the store's column actions.
export function buildColumn(children: Slot[], spacing = 8): Slot {
  const kids = children.map((ch, i) => {
    const rt = ch.components.find((c) => c.type === "RectTransform")?.props as
      | { offsetMin?: { y: number }; offsetMax?: { y: number } } | undefined;
    const h =
      rt?.offsetMin && rt?.offsetMax ? Math.abs(rt.offsetMax.y - rt.offsetMin.y) : 36;
    const hasLE = ch.components.some((c) => c.type === "LayoutElement");
    const components = hasLE
      ? ch.components.map((c) =>
          c.type === "LayoutElement"
            ? { ...c, props: { ...c.props, preferredHeight: h || 36, orderOffset: i } }
            : c,
        )
      : [
          ...ch.components,
          c("LayoutElement", {
            minWidth: -1, minHeight: h || 36, preferredWidth: -1,
            preferredHeight: h || 36, flexibleWidth: -1, flexibleHeight: -1,
            orderOffset: i,
          }),
        ];
    return { ...ch, components };
  });
  return s(
    "Column",
    [
      c("RectTransform", {
        anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
        offsetMin: { x: -100, y: -50 }, offsetMax: { x: 100, y: 50 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("VerticalLayout", {
        spacing, paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
        horizontalAlign: "Left", verticalAlign: "Top",
        forceExpandWidth: true, forceExpandHeight: false,
      }),
    ],
    kids,
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

const BUILDERS: Partial<Record<PaletteItem, (cascade: number) => Slot>> = {
  Checkbox: buildCheckbox,
  Toggle: buildToggle,
  Slider: buildSlider,
  ProgressBar: buildProgressBar,
  Dropdown: buildDropdown,
  ColorPicker: buildColorPicker,
  TextField: buildTextField,
  ReferenceField: buildReferenceField,
  Radio: buildRadio,
  RadioGroup: buildRadioGroup,
  ScrollArea: buildScrollArea,
  Tabs: buildTabs,
  Waveform: buildWaveform,
  UserProfile: buildUserProfile,
  // Widget-only pseudo-type (not a UixComponent) — see palette.ts WIDGET_ONLY_ITEMS.
  Spinner: buildSpinner,
};

/** True for composite control types that should be added as a full widget
 *  subtree (matching the Experimental Panel) rather than a bare component. */
export function isWidgetType(type: PaletteItem): boolean {
  return type in BUILDERS;
}

/** Build a standalone widget subtree for `type`, or null if `type` is a simple
 *  single-component element. `cascade` is the sibling count, used to offset
 *  repeated adds so they don't stack exactly. */
export function buildWidget(
  type: PaletteItem,
  cascade: number,
  buttonA?: Color,
): Slot | null {
  // Color Picker takes the active theme's Button A so its swatch defaults
  // in-theme; every other widget is theme-agnostic at build time.
  if (type === "ColorPicker") return buildColorPicker(cascade, buttonA);
  const fn = BUILDERS[type];
  return fn ? fn(cascade) : null;
}
