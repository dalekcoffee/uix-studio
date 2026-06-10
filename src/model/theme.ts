// Document-level theming. Stores a set of global color/size values plus a
// preset name; "Apply" actions walk the slot tree and push those values onto
// matching slots by name. Per-element values still win after apply — the
// theme is a bulk operation, not a live binding.
import type { Slot, UixComponent } from "./types";
import { imageHasSprite } from "./imageSprite";

export type Color = { r: number; g: number; b: number; a: number };

export type ThemePresetId =
  | "light"
  | "dark"
  | "sakura"
  | "tech"
  | "coffee"
  | "frosted"
  | "custom";

export interface Theme {
  preset: ThemePresetId;
  background: Color;
  headerTextColor: Color;
  headerTextSize: number;
  bodyTextColor: Color;
  bodyTextSize: number;
  accent: Color;
  // "Field" / "control surface" color. Background of slider tracks, text-field
  // inputs, checkbox boxes, toggle pills (off state), progress bar tracks,
  // dropdown triggers, and radio dots. Distinct from the panel background so
  // these controls visually pop against the panel, even when the panel itself
  // is dark or light. Tinted darker than `background` on dark themes, lighter
  // on light themes.
  controlSurface: Color;
  // "Container surface" — the RAISED panel tier that holds other controls:
  // a Tabs group's content page + active tab, and a ScrollArea's background.
  // Distinct from both the panel background and `controlSurface`: the controls
  // INSIDE a container keep riding controlSurface so they read as recessed wells
  // against this raised surface. The inactive tabs + tab frame are derived from
  // this by darkening (recede), so one token drives the whole tabbed/scroll look.
  containerSurface: Color;
  buttonA: Color;
  buttonB: Color;
  cornerRadius: number; // 0-100 bulk corner radius; applied to shape Images only via the explicit Apply Corner Radius action
  // Branding fields — edited via the Branding menu, applied to the Canvas
  // component's matching props.
  backLogoUrl: string;
  backLogoReason: string;
  // SHA-256 of a user-uploaded image stored in IndexedDB. Empty = use the
  // bundled UIX Studio logo on the back of the panel. The Canvas component
  // already has `backLogoCustomHash` — this field is the theme's mirror and
  // the apply pushes it onto the Canvas.
  backLogoImageHash: string;
}

function rgb(r: number, g: number, b: number, a = 1): Color {
  return { r, g, b, a };
}

