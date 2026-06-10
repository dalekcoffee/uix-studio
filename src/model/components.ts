import { z } from "zod";
import type { UixComponentType } from "./types";

const vec2 = z.object({ x: z.number(), y: z.number() });
const color = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
});

export type Vec2 = z.infer<typeof vec2>;
export type Color = z.infer<typeof color>;

const canvasSchema = z.object({
  sizeX: z.number().default(800),
  sizeY: z.number().default(600),
  pixelScale: z.number().default(0.0005),
  acceptPhysicalTouch: z.boolean().default(true),
  backgroundColor: color.default({ r: 0.051, g: 0.051, b: 0.051, a: 1 }),
  // When true, exporter bundles a rounded-corner sprite + SpriteProvider on the
  // canvas slot and every Image references it (9-sliced) for rounded corners
  // matching the look of real Resonite UIX panels. Set false for square corners.
  rounded: z.boolean().default(true),
  // When true, the exporter lowers the panel into a real layout-driven hierarchy
  // (non-structural top-level elements flow inside a VerticalLayout, horizontally-
  // adjacent ones grouped into HorizontalLayout rows) so that editing a slot's
  // OrderOffset in Resonite physically reorders elements in-game. When false the
  // panel exports with absolute RectTransform positions (free-form), which is not
  // rearrangeable in-game. Defaults true; the Snap/Free editor toggle drives it
  // (Snap → true, Free → false). See buildCanvasStack in exportBrson.ts.
  stackLayout: z.boolean().default(true),
  // Optional user-uploaded image (SHA-256 hash, bytes stored in IndexedDB) that
  // overrides the default UIX Studio logo printed on the BACK of the exported
  // panel. Empty string → use the bundled UIX Studio logo. The "Made with
  // UIX Studio" credits badge in the bottom-left corner is unaffected — it
  // always shows the UIX Studio branding.
  backLogoCustomHash: z.string().default(""),
  // URL that the rear logo (large logo on the back of the panel) hyperlinks
  // to when clicked. Defaults to the UIX Studio homepage so a freshly-exported
  // panel ships with a working "what made this?" link out of the box; users
  // can clear or change it from the Canvas inspector. Empty = no link.
  backLogoHyperlinkUrl: z.string().default("https://uix.dalek.coffee"),
  backLogoHyperlinkReason: z.string().default("Check out the tool! :D"),
  // Panel-level side padding (px): the left/right inset of top-level BODY
  // content from the panel edges. Full-width Header / footer bars stay
  // edge-to-edge (exempt). Default 16 matches the historical hardcoded margin,
  // so it's a visual no-op until changed. Also the source value for nested
  // container padding, which defaults to HALF this (see resolvePad in
  // model/padding.ts). Applied by store.setContentPadding, which bakes the
  // inset into each body element's RectTransform (so preview/grips/export stay
  // consistent). Vertical rhythm stays spacing-driven (not insetn by this).
  contentPadding: z.number().default(16),
});

const rectTransformSchema = z.object({
  anchorMin: vec2.default({ x: 0, y: 0 }),
  anchorMax: vec2.default({ x: 1, y: 1 }),
  offsetMin: vec2.default({ x: 0, y: 0 }),
  offsetMax: vec2.default({ x: 0, y: 0 }),
  pivot: vec2.default({ x: 0.5, y: 0.5 }),
});

const imageSchema = z.object({
  tint: color.default({ r: 1, g: 1, b: 1, a: 1 }),
  preserveAspect: z.boolean().default(false),
  spriteUrl: z.string().default(""),
  // Unified corner-radius knob (0-100). The single, canonical way to shape an
  // Image's corners — replaces the former `rounded` / `usePillSprite` /
  // `roundedAmount` trio. Semantics:
  //   0   → square (no shape sprite at all)
  //   100 → full pill: corner radius = half the shorter dimension (a true
  //         capsule). Lowered to the pill sprite + NineSliceSizing="RectHeight"
  //         so it's runtime-correct at any size, no baked rect needed.
  //   0<r<100 → proportional rounded rect: corner radius = (r/100) × half the
  //         shorter dim, baked at export via a per-Image SpriteProvider with
  //         NineSliceSizing="FixedSize". (For elements sized by a layout
  //         container at runtime, this uses the static rect estimate.)
  // Defaults to 100 (pill) so freshly-added Images come out fully rounded; dial
  // down toward 0 for sharper corners.
  cornerRadius: z.number().min(0).max(100).default(100),
  // Round to the PANEL's absolute corner radius instead of one proportional to
  // this Image's own size. For panel-edge chrome (e.g. a full-width header bar)
  // whose own dimensions would otherwise yield a much tighter corner than the
  // rounded canvas. At export, overrides cornerRadius with the panel's pill
  // FixedSize (see _panelCornerFixedSizePx in exportBrson). Inert unless the
  // canvas is rounded; cornerRadius is the fallback.
  matchPanelCorners: z.boolean().optional(),
  // UI icon sprite opt-ins. Each maps to a bundled StaticTexture2D +
  // SpriteProvider attached to the canvas slot. PreserveAspect defaults true
  // when any of these is set. An icon/photo sprite wins over the corner shape.
  useHelpIcon:  z.boolean().default(false),
  useCloseIcon: z.boolean().default(false),
  useCheckIcon: z.boolean().default(false),
  // Backspace icon (UIIcons/Backspace.png) — used by the Keypad preset's
  // delete key, but available to any Image as a free-standing flag.
  useBackspaceIcon: z.boolean().default(false),
  // Spinner/loading icon (UIIcons/progress_activity.png). Spins in the
  // editor preview via CSS animate-spin. In-game, toggle Active on the slot
  // with a BooleanValueDriver wired to a boolean state field.
  useSpinnerIcon: z.boolean().default(false),
  // Icon tint — multiplied with the icon sprite color. Defaults to white (1,1,1,1)
  // so bundled icons look correct out of the box. White-mask icons (Checkmark,
  // Backspace, Spinner, OpenArrow, Clear) recolor cleanly with any tint. Full-
  // color icons (Cancel, Help&Info, custom uploads, logo) are also tintable but
  // darkening/shifting them may look muddy — set intentionally.
  iconTint: color.default({ r: 1, g: 1, b: 1, a: 1 }),
  // User-uploaded custom image — SHA-256 hash of the PNG/JPG bytes stored in
  // IndexedDB (see src/io/imageStore.ts). When set, the exporter bundles the
  // bytes into the .resonitepackage zip under Assets/<hash> and wires a
  // StaticTexture2D + SpriteProvider so Resonite resolves @packdb:///<hash>.
  customImageHash: z.string().default(""),
  // Quick "make this image clickable to a URL" option. When `hyperlinkUrl`
  // is non-empty, the exporter auto-injects a sibling BoxCollider sized to
  // the image's RectTransform rect and a Hyperlink component carrying the
  // URL + Reason on the same slot. Equivalent to manually attaching both
  // components via the palette, but no sizing/wiring required.
  hyperlinkUrl: z.string().default(""),
  hyperlinkReason: z.string().default(""),
  // Placeholder removal. Empty Images render a hatched "Image Placeholder"
  // overlay in the editor (and the exporter bakes a matching sprite when
  // useImagePlaceholder is set). `placeholderRemoved` suppresses both, leaving a
  // plain tinted Image. Making a graphic clickable auto-sets it (a button must
  // not read as a "drop image here" zone); making it static again clears it —
  // UNLESS the user removed the placeholder by hand. That manual intent is
  // tracked by `placeholderUserRemoved`, which keeps it removed across
  // clickable toggles (see store.setImageClickable + Inspector GraphicControls).
  placeholderRemoved: z.boolean().default(false),
  placeholderUserRemoved: z.boolean().default(false),
  // Background layout mode — only consulted when this Image carries a custom
  // background (customImageHash set on the Front Backing / Back Cover surfaces).
  // "fit" = contain (letterbox), "stretch" = fill (may deform), "full" = cover
  // (fills the canvas, cropping overflow via a centered sprite UV-rect). Inert
  // on every other Image. See store.setBackgroundImage + Inspector
  // BackgroundImageSection + compImage (export) + renderSlot (preview).
  backgroundFit: z.enum(["fit", "stretch", "full"]).default("full"),
  // Framing for "full" (cover) backgrounds — consulted only when backgroundFit
  // is "full" on a backdrop face. `backgroundFocus` is the normalized focal
  // point (0..1; 0.5,0.5 = centered, today's default) and `backgroundZoom`
  // scales past cover (1 = plain cover). Applied identically by the export bake
  // (io/bakeBackground.ts) and the editor preview (renderSlot).
  backgroundFocus: vec2.default({ x: 0.5, y: 0.5 }),
  backgroundZoom: z.number().min(1).max(4).default(1),
  // Set on the Front Backing / Back Cover face Images by the Background menu to
  // mark the face as user-managed: "color" (drives `tint`) or "image" (drives
  // `customImageHash`). Its mere presence tells the Theme apply to leave that
  // face alone ("Background menu wins"). Absent = theme-managed (default).
  backgroundKind: z.enum(["color", "image"]).optional(),
  // Theme opt-out. When true, every Theme apply (background, control surface,
  // accent, button) leaves this Image's color alone. Used to pin the white card
  // surfaces in the login presets so they stay white on any theme while the
  // accents/buttons around them still re-skin. Not user-editable (no field
  // descriptor) — set in the preset builders. See src/model/theme.ts.
  themeLock: z.boolean().optional(),
});

const textSchema = z.object({
  content: z.string().default("Text"),
  size: z.number().default(24),
  color: color.default({ r: 1, g: 1, b: 1, a: 1 }),
  horizontalAlign: z.enum(["Left", "Center", "Right", "Justify"]).default("Center"),
  verticalAlign: z.enum(["Top", "Middle", "Bottom"]).default("Middle"),
  autoSize: z.boolean().default(false),
  // Theme opt-out — see imageSchema.themeLock. When true, Theme apply leaves
  // this Text's color alone (used to keep login-card text dark/readable on the
  // permanently-white card surfaces, and to keep white glyphs legible on accent
  // chips). Not user-editable; set in the preset builders.
  themeLock: z.boolean().optional(),
});

const textFieldSchema = z.object({
  placeholder: z.string().default(""),
  textContent: z.string().default(""),
  fontSize: z.number().default(16),
  textColor: color.default({ r: 0.9, g: 0.9, b: 0.9, a: 1 }),
  placeholderColor: color.default({ r: 0.45, g: 0.45, b: 0.45, a: 1 }),
  backgroundTint: color.default({ r: 0.12, g: 0.12, b: 0.12, a: 1 }),
  fieldType: z.enum(["text", "float", "int"]).default("text"),
  textAlign: z.enum(["Left", "Center", "Right"]).default("Left"),
  // Float display rounding — digits shown after the decimal point. Default 2 so a
  // driven value (e.g. a slider feeding a float field) shows "0.48" instead of
  // overflowing the box with "0.4807973…". Only the float parser reads it.
  decimalPlaces: z.number().int().default(2),
  // Theme opt-out — see imageSchema.themeLock. When true, Theme apply leaves
  // this field's text/placeholder/background colors alone (keeps the white login
  // input fields white with dark text on any theme). Not user-editable.
  themeLock: z.boolean().optional(),
  // Cross-element link (internal plumbing — not in FIELD_DESCRIPTORS). When set on
  // a numeric (float/int) field, the exporter two-way-binds this field's parsed
  // value to the Slider whose `linkId` matches, via a ValueCopy<float> with
  // WriteBack — so the field both displays and sets the slider. See the "🔗 Links"
  // post-traversal pass in exportBrson.ts.
  bindSliderId: z.string().default(""),
});

const buttonSchema = z.object({
  normalColor: color.default({ r: 0.25, g: 0.25, b: 0.25, a: 1 }),
  highlightColor: color.default({ r: 0.40, g: 0.40, b: 0.40, a: 1 }),
  pressColor: color.default({ r: 0.15, g: 0.15, b: 0.15, a: 1 }),
  disabledColor: color.default({ r: 0.30, g: 0.30, b: 0.30, a: 1 }),
  hoverVibrate: z.boolean().default(false),
  // "Take ownership" wiring: when set to a UserProfile slot's (editor) id, the
  // exporter adds a ButtonDynamicImpulseTrigger so pressing this button assigns the
  // pressing user to that profile (avatar + name). Empty = ordinary button.
  takeOwnershipLinkId: z.string().default(""),
});

// Container padding defaults are the -1 "auto / inherit" sentinel (mirrors the
// LayoutElement min/preferred -1 convention): an unset side inherits HALF the
// Canvas.contentPadding at render/export (see resolvePad in model/padding.ts);
// an explicit >= 0 value wins. Every preset/template/widget sets padding
// explicitly, so this default only affects user-added containers.
const verticalLayoutSchema = z.object({
  spacing: z.number().default(4),
  paddingTop: z.number().default(-1),
  paddingBottom: z.number().default(-1),
  paddingLeft: z.number().default(-1),
  paddingRight: z.number().default(-1),
  horizontalAlign: z.enum(["Left", "Center", "Right"]).default("Left"),
  verticalAlign: z.enum(["Top", "Middle", "Bottom"]).default("Top"),
  forceExpandWidth: z.boolean().default(true),
  forceExpandHeight: z.boolean().default(false),
});