// ── Presets ────────────────────────────────────────────────────────────────
// Dark mirrors the experimental template's authored values so the default
// document opens "in theme" — no apply needed on a fresh project.
export const PRESETS: Record<Exclude<ThemePresetId, "custom">, Omit<Theme, "preset">> = {
  dark: {
    background: rgb(0.05, 0.05, 0.05),
    headerTextColor: rgb(0.9, 0.9, 0.9),
    headerTextSize: 18,
    bodyTextColor: rgb(0.72, 0.72, 0.76),
    bodyTextSize: 13,
    accent: rgb(0.18, 0.36, 0.6),
    // controlSurface + buttonB both at #060607 (= 6/255, 6/255, 7/255 sRGB).
    // Picked to match the rendered "near-black" Resonite reads from
    // Button B's storage representation. Drives all input control pills
    // (Dropdown, Reference Field, Slider tracks, TextField, ScrollArea bg,
    // Toggle off-state, Radio outer ring, etc.) and the Button B fill.
    controlSurface: rgb(0.0235, 0.0235, 0.0275),
    // Raised tab/scroll surface — the experimental template's authored tab page.
    containerSurface: rgb(0.16, 0.18, 0.23),
    buttonA: rgb(0.18, 0.36, 0.6),
    buttonB: rgb(0.0235, 0.0235, 0.0275),
    cornerRadius: 100,
    backLogoUrl: "https://uix.dalek.coffee",
    backLogoReason: "Check out the tool! :D",
    backLogoImageHash: "",
  },
  light: {
    background: rgb(0.95, 0.95, 0.95),
    headerTextColor: rgb(0.1, 0.1, 0.1),
    headerTextSize: 18,
    bodyTextColor: rgb(0.25, 0.25, 0.30),
    bodyTextSize: 13,
    accent: rgb(0.15, 0.40, 0.85),
    controlSurface: rgb(0.85, 0.86, 0.88),
    // White card raised above the light-grey panel; controls (0.85) recess into it.
    containerSurface: rgb(1.0, 1.0, 1.0),
    buttonA: rgb(0.15, 0.40, 0.85),
    buttonB: rgb(0.82, 0.82, 0.82),
    cornerRadius: 100,
    backLogoUrl: "https://uix.dalek.coffee",
    backLogoReason: "Check out the tool! :D",
    backLogoImageHash: "",
  },
  sakura: {
    background: rgb(0.99, 0.92, 0.94),
    headerTextColor: rgb(0.30, 0.14, 0.22),
    headerTextSize: 18,
    bodyTextColor: rgb(0.46, 0.26, 0.36),
    bodyTextSize: 13,
    accent: rgb(0.91, 0.54, 0.66),
    controlSurface: rgb(0.94, 0.80, 0.84),
    containerSurface: rgb(0.98, 0.90, 0.92),
    buttonA: rgb(0.85, 0.42, 0.54),
    buttonB: rgb(0.96, 0.83, 0.85),
    cornerRadius: 100,
    backLogoUrl: "https://uix.dalek.coffee",
    backLogoReason: "Check out the tool! :D",
    backLogoImageHash: "",
  },
  tech: {
    background: rgb(0.04, 0.05, 0.10),
    headerTextColor: rgb(0.0, 1.0, 0.62),
    headerTextSize: 18,
    bodyTextColor: rgb(0.66, 0.91, 0.82),
    bodyTextSize: 13,
    accent: rgb(0.0, 0.85, 1.0),
    controlSurface: rgb(0.08, 0.12, 0.20),
    containerSurface: rgb(0.10, 0.14, 0.24),
    buttonA: rgb(0.0, 0.62, 0.85),
    buttonB: rgb(0.10, 0.13, 0.19),
    cornerRadius: 100,
    backLogoUrl: "https://uix.dalek.coffee",
    backLogoReason: "Check out the tool! :D",
    backLogoImageHash: "",
  },
  coffee: {
    // Espresso panel + cream/latte text + mocha controls. The old palette
    // leaned into roast-orange (caramel highlights, burnt-orange accent)
    // which read more "autumn" than "coffee". This version trades those
    // for desaturated medium-roast browns so the theme reads as coffee +
    // cream rather than a pumpkin-spice latte.
    background: rgb(0.14, 0.10, 0.08),
    headerTextColor: rgb(0.96, 0.91, 0.83),
    headerTextSize: 18,
    bodyTextColor: rgb(0.80, 0.71, 0.58),
    bodyTextSize: 13,
    accent: rgb(0.60, 0.46, 0.34),
    controlSurface: rgb(0.20, 0.15, 0.12),
    containerSurface: rgb(0.24, 0.18, 0.14),
    buttonA: rgb(0.50, 0.36, 0.26),
    buttonB: rgb(0.27, 0.20, 0.15),
    cornerRadius: 100,
    backLogoUrl: "https://uix.dalek.coffee",
    backLogoReason: "Check out the tool! :D",
    backLogoImageHash: "",
  },
  // Frosted Glass — translucent panel that reads like a glass overlay.
  // Drops the background alpha so the panel becomes see-through; light cool
  // text reads on top. Pairs especially nicely with VR backdrops where you
  // want the world peeking through the UI.
  frosted: {
    background: rgb(0.85, 0.88, 0.95, 0.30),
    // Translucent light panel needs dark text to stay readable — white text
    // on the pale background reads as a low-contrast smear regardless of the
    // viewing backdrop behind the panel in Resonite.
    headerTextColor: rgb(0.0, 0.0, 0.0),
    headerTextSize: 18,
    bodyTextColor: rgb(0.1, 0.1, 0.15),
    bodyTextSize: 13,
    accent: rgb(0.62, 0.78, 1.0),
    controlSurface: rgb(1.0, 1.0, 1.0, 0.22),
    // Slightly more opaque translucent white so the tab/scroll area reads as a
    // raised glass panel over the see-through background.
    containerSurface: rgb(1.0, 1.0, 1.0, 0.28),
    buttonA: rgb(0.34, 0.58, 0.94, 0.85),
    buttonB: rgb(1.0, 1.0, 1.0, 0.18),
    cornerRadius: 100,
    backLogoUrl: "https://uix.dalek.coffee",
    backLogoReason: "Check out the tool! :D",
    backLogoImageHash: "",
  },
};

export function defaultTheme(): Theme {
  return { preset: "dark", ...PRESETS.dark };
}

export function applyPreset(preset: ThemePresetId, existing: Theme): Theme {
  if (preset === "custom") return { ...existing, preset: "custom" };
  return { preset, ...PRESETS[preset] };
}

// Round-trip helper: merges a partially-parsed theme into a full Theme by
// filling missing fields from the dark preset. Tolerates older save files
// that predate the theme system entirely.
export function normalizeTheme(raw: unknown): Theme {
  const base = defaultTheme();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Theme>;
  return {
    preset: (typeof r.preset === "string" ? r.preset : "dark") as ThemePresetId,
    background: r.background ?? base.background,
    headerTextColor: r.headerTextColor ?? base.headerTextColor,
    headerTextSize: typeof r.headerTextSize === "number" ? r.headerTextSize : base.headerTextSize,
    bodyTextColor: r.bodyTextColor ?? base.bodyTextColor,
    bodyTextSize: typeof r.bodyTextSize === "number" ? r.bodyTextSize : base.bodyTextSize,
    accent: r.accent ?? base.accent,
    controlSurface: r.controlSurface ?? base.controlSurface,
    containerSurface: r.containerSurface ?? base.containerSurface,
    buttonA: r.buttonA ?? base.buttonA,
    buttonB: r.buttonB ?? base.buttonB,
    cornerRadius: typeof r.cornerRadius === "number" ? r.cornerRadius : base.cornerRadius,
    backLogoUrl: typeof r.backLogoUrl === "string" ? r.backLogoUrl : base.backLogoUrl,
    backLogoReason: typeof r.backLogoReason === "string" ? r.backLogoReason : base.backLogoReason,
    backLogoImageHash: typeof r.backLogoImageHash === "string" ? r.backLogoImageHash : base.backLogoImageHash,
  };
}