const horizontalLayoutSchema = z.object({
  spacing: z.number().default(4),
  paddingTop: z.number().default(-1),
  paddingBottom: z.number().default(-1),
  paddingLeft: z.number().default(-1),
  paddingRight: z.number().default(-1),
  horizontalAlign: z.enum(["Left", "Center", "Right"]).default("Left"),
  verticalAlign: z.enum(["Top", "Middle", "Bottom"]).default("Top"),
  forceExpandWidth: z.boolean().default(false),
  forceExpandHeight: z.boolean().default(true),
});

const gridLayoutSchema = z.object({
  cellSizeX: z.number().default(80),
  cellSizeY: z.number().default(80),
  spacingX: z.number().default(4),
  spacingY: z.number().default(4),
  paddingTop: z.number().default(-1),
  paddingBottom: z.number().default(-1),
  paddingLeft: z.number().default(-1),
  paddingRight: z.number().default(-1),
  horizontalAlign: z.enum(["Left", "Center", "Right"]).default("Left"),
  verticalAlign: z.enum(["Top", "Middle", "Bottom"]).default("Top"),
});

const layoutElementSchema = z.object({
  minWidth: z.number().default(-1),
  minHeight: z.number().default(-1),
  preferredWidth: z.number().default(-1),
  preferredHeight: z.number().default(-1),
  flexibleWidth: z.number().default(-1),
  flexibleHeight: z.number().default(-1),
  orderOffset: z.number().default(0),
});

const maskSchema = z.object({
  showMaskGraphic: z.boolean().default(false),
});

const ignoreLayoutSchema = z.object({});

const boxColliderSchema = z.object({
  sizeX: z.number().default(100),
  sizeY: z.number().default(100),
});

// Hyperlink component opens its URL in the user's browser when its sibling
// collider is clicked. Add a BoxCollider sized to the slot's RectTransform.
const hyperlinkSchema = z.object({
  url: z.string().default(""),
  openOnce: z.boolean().default(false),
  reason: z.string().default(""),
});

// Checkbox marks a slot as a real Resonite UIX.Checkbox. The slot should also
// have an Image (the box), a Text (typically "✓"), and a Button. On export,
// the serializer adds a BooleanValueDriver<colorX> (driving Text.Color between
// transparent and opaque) and a UIX.Checkbox component (TargetState refs the
// driver's State bool). Clicking the Button toggles the Checkbox, which flips
// the driver, which fades the ✓ in/out.
const checkboxSchema = z.object({
  initialState: z.boolean().default(true),
});

// Toggle marks a slot as a real Resonite bool-toggle. Shares the underlying
// UIX.Checkbox + BooleanValueDriver<colorX> wiring with Checkbox, but uses two
// explicit colors (offColor / onColor) instead of alpha-toggling a single
// tint. Typically used on a wide pill-shaped Image (3:1 ratio) without an icon.
const toggleSchema = z.object({
  initialState: z.boolean().default(false),
  offColor: color.default({ r: 0.22, g: 0.22, b: 0.22, a: 1 }),
  onColor:  color.default({ r: 0.18, g: 0.36, b: 0.60, a: 1 }),
});

// Knob marks a slot as the sliding-knob child of a Toggle parent. The four
// vec2 props are the OffsetMin / OffsetMax values for the RectTransform in
// the off vs on states; the exporter generates two BooleanValueDriver<float2>
// components that flip the slot's RT offsets between these positions when the
// parent Toggle's ValueMultiDriver writes its bool to the drivers' States.
// Popup: attached to a Button (or BoxCollider) slot to open a modal-style
// dialog on click. At export it lowers to a real Active=false spawn-window
// modal sub-tree (backdrop + card + dismiss button) toggled by ButtonValueSet/
// ButtonToggle wiring on the trigger and dismiss — see buildPopupModalSlot in
// exportBrson.ts.
//
// The dialog content is editable: `contentSlotId` (when set) points at a
// PopupContent container slot (a direct child of the Canvas root) that holds
// the user's arranged elements. The editor renders that subtree as a centered,
// editable overlay; export lowers its children into the modal card. When
// `contentSlotId` is absent (legacy saves / un-edited presets) the exporter
// synthesizes the card from title/body/dismissLabel instead — byte-identical
// to the pre-editable behavior. `ensurePopupContent` (store.ts) lazily creates
// the content subtree from these strings on first edit.
const popupSchema = z.object({
  title: z.string().default("Heads up"),
  body: z.string().default("Your message here."),
  dismissLabel: z.string().default("Dismiss"),
  // Id of the linked PopupContent container slot. Absent until first edited.
  contentSlotId: z.string().optional(),
});

// PopupContent: marker on the editable popup-card container slot. Carries no
// layout component, so the snap engine treats it as an absolute container and
// its children get full side-by-side dragging. PopupDismiss marks the child
// button that closes the modal (so the exporter wires its Active-toggle).
const popupContentSchema = z.object({});
const popupDismissSchema = z.object({});

const knobSchema = z.object({
  offOffsetMin: vec2.default({ x: -27, y: -13 }),
  offOffsetMax: vec2.default({ x: -1,  y:  13 }),
  onOffsetMin:  vec2.default({ x:  1,  y: -13 }),
  onOffsetMax:  vec2.default({ x: 27,  y:  13 }),
});

// Slider marks a slot as a real Resonite UIX.Slider<float>. The host slot is
// the slider's track — typically a thin rounded rectangle with an Image acting
// as the background. At export the serializer expands this slot into the full
// FrooxEngine wiring:
//   * UIX.Slider<float> component with min/max/value/direction
//   * A synthetic "Fill" child slot (Image + RectTransform) representing the
//     filled portion. The Slider's HandleAnchorMaxDrive is wired to this
//     child's RT.AnchorMax field so dragging updates the visual fill.
//   * Two SmoothValue<float2> companions for animated motion.
// In the editor we render an overlay fill rect proportional to value so the
// designer can see the starting position.
const sliderSchema = z.object({
  value: z.number().default(0.5),
  min: z.number().default(0),
  max: z.number().default(1),
  direction: z.enum(["Horizontal", "Vertical"]).default("Horizontal"),
  integers: z.boolean().default(false),
  power: z.number().default(1),
  fillColor: color.default({ r: 0.18, g: 0.36, b: 0.6, a: 1 }),
  clamp: z.boolean().default(true),
  requireInitialPress: z.boolean().default(true),
  // Cross-element link source id (internal plumbing). A float field whose
  // `bindSliderId` matches two-way-binds to this slider's value. See exportBrson.
  linkId: z.string().default(""),
});

// ProgressBar marks a slot as a static visual progress indicator. The host
// slot's Image is the track background; the exporter generates a synthetic
// "Fill" child slot whose RectTransform AnchorMax is pinned to `value/max`
// of the track length, tinted with `fillColor`. No drivers, no UIX.Slider —
// it's a read-only visual the user (or a downstream Resonite script) can
// drive by writing into the Fill RT.AnchorMax field after the panel spawns.
const progressBarSchema = z.object({
  value: z.number().default(0.6),
  min: z.number().default(0),
  max: z.number().default(1),
  direction: z.enum(["Horizontal", "Vertical"]).default("Horizontal"),
  fillColor: color.default({ r: 0.18, g: 0.36, b: 0.6, a: 1 }),
  // Cross-element link target id (internal plumbing). When set, the exporter
  // drives this bar's fill color from the ColorPicker whose `linkId` matches,
  // via a ValueCopy<colorX>. See the "🔗 Links" pass in exportBrson.ts.
  colorLinkId: z.string().default(""),
});

// Waveform marks a slot as an audio waveform visualizer. At export the slot
// becomes a UIX.RectMesh<AudioSourceWaveformMesh> (procedural live-waveform mesh,
// rendered with the canvas default UI material — no material to bundle) plus a
// ReferenceCast<IWorldElement, IWorldAudioDataSource> that feeds the mesh's
// audio Source. `audioLinkId` pairs it with a ReferenceField whose matching
// `audioLinkId` holds the dropped "Audio source" — the exporter wires a
// ReferenceCopy from that field into the cast (see the "🔗 Links" pass).
const waveformSchema = z.object({
  color: color.default({ r: 0.88, g: 0.88, b: 0.88, a: 1 }),
  // Mesh.Points — horizontal sample count (resolution of the trace).
  points: z.number().int().min(2).default(256),
  // Mesh.Width — line thickness of the trace.
  thickness: z.number().min(0.5).default(4),
  // Mesh.HistoryLength — seconds of audio history the trace spans.
  historyLength: z.number().min(0.05).default(0.5),
  // Cross-element link target id (internal plumbing). The ReferenceField whose
  // `audioLinkId` matches drives this waveform's audio source.
  audioLinkId: z.string().default(""),
});

// UserProfile marks a slot as a "member card": a rounded card holding an avatar
// (a circular image placeholder the end user fills) and a name label. Editor-only
// — at export the marker is skipped and the Card Image + Avatar Image + Name Text
// serialize as ordinary slots. `avatarPosition` re-lays the avatar relative to
// the name (the store action setUserProfileLayout + the widget builder share the
// geometry in userProfileLayout()).
const userProfileSchema = z.object({
  avatarPosition: z.enum(["left", "above", "right"]).default("left"),
});

// Radio marks a slot as one option in a mutually-exclusive group. At export
// the first radio in a given groupId owns a ValueField<int> (the shared
// "selected index"); every radio in the group writes its index to that field
// on click (ButtonValueSet<int>) and drives the visibility of its inner dot
// via ValueEqualityDriver<int> comparing the shared field to its own index.
// Radios with the same groupId behave as a single radio group — exactly one
// is selected at runtime.
const radioSchema = z.object({
  groupId: z.string().default("group1"),
  index: z.number().int().default(0),
  initiallySelected: z.boolean().default(false),
  selectedColor: color.default({ r: 0.95, g: 0.95, b: 0.95, a: 1 }),
});

// Dropdown marks a slot as a dropdown trigger. The host slot is the trigger
// button (Image + Button + a child Text showing the current label). At export
// the exporter lowers this into:
//   * UIX.Button on the host (already present from user props)
//   * ButtonToggle pointing at a pre-allocated popup.Active bool field
//   * ValueField<int> holding the current selection (seeded to initialIndex)
//   * A spawn-window popup sub-tree containing a vertical list of option
//     buttons. Each option button carries three action components:
//       - ButtonValueSet<int>: writes its index into the shared ValueField<int>
//       - ButtonValueSet<string>: writes its label into trigger Text.Content
//       - ButtonToggle: flips popup.Active=false to close the menu
// Options are stored as a multiline string (one option per line) for simple
// inspector editing; the exporter splits on '\n' / '\r' at build time.
const dropdownSchema = z.object({
  options: z.string().default("Option 1\nOption 2\nOption 3"),
  initialIndex: z.number().int().default(0),
  optionFillColor: color.default({ r: 0.14, g: 0.16, b: 0.20, a: 1 }),
  optionLabelColor: color.default({ r: 0.95, g: 0.95, b: 0.95, a: 1 }),
});

// ColorPicker marks a slot as a native Resonite color swatch+picker. The host
// slot is the swatch — an Image (whose Tint shows the current color), a Button
// (so the swatch is clickable), and this marker. At export the serializer adds
// a FrooxEngine.ButtonEditColorX whose Target is the swatch Image.Tint field:
// clicking the swatch opens Resonite's built-in color picker overlay, and the
// chosen color is written straight back into the Tint (Continuous=true), so the
// swatch live-recolors. No ProtoFlux required. The exposed "📚 Value" slot
// mirrors the Tint into a DynamicValueVariable<colorX> (named after the row
// label) via a ValueCopy<colorX>, matching every other interactive control.
//   alpha — allow editing the alpha channel in the picker
//   hdr   — allow HDR (>1) color values in the picker
const colorPickerSchema = z.object({
  initialColor: color.default({ r: 0.18, g: 0.36, b: 0.6, a: 1 }),
  alpha: z.boolean().default(true),
  hdr: z.boolean().default(false),
  // Cross-element link source id (internal plumbing). A ProgressBar whose
  // `colorLinkId` matches has its fill color driven by this picker's chosen
  // color, via a ValueCopy<colorX>. See exportBrson.ts.
  linkId: z.string().default(""),
});

// KeypadDisplay marks the slot whose Text component receives keypad input.
// The slot should already have a RectTransform and a Text component (the
// visible display). At export, the slot's Text.Content field UUID is
// captured into a module-level temp so subsequent KeypadKey buttons can
// wire their ButtonValueSet<string> to write into it. No props — the
// marker presence is the whole signal.
//
// Limitation (V1): the marker just sets the display to the pressed key's
// value, overwriting any previous content. True "type-as-you-go" append
// requires a ProtoFlux node in Resonite after import.
const keypadDisplaySchema = z.object({});

// KeypadKey marks a button slot as part of a Keypad — clicking it writes
// `value` into the most-recently-serialized KeypadDisplay's Text.Content
// field. The slot should have an Image + Button alongside this marker.
// For the Backspace and Clear buttons, set `value` to "" — the keypad will
// blank the display on click.
const keypadKeySchema = z.object({
  value: z.string().default(""),
});