// ── Apply: walk the slot tree, push theme values onto matching slots ─────
// Match strategy is by slot name. Conventional names from the experimental
// template — users who keep slot names get full theme support; renamed
// slots are simply skipped.

function lighten(c: Color, amount: number): Color {
  return {
    r: Math.max(0, Math.min(1, c.r + amount)),
    g: Math.max(0, Math.min(1, c.g + amount)),
    b: Math.max(0, Math.min(1, c.b + amount)),
    a: c.a,
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type SlotPredicate = (slot: Slot, parent: Slot | null) => boolean;
type SlotMutator = (slot: Slot, parent: Slot | null) => void;

function walk(
  root: Slot,
  match: SlotPredicate,
  mutate: SlotMutator,
  parent: Slot | null = null,
): void {
  if (match(root, parent)) mutate(root, parent);
  for (const c of root.children) walk(c, match, mutate, root);
}

function setComponentProp(
  slot: Slot,
  type: UixComponent["type"],
  key: string,
  value: unknown,
): void {
  const c = slot.components.find((cc) => cc.type === type);
  if (!c) return;
  (c.props as Record<string, unknown>)[key] = value;
}

function nameEquals(slot: Slot, name: string): boolean {
  return slot.name.trim().toLowerCase() === name.toLowerCase();
}

// Theme opt-out: a component flagged `themeLock` is skipped by every apply
// function, so its authored color survives a theme switch. Used to pin the
// white card surfaces + dark on-card text in the login presets, and to keep
// white glyphs legible on accent chips. See components.ts (Image/Text/TextField
// schemas carry the optional flag).
function isLocked(comp: UixComponent | undefined): boolean {
  return !!comp && (comp.props as { themeLock?: unknown }).themeLock === true;
}

// Component types that signal an interactive control-surface slot (slider
// track, progress bar, text input, dropdown trigger, toggle pill, radio dot,
// reference drop target). Extracted to module scope so both applyControlSurface
// and isSectionPillSlot can reference the same set. NOTE: ScrollArea is NOT
// here — a scroll area is a CONTAINER (it holds other controls), so its
// background rides `containerSurface` (see applyContainerSurface), not the
// control-field surface, which the controls inside it use.
const CONTROL_FIELD_TYPES = new Set([
  "Slider", "ProgressBar", "TextField", "Dropdown",
  "Toggle", "Radio", "ReferenceField",
]);

// Returns true for "section pill" slots: a shaped Image (cornerRadius > 0,
// no sprite/icon) and a Text component on the *same* slot, with no interactive
// components (no Button, no field-control marker). These chips are purely
// decorative section dividers and score/label bands — they should ride
// controlSurface (Image) and bodyTextColor (Text) on any theme. Slots named
// "Title" are excluded because applyHeaderText already owns them.
function isSectionPillSlot(s: Slot): boolean {
  const img = s.components.find((c) => c.type === "Image");
  if (!img) return false;
  const p = img.props as Record<string, unknown>;
  const hasSprite = imageHasSprite(p);
  const isShape = typeof p.cornerRadius === "number" && (p.cornerRadius as number) > 0;
  if (!isShape || hasSprite) return false;
  // The label may sit on the pill slot itself (legacy) or on a dedicated child
  // "Label" slot (current presets — Resonite renders one Graphic per slot, so the
  // text is nested above the Image rather than co-located). Accept either.
  const hasLabelText =
    s.components.some((c) => c.type === "Text") ||
    s.children.some(
      (ch) =>
        ch.name.trim().toLowerCase() === "label" &&
        ch.components.some((c) => c.type === "Text"),
    );
  if (!hasLabelText) return false;
  if (s.components.some((c) => c.type === "Button")) return false;
  if (s.components.some((c) => CONTROL_FIELD_TYPES.has(c.type))) return false;
  if (s.name.trim().toLowerCase() === "title") return false;
  return true;
}

// ── Per-property apply functions ──────────────────────────────────────────
// Each takes a cloned root and returns it mutated. The store wraps these
// in commit() so they're undoable as a single step.

export function applyBackground(root: Slot, color: Color): Slot {
  const r = clone(root);
  walk(r, (s) => {
    // "Background"/"Back Cover"/"Front Backing" are the experimental panel's
    // backdrop slots; "Card"/"Dialog"/"Body" are the equivalent panel-fill slots
    // used by the card, dialog, and profile presets. All are the outermost
    // colored surface, so they all ride the theme background.
    return nameEquals(s, "Background")
        || nameEquals(s, "Back Cover")
        || nameEquals(s, "Front Backing")
        || nameEquals(s, "Card")
        || nameEquals(s, "Dialog")
        || nameEquals(s, "Body");
  }, (s) => {
    // "Background menu wins": a face the user set via the Background menu is
    // marked `backgroundKind` on its Image — leave it alone so a theme switch
    // doesn't repaint a deliberate custom background. A `themeLock` face (the
    // white login-card surfaces) is likewise pinned. Untouched faces ride the
    // theme.
    const img = s.components.find((c) => c.type === "Image");
    if ((img?.props as { backgroundKind?: unknown } | undefined)?.backgroundKind) return;
    if (isLocked(img)) return;
    setComponentProp(s, "Image", "tint", color);
  });
  // Canvas backgroundColor — mirrored on the Canvas component too. Find
  // any slot that carries a Canvas component (typically the root).
  walk(r, (s) => s.components.some((c) => c.type === "Canvas"), (s) => {
    setComponentProp(s, "Canvas", "backgroundColor", color);
  });
  return r;
}

export function applyHeaderText(root: Slot, color: Color, size: number): Slot {
  const r = clone(root);
  walk(r, (s) => nameEquals(s, "Title"), (s) => {
    if (isLocked(s.components.find((c) => c.type === "Text"))) return;
    setComponentProp(s, "Text", "color", color);
    setComponentProp(s, "Text", "size", size);
  });
  return r;
}

export function applyBodyText(root: Slot, color: Color, size: number): Slot {
  const r = clone(root);
  // EVERY Text element rides the body text color so no caption is ever left at a
  // hardcoded shade that fights the theme — field values, section headings,
  // usernames, footers, button captions, keypad digits, etc. Two exceptions:
  //   - slots named "Title" (applyHeaderText owns those), and
  //   - `themeLock` Text (white login-card captions kept dark/readable; white
  //     glyphs kept legible on accent chips).
  // Size only flows into "Body Text" slots — labels/captions keep their authored
  // size so a theme switch never resizes a carefully-tuned layout.
  walk(r, () => true, (s, parent) => {
    const txt = s.components.find((c) => c.type === "Text");
    if (!txt || isLocked(txt) || nameEquals(s, "Title")) return;
    // The popup Dismiss button's label rides a button-contrast color (white, set
    // by applyButtonA) — never body text, or it'd vanish on the colored pill.
    if (parent && parent.components.some((c) => c.type === "PopupDismiss")) return;
    (txt.props as Record<string, unknown>).color = color;
    if (nameEquals(s, "Body Text")) (txt.props as Record<string, unknown>).size = size;
  });
  // Keypad backspace icon — tint matches body text so it stays consistent
  // with the digit/letter text on the same row of key tiles.
  walk(r, (s) => {
    const img = s.components.find((c) => c.type === "Image");
    return !!(img && (img.props as Record<string, unknown>).useBackspaceIcon) && !isLocked(img);
  }, (s) => {
    setComponentProp(s, "Image", "tint", color);
  });
  // Component-internal text knobs: a control's displayed value lives on its own
  // color prop rather than a sibling Text. Tie each to body text (skipping
  // locked controls) so the chosen item / typed text / dropped-object name stay
  // readable against the field surface across themes.
  walk(r, () => true, (s) => {
    const dd = s.components.find((c) => c.type === "Dropdown");
    if (dd && !isLocked(dd)) (dd.props as Record<string, unknown>).optionLabelColor = color;
    const rf = s.components.find((c) => c.type === "ReferenceField");
    if (rf && !isLocked(rf)) (rf.props as Record<string, unknown>).textColor = color;
    const tf = s.components.find((c) => c.type === "TextField");
    if (tf && !isLocked(tf)) {
      (tf.props as Record<string, unknown>).textColor = color;
      (tf.props as Record<string, unknown>).placeholderColor = { ...color, a: +(color.a * 0.55).toFixed(2) };
    }
  });
  return r;
}

export function applyAccent(root: Slot, color: Color): Slot {
  const r = clone(root);
  walk(r, () => true, (s) => {
    setComponentProp(s, "Slider", "fillColor", color);
    setComponentProp(s, "ProgressBar", "fillColor", color);
    setComponentProp(s, "Toggle", "onColor", color);
    setComponentProp(s, "Radio", "selectedColor", color);
    const spinnerImg = s.components.find(
      (c) => c.type === "Image" && (c.props as Record<string, unknown>).useSpinnerIcon,
    );
    if (spinnerImg) (spinnerImg.props as Record<string, unknown>).tint = color;
  });
  // Decorative "brand pop" surfaces — title/header accent bars, header stripes,
  // the small icon chips that prefix form fields, and logo badges. These are the
  // panel's accent-colored fills (originally hardcoded brand-blue in the form /
  // ID-card presets); tying their Image tint to the theme accent lets them
  // re-skin instead of stubbornly staying blue. Matched by name so user-kept
  // slots theme; the glyph/letter sits on a child slot (kept white) so it reads
  // on the accent. Runs before applyControlSurface, which doesn't claim these
  // names.
  const ACCENT_SURFACE_NAMES = new Set([
    "accent", "accent bar", "title bar", "field icon", "logo",
    "header stripe", "header subtitle",
  ]);
  walk(r, (s) => ACCENT_SURFACE_NAMES.has(s.name.trim().toLowerCase()), (s) => {
    if (isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "Image", "tint", color);
  });
  // Title chips: a slot named "Title" that also carries an Image (a brand-tinted
  // pill behind the title caption, as in the ID-card / installer presets). The
  // caption rides header text (applyHeaderText); its backing chip rides the
  // accent so the pair re-skins together. A plain text-only "Title" has no Image
  // and is unaffected.
  walk(r, (s) => nameEquals(s, "Title") && s.components.some((c) => c.type === "Image"), (s) => {
    if (isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "Image", "tint", color);
  });
  return r;
}

// Push the control-surface color onto every interactive control's "field"
// background — slider tracks, progress bar tracks, text-field inputs,
// dropdown triggers, toggle pills (off state), radio dots' outer ring, and
// the checkbox's Box wrapper. These are the slots that author the slight
// dark fill that makes a control "read" as an input area against the panel.
//
// Match strategy is component-marker-based (works on user-renamed slots)
// plus a name-based fallback for the checkbox Box (whose marker lives on
// the Check Icon child, not the slot with the visible background).
export function applyControlSurface(root: Slot, color: Color): Slot {
  const r = clone(root);
  // Image-placeholder detection mirrors the rule in src/editor/render/renderSlot.tsx
  // and src/model/warnings.ts: an Image slot with no sprite/icon/rounded
  // shape, no children, and no companion Button/Text. Those slots are
  // "drop your image here" placeholders that should track the controls bg.
  function isImagePlaceholderSlot(s: Slot): boolean {
    // Structural chrome (header stripes, backdrop bands) is never a "drop your
    // image here" placeholder — it's an intentional solid fill that other apply
    // passes (accent / background) own. Without this guard a structural fill with
    // no corner radius / children reads as an empty placeholder and gets
    // overridden to the control surface, clobbering its accent tint.
    if (s.structural) return false;
    const img = s.components.find((c) => c.type === "Image");
    if (!img) return false;
    const p = img.props as Record<string, unknown>;
    const hasSprite = imageHasSprite(p);
    const isShape = typeof p.cornerRadius === "number" && (p.cornerRadius as number) > 0;
    if (hasSprite || isShape) return false;
    if (s.children.length > 0) return false;
    if (s.components.some((c) => c.type === "Button")) return false;
    if (s.components.some((c) => c.type === "Text")) return false;
    if (s.components.some((c) => c.type === "TextField")) return false;
    return true;
  }
  walk(r, () => true, (s) => {
    const isField = s.components.some((c) => CONTROL_FIELD_TYPES.has(c.type));
    const isCheckboxBox =
      s.name.trim().toLowerCase() === "box" &&
      s.children.some((c) => c.components.some((cc) => cc.type === "Checkbox"));
    // The Header bar uses a rounded fill that's a tier brighter than the
    // panel background — same role as the controls bg, so we tie them.
    const isHeader = s.name.trim().toLowerCase() === "header";
    const isPlaceholder = isImagePlaceholderSlot(s);
    // Section pills: shaped Image + Text chips that act as section dividers
    // or score readout bands. No interactive components — purely decorative.
    const isPill = isSectionPillSlot(s);
    // Keypad digit display — the rounded dark rect at the top of the numpad
    // that shows the currently typed value. Rides controlSurface like any
    // other input field background.
    const isDisplay = nameEquals(s, "Display");
    // Picture-placeholder bands — avatar tiles, profile banners, and the
    // stylized-login art panel. They host an uploaded image but, until the user
    // supplies one, their fill should read as a themed drop surface rather than
    // a stuck brand color. Matched by name (these carry a rounded/full Image
    // that isImagePlaceholderSlot excludes because it's a shape or has a sprite).
    const PICTURE_BAND_NAMES = new Set(["avatar", "banner", "image panel"]);
    const isPictureBand = PICTURE_BAND_NAMES.has(s.name.trim().toLowerCase());
    // "Board" panels — the framed sub-surfaces of a poster/showcase layout (e.g.
    // the Showcase preset's "Left Board" / "Right Board"). They're a raised panel
    // tier, the same role as the header bar, so they ride controlSurface and
    // re-skin instead of staying a hardcoded dark fill on a light theme.
    const isBoard = s.name.trim().toLowerCase().endsWith(" board");
    // The editable popup dialog card (a PopupContent slot floating as a centered
    // overlay) rides controlSurface — matching how both the exporter's synthesized
    // modal (buildPopupModalSlot, themeSurface = controlSurface) and the editable
    // card builder (buildPopupContent, surface: theme.controlSurface) author it.
    // Without this, a theme switch re-skins the popup's text but leaves the card
    // stuck on whatever surface it was built under.
    const isPopupCard = s.components.some((c) => c.type === "PopupContent");
    if (!isField && !isCheckboxBox && !isHeader && !isPlaceholder && !isPill && !isDisplay && !isPictureBand && !isBoard && !isPopupCard) return;
    // `themeLock` pins the white login-input fields — leave their surface alone.
    if (isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "Image", "tint", color);
    if (isLocked(s.components.find((c) => c.type === "TextField"))) return;
    setComponentProp(s, "TextField", "backgroundTint", color);
    setComponentProp(s, "Toggle", "offColor", color);
    // Reference Field has three color knobs of its own — fieldColor drives
    // the central drop-target pill, buttonColor drives the Inspector +
    // Clear sub-buttons. Both ride the controls surface so the widget
    // matches Sliders/TextFields/etc. textColor stays on bodyTextColor
    // (handled by applyBodyText).
    setComponentProp(s, "ReferenceField", "fieldColor",  color);
    setComponentProp(s, "ReferenceField", "buttonColor", color);
    // Radio dots that also carry a Button: keep Button state colors in sync
    // with the Image tint so hover/press feedback reads correctly on any theme.
    if (isField && s.components.some((c) => c.type === "Radio") && s.components.some((c) => c.type === "Button")) {
      const highlight = lighten(color, 0.12);
      const press = lighten(color, -0.12);
      const disabled = { r: 0.3, g: 0.3, b: 0.3, a: color.a };
      setComponentProp(s, "Button", "normalColor", color);
      setComponentProp(s, "Button", "highlightColor", highlight);
      setComponentProp(s, "Button", "pressColor", press);
      setComponentProp(s, "Button", "disabledColor", disabled);
    }
  });
  // Dropdown popup option bg — the exporter builds the option buttons using
  // this color, so the spawn-window menu (Low/Medium/High) reads as the same
  // surface tier as every other control.
  walk(r, () => true, (s) => {
    setComponentProp(s, "Dropdown", "optionFillColor", color);
  });
  return r;
}

// Push the "container surface" onto the raised panel tiers that HOLD other
// controls: a Tabs group's content page + active tab, and a ScrollArea's
// background. The inactive tabs + tab frame are derived by darkening (recede),
// so one theme token drives the whole tabbed/scroll look coherently. Controls
// nested inside keep riding controlSurface (recessed wells against this raised
// surface). Matched by component marker so user-renamed slots still theme.
export function applyContainerSurface(root: Slot, color: Color): Slot {
  const r = clone(root);
  const inactive = lighten(color, -0.045); // recessed (unselected) tab
  const frame = lighten(color, -0.09);     // the card the whole group sits on
  // Tabs hosts: re-color the frame Image, every page Image, each tab button (by
  // selection), and the Tabs component's own color props (so applyActiveTab /
  // re-render stay consistent).
  walk(r, (s) => s.components.some((c) => c.type === "Tabs"), (host) => {
    if (isLocked(host.components.find((c) => c.type === "Image"))) return;
    const tabs = host.components.find((c) => c.type === "Tabs")!;
    const tp = tabs.props as Record<string, unknown>;
    // Segmented style (frameless pill selector, background-less pages) DEPENDS
    // on frame/page/inactive staying transparent — only the active pill takes
    // the container surface. Writing the opaque folder-style tones here would
    // permanently turn the pills into a folder card (theme apply is a bulk
    // write, not a live binding — undo is the only way back).
    const segmented = ((tp.tabStyle as string) ?? "folder") === "segmented";
    const transparent = rgb(0, 0, 0, 0);
    tp.pageColor = segmented ? transparent : color;
    tp.activeColor = color;
    tp.inactiveColor = segmented ? transparent : inactive;
    tp.frameColor = segmented ? transparent : frame;
    if (!segmented) {
      setComponentProp(host, "Image", "tint", frame);
      for (const pg of host.children.filter((ch) => ch.components.some((c) => c.type === "TabPage"))) {
        setComponentProp(pg, "Image", "tint", color);
      }
    }
    const bar = host.children.find((ch) => ch.children.some((g) => g.components.some((c) => c.type === "TabButton")));
    if (bar) {
      const buttons = bar.children.filter((g) => g.components.some((c) => c.type === "TabButton"));
      const activeIdx = Math.max(0, Math.min(buttons.length - 1, ((tp.activeTab as number) ?? 0) | 0));
      buttons.forEach((b, i) => {
        const tint = i === activeIdx ? color : (segmented ? transparent : inactive);
        setComponentProp(b, "Image", "tint", tint);
        setComponentProp(b, "Button", "normalColor", tint);
        // Hover/press derive from the SURFACE color, not the resting tint — on a
        // segmented inactive (transparent) pill this makes hover reveal a faint
        // pill instead of staying invisible (lighten() preserves alpha 0).
        const feedbackBase = segmented ? color : tint;
        setComponentProp(b, "Button", "highlightColor", lighten(feedbackBase, 0.10));
        setComponentProp(b, "Button", "pressColor", lighten(feedbackBase, -0.08));
      });
    }
  });
  // ScrollArea backgrounds — the host-slot Image is painted with backgroundTint
  // at export time and the preview reads the same prop; keep both in sync.
  walk(r, (s) => s.components.some((c) => c.type === "ScrollArea"), (s) => {
    if (isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "ScrollArea", "backgroundTint", color);
    setComponentProp(s, "Image", "tint", color);
  });
  return r;
}

function applyButtonColors(root: Slot, names: string[], color: Color): Slot {
  const r = clone(root);
  const highlight = lighten(color, 0.12);
  const press = lighten(color, -0.12);
  const disabled = { r: 0.3, g: 0.3, b: 0.3, a: color.a };
  const lower = names.map((n) => n.toLowerCase());
  walk(r, (s) => lower.includes(s.name.trim().toLowerCase()), (s) => {
    if (isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "Image", "tint", color);
    setComponentProp(s, "Button", "normalColor", color);
    setComponentProp(s, "Button", "highlightColor", highlight);
    setComponentProp(s, "Button", "pressColor", press);
    setComponentProp(s, "Button", "disabledColor", disabled);
  });
  return r;
}

export function applyButtonA(root: Slot, color: Color): Slot {
  // "Login Button" is the form presets' primary call-to-action and "Install" is
  // the installer's — same role as the experimental panel's "Button A"/"Enter",
  // so they ride the primary button color rather than staying hardcoded.
  // "Open Dialog" is the Showcase preset's popup trigger — a primary action too.
  const r = applyButtonColors(root, ["Button A", "Enter", "Login Button", "Install", "Open Dialog"], color);
  // A Color Picker's swatch defaults to the primary button color (see
  // widgets.buildColorPicker). Tie its initial color + swatch Image/Button to
  // buttonA so a freshly-defaulted picker re-skins with the theme instead of
  // staying a hardcoded brand color; a user-set `themeLock` pins it.
  const highlight = lighten(color, 0.12);
  const press = lighten(color, -0.12);
  const disabled = { r: 0.3, g: 0.3, b: 0.3, a: color.a };
  // The editable popup dialog's Dismiss button is the modal's primary action —
  // same role as the synthesized modal's OK button (themeButtonA). Theme its
  // Image + Button states to buttonA, and pin its label white so it stays legible
  // on the colored pill (applyBodyText would otherwise drag it to body text).
  walk(r, (s) => s.components.some((c) => c.type === "PopupDismiss"), (s) => {
    if (isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "Image", "tint", color);
    setComponentProp(s, "Button", "normalColor", color);
    setComponentProp(s, "Button", "highlightColor", highlight);
    setComponentProp(s, "Button", "pressColor", press);
    setComponentProp(s, "Button", "disabledColor", disabled);
    const label = s.children.find((ch) => nameEquals(ch, "Label"));
    if (label && !isLocked(label.components.find((c) => c.type === "Text"))) {
      setComponentProp(label, "Text", "color", { r: 1, g: 1, b: 1, a: 1 });
    }
  });
  walk(r, (s) => s.components.some((c) => c.type === "ColorPicker"), (s) => {
    const cp = s.components.find((c) => c.type === "ColorPicker");
    if (isLocked(cp) || isLocked(s.components.find((c) => c.type === "Image"))) return;
    setComponentProp(s, "ColorPicker", "initialColor", color);
    setComponentProp(s, "Image", "tint", color);
    setComponentProp(s, "Button", "normalColor", color);
    setComponentProp(s, "Button", "highlightColor", highlight);
    setComponentProp(s, "Button", "pressColor", press);
    setComponentProp(s, "Button", "disabledColor", color);
  });
  return r;
}

// Button B drives two things, by STRUCTURE rather than slot name (so a renamed
// or user-created icon button still themes correctly):
//   1. Any slot literally named "Button B" (the body secondary-action button).
//   2. Any icon button — a slot with a Button whose DIRECT CHILD carries a Help
//      or Close system icon (the background-shape-on-parent + icon-on-child
//      pattern). These read as secondary tool buttons on the header bar.
// A logo-icon child instead gets a fully transparent background — a logo should
// never sit inside a themed pill. Component-internal icons are deliberately not
// matched: the Checkmark lives on its own Image driven by Checkbox (rides
// controlSurface), the Spinner has no background, and child-icon detection only
// looks for Help/Close/Logo so Checkmark/Backspace/Spinner can never trigger it.
export function applyButtonB(root: Slot, color: Color): Slot {
  const r = clone(root);
  const highlight = lighten(color, 0.12);
  const press = lighten(color, -0.12);
  const disabled = { r: 0.3, g: 0.3, b: 0.3, a: color.a };
  const transparent = { r: 0, g: 0, b: 0, a: 0 };
  const childIconFlag = (s: Slot): "useLogoSprite" | "useHelpIcon" | "useCloseIcon" | null => {
    for (const c of s.children) {
      const img = c.components.find((cc) => cc.type === "Image");
      if (!img) continue;
      const p = img.props as Record<string, unknown>;
      if (p.useLogoSprite) return "useLogoSprite";
      if (p.useHelpIcon)   return "useHelpIcon";
      if (p.useCloseIcon)  return "useCloseIcon";
    }
    return null;
  };
  walk(r, () => true, (s) => {
    const hasButton = s.components.some((c) => c.type === "Button");
    if (hasButton && isLocked(s.components.find((c) => c.type === "Image"))) return;
    const icon = hasButton ? childIconFlag(s) : null;
    if (icon === "useLogoSprite") {
      setComponentProp(s, "Image", "tint", transparent);
      setComponentProp(s, "Button", "normalColor", transparent);
      setComponentProp(s, "Button", "highlightColor", transparent);
      setComponentProp(s, "Button", "pressColor", transparent);
      setComponentProp(s, "Button", "disabledColor", transparent);
      return;
    }
    const lowerName = s.name.trim().toLowerCase();
    // "Link Button" = the slim secondary action buttons (Forgot password / Sign
    // Up) that replaced the old non-clickable brand-blue link text. They share
    // Button B's secondary-action color so they re-skin with the theme.
    const isNamedButtonB = lowerName === "button b" || lowerName === "link button" || lowerName === "uninstall";
    const isToolIconButton = icon === "useHelpIcon" || icon === "useCloseIcon";
    const isKeypadKey = hasButton && /^key /i.test(s.name.trim());
    if (isNamedButtonB || isToolIconButton || isKeypadKey) {
      setComponentProp(s, "Image", "tint", color);
      setComponentProp(s, "Button", "normalColor", color);
      setComponentProp(s, "Button", "highlightColor", highlight);
      setComponentProp(s, "Button", "pressColor", press);
      setComponentProp(s, "Button", "disabledColor", disabled);
    }
  });
  return r;
}

// Bulk-set every shape Image's cornerRadius to `amount` (0-100). Skips Images
// that display an actual picture/icon — corner radius only shapes colored-mask
// Images. Invoked only by the explicit "Apply Corner Radius" action, NOT by the
// color-preset chips (applyAll), so switching themes preserves the per-element
// radii the design relies on.
export function applyCornerRadius(root: Slot, amount: number): Slot {
  const r = clone(root);
  walk(r, () => true, (s) => {
    const img = s.components.find((c) => c.type === "Image");
    if (!img) return;
    const p = img.props as Record<string, unknown>;
    const hasPicture = !!p.customImageHash
      || p.useHelpIcon || p.useCloseIcon || p.useCheckIcon
      || p.useBackspaceIcon || p.useSpinnerIcon || p.useLogoSprite
      || (typeof p.spriteUrl === "string" && /^https?:\/\//.test(p.spriteUrl as string));
    if (hasPicture) return;
    p.cornerRadius = amount;
  });
  return r;
}

export function applyBackLogo(root: Slot, url: string, reason: string): Slot {
  const r = clone(root);
  walk(r, (s) => s.components.some((c) => c.type === "Canvas"), (s) => {
    setComponentProp(s, "Canvas", "backLogoHyperlinkUrl", url);
    setComponentProp(s, "Canvas", "backLogoHyperlinkReason", reason);
  });
  return r;
}

export function applyBackLogoImage(root: Slot, hash: string): Slot {
  const r = clone(root);
  walk(r, (s) => s.components.some((c) => c.type === "Canvas"), (s) => {
    setComponentProp(s, "Canvas", "backLogoCustomHash", hash);
  });
  return r;
}

// Push all three branding fields at once — invoked by the "Apply Branding"
// button so URL, reason, and image all update together.
export function applyBranding(
  root: Slot,
  url: string,
  reason: string,
  imageHash: string,
): Slot {
  let r = applyBackLogo(root, url, reason);
  r = applyBackLogoImage(r, imageHash);
  return r;
}

// Single-shot: apply every theme property at once. Used by preset chips
// (which set the theme values *and* immediately push them everywhere).
export function applyAll(root: Slot, theme: Theme): Slot {
  let r = applyBackground(root, theme.background);
  r = applyHeaderText(r, theme.headerTextColor, theme.headerTextSize);
  r = applyBodyText(r, theme.bodyTextColor, theme.bodyTextSize);
  r = applyAccent(r, theme.accent);
  r = applyControlSurface(r, theme.controlSurface);
  r = applyContainerSurface(r, theme.containerSurface);
  r = applyButtonA(r, theme.buttonA);
  r = applyButtonB(r, theme.buttonB);
  // Corner radius is intentionally NOT applied here — see applyCornerRadius.
  // Color-preset chips must not flatten the per-element radii (pill buttons vs.
  // subtle panel backgrounds). Users bulk-set radius via its own Apply action.
  r = applyBranding(r, theme.backLogoUrl, theme.backLogoReason, theme.backLogoImageHash);
  return r;
}