// Close marks a slot as a "destroy this window when clicked" button. Lowers
// to a FrooxEngine.ButtonDestroy component at export — that component
// subscribes to the host slot's UIX.Button.Pressed event automatically, so a
// slot only needs Button + Close together to be a working close button.
// `findObjectRoot=true` walks up the hierarchy from the host slot to the
// nearest ObjectRoot (the panel's outer grabbable) and destroys that whole
// subtree on click, which is what users almost always want for an "X" button.
// Set false + supply your own Target via inspector (future) if you ever need
// to destroy a specific sub-slot instead.
const closeSchema = z.object({
  findObjectRoot: z.boolean().default(true),
});

// ReferenceField marks a slot as a labeled drop-target field for an
// IWorldElement reference. At export the host slot carries the actual
// storage (FrooxEngine.RefEditor + ReferenceField<IWorldElement>), and a
// single synthesized child holds a HorizontalLayout with two visible
// buttons:
//   * "Field"     — drop target (Image + Button + ButtonRelay→SetReference)
//                   with a child Text whose Content.ID is bound to
//                   RefEditor._textDrive so Resonite drives the displayed
//                   name when an IWorldElement is dropped
//   * "Inspector" — opens an inspector on the referenced object via
//                   RefEditor.OpenInspectorButton ("⤴" icon)
// Click-without-drag on the Field button fires the ButtonRelay → clears the
// stored reference. Drag-and-drop is caught by RefEditor first via _button.
// See the hasReferenceField branch in src/io/exportBrson.ts for the full
// wiring; the "Text to String with Reference Field" example in UIX Template/
// is the reference implementation.
const referenceFieldSchema = z.object({
  fieldColor:  color.default({ r: 0.024, g: 0.028, b: 0.036, a: 1 }),
  buttonColor: color.default({ r: 0.024, g: 0.028, b: 0.036, a: 1 }),
  textColor:   color.default({ r: 0.88, g: 0.88, b: 0.88, a: 1 }),
  // Cross-element link source id (internal plumbing). When set, a Waveform whose
  // `audioLinkId` matches has its audio source driven by the object dropped here.
  audioLinkId: z.string().default(""),
});

// ScrollArea marks a slot as a scrollable viewport. At export the slot is
// lowered into a Resonite UIX.ScrollRect hierarchy:
//   Host slot   : RT + Image (background) + UIX.Mask (overflow clipping)
//   Content slot: RT (anchors stretch) + UIX.ScrollRect (ViewportOverride →
//                 host RT) + UIX.ContentSizeFitter (PreferredSize on the
//                 scrolling axis) + a Vertical/Horizontal/Grid layout
//                 container. User-authored children of the ScrollArea slot
//                 get moved INTO this synthetic content slot at serialize
//                 time so the user's mental model stays "drop items into the
//                 ScrollArea and they stack + become scrollable".
// `showScrollbar` adds a thin visual track on the right (Vertical) or bottom
// (Horizontal). V1 thumb is static (centered) — purely a visual cue that
// scrolling is possible. A driven thumb position is a future iteration.
const scrollAreaSchema = z.object({
  direction: z.enum(["Vertical", "Horizontal", "Both"]).default("Vertical"),
  backgroundTint: color.default({ r: 0.07, g: 0.08, b: 0.11, a: 1 }),
  spacing: z.number().default(4),
  // -1 = inherit half the Canvas.contentPadding (see resolvePad); explicit wins.
  padding: z.number().default(-1),
  showScrollbar: z.boolean().default(true),
  scrollbarTrackTint: color.default({ r: 0.15, g: 0.17, b: 0.21, a: 1 }),
  scrollbarThumbTint: color.default({ r: 0.55, g: 0.60, b: 0.68, a: 1 }),
  // Scrollbar corner roundness (0-100). Independent of (and far lower than)
  // the Image cornerRadius applied to normal elements: 100% here = a full
  // capsule on the thin bar's thickness, not a giant pill. Keeps thin
  // scrollbars clean instead of pinching to a point.
  scrollbarRoundness: z.number().min(0).max(100).default(100),
});

// RadioGroup is a marker placed on the parent slot of a set of Radio options.
// At export it adds a shared ValueField<int> to that slot — the radios under
// it discover the field via the module-level _radioGroupFieldIds map keyed
// by groupId. The shared "selected index" lives in a place that makes
// structural sense (the group root) instead of being buried inside one of
// the options.
const radioGroupSchema = z.object({
  groupId: z.string().default("group1"),
  initialIndex: z.number().int().default(0),
  // List-driven editing (v0.1.39): the option labels live here, one per line, and
  // the editor regenerates the option ring/label child slots from this list (add/
  // remove/rename without hand-building slots). Empty = derive the list from the
  // existing option slots (migrates legacy/preset groups on first edit).
  options: z.string().default(""),
  // Where each option's label sits relative to its dot (applied uniformly).
  // "none" = bare dots, no per-option text.
  labelPosition: z.enum(["up", "down", "left", "right", "none"]).default("right"),
  // Lay the options out as a horizontal row or a vertical list.
  orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
});

// Tabs marks the host slot of a tabbed container. Its children are a "Tab Bar"
// (a Horizontal/Vertical layout of TabButton slots) followed by N TabPage
// slots. Exactly one page is visible at runtime, selected by a shared
// ValueField<int> the exporter adds to this host: each TabButton writes its
// positional index into it on click, and each TabPage's Active is driven by a
// ValueEqualityDriver<int> comparing that field to the page's positional index.
// `activeTab` is the editor-selected page AND the exported initial selection.
//   orientation — "Horizontal" puts the tab strip on TOP (a horizontal row of
//                 tabs); "Vertical" puts it on the LEFT (a vertical stack).
//   tabBarSize  — strip height (Horizontal) / width (Vertical), in px.
//   pagePadding — inner padding inside each page (≈ half the canvas margin) so
//                 content doesn't hug the edges.
const tabsSchema = z.object({
  orientation: z.enum(["Horizontal", "Vertical"]).default("Horizontal"),
  // Which side the tab bar sits on. top/bottom ⇒ a horizontal strip
  // (orientation Horizontal); left/right ⇒ a vertical strip (orientation
  // Vertical). The authoritative control; `orientation` is kept in sync for
  // export + back-compat.
  tabPosition: z.enum(["top", "bottom", "left", "right"]).default("top"),
  activeTab: z.number().int().default(0),
  tabBarSize: z.number().default(40),
  tabSpacing: z.number().default(3),
  // -1 = inherit half the Canvas.contentPadding (see resolvePad); explicit wins.
  pagePadding: z.number().default(-1),
  // Active tab fill — defaults to the SAME color as pageColor so the selected
  // tab merges into the content panel below it (folder-tab connection).
  activeColor:   color.default({ r: 0.16, g: 0.18, b: 0.23, a: 1 }),
  // Inactive tabs sit recessed against the frame.
  inactiveColor: color.default({ r: 0.11, g: 0.12, b: 0.15, a: 1 }),
  // Content panel surface (shared with the active tab).
  pageColor:     color.default({ r: 0.16, g: 0.18, b: 0.23, a: 1 }),
  // Outer frame / header backdrop — the card the whole tabbed group sits on.
  frameColor:    color.default({ r: 0.09, g: 0.10, b: 0.13, a: 1 }),
  labelColor:    color.default({ r: 0.95, g: 0.95, b: 0.95, a: 1 }),
  // Visual style. "folder" = the classic tabbed card (frame + page panel + the
  // active tab merging into the body). "segmented" = a pill/segmented selector
  // with no frame and seamless (background-less) pages — the active tab reads as
  // a highlighted button above the content. Style is realized by how the tab
  // bar/pages are authored (frame & page Images present or not, tab colors); the
  // export's tab MECHANISM is identical either way.
  tabStyle: z.enum(["folder", "segmented"]).default("folder"),
});

// TabButton / TabPage: empty markers. A TabButton's index is its position among
// the Tab Bar's children; a TabPage's index is its position among the host's
// TabPage children. Keeping index positional means reordering tabs is a pure
// array swap with no field resync. TabPage carries no layout component so the
// snap engine treats it as an absolute container (full side-by-side dragging).
const tabButtonSchema = z.object({});
const tabPageSchema = z.object({});

// Editor-only spacer marker — carries no real props; its slot's RectTransform
// holds the reserved height. Exports as a plain empty slot.
const spacerSchema = z.object({});

export const COMPONENT_SCHEMAS = {
  Canvas: canvasSchema,
  RectTransform: rectTransformSchema,
  Image: imageSchema,
  Text: textSchema,
  TextField: textFieldSchema,
  Button: buttonSchema,
  VerticalLayout: verticalLayoutSchema,
  HorizontalLayout: horizontalLayoutSchema,
  GridLayout: gridLayoutSchema,
  LayoutElement: layoutElementSchema,
  Mask: maskSchema,
  IgnoreLayout: ignoreLayoutSchema,
  BoxCollider: boxColliderSchema,
  Hyperlink: hyperlinkSchema,
  Checkbox: checkboxSchema,
  Toggle: toggleSchema,
  Knob: knobSchema,
  Popup: popupSchema,
  PopupContent: popupContentSchema,
  PopupDismiss: popupDismissSchema,
  Slider: sliderSchema,
  ProgressBar: progressBarSchema,
  Radio: radioSchema,
  RadioGroup: radioGroupSchema,
  Dropdown: dropdownSchema,
  ColorPicker: colorPickerSchema,
  KeypadDisplay: keypadDisplaySchema,
  KeypadKey: keypadKeySchema,
  Close: closeSchema,
  ReferenceField: referenceFieldSchema,
  Waveform: waveformSchema,
  UserProfile: userProfileSchema,
  ScrollArea: scrollAreaSchema,
  Tabs: tabsSchema,
  TabButton: tabButtonSchema,
  TabPage: tabPageSchema,
  Spacer: spacerSchema,
} satisfies Record<UixComponentType, z.ZodTypeAny>;

export type ComponentProps<T extends UixComponentType> = z.infer<
  (typeof COMPONENT_SCHEMAS)[T]
>;

export function defaultProps<T extends UixComponentType>(type: T): ComponentProps<T> {
  return COMPONENT_SCHEMAS[type].parse({}) as ComponentProps<T>;
}

// In-place migration of legacy Image shape props (`rounded` / `usePillSprite` /
// `roundedAmount`) to the unified `cornerRadius`. Idempotent: skips Images that
// already carry a `cornerRadius`. Called when loading saved documents so older
// .uixstudio.json files keep working. Mapping:
//   usePillSprite:true            → 100 (full pill)
//   roundedAmount:N (rounded)     → N   (explicit proportional value)
//   rounded:true (no amount)      → 100 (the new default look)
//   none of the above             → 0   (square)
export function migrateLegacyImageProps(props: Record<string, unknown>): Record<string, unknown> {
  if (!props || typeof props !== "object") return props;
  if (!("cornerRadius" in props)) {
    if (props.usePillSprite === true) props.cornerRadius = 100;
    else if (typeof props.roundedAmount === "number") props.cornerRadius = props.roundedAmount;
    else if (props.rounded === true) props.cornerRadius = 100;
    else props.cornerRadius = 0;
  }
  delete props.rounded;
  delete props.usePillSprite;
  delete props.roundedAmount;
  return props;
}

export interface FieldDescriptor {
  key: string;
  label: string;
  kind: "number" | "boolean" | "string" | "vec2" | "color" | "enum" | "slider";
  options?: readonly string[];
  step?: number;
  min?: number;
  max?: number;
  /**
   * Optional conditional visibility — the field renders only when the given
   * sibling prop on the same component equals `value`. Used by `roundedAmount`
   * to appear under `rounded` only when that boolean is checked.
   */
  visibleWhen?: { key: string; value: unknown };
  /**
   * Inspector display unit shown next to the slider value, e.g. "%".
   */
  unit?: string;
}

export const FIELD_DESCRIPTORS: Record<UixComponentType, readonly FieldDescriptor[]> = {
  Canvas: [
    { key: "sizeX", label: "Size X", kind: "number" },
    { key: "sizeY", label: "Size Y", kind: "number" },
    { key: "pixelScale", label: "Pixel Scale", kind: "number", step: 0.0001 },
    { key: "acceptPhysicalTouch", label: "Accept Physical Touch", kind: "boolean" },
    { key: "backgroundColor", label: "Background Color", kind: "color" },
    { key: "rounded", label: "Rounded Corners", kind: "boolean" },
    { key: "stackLayout", label: "Stack Layout (reorderable in-game)", kind: "boolean" },
    // Panel side padding. Insets top-level content from the left/right edges and
    // sets the inherited default (half) for nested containers' inner padding.
    { key: "contentPadding", label: "Content Padding", kind: "number", min: 0, step: 1, unit: "px" },
    // Back-logo URL/reason moved to the Theme menu (bottom-left of the editor).
  ],
  RectTransform: [
    { key: "anchorMin", label: "Anchor Min", kind: "vec2", step: 0.01 },
    { key: "anchorMax", label: "Anchor Max", kind: "vec2", step: 0.01 },
    { key: "offsetMin", label: "Offset Min", kind: "vec2" },
    { key: "offsetMax", label: "Offset Max", kind: "vec2" },
    { key: "pivot", label: "Pivot", kind: "vec2", step: 0.01 },
  ],
  // A "graphic": the visual half is identical whether or not the slot is also
  // a Button — the same fields show in both cases. Interactivity is added via
  // the Make-clickable toggle (see Inspector GraphicControls), not a different
  // component with different settings. The 5 bundled icon booleans
  // (useHelpIcon, …) are consolidated into the Inspector's single Icon
  // dropdown rather than listed here as separate toggles.
  Image: [
    { key: "tint", label: "Color", kind: "color" },
    { key: "preserveAspect", label: "Preserve Aspect", kind: "boolean" },
    // No manual "Sprite URL / resdb://" field: users either upload an image
    // here (System Images / custom upload) or set the texture themselves in
    // Resonite. The `spriteUrl` prop still exists on the schema (kept for
    // backward-compat with saved docs and the exporter's http-sprite path),
    // it's just no longer editable from the web inspector.
    {
      key: "cornerRadius",
      label: "Corner Radius",
      kind: "slider",
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    { key: "iconTint", label: "Icon Tint", kind: "color" },
    { key: "hyperlinkUrl",    label: "Hyperlink URL",     kind: "string" },
    { key: "hyperlinkReason", label: "Hyperlink Reason",  kind: "string" },
  ],
  Text: [
    { key: "content", label: "Content", kind: "string" },
    { key: "size", label: "Size", kind: "number" },
    { key: "color", label: "Color", kind: "color" },
    {
      key: "horizontalAlign",
      label: "H Align",
      kind: "enum",
      options: ["Left", "Center", "Right", "Justify"],
    },
    {
      key: "verticalAlign",
      label: "V Align",
      kind: "enum",
      options: ["Top", "Middle", "Bottom"],
    },
    { key: "autoSize", label: "Auto Size", kind: "boolean" },
  ],
  TextField: [
    { key: "placeholder", label: "Placeholder", kind: "string" },
    { key: "textContent", label: "Default Content", kind: "string" },
    { key: "fontSize", label: "Font Size", kind: "number" },
    { key: "textColor", label: "Text Color", kind: "color" },
    { key: "placeholderColor", label: "Placeholder Color", kind: "color" },
    { key: "backgroundTint", label: "Background Tint", kind: "color" },
    // Float fields only — digits shown after the decimal point (default 2).
    // Hidden for text/int fields via visibleWhen (only the float parser reads it).
    { key: "decimalPlaces", label: "Decimal Places", kind: "number", visibleWhen: { key: "fieldType", value: "float" } },
  ],
  // `normalColor` is intentionally omitted — the resting/visible color of a
  // button is the sibling Image's `tint` (shown as "Color" on the graphic).
  // These are the hover/press/disabled feedback colors, only animated when the
  // button is wired to drive its Image (toggles, sliders); for a plain
  // clickable image they're inert. Kept here so driven widgets remain editable.
  Button: [
    { key: "highlightColor", label: "Highlight Color", kind: "color" },
    { key: "pressColor", label: "Press Color", kind: "color" },
    { key: "disabledColor", label: "Disabled Color", kind: "color" },
    { key: "hoverVibrate", label: "Hover Vibrate", kind: "boolean" },
  ],
  VerticalLayout: [
    { key: "spacing", label: "Spacing", kind: "number" },
    { key: "paddingTop", label: "Padding Top", kind: "number" },
    { key: "paddingBottom", label: "Padding Bottom", kind: "number" },
    { key: "paddingLeft", label: "Padding Left", kind: "number" },
    { key: "paddingRight", label: "Padding Right", kind: "number" },
    {
      key: "horizontalAlign",
      label: "H Align",
      kind: "enum",
      options: ["Left", "Center", "Right"],
    },
    {
      key: "verticalAlign",
      label: "V Align",
      kind: "enum",
      options: ["Top", "Middle", "Bottom"],
    },
    { key: "forceExpandWidth", label: "Force Expand W", kind: "boolean" },
    { key: "forceExpandHeight", label: "Force Expand H", kind: "boolean" },
  ],
  HorizontalLayout: [
    { key: "spacing", label: "Spacing", kind: "number" },
    { key: "paddingTop", label: "Padding Top", kind: "number" },
    { key: "paddingBottom", label: "Padding Bottom", kind: "number" },
    { key: "paddingLeft", label: "Padding Left", kind: "number" },
    { key: "paddingRight", label: "Padding Right", kind: "number" },
    {
      key: "horizontalAlign",
      label: "H Align",
      kind: "enum",
      options: ["Left", "Center", "Right"],
    },
    {
      key: "verticalAlign",
      label: "V Align",
      kind: "enum",
      options: ["Top", "Middle", "Bottom"],
    },
    { key: "forceExpandWidth", label: "Force Expand W", kind: "boolean" },
    { key: "forceExpandHeight", label: "Force Expand H", kind: "boolean" },
  ],
  GridLayout: [
    { key: "cellSizeX", label: "Cell Size X", kind: "number" },
    { key: "cellSizeY", label: "Cell Size Y", kind: "number" },
    { key: "spacingX", label: "Spacing X", kind: "number" },
    { key: "spacingY", label: "Spacing Y", kind: "number" },
    { key: "paddingTop", label: "Padding Top", kind: "number" },
    { key: "paddingBottom", label: "Padding Bottom", kind: "number" },
    { key: "paddingLeft", label: "Padding Left", kind: "number" },
    { key: "paddingRight", label: "Padding Right", kind: "number" },
    {
      key: "horizontalAlign",
      label: "H Align",
      kind: "enum",
      options: ["Left", "Center", "Right"],
    },
    {
      key: "verticalAlign",
      label: "V Align",
      kind: "enum",
      options: ["Top", "Middle", "Bottom"],
    },
  ],
  LayoutElement: [
    { key: "minWidth", label: "Min Width", kind: "number" },
    { key: "minHeight", label: "Min Height", kind: "number" },
    { key: "preferredWidth", label: "Preferred Width", kind: "number" },
    { key: "preferredHeight", label: "Preferred Height", kind: "number" },
    { key: "flexibleWidth", label: "Flexible Width", kind: "number" },
    { key: "flexibleHeight", label: "Flexible Height", kind: "number" },
    { key: "orderOffset", label: "Order Offset", kind: "number" },
  ],
  Mask: [{ key: "showMaskGraphic", label: "Show Mask Graphic", kind: "boolean" }],
  IgnoreLayout: [],
  BoxCollider: [
    { key: "sizeX", label: "Size X", kind: "number" },
    { key: "sizeY", label: "Size Y", kind: "number" },
  ],
  Hyperlink: [
    { key: "url", label: "URL", kind: "string" },
    { key: "openOnce", label: "Open Once", kind: "boolean" },
    { key: "reason", label: "Reason", kind: "string" },
  ],
  Checkbox: [
    { key: "initialState", label: "Initial State", kind: "boolean" },
  ],
  Toggle: [
    { key: "initialState", label: "Initial State", kind: "boolean" },
    { key: "offColor", label: "Off Color", kind: "color" },
    { key: "onColor",  label: "On Color",  kind: "color" },
  ],
  Knob: [
    { key: "offOffsetMin", label: "Off Offset Min", kind: "vec2" },
    { key: "offOffsetMax", label: "Off Offset Max", kind: "vec2" },
    { key: "onOffsetMin",  label: "On Offset Min",  kind: "vec2" },
    { key: "onOffsetMax",  label: "On Offset Max",  kind: "vec2" },
  ],
  // No editable fields: the dialog's title/body/dismiss text are edited directly
  // on the card via the "Edit popup dialog…" surface, so exposing the schema's
  // title/body/dismissLabel here only confused users (editing them did nothing
  // once the card was built). Those props live on in the schema purely as the
  // initial seed for ensurePopupContent and the export fallback for un-edited
  // popups — they're plumbing, not user-facing.
  Popup: [],
  // Markers — no editable fields (the card is edited by arranging its children).
  PopupContent: [],
  PopupDismiss: [],
  Slider: [
    { key: "value", label: "Initial Value", kind: "number", step: 0.01 },
    { key: "min", label: "Min", kind: "number" },
    { key: "max", label: "Max", kind: "number" },
    {
      key: "direction",
      label: "Direction",
      kind: "enum",
      options: ["Horizontal", "Vertical"],
    },
    { key: "fillColor", label: "Fill Color", kind: "color" },
    { key: "integers", label: "Integers Only", kind: "boolean" },
    { key: "power", label: "Power Curve", kind: "number", step: 0.1 },
    { key: "clamp", label: "Clamp", kind: "boolean" },
    { key: "requireInitialPress", label: "Require Initial Press", kind: "boolean" },
  ],
  ProgressBar: [
    { key: "value", label: "Value", kind: "number", step: 0.01 },
    { key: "min", label: "Min", kind: "number" },
    { key: "max", label: "Max", kind: "number" },
    {
      key: "direction",
      label: "Direction",
      kind: "enum",
      options: ["Horizontal", "Vertical"],
    },
    { key: "fillColor", label: "Fill Color", kind: "color" },
  ],
  Radio: [
    { key: "groupId", label: "Group ID", kind: "string" },
    { key: "index", label: "Index", kind: "number" },
    { key: "initiallySelected", label: "Initially Selected", kind: "boolean" },
    { key: "selectedColor", label: "Selected Color", kind: "color" },
  ],
  // Edited via the custom RadioGroupInspector (options list + label position +
  // orientation). groupId/initialIndex/options/labelPosition/orientation are all
  // driven from there, so no raw fields here.
  RadioGroup: [],
  // options + initialIndex are edited via the custom DropdownInspector (the same
  // add/remove/rename list UX as the radial group); only the colors are raw fields.
  Dropdown: [
    { key: "optionFillColor",  label: "Option Fill Color",  kind: "color" },
    { key: "optionLabelColor", label: "Option Label Color", kind: "color" },
  ],
  ColorPicker: [
    { key: "initialColor", label: "Initial Color", kind: "color" },
    { key: "alpha",        label: "Edit Alpha",    kind: "boolean" },
    { key: "hdr",          label: "Allow HDR",     kind: "boolean" },
  ],
  Close: [
    { key: "findObjectRoot", label: "Destroy Object Root", kind: "boolean" },
  ],
  KeypadDisplay: [],
  KeypadKey: [
    { key: "value", label: "Value Written", kind: "string" },
  ],
  ReferenceField: [
    { key: "fieldColor",  label: "Field Color",  kind: "color" },
    { key: "buttonColor", label: "Button Color", kind: "color" },
    { key: "textColor",   label: "Text Color",   kind: "color" },
  ],
  Waveform: [
    { key: "color",         label: "Color",          kind: "color" },
    { key: "points",        label: "Resolution",     kind: "number" },
    { key: "thickness",     label: "Line Thickness", kind: "number", step: 0.5 },
    { key: "historyLength", label: "History (s)",    kind: "number", step: 0.1 },
  ],
  // avatarPosition is edited via a custom Inspector toggle (it re-lays the avatar
  // + name children, so it can't be a plain field write). No raw fields.
  UserProfile: [],
  ScrollArea: [
    {
      key: "direction",
      label: "Direction",
      kind: "enum",
      options: ["Vertical", "Horizontal", "Both"],
    },
    { key: "backgroundTint",     label: "Background",          kind: "color" },
    { key: "spacing",            label: "Item Spacing",        kind: "number" },
    { key: "padding",            label: "Inner Padding",       kind: "number" },
    { key: "showScrollbar",      label: "Show Scrollbar",      kind: "boolean" },
    { key: "scrollbarTrackTint", label: "Scrollbar Track",     kind: "color", visibleWhen: { key: "showScrollbar", value: true } },
    { key: "scrollbarThumbTint", label: "Scrollbar Thumb",     kind: "color", visibleWhen: { key: "showScrollbar", value: true } },
    { key: "scrollbarRoundness", label: "Scrollbar Roundness", kind: "slider", min: 0, max: 100, step: 1, unit: "%", visibleWhen: { key: "showScrollbar", value: true } },
  ],
  Tabs: [
    {
      key: "orientation",
      label: "Tab Strip",
      kind: "enum",
      options: ["Horizontal", "Vertical"],
    },
    { key: "activeTab",   label: "Active Tab",   kind: "number" },
    { key: "tabBarSize",  label: "Tab Bar Size", kind: "number" },
    { key: "tabSpacing",  label: "Tab Spacing",  kind: "number" },
    { key: "pagePadding", label: "Page Padding", kind: "number" },
    { key: "activeColor",   label: "Active Tab Color",   kind: "color" },
    { key: "inactiveColor", label: "Inactive Tab Color", kind: "color" },
    { key: "pageColor",     label: "Page Background",     kind: "color" },
    { key: "frameColor",    label: "Frame Color",         kind: "color" },
    { key: "labelColor",    label: "Label Color",         kind: "color" },
  ],
  // Markers — no editable fields (tabs are edited by clicking/arranging).
  TabButton: [],
  TabPage: [],
  // Spacer height is edited via a bespoke control (SpacerSection) that resizes
  // the slot's RectTransform, so no plain field descriptors here.
  Spacer: [],
};
