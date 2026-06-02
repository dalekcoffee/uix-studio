// Exports the slot tree as a Resonite-native .brson file (FrDT + Brotli-compressed BSON).
// Schema reverse-engineered from a real Resonite .brson BSON dump (2026.5.20.291).
// No external tools required — drag the exported .brson straight into Resonite.
import { serialize, Int32, Long } from "bson";
import brotliPromise from "brotli-wasm";

// Eagerly kick off WASM init so it's likely ready by the time the user clicks Export.
const brotliReady = brotliPromise;
import type { Slot, UixComponent, UixDocument } from "../model/types";
import { isStructuralSlot } from "../model/structural";
import { DEFAULT_CONTENT_PADDING, SCROLLBAR_GUTTER, resolvePad } from "../model/padding";
import { findBackgroundSlots } from "../model/background";
import { controlDisplayName } from "../model/controlName";
import { emitScrollbar } from "./scrollbarEmitter";

// FrDT header: magic "FrDT" + 4 null bytes + compression-type byte (3 = Brotli)
const FRDT_HEADER = new Uint8Array([0x46, 0x72, 0x44, 0x54, 0x00, 0x00, 0x00, 0x00, 0x03]);

// ── ID generator ─────────────────────────────────────────────────────────────

let _idCounter = 0;
function resetIds() { _idCounter = 0; }
function nextId(): string {
  return `${(_idCounter++).toString(16).padStart(8, "0")}-0000-0000-0000-000000000000`;
}

// ── Type registry ─────────────────────────────────────────────────────────────

const FULL_TYPE: Record<string, string> = {
  Grabbable: "[FrooxEngine]FrooxEngine.Grabbable",
  Canvas: "[FrooxEngine]FrooxEngine.UIX.Canvas",
  RectTransform: "[FrooxEngine]FrooxEngine.UIX.RectTransform",
  Image: "[FrooxEngine]FrooxEngine.UIX.Image",
  Text: "[FrooxEngine]FrooxEngine.UIX.Text",
  TextField: "[FrooxEngine]FrooxEngine.UIX.TextField",
  Button: "[FrooxEngine]FrooxEngine.UIX.Button",
  VerticalLayout: "[FrooxEngine]FrooxEngine.UIX.VerticalLayout",
  HorizontalLayout: "[FrooxEngine]FrooxEngine.UIX.HorizontalLayout",
  GridLayout: "[FrooxEngine]FrooxEngine.UIX.GridLayout",
  LayoutElement: "[FrooxEngine]FrooxEngine.UIX.LayoutElement",
  Mask: "[FrooxEngine]FrooxEngine.UIX.Mask",
  IgnoreLayout: "[FrooxEngine]FrooxEngine.UIX.IgnoreLayout",
  UI_UnlitMaterial: "[FrooxEngine]FrooxEngine.UI_UnlitMaterial",
  UI_TextUnlitMaterial: "[FrooxEngine]FrooxEngine.UI_TextUnlitMaterial",
  FontChain: "[FrooxEngine]FrooxEngine.FontChain",
  StaticFont: "[FrooxEngine]FrooxEngine.StaticFont",
  BoxCollider: "[FrooxEngine]FrooxEngine.BoxCollider",
  StaticTexture2D: "[FrooxEngine]FrooxEngine.StaticTexture2D",
  SpriteProvider: "[FrooxEngine]FrooxEngine.SpriteProvider",
  Hyperlink: "[FrooxEngine]FrooxEngine.Hyperlink",
  ButtonDestroy: "[FrooxEngine]FrooxEngine.ButtonDestroy",
  ButtonToggle:  "[FrooxEngine]FrooxEngine.ButtonToggle",
  QuadMesh: "[FrooxEngine]FrooxEngine.QuadMesh",
  MeshRenderer: "[FrooxEngine]FrooxEngine.MeshRenderer",
  UnlitMaterial: "[FrooxEngine]FrooxEngine.UnlitMaterial",
  SmoothValueColorX: "[FrooxEngine]FrooxEngine.SmoothValue<colorX>",
  ValueFieldBool: "[FrooxEngine]FrooxEngine.ValueField<bool>",
  Checkbox: "[FrooxEngine]FrooxEngine.UIX.Checkbox",
  BooleanValueDriverColorX: "[FrooxEngine]FrooxEngine.BooleanValueDriver<colorX>",
  BooleanValueDriverFloat2: "[FrooxEngine]FrooxEngine.BooleanValueDriver<float2>",
  ValueMultiDriverBool: "[FrooxEngine]FrooxEngine.ValueMultiDriver<bool>",
  SmoothValueFloat2: "[FrooxEngine]FrooxEngine.SmoothValue<float2>",
  SliderFloat: "[FrooxEngine]FrooxEngine.UIX.Slider<float>",
  TextEditor: "[FrooxEngine]FrooxEngine.TextEditor",
  ValueFieldInt:           "[FrooxEngine]FrooxEngine.ValueField<int>",
  // ValueField<float> — used as the user-drivable progress value on the
  // ProgressBar root, plus a constant "1" on the Fill child for the Y axis.
  // See the hasProgressBar branch in serializeSlot for the wiring pattern.
  ValueFieldFloat:         "[FrooxEngine]FrooxEngine.ValueField<float>",
  // Float2Driver — combines two float field references into a float2 and
  // writes it to a target float2 field every frame. Used on the ProgressBar
  // root to feed Fill.RT.AnchorMax = (progressValue, 1) so the end user
  // only has to drive a single float instead of a float2.
  Float2Driver:            "[FrooxEngine]FrooxEngine.Float2Driver",
  ButtonValueSetInt:       "[FrooxEngine]FrooxEngine.ButtonValueSet<int>",
  ButtonValueSetString:    "[FrooxEngine]FrooxEngine.ButtonValueSet<string>",
  ValueEqualityDriverInt:  "[FrooxEngine]FrooxEngine.ValueEqualityDriver<int>",
  // ReferenceField<IWorldElement> — generic storage component holding a
  // dropped IWorldElement reference. Paired with RefEditor (which registers
  // a sibling Button as the drop sink) on the same slot. See the
  // hasReferenceField branch in serializeSlot for the wiring.
  ReferenceFieldIWorldElement:      "[FrooxEngine]FrooxEngine.ReferenceField<[FrooxEngine]FrooxEngine.IWorldElement>",
  // ButtonReferenceSet<IWorldElement> — sibling-of-Button helper that writes
  // SetReference (typically null) into a target field UUID when the Button is
  // pressed. Used on the Reference Field's Clear button to null the stored
  // reference directly (more reliable than going through RefEditor.SetReference
  // via a ButtonRelay, which empirically did not fire).
  ButtonReferenceSetIWorldElement:  "[FrooxEngine]FrooxEngine.ButtonReferenceSet<[FrooxEngine]FrooxEngine.IWorldElement>",
  // RefEditor — FrooxEngine's "make this slot edit a reference" helper. Holds
  // three back-references (_targetRef, _textDrive, _button) and wires Resonite's
  // drop routing to the named Button. Replaces the older UIX.ReferenceReceiver
  // approach, which does not actually receive drops in current Resonite.
  RefEditor:                        "[FrooxEngine]FrooxEngine.RefEditor",
  // Spinner stack — UIX.OutlinedArc (procedural arc primitive) driven by two
  // ValueGradientDriver<float>s whose Progress fields are advanced by a small
  // ProtoFlux subtree (WorldTime → mul → mod → ValueFieldDrive<float>). See
  // SpinnerExample/_decoded.json for the captured pattern.
  OutlinedArc:               "[FrooxEngine]FrooxEngine.UIX.OutlinedArc",
  UI_CircleSegment:          "[FrooxEngine]FrooxEngine.UI_CircleSegment",
  ValueGradientDriverFloat:  "[FrooxEngine]FrooxEngine.ValueGradientDriver<float>",
  ValueCopyFloat:            "[FrooxEngine]FrooxEngine.ValueCopy<float>",
  FloatTextEditorParser:     "[FrooxEngine]FrooxEngine.FloatTextEditorParser",
  IntTextEditorParser:       "[FrooxEngine]FrooxEngine.IntTextEditorParser",
  // ── Exposed-value plumbing ("📚 Value" child slot per interactive control) ──
  // DynamicVariableSpace sits on the canvas slot so every exported value
  // variable binds by name; one DynamicValueVariable<T> per control holds the
  // exposed value, kept in sync with the control's real field by a ValueCopy<T>.
  // Field layouts verified verbatim against UIX Template/SpinnerExample/
  // _decoded.json (DynamicVariableSpace = Type 10, DynamicValueVariable<bool> =
  // Type 11, DynamicValueVariable<string> = Type 13, ValueCopy<float> = Type 27).
  DynamicVariableSpace:       "[FrooxEngine]FrooxEngine.DynamicVariableSpace",
  DynamicValueVariableBool:   "[FrooxEngine]FrooxEngine.DynamicValueVariable<bool>",
  DynamicValueVariableInt:    "[FrooxEngine]FrooxEngine.DynamicValueVariable<int>",
  DynamicValueVariableFloat:  "[FrooxEngine]FrooxEngine.DynamicValueVariable<float>",
  DynamicValueVariableString: "[FrooxEngine]FrooxEngine.DynamicValueVariable<string>",
  ValueCopyBool:             "[FrooxEngine]FrooxEngine.ValueCopy<bool>",
  ValueCopyInt:              "[FrooxEngine]FrooxEngine.ValueCopy<int>",
  ValueCopyString:           "[FrooxEngine]FrooxEngine.ValueCopy<string>",
  // Color picker plumbing. ButtonEditColorX (verified verbatim against UIX
  // Template/Preset Template 6: Target/_colorPicker/Continuous/Alpha/HDR) hooks
  // a slot's Button so clicking opens Resonite's native color picker, writing
  // the chosen colorX straight into the Target field (the swatch Image.Tint).
  // The exposed value mirrors that Tint into a DynamicValueVariable<colorX> via
  // a ValueCopy<colorX> (both types present in Template 6's Types registry).
  ButtonEditColorX:           "[FrooxEngine]FrooxEngine.ButtonEditColorX",
  DynamicValueVariableColorX: "[FrooxEngine]FrooxEngine.DynamicValueVariable<colorX>",
  ValueCopyColorX:            "[FrooxEngine]FrooxEngine.ValueCopy<colorX>",
  // Reference-field value output. ReferenceCopy<T> structure verified in dumps
  // (Rocker/Preset Template 7: Source/Target/WriteBack, exactly like ValueCopy).
  // DynamicReferenceVariable<T> is the reference analog of the verified
  // DynamicValueVariable<T> (Value→Reference); not in a dump but inferred from
  // the uniform FrooxEngine dynamic-variable shape — NEEDS VR CONFIRMATION.
  DynamicReferenceVariableIWorldElement: "[FrooxEngine]FrooxEngine.DynamicReferenceVariable<[FrooxEngine]FrooxEngine.IWorldElement>",
  ReferenceCopyIWorldElement:            "[FrooxEngine]FrooxEngine.ReferenceCopy<[FrooxEngine]FrooxEngine.IWorldElement>",
  // ProtoFlux node typenames (full classpath). The pattern is:
  //   WorldTimeFloat → ValueMul<float>(× speed) → ValueMod<float>(% wrap)
  //     → ValueFieldDrive<float>(Drive: gradientProgressFieldId)
  WorldTimeFloat:            "[ProtoFluxBindings]FrooxEngine.ProtoFlux.Runtimes.Execution.Nodes.FrooxEngine.Time.WorldTimeFloat",
  ValueFieldDriveFloat:      "[ProtoFluxBindings]FrooxEngine.FrooxEngine.ProtoFlux.CoreNodes.ValueFieldDrive<float>",
  FieldDriveBaseFloatProxy:  "[FrooxEngine]FrooxEngine.ProtoFlux.CoreNodes.FieldDriveBase<float>+Proxy",
  ValueModFloat:             "[ProtoFluxBindings]FrooxEngine.ProtoFlux.Runtimes.Execution.Nodes.Operators.ValueMod<float>",
  ValueInputFloat:           "[ProtoFluxBindings]FrooxEngine.ProtoFlux.Runtimes.Execution.Nodes.ValueInput<float>",
  ValueMulFloat:             "[ProtoFluxBindings]FrooxEngine.ProtoFlux.Runtimes.Execution.Nodes.Operators.ValueMul<float>",
  // ScrollArea components — UIX.ScrollRect handles the actual scroll
  // behavior (drag-to-pan, wheel input) and UIX.ContentSizeFitter auto-grows
  // the content slot to fit its children along the scrolling axis.
  ScrollRect:                "[FrooxEngine]FrooxEngine.UIX.ScrollRect",
  ContentSizeFitter:         "[FrooxEngine]FrooxEngine.UIX.ContentSizeFitter",
  // RectTransformComputedProperties — exposes a RectTransform's live computed
  // Rect (LocalComputeRect, an IValue<Rect>). The ported scrollbar's ProtoFlux
  // reads the Content's and viewport's LocalComputeRect to size/position the
  // handle. Must be emitted explicitly (with stable field IDs) on both slots —
  // if Resonite auto-added it on import the field IDs wouldn't match the graph.
  RectTransformComputedProperties: "[FrooxEngine]FrooxEngine.UIX.RectTransformComputedProperties",
};

// Resonite hosts these fonts in the cloud (resdb). The hash identifies content;
// using resdb:/// scheme tells Resonite to fetch from cloud if not locally cached.
// (@packdb:/// only works for assets already in the user's local packdb cache.)
// We ship a single bundled font (Noto Sans, hash 8c1dc004...) inside the .zip bundle.
// @packdb:///<hash> URLs only resolve if the asset is in the bundle's assetManifest.
// This is the MainFont (Latin/Greek/Cyrillic, ~630KB — no CJK glyphs).
const BUNDLED_FONT_URL =
  "@packdb:///8c1dc004996029f804283dd398ca2a05d4d33ebcba5c0d25ea13fd2026572279";

// FallbackFonts for the FontChain — Resonite's OWN shipped CJK / symbol / emoji
// fonts, captured from a live Resonite FontChain (see CLAUDE.md "Font assets").
// Referenced from the user's local resdb cache rather than bundled, so JP/KR/CN
// text renders without shipping multi-MB binaries in every export. The leading
// "@" marks the Uri "preserve across import" — the same rule that keeps @packdb
// bundles and @https hyperlinks from being null-coerced by Resonite's BSON-import
// security pass; a bare resdb:/// here would be nulled and the glyphs would vanish.
// Extensions (.ttf/.otf) are required for the fetch to resolve.
const CJK_FALLBACK_FONT_URLS = [
  "@resdb:///4cac521169034ddd416c6deffe2eb16234863761837df677a910697ec5babd25.ttf",
  "@resdb:///b4a1dfdbfa13b4755e5eac20cb25c1d17ed5a745ceb89639595e8cf45a2b1e07.ttf",
  "@resdb:///cd07743a4c93d8da929afdd28c1d368f11da478a1093146a13610081c2a58440.ttf",
  "@resdb:///bcda0bcc22bab28ea4fedae800bfbf9ec76d71cc3b9f851779a35b7e438a839d.otf",
  "@resdb:///9aee503e8c9126e238639973a7eb7830ae02b4aed2a8f453b0f86300c2b5a9af.ttf",
];

// Rounded-corner sprite (from Preset Template 2). A 9-slice white-mask PNG with
// soft rounded corners; tinted by each Image's Tint. Bundled when canvas.rounded.
const BUNDLED_SPRITE_URL =
  "@packdb:///bc05f293ccbf972aa17a93e7a379f28296124beeb4d8ebd1e66191d7119a6861";

// Back-panel branding image — the UIX Studio app logo, bundled so the back
// face of the imported panel reads "UIX Studio" instead of showing the old
// compass.jpeg orientation-test asset.
const BUNDLED_LOGO_URL =
  "@packdb:///75dc848ea37322f2d6ffa64565c0bd48662023dc3dca35b9eb891d89090d5e1a";

// UI icon sprites — small white-on-transparent PNGs used as Image sprites on
// header buttons and checkboxes. Each gets its own StaticTexture2D + a
// SpriteProvider on the canvas slot. Borders=[0,0,0,0] so 9-slice doesn't
// stretch the glyph; PreserveAspect on Images that use them.
// UIIcons/Help&Info.png — replaces the older line-art Question icon. Same
// useHelpIcon flag drives it; only the hash changed.
const BUNDLED_HELP_ICON_URL =
  "@packdb:///bbd7ddee64db15cae88246800434f81d41c99eb931e2cd6819f7f58f779f038a";
// UIIcons/Cancel.png — replaces the older CloseWindow.png. The PNG bakes in
// a soft red circle + white X, so close buttons read as destructive without
// extra tint work on the Image; pair with a #FF7676 button background for
// best contrast.
const BUNDLED_CLOSE_ICON_URL =
  "@packdb:///c0227d6bb40a93cc0eeaa46327b009d088e42dc5c457104393b95d9d2264c863";
const BUNDLED_CHECK_ICON_URL =
  "@packdb:///a06fe347c5d05a8e9c4db7f57953f4186bd4f402f4dac7090056537453fdae0c";
// Backspace icon (UIIcons/Backspace.png) — used by the Keypad preset's
// delete key. Same wiring shape as Help/Close/Check.
const BUNDLED_BACKSPACE_ICON_URL =
  "@packdb:///ffd79aad917edc57353d05e829ab35ac3b1f83205722302c87f03c3359cc7436";
// Spinner/loading icon (UIIcons/progress_activity.png).
const BUNDLED_SPINNER_ICON_URL =
  "@packdb:///bb9de64e158db9afc27101136bb146049a0e44edf3a9a5d4714e21f2b969583e";
// OpenArrow / Clear icons — used on the Reference Field's Inspector and
// Clear buttons (Unicode glyphs aren't in the bundled Noto Sans font, so
// the text approach rendered blank).
const BUNDLED_OPENARROW_ICON_URL =
  "@packdb:///2781fa55bc5fdf45b34e9c2dd9f109ea8797857478fccb492369032a3db8030a";
const BUNDLED_CLEAR_ICON_URL =
  "@packdb:///b066141720509dd4323139facf84fcc7e6d76f07528b0aa02e81f0143e42c9a4";
// Placeholder image — split into TWO baked sprites (scripts/gen-placeholder2.ps1):
//   • BACKGROUND: 45° hatch + dashed border, NO icon. Exported with
//     PreserveAspect=false so it STRETCHES to fill any rect (matches the editor
//     preview, which draws the hatch box filling the whole element).
//   • ICON: the image/mountain glyph on a SQUARE canvas. Emitted as a centered
//     CHILD Image with PreserveAspect=true so the glyph keeps its aspect (never
//     stretches) regardless of the slot's shape.
// Both baked WHITE/grayscale so export can TINT them with the theme's bodyTextColor.
const BUNDLED_IMAGE_PLACEHOLDER_URL =
  "@packdb:///e38064f93c6984cc88189db8a41566bf064f83001ef1630917193551eda9358a";
const BUNDLED_IMAGE_ICON_URL =
  "@packdb:///9a61203b3a3b092cbbcc14dc3bfd008c7188b389e7acec600ea3132177306ffe";

// Dedicated pill sprite (extracted from UIX Template/Rocker 2). The texture
// is a 4-quadrant quarter-circle layout designed for Borders=0.5 — the entire
// texture is corner, no middle stretch. Paired with NineSliceSizing=RectHeight
// on the Image, this produces a true pill at any rect size.
const BUNDLED_PILL_SPRITE_URL =
  "@packdb:///cb7ba11c8a391d6c8b4b5c5122684888a6a719179996e88c954a49b6b031a845";

// Back-side credits text — a single pre-rasterized PNG containing
// "Made with UIX Studio    by Dalek" on transparent background. Paired with
// a small UIX Studio logo to its left and one wrapping BoxCollider + Hyperlink
// that takes click anywhere on the row to uix.dalek.coffee.
const BUNDLED_CREDITS_TEXT_URL =
  "@packdb:///b97bbd70290cd774c5c5524956b39a1c47db1900c5cfa724ae1bb11bf6a49595";
// Aspect ratio of the source PNG (1280×224 — "Made with UIX Studio", no
// "by Dalek" suffix). QuadMesh.Size = [aspect, 1] so the texture renders at
// its natural proportions.
const CREDITS_TEXT_ASPECT = 1280 / 224;

// Aspect (w/h) of the credits backdrop quad (see buildCreditsBanner's backdrop
// size: [logoSize+gap+textAspect+0.8, max(logoSize,1)+0.6]). Exported so the
// bundler can bake the rounded-rect mask at the matching aspect (no distortion).
// Keep in sync with those literals.
export const CREDITS_BACKDROP_ASPECT = (1.2 + 0.3 + CREDITS_TEXT_ASPECT + 0.8) / (Math.max(1.2, 1) + 0.6);

const TYPE_VERSIONS: Record<string, number> = {
  "[FrooxEngine]FrooxEngine.Grabbable": 2,
  "[FrooxEngine]FrooxEngine.UIX.Canvas": 2,
  "[FrooxEngine]FrooxEngine.UIX.RectTransform": 1,
  "[FrooxEngine]FrooxEngine.UIX.Image": 1,
  "[FrooxEngine]FrooxEngine.UIX.Text": 1,
  "[FrooxEngine]FrooxEngine.UIX.TextField": 1,
  "[FrooxEngine]FrooxEngine.UI_UnlitMaterial": 2,
  "[FrooxEngine]FrooxEngine.BoxCollider": 1,
  "[FrooxEngine]FrooxEngine.QuadMesh": 1,
  "[FrooxEngine]FrooxEngine.UIX.Slider<float>": 1,
  "[FrooxEngine]FrooxEngine.UIX.ScrollRect": 1,
  "[FrooxEngine]FrooxEngine.IntTextEditorParser": 1,
};

let _typeRegistry: string[] = [];
let _typeIndexMap: Map<string, number> = new Map();
function resetTypes() { _typeRegistry = []; _typeIndexMap = new Map(); }
function typeIndex(shortName: string): Int32 {
  const full = FULL_TYPE[shortName] ?? shortName;
  if (!_typeIndexMap.has(full)) {
    _typeIndexMap.set(full, _typeRegistry.length);
    _typeRegistry.push(full);
  }
  return new Int32(_typeIndexMap.get(full)!);
}

// ── Shared asset IDs (set during buildSharedAssets, consumed by compText) ──

let _txtMatId = "";
let _backTxtMatId = "";  // UI_TextUnlitMaterial w/ Sidedness=Back (for back-panel text)
let _fontTxtMatId = "";  // UI_TextUnlitMaterial w/ Sidedness=Front + offset (for rotated back-facing text)
let _fontChainId = "";
let _backMatId = "";
let _frontBackingMatId = ""; // UI_UnlitMaterial w/ Sidedness=Front + positive offset — solid backdrop visible from the front, sitting BEHIND the regular UI Images. Used by a sibling slot to BackCover so the front panel is fully opaque even with the rounded sprite's anti-aliased middle.
let _frontFacingMatId = ""; // UI_UnlitMaterial w/ Sidedness=Front + offset (for rotated back-facing images)
let _textureId = "";   // legacy rounded-sprite StaticTexture2D ID (canvas.rounded only)
let _logoTextureId = "";  // logo PNG StaticTexture2D ID (always bundled)
let _logoSpriteId = "";   // logo SpriteProvider component ID (on canvas slot)
let _helpTexId = "";    let _helpSpriteId = "";   // help icon  (top-left header button)
let _closeTexId = "";   let _closeSpriteId = "";  // close icon (top-right header button)
let _checkTexId = "";   let _checkSpriteId = "";  // check icon (checkbox)
let _backspaceTexId = ""; let _backspaceSpriteId = ""; // backspace icon (keypad delete key)
let _spinnerTexId  = ""; let _spinnerSpriteId  = ""; // spinner/loading icon
let _openArrowTexId = ""; let _openArrowSpriteId = ""; // open-inspector arrow icon (Reference Field)
let _clearIconTexId = ""; let _clearIconSpriteId = ""; // clear / cancel icon (Reference Field)
let _pillTexId = "";    let _pillSpriteId = "";   // pill background (toggle/rocker)
let _imagePlaceholderTexId = ""; let _imagePlaceholderSpriteId = ""; // placeholder hatch background
let _imageIconTexId = ""; let _imageIconSpriteId = ""; // placeholder centered glyph (aspect-locked child)
// UI_CircleSegment material used by every UIX.OutlinedArc emitted for spinners.
// Bundled lazily — only when at least one slot uses the spinner pattern, since
// the material is unique to procedural arc rendering.
let _circleSegmentMatId = "";
// Set during serializeSlot when a slot carrying the KeypadDisplay marker is
// built — holds the UUID of that slot's Text.Content field so subsequent
// KeypadKey buttons can wire their ButtonValueSet<string> to write into it.
// Cleared each export; only the most-recent display is targeted, which is
// fine for V1 (one keypad per panel).
let _keypadDisplayContentId: string = "";
// True when a KeypadDisplay slot was found but its Text lives on a child slot
// (the "one Graphic per slot" fix moves Text to a child "Label"). The first
// child slot that has a Text component will stash its content UUID and clear
// this flag.
let _keypadDisplayChildPending = false;
// User-uploaded custom images. Each distinct hash referenced by any Image in
// the document gets one StaticTexture2D in the Assets array and one
// SpriteProvider component on the canvas slot; compImage routes by hash.
let _customTexIds:    Map<string, string> = new Map();
let _customSpriteIds: Map<string, string> = new Map();

// Knob-to-parent metadata channel: when a Knob slot is serialized, its two
// BooleanValueDriver<float2> State field IDs land here so the parent Toggle's
// serializer can wire its ValueMultiDriver<bool>.Drives list to them. Set
// during the knob's serializeSlot, read immediately after by the parent.
let _lastKnobAStateId = "";
let _lastKnobBStateId = "";

// Radio group registry — the shared ValueField<int>.Value field ID per groupId,
// keyed by the user-supplied Radio.groupId string. First radio scanned for a
// given groupId creates the ValueField<int> on its own slot and seeds this
// map; subsequent radios reference the same field ID for their
// ButtonValueSet<int>.TargetValue and ValueEqualityDriver<int>.Target.
let _radioGroupFieldIds: Map<string, string> = new Map();

// Tabs state. Pre-allocated at the top of exportBrsonFile (allocateTabsIds),
// mirroring _popupActiveIds: a Tabs host serializes BEFORE its page children,
// yet its ValueEqualityDriver<int>s must reference each page slot's Active
// field — so those Active field UUIDs are pre-allocated here and the page's
// slot wrapper reuses its UUID (instead of nextId()) for Active.
//   _tabPageActiveIds      pageSlotId   → pre-allocated Active field UUID
//   _tabPageInfo           pageSlotId   → { positional index, initial active }
//   _tabButtonInfo         buttonSlotId → host id + index + initial active + colors
//   _tabsSharedFieldByHost hostSlotId   → the shared ValueField<int>.Value id
//                                         (populated when the host serializes;
//                                          read by its buttons, which serialize
//                                          after it)
interface TabRGBA { r: number; g: number; b: number; a: number }
let _tabPageActiveIds: Map<string, string> = new Map();
let _tabPageInfo: Map<string, { index: number; active: boolean }> = new Map();
let _tabButtonInfo: Map<
  string,
  { hostId: string; index: number; active: boolean; activeColor: TabRGBA; inactiveColor: TabRGBA }
> = new Map();
let _tabsSharedFieldByHost: Map<string, string> = new Map();

// Pre-computed pixel rect sizes per slot id, populated once at the top of
// exportBrsonFile. Sized via static RectTransform math (anchors + offsets,
// ignoring layout containers). Used to auto-size BoxColliders injected by the
// Image.hyperlinkUrl convenience prop. Falls back to 100×100 if the slot's
// rect can't be derived (e.g. nested under unknown parent).
let _slotRectSizes: Map<string, { w: number; h: number }> = new Map();

// The pill SpriteProvider FixedSize the Background/Front Backing use, so any
// Image flagged `matchPanelCorners` can round its panel-edge corners to the
// SAME absolute radius as the panel rather than one proportional to its own
// (smaller) size — e.g. a full-width header bar whose own height would
// otherwise give a much tighter corner. 0 = panel isn't rounded. Computed at
// export from the Front Backing's cornerRadius and the canvas size.
let _panelCornerFixedSizePx = 0;

// Pre-allocated Active-field UUIDs for popup spawn-window modals. Keyed by
// the popup-host slot id (e.g. the help icon). When a host slot is serialized
// the exporter emits a ButtonToggle targeting this UUID; when the modal slot
// itself is later built, it uses this UUID as its Active field ID. Allocated
// at the top of exportBrsonFile *before* any tree serialization so the ID is
// stable across the two write sites. See `buildPopupModal`.
let _popupActiveIds: Map<string, string> = new Map();

// Theme reference set at the top of exportBrsonFile. The generated popup
// modal sub-trees (Card / Title / Body / OK button) are built on the fly
// from this state — they aren't part of the user's doc.root, so the regular
// theme-apply pipeline never touches them. Reading the theme here lets the
// modal pick up the user's chosen surface / text / accent colors instead of
// the hardcoded dark-grey + blue defaults from the old design.
let _exportTheme: import("../model/theme").Theme | null = null;

// Canvas.contentPadding for this export. Read once in exportBrsonFile; nested
// container padding fields left at the -1 "auto" sentinel inherit half of it
// (see resolvePad). Body-content side margins are already baked into each
// element's RectTransform (store.setContentPadding), so this value only feeds
// the nested-container inheritance — not a second outer inset.
let _canvasContentPadding = DEFAULT_CONTENT_PADDING;

// Dropdown spawn-window state. Same shape as `_popupActiveIds` but tracks
// dropdown trigger slots specifically — we keep them separate so the modal
// builder knows which popup style to assemble (info dialog vs. option list).
//   _dropdownActiveIds      — pre-allocated modal Active-field UUID (one per
//                             dropdown trigger), so the trigger's ButtonToggle
//                             and the modal slot's Active.ID match.
//   _dropdownValueFieldIds  — populated AFTER trigger serialization with the
//                             UUID of the ValueField<int>'s Value field; each
//                             option button's ButtonValueSet<int> targets it.
//   _dropdownTextContentIds — populated AFTER trigger serialization with the
//                             UUID of the synthetic Label child's Text.Content
//                             field; each option button's ButtonValueSet<string>
//                             targets it so the trigger label updates on click.
let _dropdownActiveIds: Map<string, string> = new Map();
let _dropdownValueFieldIds: Map<string, string> = new Map();
let _dropdownTextContentIds: Map<string, string> = new Map();

// Per-Image extras the dispatcher (compImage) wants appended to the current
// slot's component list — used to inject a one-off SpriteProvider per Image
// when `Image.cornerRadius` is an intermediate value (0<r<100, FixedSize
// sizing). serializeSlot saves/restores this stack-style so each slot collects
// only its own extras.
let _pendingImageExtras: Array<{ Type: Int32; Data: Record<string, unknown> }> = [];
// Pixel rect of the slot whose Image is currently being built. Set by
// serializeSlot (and synthetic builders) right before calling compImage so the
// intermediate-cornerRadius path can bake FixedSize = (cr/100) × min(w,h)/2.
// Null → fall back to the runtime-proportional RectHeight pill for any non-zero
// radius (no static rect available).
let _currentImageRect: { w: number; h: number } | null = null;
let _backLogoMatId = "";  // 3D UnlitMaterial (Sidedness=Front) for the back-panel QuadMesh logo
// User-configurable hyperlink wired into the back logo slot when set on the
// canvas component. Populated at the top of `exportBrsonFile` and consumed by
// `buildBackLogoSlot`. Empty URL → no collider/hyperlink emitted.
let _backLogoHyperlinkUrl = "";
let _backLogoHyperlinkReason = "";
let _badgeLogoMatId = ""; // 3D UnlitMaterial for the small UIX Studio logo in the bottom-left credits corner — always uses the default logo texture, never the user's override
// 3D UnlitMaterial for the combined "Made with UIX Studio  by Dalek" text PNG.
let _creditsTextMatId = "";
// 3D UnlitMaterial (Sidedness=Front, dark semi-opaque, no texture) drawn behind
// the credits banner so the logo/text stay readable over a custom back image.
// Only built + referenced when the Back Cover carries a custom background.
let _creditsBackdropMatId = "";
let _backHasCustomImage = false;
// When set (by the bundler, for rounded panels), the credits backdrop material
// uses this @packdb texture (a baked rounded-rect alpha mask) so its corners
// round; empty → a square textureless quad.
let _creditsBackdropTexHash = "";

// ── Field helpers ─────────────────────────────────────────────────────────────

type BsonVal = string | number | boolean | null | Int32 | Long | unknown[] | Record<string, unknown>;

function fd(data: BsonVal) { return { ID: nextId(), Data: data }; }
function fi(data: number) { return { ID: nextId(), Data: new Int32(data) }; }

function colorArr(c: { r: number; g: number; b: number; a: number }): unknown[] {
  return [c.r, c.g, c.b, c.a, "sRGB"];
}
function vec2(v: { x: number; y: number }): unknown[] { return [v.x, v.y]; }
function vec3(x: number, y: number, z: number): unknown[] { return [x, y, z]; }
function vec4(x: number, y: number, z: number, w: number): unknown[] { return [x, y, z, w]; }

// ── Component data builders ───────────────────────────────────────────────────

function baseComp(updateOrder = 0) {
  return {
    ID: nextId(),
    "persistent-ID": nextId(),
    UpdateOrder: fi(updateOrder),
    Enabled: fd(true),
  };
}

// Assets use { persistent: {ID, Data} } instead of "persistent-ID" string
function baseAssetComp(persistent = false) {
  return {
    ID: nextId(),
    persistent: { ID: nextId(), Data: persistent },
    UpdateOrder: fi(0),
    Enabled: fd(true),
    HighPriorityIntegration: fd(false),
  };
}

// StaticFont has NO HighPriorityIntegration — including it makes Resonite reject the asset.
function baseStaticFontComp() {
  return {
    ID: nextId(),
    persistent: { ID: nextId(), Data: true },
    UpdateOrder: fi(0),
    Enabled: fd(true),
  };
}

// StaticTexture2D for the rounded-corner sprite — structure matches Preset Template 2's.
// No HighPriorityIntegration field (like StaticFont).
function compStaticTexture2D(url: string): Record<string, unknown> {
  return {
    ID: nextId(),
    persistent: { ID: nextId(), Data: true },
    UpdateOrder: fi(0),
    Enabled: fd(true),
    URL: fd(url),
    FilterMode: fd(null),
    AnisotropicLevel: fd(null),
    Uncompressed: fd(false),
    DirectLoad: fd(false),
    ForceExactVariant: fd(false),
    PreferredFormat: fd(null),
    PreferredProfile: fd("sRGBAlpha"),
    MipMapBias: fd(0),
    IsNormalMap: fd(false),
    WrapModeU: fd("Repeat"),
    WrapModeV: fd("Repeat"),
    PowerOfTwoAlignThreshold: fd(0.05),
    CrunchCompressed: fd(true),
    MinSize: fd(null),
    MaxSize: fd(null),
    MipMaps: fd(true),
    KeepOriginalMipMaps: fd(false),
    MipMapFilter: fd("Box"),
    Readable: fd(false),
  };
}

// SpriteProvider — sits on the canvas slot as a component, referenced by each
// Image's Sprite field. Default borders are tuned for the rounded-corner UI
// sprite; for raw icons pass `borders=[0,0,0,0]` to disable 9-slicing.
function compSpriteProvider(
  textureId: string,
  borders: [number, number, number, number] = [0.25, 0.25, 0.25, 0.25],
  scale = 0.2681618928909302,
  fixedSize = 8.824231147766113,
): Record<string, unknown> {
  return {
    ...baseComp(),
    Texture: fd(textureId),
    Rect: fd({ X: 0, Y: 0, Width: 1, Height: 1 }),
    Borders: fd(borders),
    Scale: fd(scale),
    FixedSize: fd(fixedSize),
  };
}

/**
 * Walk the slot tree and return the unique set of `Image.customImageHash`
 * values referenced anywhere in the document. Each one will need its own
 * StaticTexture2D asset and SpriteProvider component, plus the corresponding
 * bytes bundled into the .resonitepackage zip.
 */
export function collectCustomImageHashes(root: import("../model/types").Slot): string[] {
  const seen = new Set<string>();
  function walk(slot: import("../model/types").Slot) {
    for (const c of slot.components) {
      if (c.type === "Image") {
        const h = (c.props as { customImageHash?: string }).customImageHash;
        if (h && h.trim().length === 64) seen.add(h);
      }
      // Canvas's optional custom back-logo image — bundled the same way as
      // Image custom uploads so its bytes ride along in the .resonitepackage.
      if (c.type === "Canvas") {
        const h = (c.props as { backLogoCustomHash?: string }).backLogoCustomHash;
        if (h && h.trim().length === 64) seen.add(h);
      }
    }
    for (const child of slot.children) walk(child);
  }
  walk(root);
  return [...seen];
}

// Walk the tree looking for a slot with the given id and return its Popup
// component's props. Used by buildRootWrapper when it materializes the
// modal — it needs the title/body/dismissLabel that were authored on the
// original popup-host slot.
function findPopupPropsForSlotId(
  slot: import("../model/types").Slot,
  targetId: string,
): { title?: string; body?: string; dismissLabel?: string } | null {
  if (slot.id === targetId) {
    const popupComp = slot.components.find((c) => c.type === "Popup");
    if (popupComp) return popupComp.props as { title?: string; body?: string; dismissLabel?: string };
  }
  for (const child of slot.children) {
    const r = findPopupPropsForSlotId(child, targetId);
    if (r) return r;
  }
  return null;
}

// Resolve the editable PopupContent card linked to a popup-host slot, if any.
// The host's Popup.contentSlotId points at a PopupContent slot elsewhere in the
// tree (a direct Canvas-root child). Returns null for legacy/un-edited popups
// (which fall back to the synthesized title/body/dismiss modal).
function findSlotByIdM(
  slot: import("../model/types").Slot,
  id: string,
): import("../model/types").Slot | null {
  if (slot.id === id) return slot;
  for (const child of slot.children) {
    const r = findSlotByIdM(child, id);
    if (r) return r;
  }
  return null;
}
function findPopupContentSlot(
  canvasSlot: import("../model/types").Slot,
  hostSlotId: string,
): import("../model/types").Slot | null {
  const host = findSlotByIdM(canvasSlot, hostSlotId);
  const popup = host?.components.find((c) => c.type === "Popup");
  const cid = (popup?.props as { contentSlotId?: string } | undefined)?.contentSlotId;
  if (!cid) return null;
  const content = findSlotByIdM(canvasSlot, cid);
  if (!content || !content.components.some((c) => c.type === "PopupContent")) return null;
  return content;
}

function findDropdownPropsForSlotId(
  slot: import("../model/types").Slot,
  targetId: string,
): Record<string, unknown> | null {
  if (slot.id === targetId) {
    const c = slot.components.find((c) => c.type === "Dropdown");
    if (c) return c.props as Record<string, unknown>;
  }
  for (const child of slot.children) {
    const r = findDropdownPropsForSlotId(child, targetId);
    if (r) return r;
  }
  return null;
}

function findSlotNameById(
  slot: import("../model/types").Slot,
  targetId: string,
): string | null {
  if (slot.id === targetId) return slot.name;
  for (const child of slot.children) {
    const r = findSlotNameById(child, targetId);
    if (r !== null) return r;
  }
  return null;
}

// Pre-walks the slot tree starting at the canvas (using its sizeX/sizeY as
// the initial parent rect) and stamps each slot's pixel size into
// `_slotRectSizes`. Sizing follows the same anchor+offset math the editor's
// rectTransform.ts uses; layout containers (Horizontal/Vertical/Grid) that
// re-position children at runtime are ignored — the static authored RT is
// "close enough" for auto-sizing a Hyperlink BoxCollider.
function computeSlotRectSizes(canvas: import("../model/types").Slot): void {
  _slotRectSizes = new Map();
  const canvasComp = canvas.components.find((c) => c.type === "Canvas");
  const canvasW = (canvasComp?.props as { sizeX?: number } | undefined)?.sizeX ?? 800;
  const canvasH = (canvasComp?.props as { sizeY?: number } | undefined)?.sizeY ?? 600;

  function walk(slot: import("../model/types").Slot, parentW: number, parentH: number) {
    const rt = slot.components.find((c) => c.type === "RectTransform");
    let w = parentW;
    let h = parentH;
    if (rt) {
      const p = rt.props as {
        anchorMin?: { x: number; y: number };
        anchorMax?: { x: number; y: number };
        offsetMin?: { x: number; y: number };
        offsetMax?: { x: number; y: number };
      };
      const amin = p.anchorMin ?? { x: 0, y: 0 };
      const amax = p.anchorMax ?? { x: 1, y: 1 };
      const omin = p.offsetMin ?? { x: 0, y: 0 };
      const omax = p.offsetMax ?? { x: 0, y: 0 };
      w = Math.max(0, (amax.x - amin.x) * parentW + (omax.x - omin.x));
      h = Math.max(0, (amax.y - amin.y) * parentH + (omax.y - omin.y));
    }
    _slotRectSizes.set(slot.id, { w, h });
    for (const child of slot.children) walk(child, w, h);
  }
  // Canvas slot itself is the root for size — its rect IS its pixel dims.
  _slotRectSizes.set(canvas.id, { w: canvasW, h: canvasH });
  for (const child of canvas.children) walk(child, canvasW, canvasH);
}

// Walks the slot tree from the canvas down, computing each slot's full rect
// (left/bottom/right/top in canvas-relative Y-UP pixel coordinates) by
// applying RectTransform anchors+offsets at each level. Returns the rect of
// the slot whose ID matches `targetId`, or null if not found. Used by the
// inline Dropdown menu builder to place the menu directly below its trigger
// in canvas space — we need the trigger's actual position, not just size.
function computeCanvasRelativeRectFor(
  canvas: import("../model/types").Slot,
  targetId: string,
): { left: number; bottom: number; right: number; top: number } | null {
  const canvasComp = canvas.components.find((c) => c.type === "Canvas");
  const canvasW = (canvasComp?.props as { sizeX?: number } | undefined)?.sizeX ?? 800;
  const canvasH = (canvasComp?.props as { sizeY?: number } | undefined)?.sizeY ?? 600;

  function walk(
    slot: import("../model/types").Slot,
    parent: { left: number; bottom: number; right: number; top: number },
  ): { left: number; bottom: number; right: number; top: number } | null {
    const rt = slot.components.find((c) => c.type === "RectTransform");
    let rect = parent;
    if (rt && slot !== canvas) {
      const p = rt.props as {
        anchorMin?: { x: number; y: number };
        anchorMax?: { x: number; y: number };
        offsetMin?: { x: number; y: number };
        offsetMax?: { x: number; y: number };
      };
      const amin = p.anchorMin ?? { x: 0, y: 0 };
      const amax = p.anchorMax ?? { x: 1, y: 1 };
      const omin = p.offsetMin ?? { x: 0, y: 0 };
      const omax = p.offsetMax ?? { x: 0, y: 0 };
      const pw = parent.right - parent.left;
      const ph = parent.top   - parent.bottom;
      rect = {
        left:   parent.left   + amin.x * pw + omin.x,
        bottom: parent.bottom + amin.y * ph + omin.y,
        right:  parent.left   + amax.x * pw + omax.x,
        top:    parent.bottom + amax.y * ph + omax.y,
      };
    }
    if (slot.id === targetId) return rect;
    for (const child of slot.children) {
      const r = walk(child, rect);
      if (r) return r;
    }
    return null;
  }
  return walk(canvas, { left: 0, bottom: 0, right: canvasW, top: canvasH });
}

/** Extracts the optional user-set back-logo hash from the canvas component
 * tree, or "" if none. Used by exportBundle/exportBrson to swap the default
 * UIX Studio back logo for a user-uploaded image. */
export function getCanvasBackLogoHash(root: import("../model/types").Slot): string {
  const c = root.components.find((c) => c.type === "Canvas");
  if (!c) return "";
  const h = (c.props as { backLogoCustomHash?: string }).backLogoCustomHash;
  return typeof h === "string" && h.trim().length === 64 ? h : "";
}

function buildSharedAssets(rounded = true, customHashes: string[] = [], backLogoHash: string = ""): Array<{ Type: Int32; Data: Record<string, unknown> }> {
  // Foreground Images use Material: null (Resonite default) — sharing one
  // bundled material caused Z-fighting. ONE custom material is bundled below:
  // a back-face-only material for the panel's back cover (visible only when
  // viewed from behind), matching Preset Template's "Backing" pattern.
  const backMatData: Record<string, unknown> = {
    ...baseAssetComp(false),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
    RenderQueue: fi(-1),
    "_shader-ID": nextId(),
    Texture: fd(null),
    TextureScale: fd([1, 1]),
    TextureOffset: fd([0, 0]),
    Tint: fd([1, 1, 1, 1, "sRGBAlpha"]),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.5, "sRGBAlpha"]),
    AlphaCutoff: fd(0.5),
    AlphaClip: fd(true),
    TextureMode: fd("DirectColor"),
    MaskTexture: fd(null),
    MaskScale: fd([1, 1]),
    MaskOffset: fd([0, 0]),
    MaskMode: fd("MultiplyAlpha"),
    BlendMode: fd("Alpha"),
    // Back-only material: renders ONLY when viewed from behind. Paired with a
    // negative polygon offset that pulls it CLOSER to the back-side viewer
    // than the canvas's default-material UI back-faces (at OffsetFactor=1,
    // OffsetUnits=100), so the BackCover slot sits IN FRONT of the mirrored
    // UI when seen from the rear and produces a clean dark backdrop with the
    // bundled logo on top instead of see-through mirrored widgets.
    Sidedness: fd("Back"),
    ZWrite: fd("On"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(-1),
    OffsetUnits: fd(100),
  };
  _backMatId = backMatData.ID as string;

  // Front-only solid backing material — mirrors the back material but with
  // Sidedness="Front" and a POSITIVE polygon offset that pushes it BEHIND the
  // canvas's UI Images. A second sibling slot under Background uses this
  // material so the front view also gets a fully-opaque backdrop, closing the
  // residual alpha holes from the anti-aliased middle texel of the rounded
  // sprite without covering up the front widgets.
  const frontBackingMatData: Record<string, unknown> = {
    ...baseAssetComp(false),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
    RenderQueue: fi(-1),
    "_shader-ID": nextId(),
    Texture: fd(null),
    TextureScale: fd([1, 1]),
    TextureOffset: fd([0, 0]),
    Tint: fd([1, 1, 1, 1, "sRGBAlpha"]),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.5, "sRGBAlpha"]),
    AlphaCutoff: fd(0.5),
    AlphaClip: fd(true),
    TextureMode: fd("DirectColor"),
    MaskTexture: fd(null),
    MaskScale: fd([1, 1]),
    MaskOffset: fd([0, 0]),
    MaskMode: fd("MultiplyAlpha"),
    BlendMode: fd("Alpha"),
    Sidedness: fd("Front"),
    ZWrite: fd("On"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(2),
    OffsetUnits: fd(200),
  };
  _frontBackingMatId = frontBackingMatData.ID as string;

  // UI_TextUnlitMaterial — field order matches Fixed Export. Render fields
  // (RenderQueue, Rect, Stencil*) come AT THE END here, opposite of UI_UnlitMaterial.
  const txtMatData: Record<string, unknown> = {
    ...baseAssetComp(true),
    "_shader-ID": nextId(),
    FontAtlas: fd(null),
    TintColor: fd([1, 1, 1, 1, "sRGBAlpha"]),
    OutlineColor: fd([0, 0, 0, 1, "sRGBAlpha"]),
    BackgroundColor: fd([0, 0, 0, 1, "sRGBAlpha"]),
    AutoBackgroundColor: fd(true),
    GlyphRenderMethod: fd("MSDF"),
    PixelRange: fi(4),
    FaceDilate: fd(0),
    OutlineThickness: fd(0),
    FaceSoftness: fd(0),
    BlendMode: fd("Alpha"),
    Sidedness: fd("Double"),
    ZWrite: fd("Auto"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(0),
    OffsetUnits: fd(0),
    RenderQueue: fi(-1),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.5, "sRGBAlpha"]),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
  };
  _txtMatId = txtMatData.ID as string;

  // Same as txtMatData but Sidedness=Back + OffsetFactor=-1 — for text painted
  // on the back of the panel (only visible from behind, like the back panel).
  const backTxtMatData: Record<string, unknown> = {
    ...baseAssetComp(true),
    "_shader-ID": nextId(),
    FontAtlas: fd(null),
    TintColor: fd([1, 1, 1, 1, "sRGBAlpha"]),
    OutlineColor: fd([0, 0, 0, 1, "sRGBAlpha"]),
    BackgroundColor: fd([0, 0, 0, 1, "sRGBAlpha"]),
    AutoBackgroundColor: fd(true),
    GlyphRenderMethod: fd("MSDF"),
    PixelRange: fi(4),
    FaceDilate: fd(0),
    OutlineThickness: fd(0),
    FaceSoftness: fd(0),
    BlendMode: fd("Alpha"),
    Sidedness: fd("Back"),
    ZWrite: fd("Auto"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(-1),
    OffsetUnits: fd(0),
    RenderQueue: fi(-1),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.5, "sRGBAlpha"]),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
  };
  _backTxtMatId = backTxtMatData.ID as string;

  // Front-facing image material for back-panel branding that's been rotated 180°
  // around Y. Sidedness="Front" so the (now-rear-facing) quad only renders to
  // the back viewer; OffsetFactor=-2 pushes ahead of the Sidedness="Back" panel
  // material (which uses -1) so they don't Z-fight.
  const frontFacingMatData: Record<string, unknown> = {
    ...baseAssetComp(false),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
    RenderQueue: fi(-1),
    "_shader-ID": nextId(),
    Texture: fd(null),
    TextureScale: fd([1, 1]),
    TextureOffset: fd([0, 0]),
    Tint: fd([1, 1, 1, 1, "sRGBAlpha"]),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.5, "sRGBAlpha"]),
    AlphaCutoff: fd(0.5),
    AlphaClip: fd(true),
    TextureMode: fd("DirectColor"),
    MaskTexture: fd(null),
    MaskScale: fd([1, 1]),
    MaskOffset: fd([0, 0]),
    MaskMode: fd("MultiplyAlpha"),
    BlendMode: fd("Alpha"),
    Sidedness: fd("Front"),
    ZWrite: fd("On"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(-2),
    OffsetUnits: fd(100),
  };
  _frontFacingMatId = frontFacingMatData.ID as string;

  // Same idea for text — rotated back-panel labels that should read correctly.
  const fontTxtMatData: Record<string, unknown> = {
    ...baseAssetComp(true),
    "_shader-ID": nextId(),
    FontAtlas: fd(null),
    TintColor: fd([1, 1, 1, 1, "sRGBAlpha"]),
    OutlineColor: fd([0, 0, 0, 1, "sRGBAlpha"]),
    BackgroundColor: fd([0, 0, 0, 1, "sRGBAlpha"]),
    AutoBackgroundColor: fd(true),
    GlyphRenderMethod: fd("MSDF"),
    PixelRange: fi(4),
    FaceDilate: fd(0),
    OutlineThickness: fd(0),
    FaceSoftness: fd(0),
    BlendMode: fd("Alpha"),
    Sidedness: fd("Front"),
    ZWrite: fd("Auto"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(-2),
    OffsetUnits: fd(0),
    RenderQueue: fi(-1),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.5, "sRGBAlpha"]),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
  };
  _fontTxtMatId = fontTxtMatData.ID as string;

  // One StaticFont per glyph source. MainFont = the bundled Latin Noto Sans
  // (@packdb, inside the .zip). FallbackFonts = Resonite's own CJK/symbol/emoji
  // fonts via @resdb (resolved from the user's local cache). Previously every
  // fallback pointed back at the Latin font, so any JP/KR/CN text imported as
  // tofu boxes — this is the fix for that. Same glyph-render config for all
  // (Padding/PixelRange/GlyphEmSize/MipMaps), only the URL differs.
  const makeStaticFont = (url: string): Record<string, unknown> => ({
    ...baseStaticFontComp(),
    URL: fd(url),
    Padding: fi(1),
    PixelRange: fi(4),
    GlyphEmSize: fi(32),
    MipMaps: fd(true),
    MipMapFiltering: fd("Box"),
    LODBias: fd(-1),
  });

  const mainFontData = makeStaticFont(BUNDLED_FONT_URL);
  const mainFontId = mainFontData.ID as string;
  const fallbackFontData = CJK_FALLBACK_FONT_URLS.map(makeStaticFont);

  const fontChainData: Record<string, unknown> = {
    ...baseAssetComp(false),
    MainFont: fd(mainFontId),
    FallbackFonts: fd(
      fallbackFontData.map((f) => ({ ID: nextId(), Data: f.ID as string })),
    ),
  };
  _fontChainId = fontChainData.ID as string;

  const assets: Array<{ Type: Int32; Data: Record<string, unknown> }> = [
    { Type: typeIndex("UI_UnlitMaterial"), Data: backMatData },
    { Type: typeIndex("UI_UnlitMaterial"), Data: frontBackingMatData },
    { Type: typeIndex("UI_UnlitMaterial"), Data: frontFacingMatData },
    { Type: typeIndex("UI_TextUnlitMaterial"), Data: txtMatData },
    { Type: typeIndex("UI_TextUnlitMaterial"), Data: backTxtMatData },
    { Type: typeIndex("UI_TextUnlitMaterial"), Data: fontTxtMatData },
    { Type: typeIndex("StaticFont"), Data: mainFontData },
    ...fallbackFontData.map((f) => ({
      Type: typeIndex("StaticFont"),
      Data: f,
    })),
    { Type: typeIndex("FontChain"), Data: fontChainData },
  ];

  // Rounded-corner texture only included when canvas.rounded is enabled.
  if (rounded) {
    const texData = compStaticTexture2D(BUNDLED_SPRITE_URL);
    _textureId = texData.ID as string;
    assets.push({ Type: typeIndex("StaticTexture2D"), Data: texData });
  }

  // Logo texture is always bundled (back-panel branding).
  const logoTexData = compStaticTexture2D(BUNDLED_LOGO_URL);
  _logoTextureId = logoTexData.ID as string;
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: logoTexData });

  // UI icon textures (Help / Close / Checkmark) — always bundled. Their
  // SpriteProvider companions get attached to the canvas slot during slot
  // serialization, and Images opt in via useHelpIcon / useCloseIcon /
  // useCheckIcon flags.
  const helpTexData      = compStaticTexture2D(BUNDLED_HELP_ICON_URL);
  const closeTexData     = compStaticTexture2D(BUNDLED_CLOSE_ICON_URL);
  const checkTexData     = compStaticTexture2D(BUNDLED_CHECK_ICON_URL);
  const backspaceTexData = compStaticTexture2D(BUNDLED_BACKSPACE_ICON_URL);
  const spinnerTexData   = compStaticTexture2D(BUNDLED_SPINNER_ICON_URL);
  const pillTexData      = compStaticTexture2D(BUNDLED_PILL_SPRITE_URL);
  const openArrowTexData = compStaticTexture2D(BUNDLED_OPENARROW_ICON_URL);
  const clearIconTexData         = compStaticTexture2D(BUNDLED_CLEAR_ICON_URL);
  const imagePlaceholderTexData  = compStaticTexture2D(BUNDLED_IMAGE_PLACEHOLDER_URL);
  const imageIconTexData         = compStaticTexture2D(BUNDLED_IMAGE_ICON_URL);
  _helpTexId             = helpTexData.ID             as string;
  _closeTexId            = closeTexData.ID            as string;
  _checkTexId            = checkTexData.ID            as string;
  _backspaceTexId        = backspaceTexData.ID        as string;
  _spinnerTexId          = spinnerTexData.ID          as string;
  _pillTexId             = pillTexData.ID             as string;
  _openArrowTexId        = openArrowTexData.ID        as string;
  _clearIconTexId        = clearIconTexData.ID        as string;
  _imagePlaceholderTexId = imagePlaceholderTexData.ID as string;
  _imageIconTexId        = imageIconTexData.ID        as string;
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: helpTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: closeTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: checkTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: backspaceTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: spinnerTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: pillTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: openArrowTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: clearIconTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: imagePlaceholderTexData });
  assets.push({ Type: typeIndex("StaticTexture2D"), Data: imageIconTexData });

  // UI_CircleSegment material — bundled unconditionally alongside the rest of
  // the UI materials. UIX.OutlinedArc (emitted for spinner slots) needs this
  // material type to draw the procedural arc geometry; UI_UnlitMaterial won't
  // produce the same visual. Cheap to include even when no spinner is used.
  const circleSegMatData = compUICircleSegment();
  _circleSegmentMatId = circleSegMatData.ID as string;
  assets.push({ Type: typeIndex("UI_CircleSegment"), Data: circleSegMatData });

  // User-uploaded custom images — one StaticTexture2D per unique hash. The
  // matching SpriteProvider component lands on the canvas slot during slot
  // serialization (see the canvas-slot branch in serializeSlot), and
  // compImage routes by hash via _customSpriteIds.
  _customTexIds = new Map();
  for (const hash of customHashes) {
    const tex = compStaticTexture2D(`@packdb:///${hash}`);
    _customTexIds.set(hash, tex.ID as string);
    assets.push({ Type: typeIndex("StaticTexture2D"), Data: tex });
  }

  // 3D UnlitMaterial for the back-panel QuadMesh logo. Field order and types
  // mirror the reference dump in UIX Template/BackLogoExample exactly — Resonite
  // rejects this asset if any field is missing or has the wrong BSON type.
  // Texture defaults to the bundled UIX Studio logo, but is overridden to the
  // user's uploaded image when canvas.backLogoCustomHash is set.
  const userBackLogoTexId = backLogoHash ? _customTexIds.get(backLogoHash) : undefined;
  const backLogoTextureRef = userBackLogoTexId ?? _logoTextureId;
  const backLogoMatData: Record<string, unknown> = {
    ...baseAssetComp(true),
    TintColor: fd([1, 1, 1, 1, "sRGB"]),
    Texture: fd(backLogoTextureRef),
    TextureScale: fd([1, 1]),
    TextureOffset: fd([0, 0]),
    MaskTexture: fd(null),
    MaskScale: fd([1, 1]),
    MaskOffset: fd([0, 0]),
    MaskMode: fd("MultiplyAlpha"),
    BlendMode: fd("Alpha"),
    AlphaCutoff: fd(0.5),
    UseVertexColors: fd(true),
    VertexColorInterpolationSpace: fd("Linear"),
    Sidedness: fd("Front"),
    ZWrite: fd("Auto"),
    OffsetTexture: fd(null),
    OffsetMagnitude: fd([0, 0]),
    OffsetTextureScale: fd([1, 1]),
    OffsetTextureOffset: fd([0, 0]),
    PolarUVmapping: fd(false),
    PolarPower: fd(1),
    StereoTextureTransform: fd(false),
    RightEyeTextureScale: fd([1, 1]),
    RightEyeTextureOffset: fd([0, 0]),
    DecodeAsNormalMap: fd(false),
    UseBillboardGeometry: fd(false),
    UsePerBillboardScale: fd(false),
    UsePerBillboardRotation: fd(false),
    UsePerBillboardUV: fd(false),
    BillboardSize: fd([0.005, 0.005]),
    OffsetFactor: fd(0),
    OffsetUnits: fd(0),
    RenderQueue: fi(-1),
    "_unlit-ID": nextId(),
    "_unlitBillboard-ID": nextId(),
  };
  _backLogoMatId = backLogoMatData.ID as string;
  assets.push({ Type: typeIndex("UnlitMaterial"), Data: backLogoMatData });

  // Second 3D UnlitMaterial for the "Made with UIX Studio" credits badge.
  // Identical to backLogoMatData but ALWAYS uses the default UIX Studio logo
  // texture — independent of whatever the user picked for their main back
  // logo. This is what keeps the small credits badge stable regardless of
  // user customization.
  const badgeLogoMatData: Record<string, unknown> = {
    ...baseAssetComp(true),
    TintColor: fd([1, 1, 1, 1, "sRGB"]),
    Texture: fd(_logoTextureId),
    TextureScale: fd([1, 1]),
    TextureOffset: fd([0, 0]),
    MaskTexture: fd(null),
    MaskScale: fd([1, 1]),
    MaskOffset: fd([0, 0]),
    MaskMode: fd("MultiplyAlpha"),
    BlendMode: fd("Alpha"),
    AlphaCutoff: fd(0.5),
    UseVertexColors: fd(true),
    VertexColorInterpolationSpace: fd("Linear"),
    Sidedness: fd("Front"),
    ZWrite: fd("Auto"),
    OffsetTexture: fd(null),
    OffsetMagnitude: fd([0, 0]),
    OffsetTextureScale: fd([1, 1]),
    OffsetTextureOffset: fd([0, 0]),
    PolarUVmapping: fd(false),
    PolarPower: fd(1),
    StereoTextureTransform: fd(false),
    RightEyeTextureScale: fd([1, 1]),
    RightEyeTextureOffset: fd([0, 0]),
    DecodeAsNormalMap: fd(false),
    UseBillboardGeometry: fd(false),
    UsePerBillboardScale: fd(false),
    UsePerBillboardRotation: fd(false),
    UsePerBillboardUV: fd(false),
    BillboardSize: fd([0.005, 0.005]),
    OffsetFactor: fd(0),
    OffsetUnits: fd(0),
    RenderQueue: fi(-1),
    "_unlit-ID": nextId(),
    "_unlitBillboard-ID": nextId(),
  };
  _badgeLogoMatId = badgeLogoMatData.ID as string;
  assets.push({ Type: typeIndex("UnlitMaterial"), Data: badgeLogoMatData });

  // Credits backdrop — a dark, semi-opaque, textureless 3D UnlitMaterial drawn
  // behind the bottom-corner credits when the panel's back carries a custom
  // image, so the logo + text stay legible over any photo. Only built when
  // needed so default exports are byte-identical. Same field shape as the back
  // logo material (Sidedness=Front faces the back viewer); Texture=null renders
  // a flat tint, and BlendMode=Alpha + TintColor alpha give the scrim.
  if (_backHasCustomImage) {
    // Rounded panels get a baked rounded-rect alpha mask (bundled by the
    // exporter) so the scrim's corners round; otherwise a textureless square.
    let backdropTexRef: string | null = null;
    if (_creditsBackdropTexHash) {
      const bd = compStaticTexture2D(`@packdb:///${_creditsBackdropTexHash}`);
      backdropTexRef = bd.ID as string;
      assets.push({ Type: typeIndex("StaticTexture2D"), Data: bd });
    }
    const creditsBackdropMatData: Record<string, unknown> = {
      ...baseAssetComp(true),
      TintColor: fd([0.04, 0.04, 0.05, 0.72, "sRGB"]),
      Texture: fd(backdropTexRef),
      TextureScale: fd([1, 1]),
      TextureOffset: fd([0, 0]),
      MaskTexture: fd(null),
      MaskScale: fd([1, 1]),
      MaskOffset: fd([0, 0]),
      MaskMode: fd("MultiplyAlpha"),
      BlendMode: fd("Alpha"),
      AlphaCutoff: fd(0.5),
      UseVertexColors: fd(true),
      VertexColorInterpolationSpace: fd("Linear"),
      Sidedness: fd("Front"),
      ZWrite: fd("Auto"),
      OffsetTexture: fd(null),
      OffsetMagnitude: fd([0, 0]),
      OffsetTextureScale: fd([1, 1]),
      OffsetTextureOffset: fd([0, 0]),
      PolarUVmapping: fd(false),
      PolarPower: fd(1),
      StereoTextureTransform: fd(false),
      RightEyeTextureScale: fd([1, 1]),
      RightEyeTextureOffset: fd([0, 0]),
      DecodeAsNormalMap: fd(false),
      UseBillboardGeometry: fd(false),
      UsePerBillboardScale: fd(false),
      UsePerBillboardRotation: fd(false),
      UsePerBillboardUV: fd(false),
      BillboardSize: fd([0.005, 0.005]),
      OffsetFactor: fd(0),
      OffsetUnits: fd(0),
      RenderQueue: fi(-1),
      "_unlit-ID": nextId(),
      "_unlitBillboard-ID": nextId(),
    };
    _creditsBackdropMatId = creditsBackdropMatData.ID as string;
    assets.push({ Type: typeIndex("UnlitMaterial"), Data: creditsBackdropMatData });
  }

  // Two 3D UnlitMaterials for the rasterized text badges on the back side.
  // Each references its own StaticTexture2D (the pre-rendered PNG of the
  // phrase). Same field shape as backLogoMatData — Sidedness=Front so the
  // 180°-rotated QuadMesh shows the texture to back viewers without
  // mirroring.
  function makeTextBadgeMaterial(url: string): { matId: string; data: Record<string, unknown> } {
    const texData = compStaticTexture2D(url);
    assets.push({ Type: typeIndex("StaticTexture2D"), Data: texData });
    // PNG is pure white — multiplying by the body text color themes the text correctly.
    const ct = _exportTheme?.bodyTextColor ?? { r: 1, g: 1, b: 1, a: 1 };
    const matData: Record<string, unknown> = {
      ...baseAssetComp(true),
      TintColor: fd([ct.r, ct.g, ct.b, ct.a, "sRGB"]),
      Texture: fd(texData.ID as string),
      TextureScale: fd([1, 1]),
      TextureOffset: fd([0, 0]),
      MaskTexture: fd(null),
      MaskScale: fd([1, 1]),
      MaskOffset: fd([0, 0]),
      MaskMode: fd("MultiplyAlpha"),
      BlendMode: fd("Alpha"),
      AlphaCutoff: fd(0.5),
      UseVertexColors: fd(true),
      VertexColorInterpolationSpace: fd("Linear"),
      Sidedness: fd("Front"),
      ZWrite: fd("Auto"),
      OffsetTexture: fd(null),
      OffsetMagnitude: fd([0, 0]),
      OffsetTextureScale: fd([1, 1]),
      OffsetTextureOffset: fd([0, 0]),
      PolarUVmapping: fd(false),
      PolarPower: fd(1),
      StereoTextureTransform: fd(false),
      RightEyeTextureScale: fd([1, 1]),
      RightEyeTextureOffset: fd([0, 0]),
      DecodeAsNormalMap: fd(false),
      UseBillboardGeometry: fd(false),
      UsePerBillboardScale: fd(false),
      UsePerBillboardRotation: fd(false),
      UsePerBillboardUV: fd(false),
      BillboardSize: fd([0.005, 0.005]),
      OffsetFactor: fd(0),
      OffsetUnits: fd(0),
      RenderQueue: fi(-1),
      "_unlit-ID": nextId(),
      "_unlitBillboard-ID": nextId(),
    };
    assets.push({ Type: typeIndex("UnlitMaterial"), Data: matData });
    return { matId: matData.ID as string, data: matData };
  }
  _creditsTextMatId = makeTextBadgeMaterial(BUNDLED_CREDITS_TEXT_URL).matId;

  return assets;
}

// 3D QuadMesh + MeshRenderer pair, used for the back-panel logo. Field order /
// types match UIX Template/BackLogoExample verbatim. This pair lives on a slot
// OUTSIDE the Canvas — RectTransform-driven slots ignore their own rotation, but
// a plain mesh slot respects slot.Rotation, which is why this approach works for
// the back-facing branding when the UIX.Image path doesn't.
function compQuadMesh(size: [number, number] = [1, 1]): Record<string, unknown> {
  return {
    ...baseComp(),
    HighPriorityIntegration: fd(false),
    OverrideBoundingBox: fd(false),
    OverridenBoundingBox: fd({ Min: [0, 0, 0], Max: [0, 0, 0] }),
    Profile: fd("Linear"),
    Rotation: fd([0, 0, 0, 1]),
    Size: fd(size),
    UVOffset: fd([0, 0]),
    UVScale: fd([1, 1]),
    ScaleUVWithSize: fd(false),
    DualSided: fd(false),
    UseVertexColors: fd(true),
    UpperLeftColor: fd([1, 1, 1, 1, "sRGB"]),
    LowerLeftColor: fd([1, 1, 1, 1, "sRGB"]),
    LowerRightColor: fd([1, 1, 1, 1, "sRGB"]),
    UpperRightColor: fd([1, 1, 1, 1, "sRGB"]),
  };
}

function compMeshRenderer(meshId: string, materialId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    Mesh: fd(meshId),
    Materials: fd([{ ID: nextId(), Data: materialId }]),
    MaterialPropertyBlocks: fd([]),
    ShadowCastMode: fd("On"),
    MotionVectorMode: fd("Object"),
    SortingOrder: fi(0),
  };
}

function compGrabbable(): Record<string, unknown> {
  return {
    ...baseComp(),
    ReparentOnRelease: fd(true),
    PreserveUserSpace: fd(true),
    DestroyOnRelease: fd(false),
    GrabPriority: fi(0),
    GrabPriorityWhenGrabbed: fd(null),
    CustomCanGrabCheck: fd({ Target: null }),
    EditModeOnly: fd(false),
    AllowSteal: fd(false),
    DropOnDisable: fd(true),
    ActiveUserFilter: fd("Disabled"),
    OnlyUsers: fd([]),
    Scalable: fd(true),
    Receivable: fd(true),
    AllowOnlyPhysicalGrab: fd(false),
    _grabber: fd(null),
    _lastParent: fd(null),
    _lastParentIsUserSpace: fd(false),
    "__legacyActiveUserRootOnly-ID": nextId(),
  };
}

function compCanvas(
  p: Record<string, unknown>,
  rtId: string,
  colliderId: string | null = null,
  colliderSizeId: string | null = null,
  colliderOffsetId: string | null = null,
): Record<string, unknown> {
  return {
    ...baseComp(100000),
    Size: fd([(p.sizeX as number) ?? 800, (p.sizeY as number) ?? 600]),
    EditModeOnly: fd(false),
    AcceptRemoteTouch: fd(true),
    AcceptPhysicalTouch: fd(true),
    AcceptExistingTouch: fd(false),
    HighPriorityIntegration: fd(false),
    IgnoreTouchesFromBehind: fd(true),
    BlockAllInteractions: fd(false),
    LaserPassThrough: fd(false),
    PixelScale: fd(1),
    UnitScale: fd(1),
    _rootRect: fd(rtId),
    Collider: fd(colliderId),
    DefaultCulling: fd("Off"),
    _colliderSize: fd(colliderSizeId),
    _colliderOffset: fd(colliderOffsetId),
    StartingOffset: fi(-32000),
    StartingMaskDepth: fi(0),
  };
}

function compRectTransform(p: Record<string, unknown>): Record<string, unknown> {
  const anchorMin = (p.anchorMin as { x: number; y: number }) ?? { x: 0, y: 0 };
  const anchorMax = (p.anchorMax as { x: number; y: number }) ?? { x: 1, y: 1 };
  const offsetMin = (p.offsetMin as { x: number; y: number }) ?? { x: 0, y: 0 };
  const offsetMax = (p.offsetMax as { x: number; y: number }) ?? { x: 0, y: 0 };
  const pivot    = (p.pivot    as { x: number; y: number }) ?? { x: 0.5, y: 0.5 };
  return {
    ...baseComp(),
    AnchorMin: fd(vec2(anchorMin)),
    AnchorMax: fd(vec2(anchorMax)),
    OffsetMin: fd(vec2(offsetMin)),
    OffsetMax: fd(vec2(offsetMax)),
    Pivot:     fd(vec2(pivot)),
  };
}

function compImage(p: Record<string, unknown>): Record<string, unknown> {
  const authoredTint = (p.tint as { r: number; g: number; b: number; a: number }) ?? { r: 1, g: 1, b: 1, a: 1 };
  const iconTint = (p.iconTint as { r: number; g: number; b: number; a: number } | undefined) ?? { r: 1, g: 1, b: 1, a: 1 };
  const useBackMat = p.useBackMaterial === true;
  // Used in conjunction with a 180°-Y rotated slot: this material has
  // Sidedness=Front so the rotated quad's now-rear-facing surface renders
  // only to the back viewer (and not as a mirrored phantom on the front).
  const useFrontFacingMat = p.useFrontFacingMaterial === true;
  // Sprite selection priority: explicit icon flags > logo > corner shape > none.
  // - Icons & logo: PreserveAspect=true, no 9-slice stretching.
  // - Corner shape: the unified `cornerRadius` (0-100) lowered onto the pill
  //   quarter-circle texture (Borders=0.5). cr===100 → NineSliceSizing=
  //   "RectHeight" (radius = half height, runtime-correct at any size). 0<cr<100
  //   → a per-Image SpriteProvider with NineSliceSizing="FixedSize" where
  //   FixedSize = (cr/100) × half the shorter dim, baked from the slot rect.
  //   cr===0 → no sprite (square).
  // Custom user-uploaded image wins over everything else — if the slot has
  // its own image, that's clearly the intent.
  const customHash = (p.customImageHash as string | undefined) ?? "";
  const customSpriteId = customHash ? (_customSpriteIds.get(customHash) ?? null) : null;
  const useCustom = !!customSpriteId;
  const useHelp      = !useCustom && !!_helpSpriteId      && p.useHelpIcon      === true;
  const useClose     = !useCustom && !!_closeSpriteId     && p.useCloseIcon     === true;
  const useCheck     = !useCustom && !!_checkSpriteId     && p.useCheckIcon     === true;
  const useBackspace = !useCustom && !!_backspaceSpriteId && p.useBackspaceIcon === true;
  const useSpinner   = !useCustom && !!_spinnerSpriteId   && p.useSpinnerIcon   === true;
  const useOpenArrow = !useCustom && !!_openArrowSpriteId && p.useOpenArrowIcon === true;
  const useClearIcon        = !useCustom && !!_clearIconSpriteId        && p.useClearIcon        === true;
  const useImagePlaceholder = !useCustom && !!_imagePlaceholderSpriteId && p.useImagePlaceholder === true && p.placeholderRemoved !== true;
  // The placeholder's centered glyph — emitted as its own square child Image
  // (buildPlaceholderIconSlot) so it keeps its aspect while the hatch background
  // stretches to fill. Internal flag, set only by that builder.
  const useImageIcon = !useCustom && !!_imageIconSpriteId && p.useImageIcon === true;
  const useLogo  = !useCustom && !useHelp && !useClose && !useCheck && !useBackspace && !useSpinner && !useOpenArrow && !useClearIcon && !useImagePlaceholder && !!_logoSpriteId && p.useLogoSprite === true;
  const useIcon = useHelp || useClose || useCheck || useBackspace || useSpinner || useOpenArrow || useClearIcon;
  // Corner shape only applies when no icon/logo/custom image occupies the Sprite.
  const wantsShape = !useCustom && !useIcon && !useLogo && !useImagePlaceholder && !useImageIcon;
  const cornerRadius = wantsShape
    ? Math.max(0, Math.min(100, typeof p.cornerRadius === "number" ? (p.cornerRadius as number) : 0))
    : 0;
  // Internal escape hatch: an explicit corner radius in pixels, bypassing the
  // cornerRadius% → RectHeight pill. Used by synthetic thin elements (the
  // scrollbar) that need a far lower, hand-capped radius than a normal pill —
  // RectHeight would set the radius to half the bar's LONG span and pinch the
  // corners into a point. Not user-facing on regular Images.
  // `_pillFixedSizePx` is an explicit per-Image override (px); `matchPanelCorners`
  // pins the FixedSize to the panel's own corner so a panel-edge element (header
  // bar) rounds identically to the rounded canvas instead of off its own size.
  const forcedCornerPx = !wantsShape
    ? 0
    : typeof p._pillFixedSizePx === "number"
    ? Math.max(0, p._pillFixedSizePx as number)
    : p.matchPanelCorners === true && _panelCornerFixedSizePx > 0
    ? _panelCornerFixedSizePx
    : 0;
  let shapeSpriteId: string | null = null;
  let shapeSizing: "RectHeight" | "FixedSize" | null = null;
  if (forcedCornerPx > 0 && _pillTexId) {
    const sp = compSpriteProvider(_pillTexId, [0.5, 0.5, 0.5, 0.5], 1, forcedCornerPx);
    shapeSpriteId = sp.ID as string;
    shapeSizing = "FixedSize";
    _pendingImageExtras.push({ Type: typeIndex("SpriteProvider"), Data: sp });
  } else if (cornerRadius >= 100 && _pillSpriteId) {
    // Full pill — radius tracks half the height at runtime (RectHeight), no
    // baked rect. Robust for layout-driven elements whose static rect estimate
    // would otherwise be wrong.
    shapeSpriteId = _pillSpriteId;
    shapeSizing = "RectHeight";
  } else if (cornerRadius > 0 && _pillTexId) {
    // Intermediate radius — bake FixedSize from the slot's static rect. If no
    // rect is known here, fall back to the runtime-proportional pill.
    const rect = _currentImageRect;
    if (rect) {
      const fixedSizePx = (cornerRadius / 100) * (Math.min(rect.w, rect.h) / 2);
      const sp = compSpriteProvider(_pillTexId, [0.5, 0.5, 0.5, 0.5], 1, fixedSizePx);
      shapeSpriteId = sp.ID as string;
      shapeSizing = "FixedSize";
      _pendingImageExtras.push({ Type: typeIndex("SpriteProvider"), Data: sp });
    } else if (_pillSpriteId) {
      shapeSpriteId = _pillSpriteId;
      shapeSizing = "RectHeight";
    }
  }
  const spriteId = useCustom ? customSpriteId
                 : useHelp ? _helpSpriteId
                 : useClose ? _closeSpriteId
                 : useCheck ? _checkSpriteId
                 : useBackspace ? _backspaceSpriteId
                 : useSpinner ? _spinnerSpriteId
                 : useOpenArrow ? _openArrowSpriteId
                 : useClearIcon ? _clearIconSpriteId
                 : useImagePlaceholder ? _imagePlaceholderSpriteId
                 : useImageIcon ? _imageIconSpriteId
                 : useLogo ? _logoSpriteId
                 : shapeSpriteId;
  const nineSliceSizing = shapeSizing ?? "FixedSize";
  // Tint multiplies the sprite. When a slot displays any icon/sprite, use the
  // dedicated `iconTint` field (defaults to white = no change). For non-icon
  // shapes (pill, rounded rect, plain fill), use the authored background `tint`.
  const hasIconOrSprite = useCustom || useHelp || useClose || useCheck || useSpinner || useOpenArrow || useClearIcon || useLogo;
  // The image-placeholder sprite is baked white/grayscale; tint it with the
  // active theme's bodyTextColor so it stays legible on every theme (sky-blue
  // was invisible on warm/light backgrounds). Falls back to the authored tint
  // when no theme is set.
  const tint = (useImagePlaceholder || useImageIcon)
    ? (_exportTheme?.bodyTextColor ?? authoredTint)
    : hasIconOrSprite ? iconTint : authoredTint;
  // Material selection priority:
  //   useFrontFacingMaterial → 3D-style front material for rotated back branding
  //   useBackMaterial        → back-only material (Sidedness=Back) for the BackCover
  //   useFrontBacking        → front-only solid backing material (Sidedness=Front,
  //                            positive offset) that sits BEHIND the regular UI
  //                            on the front to plug the rounded sprite's residual
  //                            alpha and read as fully opaque from the front
  //   otherwise              → null (Resonite's default UI material)
  const useFrontBacking = p.useFrontBacking === true;
  const materialId = useFrontFacingMat
    ? (_frontFacingMatId || null)
    : useBackMat
    ? (_backMatId || null)
    : useFrontBacking
    ? (_frontBackingMatId || null)
    : null;
  // Background backdrop layers (Front Backing / Back Cover / rotated back face)
  // that carry a custom image honor the backgroundFit knob. Resonite can't crop
  // a sprite to a rect, so "full" (cover) is pre-baked to a canvas-aspect PNG at
  // export (see io/bakeBackground.ts + exportBundle) and arrives here as
  // "stretch" — a plain fill. "fit" is likewise pre-baked opaque (letterboxed on
  // the theme color). The only fits seen here in real exports are "stretch";
  // the fit→PreserveAspect branch is a fallback for the direct (non-bundled)
  // export path. Inert on non-backdrop images.
  const isBackdropLayer = useBackMat || useFrontBacking || useFrontFacingMat;
  const bgFit = useCustom && isBackdropLayer ? ((p.backgroundFit as string) ?? "stretch") : null;
  // fit → contain (letterbox); stretch/full → fill.
  const preserveAspect = bgFit
    ? bgFit === "fit"
    // Image placeholder: FILL the rect (PreserveAspect=false) so it matches the
    // editor preview, which draws the hatch box filling the whole element. The
    // baked sprite is 16:9; with PreserveAspect=true it letterboxed to a short
    // band whenever the rect wasn't 16:9 (e.g. a tall portrait slot beside a
    // column) — the placeholder looked "shrunk" on import even though the slot was
    // tall. Stretching the hatch/border to fill is fine for a stand-in the user
    // will replace; the user's eventual upload is `useCustom`, not this branch, so
    // real photos still honor their authored PreserveAspect (default true).
    : useImagePlaceholder
    ? false
    // The centered glyph child keeps its aspect (square sprite, square-fit).
    : useImageIcon
    ? true
    : ((p.preserveAspect as boolean) ?? (useLogo || useIcon || useCustom));
  return {
    ...baseComp(),
    Sprite: fd(spriteId),
    Material: fd(materialId),
    PreserveAspect: fd(preserveAspect),
    NineSliceSizing: fd(nineSliceSizing),
    FlipHorizontally: fd((p.flipHorizontally as boolean) ?? false),
    FlipVertically: fd((p.flipVertically as boolean) ?? false),
    InteractionTarget: fd(true),
    FillRect: fd({ X: 0, Y: 0, Width: 1, Height: 1 }),
    // Legacy ID-only field — Resonite's real Image exports always include it,
    // and its absence appears to leave the Image with no per-quad Z-write,
    // causing all Images to occupy the same effective depth → Z-fighting.
    "__legacyZWrite-ID": nextId(),
    Tint: fd(colorArr(tint)),
  };
}

function compText(p: Record<string, unknown>): Record<string, unknown> {
  const textColor = (p.color as { r: number; g: number; b: number; a: number }) ?? { r: 1, g: 1, b: 1, a: 1 };
  // Material selection — three options:
  // - useFrontFacingMaterial → Sidedness=Front for rotated back-panel labels
  // - useBackMaterial → Sidedness=Back for un-rotated back overlays
  // - default → null (Resonite's default UI text material)
  const matId = p.useFrontFacingMaterial === true && _fontTxtMatId
    ? _fontTxtMatId
    : p.useBackMaterial === true && _backTxtMatId
    ? _backTxtMatId
    : (_txtMatId || null);
  return {
    ...baseComp(),
    Font: fd(_fontChainId || null),
    Content: fd((p.content as string) ?? ""),
    ParseRichText: fd(true),
    NullContent: fd(null),
    Size: fd((p.size as number) ?? 24),
    HorizontalAlign: fd((p.horizontalAlign as string) ?? "Center"),
    VerticalAlign: fd((p.verticalAlign as string) ?? "Middle"),
    AlignmentMode: fd("Geometric"),
    Color: fd(colorArr(textColor)),
    Materials: fd(matId ? [{ ID: nextId(), Data: matId }] : []),
    LineHeight: fd(1.25),
    MaskPattern: fd(null),
    HorizontalAutoSize: fd(false),
    VerticalAutoSize: fd((p.autoSize as boolean) ?? false),
    AutoSizeMin: fd(8),
    AutoSizeMax: fd(64),
    CaretPosition: fi(-1),
    SelectionStart: fi(-1),
    CaretColor: fd([0, 0, 0, 0, "sRGBAlpha"]),
    SelectionColor: fd([0, 0, 0, 0, "sRGBAlpha"]),
    InteractionTarget: fd(true),
    "_legacyFontMaterial-ID": nextId(),
    "_legacyAlign-ID": nextId(),
  };
}

// UIX.TextField — thin wrapper around a sibling TextEditor. Holds the
// Editor reference plus four ID-only legacy fields (no Data values, just fresh
// UUIDs that preserve compatibility with older type versions).
function compTextField(editorComponentId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    Editor: fd(editorComponentId),
    "__text-ID":            nextId(),
    "EditingStarted-ID":    nextId(),
    "EditingChanged-ID":    nextId(),
    "EditingFinished-ID":   nextId(),
  };
}

// FloatTextEditorParser — sits on the same slot as TextField+TextEditor and
// auto-discovers the TextEditor to restrict input to valid floats. Min/Max of
// ±Infinity = unconstrained. DecimalPlaces = Int32.MAX_VALUE = unlimited.
function compFloatTextEditorParser(): Record<string, unknown> {
  return {
    ...baseComp(),
    ParseContinuously:      fd(true),
    UpdateStringFromValue:  fd(true),
    ParsedValue:            fd(0.0),
    Min:                    fd(-Infinity),
    Max:                    fd(Infinity),
    DecimalPlaces:          fi(2147483647),
    StringFormat:           fd(null),
  };
}

// IntTextEditorParser — same as FloatTextEditorParser but for int32. Full
// int32 range = unconstrained. Increments = 1 (step size on scroll/arrow).
function compIntTextEditorParser(): Record<string, unknown> {
  return {
    ...baseComp(),
    ParseContinuously:      fd(true),
    UpdateStringFromValue:  fd(true),
    ParsedValue:            fi(0),
    Min:                    fi(-2147483648),
    Max:                    fi(2147483647),
    Increments:             fi(1),
    StringFormat:           fd(null),
  };
}

// TextEditor — the core editable-text engine. `Text` references the Text
// COMPONENT on a child slot (not its Content field; Resonite's TextEditor
// reads/writes the Content field via the component reference). Other fields
// configure caret/selection visuals and finish behavior. Event delegates left
// null (Resonite still drives the typing behavior internally).
function compTextEditor(
  textComponentId: string,
  caretColor: { r: number; g: number; b: number; a: number } = { r: 0.882, g: 0.882, b: 0.878, a: 1 },
): Record<string, unknown> {
  return {
    ...baseComp(),
    Text: fd(textComponentId),
    Undo: fd(false),
    UndoDescription: fd(null),
    FinishHandling: fd("LeaveAsIs"),
    AutoCaretColorField: fd(true),
    CaretColorField: fd([caretColor.r, caretColor.g, caretColor.b, caretColor.a, "sRGB"]),
    SelectionColorField: fd([0.06, 0.32, 0.48, 0.5, "Linear"]),
    EditingStarted:  fd({ Target: null }),
    EditingChanged:  fd({ Target: null }),
    EditingFinished: fd({ Target: null }),
    SubmitPressed:   fd({ Target: null }),
  };
}

// Build a "tint multiplier" color in sRGBAlpha — what Resonite uses inside
// ColorDrivers when TintColorMode is "Explicit". Tag must be sRGBAlpha;
// trying sRGB here broke Button rendering in v1.0.7 (Button B turned into
// an invisible pill in Resonite), confirming Resonite expects sRGBAlpha
// specifically for the explicit tint stops.
function colorArrAlpha(c: { r: number; g: number; b: number; a: number }): unknown[] {
  return [c.r, c.g, c.b, c.a, "sRGBAlpha"];
}

function compButton(
  p: Record<string, unknown>,
  // When provided, builds a populated ColorDrivers entry whose ColorDrive
  // references this ID (which should match a sibling SmoothValue<colorX>'s
  // TargetValue field ID). This is what makes the button visually respond to
  // hover/press — the driver writes into TargetValue, SmoothValue animates
  // it into the Image's Tint field.
  colorDriveTargetId?: string,
): Record<string, unknown> {
  const normalColor    = (p.normalColor    as { r: number; g: number; b: number; a: number }) ?? { r: 0.25, g: 0.25, b: 0.25, a: 1 };
  const highlightColor = (p.highlightColor as { r: number; g: number; b: number; a: number }) ?? { r: 0.40, g: 0.40, b: 0.40, a: 1 };
  const pressColor     = (p.pressColor     as { r: number; g: number; b: number; a: number }) ?? { r: 0.15, g: 0.15, b: 0.15, a: 1 };
  const disabledColor  = (p.disabledColor  as { r: number; g: number; b: number; a: number }) ?? { r: 0.30, g: 0.30, b: 0.30, a: 1 };
  const drivers: unknown[] = colorDriveTargetId
    ? [{
        ID: nextId(),
        ColorDrive: { ID: nextId(), Data: colorDriveTargetId },
        TintColorMode: fd("Explicit"),
        NormalColor:    fd(colorArrAlpha(normalColor)),
        HighlightColor: fd(colorArrAlpha(highlightColor)),
        PressColor:     fd(colorArrAlpha(pressColor)),
        DisabledColor:  fd(colorArrAlpha(disabledColor)),
      }]
    : [];
  return {
    ...baseComp(),
    BaseColor: fd(colorArr(normalColor)),
    ColorDrivers: fd(drivers),
    "__legacy_NormalColor-ID": nextId(),
    "__legacy_HighlightColor-ID": nextId(),
    "__legacy_PressColor-ID": nextId(),
    "__legacy_DisabledColor-ID": nextId(),
    "__legacy_TintColorMode-ID": nextId(),
    "__legacy_ColorDrive-ID": nextId(),
    IsPressed: fd(false),
    IsHovering: fd(false),
    HoverVibrate: fd("Short"),
    PressVibrate: fd("Medium"),
    ClearFocusOnPress: fd(false),
    PassThroughHorizontalMovement: fd(true),
    PassThroughVerticalMovement: fd(true),
    RequireLockInToPress: fd(false),
    RequireInitialPress: fd(true),
    PressPoint: fd([0.55, 0.55]),
    SendSlotEvents: fd(true),
    Pressed:    fd({ Target: null }),
    Pressing:   fd({ Target: null }),
    Released:   fd({ Target: null }),
    HoverEnter: fd({ Target: null }),
    HoverStay:  fd({ Target: null }),
    HoverLeave: fd({ Target: null }),
  };
}

// SmoothValue<colorX> — animates a color field toward TargetValue at Speed.
// We wire it between Button.ColorDrivers[0].ColorDrive (writes into our
// TargetValue) and an Image's Tint field (the Value ref). Resonite ships this
// as the standard button-feedback pattern (see Labeled button preset).
function compSmoothValueColor(
  targetValueId: string,    // pre-allocated ID for our TargetValue field; matches Button.ColorDrive.Data
  imageTintFieldId: string, // the Image.Tint field ID we animate into
  initialColor: { r: number; g: number; b: number; a: number },
): Record<string, unknown> {
  return {
    ...baseComp(),
    TargetValue: { ID: targetValueId, Data: [initialColor.r, initialColor.g, initialColor.b, initialColor.a, "sRGBAlpha"] },
    Speed: fd(16),
    WriteBack: fd(false),
    Value: fd(imageTintFieldId),
  };
}

// SmoothValue<colorX> — variant where we let the builder allocate the
// TargetValue field ID and return it (for the toggle's color animation, where
// a BooleanValueDriver<colorX> writes into TargetValue and SmoothValue
// animates the Image's Tint).
function compSmoothValueColorAuto(
  imageTintFieldId: string,
  initialColor: { r: number; g: number; b: number; a: number },
): { data: Record<string, unknown>; targetValueId: string } {
  const base = baseComp();
  const targetValueId = nextId();
  return {
    targetValueId,
    data: {
      ...base,
      TargetValue: { ID: targetValueId, Data: [initialColor.r, initialColor.g, initialColor.b, initialColor.a, "sRGBAlpha"] },
      Speed: fd(16),
      WriteBack: fd(false),
      Value: fd(imageTintFieldId),
    },
  };
}

// SmoothValue<float2> — same shape as the colorX variant but for float2 values.
// Used for the toggle's animated knob slide: each BooleanValueDriver<float2>
// writes its FalseValue/TrueValue into the SmoothValue's TargetValue, and
// SmoothValue animates the RT.OffsetMin / OffsetMax over Speed ticks.
function compSmoothValueFloat2(
  rtFieldId: string,
  initial: { x: number; y: number },
): { data: Record<string, unknown>; targetValueId: string } {
  const base = baseComp();
  const targetValueId = nextId();
  return {
    targetValueId,
    data: {
      ...base,
      TargetValue: { ID: targetValueId, Data: [initial.x, initial.y] },
      Speed: fd(12),
      WriteBack: fd(false),
      Value: fd(rtFieldId),
    },
  };
}

// BooleanValueDriver<colorX> — local bool `State` drives one of two colors
// into `TargetField`. Note: in Resonite's pattern the driver's OWN `State`
// field is the source-of-truth bool; UIX.Checkbox toggles it via TargetState.
// Returns the data and the State field's ID so the Checkbox can reference it.
function compBooleanValueDriverColorX(
  targetFieldId: string,  // the Image/Text Color field we drive
  falseColor: { r: number; g: number; b: number; a: number },
  trueColor: { r: number; g: number; b: number; a: number },
  initialState: boolean,
): { data: Record<string, unknown>; stateFieldId: string } {
  const base = baseComp();
  // baseComp already consumed IDs for ID/persistent-ID/UpdateOrder/Enabled;
  // the next allocated ID will belong to our State field.
  const stateFieldId = nextId();
  return {
    stateFieldId,
    data: {
      ...base,
      State: { ID: stateFieldId, Data: initialState },
      TargetField: fd(targetFieldId),
      FalseValue: fd([falseColor.r, falseColor.g, falseColor.b, falseColor.a, "sRGBAlpha"]),
      TrueValue:  fd([trueColor.r,  trueColor.g,  trueColor.b,  trueColor.a,  "sRGBAlpha"]),
    },
  };
}

// BooleanValueDriver<float2> — same shape as the colorX variant but driving
// a float2 target (e.g. RectTransform.OffsetMin). Used by the sliding-toggle
// to flip the knob's offsets between off and on positions.
function compBooleanValueDriverFloat2(
  targetFieldId: string,
  falseValue: { x: number; y: number },
  trueValue: { x: number; y: number },
  initialState: boolean,
): { data: Record<string, unknown>; stateFieldId: string } {
  const base = baseComp();
  const stateFieldId = nextId();
  return {
    stateFieldId,
    data: {
      ...base,
      State: { ID: stateFieldId, Data: initialState },
      TargetField: fd(targetFieldId),
      FalseValue: fd([falseValue.x, falseValue.y]),
      TrueValue:  fd([trueValue.x,  trueValue.y]),
    },
  };
}

// ValueMultiDriver<bool> — one Value (local bool) broadcast to many bool
// fields listed in Drives. Used as the primary-state hub for the toggle so a
// single click flips every dependent driver's State in lock-step.
function compValueMultiDriverBool(
  initialValue: boolean,
  drivenFieldIds: string[],
): { data: Record<string, unknown>; valueFieldId: string } {
  const base = baseComp();
  const valueFieldId = nextId();
  const drivesId = nextId();
  return {
    valueFieldId,
    data: {
      ...base,
      Value: { ID: valueFieldId, Data: initialValue },
      Drives: {
        ID: drivesId,
        Data: drivenFieldIds.map((targetId) => ({
          ID: nextId(),
          Data: targetId,
        })),
      },
    },
  };
}

// UIX.Checkbox — clicking its sibling Button toggles TargetState (a bool field
// ref, typically the BooleanValueDriver's State). State is a local cached
// copy initialized to match.
function compCheckbox(targetStateFieldId: string, initialState: boolean): Record<string, unknown> {
  return {
    ...baseComp(),
    State: fd(initialState),
    TargetState: fd(targetStateFieldId),
    CheckVisual: fd(null),
  };
}

// ValueField<int> — holds the shared "selected index" for a radio group.
// Returns the component data plus the Value field's ID so other components
// (ButtonValueSet, ValueEqualityDriver) can reference it.
function compValueFieldInt(initialValue: number): { data: Record<string, unknown>; valueFieldId: string } {
  const base = baseComp();
  const valueFieldId = nextId();
  return {
    valueFieldId,
    data: {
      ...base,
      Value: { ID: valueFieldId, Data: new Int32(initialValue) },
    },
  };
}

// ValueField<float> — same pattern as compValueFieldInt but with a float
// payload. Used by the ProgressBar's "single float at the root" UX: the
// root slot carries one of these as the user-drivable progress value (0..1),
// and the Fill child carries another as a constant 1 for the Y axis of the
// Float2Driver feeding Fill.RT.AnchorMax.
function compValueFieldFloat(initialValue: number): { data: Record<string, unknown>; valueFieldId: string } {
  const base = baseComp();
  const valueFieldId = nextId();
  return {
    valueFieldId,
    data: {
      ...base,
      Value: { ID: valueFieldId, Data: initialValue },
    },
  };
}

// ── Exposed-value plumbing ──────────────────────────────────────────────────
// Each interactive control gets a dedicated "📚 Value" child slot holding a
// DynamicValueVariable<T> (the end-user-facing value) whose Value field is kept
// in sync with the control's real field by a ValueCopy<T>. This gives every
// element ONE obvious, typed place to read (and, via WriteBack, write) its data
// instead of burying it inside driver/marker components. See buildValueSlot.

// DynamicVariableSpace — placed on the canvas slot so every value variable
// below it binds by its name. SpaceName=null = the default/root space.
function compDynamicVariableSpace(spaceName: string | null = null): Record<string, unknown> {
  return {
    ...baseComp(),
    SpaceName: fd(spaceName),
    OnlyDirectBinding: fd(false),
  };
}

// DynamicValueVariable<T> — the exposed value holder. `kind` selects the BSON
// payload type for Value: "bool"→bool, "int"→Int32, "float"→double,
// "string"→string (matching the ValueField<T> typing rules already in use).
// Returns the Value field's UUID so a sibling ValueCopy<T> can target it.
function compDynamicValueVariable(
  kind: "bool" | "int" | "float" | "string" | "colorX",
  variableName: string,
  initialValue: boolean | number | string | { r: number; g: number; b: number; a: number },
): { data: Record<string, unknown>; valueFieldId: string } {
  const base = baseComp();
  const valueFieldId = nextId();
  const payload: BsonVal =
    kind === "int" ? new Int32(initialValue as number)
    : kind === "colorX" ? (colorArr(initialValue as { r: number; g: number; b: number; a: number }) as BsonVal)
    : (initialValue as BsonVal);
  return {
    valueFieldId,
    data: {
      ...base,
      VariableName: fd(variableName),
      Value: { ID: valueFieldId, Data: payload },
      OverrideOnLink: fd(false),
    },
  };
}

// ValueCopy<T> — mirrors Source → Target every update. WriteBack=true makes
// external writes to Target propagate back to Source, turning the exposed
// DynamicValueVariable into a two-way proxy for the control's value. The
// Source→Target read direction works regardless of WriteBack, so the exposed
// value always reflects the control even if WriteBack is later disabled.
function compValueCopy(
  sourceFieldId: string,
  targetFieldId: string,
  writeBack: boolean,
): Record<string, unknown> {
  return {
    ...baseComp(),
    Source: fd(sourceFieldId),
    Target: fd(targetFieldId),
    WriteBack: fd(writeBack),
  };
}

// DynamicReferenceVariable<IWorldElement> — reference analog of
// DynamicValueVariable: a named slot holding a dropped object reference.
// Mirrors the verified DynamicValueVariable layout with Value→Reference.
// Returns the Reference field UUID so a sibling ReferenceCopy can target it.
function compDynamicReferenceVariable(
  variableName: string,
): { data: Record<string, unknown>; referenceFieldId: string } {
  const base = baseComp();
  const referenceFieldId = nextId();
  return {
    referenceFieldId,
    data: {
      ...base,
      VariableName: fd(variableName),
      Reference: { ID: referenceFieldId, Data: null },
      OverrideOnLink: fd(false),
    },
  };
}

// ReferenceCopy<IWorldElement> — reference analog of ValueCopy. Verified
// structure (Source/Target/WriteBack) from real dumps. Mirrors a reference
// field into another every update; WriteBack makes it two-way.
function compReferenceCopy(
  sourceFieldId: string,
  targetFieldId: string,
  writeBack: boolean,
): Record<string, unknown> {
  return {
    ...baseComp(),
    Source: fd(sourceFieldId),
    Target: fd(targetFieldId),
    WriteBack: fd(writeBack),
  };
}

// ButtonEditColorX — hooks the same slot's UIX.Button so clicking it opens
// Resonite's native color picker overlay, writing the chosen colorX into the
// `Target` field (here the swatch Image.Tint). Continuous=true updates Target
// live while dragging in the picker. Structure verified verbatim against UIX
// Template/Preset Template 6's ButtonEditColorX dump.
function compButtonEditColorX(
  targetColorFieldId: string,
  alpha: boolean,
  hdr: boolean,
): Record<string, unknown> {
  return {
    ...baseComp(),
    Target:        fd(targetColorFieldId),
    _colorPicker:  fd(null),
    Continuous:    fd(true),
    Alpha:         fd(alpha),
    HDR:           fd(hdr),
  };
}

// Float2Driver — reads two float field values (X, Y) every frame and writes
// the combined float2 into the Target float2 field. Used on the ProgressBar
// root to synthesize (progressValue, 1) and write it into Fill.RT.AnchorMax,
// so the end user only has to drive a single float instead of a float2.
function compFloat2Driver(
  xFieldId: string,
  yFieldId: string,
  targetFloat2FieldId: string,
): Record<string, unknown> {
  return {
    ...baseComp(),
    X:      fd(xFieldId),
    Y:      fd(yFieldId),
    Target: fd(targetFloat2FieldId),
  };
}

// ButtonValueSet<int> — when its slot's Button is pressed, writes SetValue
// into TargetValue (a referenced int field). Used by radios to write their
// own index into the shared group field on click.
function compButtonValueSetInt(targetValueFieldId: string, setValue: number): Record<string, unknown> {
  return {
    ...baseComp(),
    TargetValue: fd(targetValueFieldId),
    SetValue: fi(setValue),
  };
}

// ButtonValueSet<string> — like the int variant but writes a string literal
// into a referenced string field on click. Used by Dropdown options to push
// their label text into the trigger button's Text.Content field, so the
// trigger always shows the most recently selected option.
function compButtonValueSetString(targetValueFieldId: string, setValue: string): Record<string, unknown> {
  return {
    ...baseComp(),
    TargetValue: fd(targetValueFieldId),
    SetValue: fd(setValue),
  };
}

// ValueEqualityDriver<int> — drives the bool field referenced by `Target` to
// the result of comparing the int field referenced by `TargetValue` against
// the literal `Reference`. Field naming is per Preset Template 7:
//   * TargetValue = SOURCE int field (the value to compare)
//   * Reference   = Int32 literal to compare against
//   * Target      = DESTINATION bool field (where the boolean result is written)
// Used by each radio to flip a local bool that gates the visibility of its
// inner dot via a sibling BooleanValueDriver<colorX>.
function compValueEqualityDriverInt(
  sharedIntFieldId: string,
  referenceIndex: number,
  outputBoolFieldId: string,
): Record<string, unknown> {
  return {
    ...baseComp(),
    TargetValue: fd(sharedIntFieldId),
    Reference: fi(referenceIndex),
    Target: fd(outputBoolFieldId),
    Invert: fd(false),
    UseApproximateComparison: fd(true),
  };
}

// UIX.Slider<float> — the interactive slider. Field order matches a real
// Resonite save (see UIX Template/Horizontal bar slider/_decoded.json). The
// component holds:
//   * BaseColor — the static tint applied when no driver is wired
//   * ColorDrivers — hover/press feedback tint on the Image referenced by ColorDrive
//   * Value/Min/Max/Integers/Power/Clamp/etc. — slider model
//   * SlideDirection — "Horizontal" | "Vertical"
//   * AnchorOffset — [0,1] for horizontal bar, [0,0] for vertical bar, etc.
//   * HandleAnchorMinDrive / HandleAnchorMaxDrive / FillLineDrive — references
//     to RectTransform AnchorMin/AnchorMax field IDs on the visual fill slot
//     (a child slot whose RT animates to represent the current value).
// We use the "bar slider" wiring (HandleAnchorMaxDrive populated, the others
// null), with the Slider's Image-tint ColorDrive optionally targeting a
// SmoothValue<colorX>.TargetValue id (caller wires that up after).
function compSliderFloat(
  p: Record<string, unknown>,
  fillAnchorMaxFieldId: string,
  colorDriveTargetId?: string,
): Record<string, unknown> {
  const value    = (p.value as number) ?? 0.5;
  const min      = (p.min   as number) ?? 0;
  const max      = (p.max   as number) ?? 1;
  const integers = (p.integers as boolean) ?? false;
  const power    = (p.power as number) ?? 1;
  const clamp    = (p.clamp as boolean) ?? true;
  const requireInitialPress = (p.requireInitialPress as boolean) ?? true;
  const direction = (p.direction as string) ?? "Horizontal";
  // AnchorOffset orients the fill: for a horizontal track the fill grows on
  // X with Y locked to full height; vertical inverts. Matches the values used
  // by Resonite's own Horizontal bar slider / Vertical bar slider templates.
  const anchorOffset: [number, number] = direction === "Vertical" ? [0, 0] : [0, 1];
  const baseColor = { r: 0.169, g: 0.184, b: 0.208, a: 1 };
  const drivers: unknown[] = colorDriveTargetId
    ? [{
        ID: nextId(),
        ColorDrive: { ID: nextId(), Data: colorDriveTargetId },
        TintColorMode: fd("Explicit"),
        NormalColor:    fd([1, 1, 1, 1, "sRGBAlpha"]),
        HighlightColor: fd([2, 2, 2, 1, "sRGBAlpha"]),
        PressColor:     fd([0.75, 0.75, 0.75, 1, "sRGBAlpha"]),
        DisabledColor:  fd([0.65, 0.65, 0.65, 1, "sRGBAlpha"]),
      }]
    : [];
  return {
    ...baseComp(),
    BaseColor: fd(colorArr(baseColor)),
    ColorDrivers: fd(drivers),
    "__legacy_NormalColor-ID": nextId(),
    "__legacy_HighlightColor-ID": nextId(),
    "__legacy_PressColor-ID": nextId(),
    "__legacy_DisabledColor-ID": nextId(),
    "__legacy_TintColorMode-ID": nextId(),
    "__legacy_ColorDrive-ID": nextId(),
    IsPressed:  fd(false),
    IsHovering: fd(false),
    Value: fd(value),
    Min:   fd(min),
    Max:   fd(max),
    Integers: fd(integers),
    MaxIsExclusive: fd(true),
    Power: fd(power),
    Clamp: fd(clamp),
    VibrationThreshold: fd(0.05),
    SlideDirection: fd(direction),
    AnchorOffset: fd(anchorOffset),
    HandleAnchorMinDrive: fd(null),
    HandleAnchorMaxDrive: fd(fillAnchorMaxFieldId),
    FillLineDrive: fd(null),
    RequireLockInToInteract: fd(false),
    RequireInitialPress: fd(requireInitialPress),
  };
}

function layoutBase(p: Record<string, unknown>) {
  // Each side: explicit (>= 0) wins; the -1 "auto" sentinel / undefined inherits
  // half the Canvas.contentPadding. The synthetic snap-stack containers pass
  // explicit 0, so they're unaffected.
  const cp = _canvasContentPadding;
  return {
    PaddingTop:    fd(resolvePad(p.paddingTop    as number | undefined, cp)),
    PaddingRight:  fd(resolvePad(p.paddingRight  as number | undefined, cp)),
    PaddingBottom: fd(resolvePad(p.paddingBottom as number | undefined, cp)),
    PaddingLeft:   fd(resolvePad(p.paddingLeft   as number | undefined, cp)),
    Spacing:       fd((p.spacing       as number) ?? 0),
  };
}

function compVerticalLayout(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseComp(), ...layoutBase(p),
    HorizontalAlign:   fd((p.horizontalAlign   as string)  ?? "Center"),
    VerticalAlign:     fd((p.verticalAlign     as string)  ?? "Top"),
    ForceExpandWidth:  fd((p.forceExpandWidth  as boolean) ?? true),
    ForceExpandHeight: fd((p.forceExpandHeight as boolean) ?? true),
  };
}

function compHorizontalLayout(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseComp(), ...layoutBase(p),
    HorizontalAlign:   fd((p.horizontalAlign   as string)  ?? "Left"),
    VerticalAlign:     fd((p.verticalAlign     as string)  ?? "Top"),
    ForceExpandWidth:  fd((p.forceExpandWidth  as boolean) ?? true),
    ForceExpandHeight: fd((p.forceExpandHeight as boolean) ?? false),
  };
}

function compGridLayout(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseComp(), ...layoutBase(p),
    SpacingX: fd((p.spacingX as number) ?? 4),
    SpacingY: fd((p.spacingY as number) ?? 4),
    CellSize: fd([(p.cellSizeX as number) ?? 80, (p.cellSizeY as number) ?? 80]),
    StartCorner:      fd("UpperLeft"),
    StartAxis:        fd("Horizontal"),
    ChildAlignment:   fd("UpperLeft"),
    Constraint:       fd("Flexible"),
    ConstraintCount:  fi((p.constraintCount as number) ?? 2),
  };
}

function compLayoutElement(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseComp(),
    MinWidth:        fd((p.minWidth        as number) ?? -1),
    PreferredWidth:  fd((p.preferredWidth  as number) ?? -1),
    FlexibleWidth:   fd((p.flexibleWidth   as number) ?? -1),
    MinHeight:       fd((p.minHeight       as number) ?? -1),
    PreferredHeight: fd((p.preferredHeight as number) ?? -1),
    FlexibleHeight:  fd((p.flexibleHeight  as number) ?? -1),
    Area:            fd(-1),
    Priority:        fi((p.priority as number) ?? 1),
    UseZeroMetrics:  fd(false),
  };
}

function compMask(showMaskGraphic = false): Record<string, unknown> {
  return { ...baseComp(), ShowMaskGraphic: fd(showMaskGraphic) };
}

function compIgnoreLayout(): Record<string, unknown> {
  return { ...baseComp() };
}

// Hyperlink — opens its URL in the user's browser when a sibling collider on
// the same slot is clicked. Reason is shown to the user as confirmation.
//
// **The "@" prefix is required.** Resonite null-coerces Uri fields on BSON
// import as a security measure (same mechanism that nulls bare `resdb:///`
// asset URLs — see CLAUDE.md). The "@" prefix marks the URI as "preserve
// across import", matching the convention `@packdb:///<hash>` uses for
// bundled asset references. Discovered empirically: a Resonite-saved
// Hyperlink that worked carried URL `"@https://uix.dalek.coffee/"`; the
// same string without the @ gets nulled. Apply the prefix unconditionally
// for any non-empty user URL. Empty/missing URLs serialize as null so the
// Hyperlink stays inert (no Open() destination).
function compHyperlink(p: Record<string, unknown>): Record<string, unknown> {
  const raw = ((p.url as string) ?? "").trim();
  const url = raw ? (raw.startsWith("@") ? raw : "@" + raw) : null;
  return {
    ...baseComp(),
    URL: fd(url),
    OpenOnce: fd((p.openOnce as boolean) ?? false),
    Reason: fd((p.reason as string) ?? null),
  };
}

// ButtonDestroy — subscribes to the host slot's UIX.Button.Pressed event and
// destroys the configured Target slot (or its ObjectRoot ancestor) on click.
// Schema captured from Preset Template 6's "Close button" slot. When
// `findObjectRoot=true`, Resonite walks up from `Target` to the nearest
// ObjectRoot at runtime — so we just pass the slot's own ID as Target and
// let Resonite climb to the panel root. Used to make the close (X) button
// actually destroy the panel when clicked.
function compButtonDestroy(targetSlotId: string, findObjectRoot: boolean): Record<string, unknown> {
  return {
    ...baseComp(),
    Target: fd(targetSlotId),
    FindObjectRoot: fd(findObjectRoot),
  };
}

// ButtonToggle — subscribes to the host slot's UIX.Button.Pressed event and
// flips the bool field referenced by TargetValue on click. Schema captured
// from Preset Template 6. Used by the popup spawn-window: both the trigger
// button (e.g. the help icon) and the OK button inside the modal carry one
// of these, with TargetValue pointing at the modal slot's Active field — so
// click-help flips Active false→true (shows the modal) and click-OK flips
// true→false (hides it).
function compButtonToggle(targetFieldId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    TargetValue: fd(targetFieldId),
  };
}

// ButtonReferenceSet<IWorldElement> — sibling-of-Button helper. When the
// host slot's UIX.Button fires Pressed, this component writes `SetReference`
// (typically null, to clear) into the field identified by `TargetReference`.
// Used on the Clear button to null the ReferenceField.Reference field
// directly, bypassing RefEditor's method dispatch (which proved unreliable).
function compButtonReferenceSetIWorldElement(
  targetRefFieldId: string,
  setReference: string | null = null,
): Record<string, unknown> {
  return {
    ...baseComp(),
    TargetReference: fd(targetRefFieldId),
    SetReference:    fd(setReference),
  };
}

// ReferenceField<IWorldElement> — the actual storage component holding a
// dropped reference. Pre-allocates the Reference field UUID so RefEditor can
// target it via _targetRef. Returns the field UUID alongside the data.
function compReferenceFieldIWorldElement(): { data: Record<string, unknown>; referenceFieldId: string } {
  const base = baseComp();
  const referenceFieldId = nextId();
  return {
    referenceFieldId,
    data: {
      ...base,
      Reference: { ID: referenceFieldId, Data: null },
    },
  };
}

// FrooxEngine.RefEditor — the canonical "make this slot a reference editor"
// helper. Resonite registers `_button` as the drop sink (drops onto that
// Button write the dropped IWorldElement into the `_targetRef` field, which
// is the ReferenceField<IWorldElement>.Reference field UUID), and drives the
// Text.Content at `_textDrive` with the dropped object's display name.
// Pattern verified against the "Text to String with Reference Field" example.
function compRefEditor(
  targetRefFieldId: string,
  textContentFieldId: string,
  buttonComponentId: string,
): Record<string, unknown> {
  return {
    ...baseComp(),
    _targetRef: fd(targetRefFieldId),
    _textDrive: fd(textContentFieldId),
    _button:    fd(buttonComponentId),
  };
}

// UI_CircleSegment material asset — used by UIX.OutlinedArc to render the
// procedural arc geometry of a spinner. Field shape captured verbatim from
// SpinnerExample. The OutlinedArc itself supplies FillColor/OutlineColor; the
// material's FillTint/OutlineTint are white multipliers. OffsetFactor=-10
// keeps the arc above other UI; ZTest=LessOrEqual is the default UI sort.
function compUICircleSegment(): Record<string, unknown> {
  return {
    ...baseAssetComp(true),
    Rect: fd({ X: 0, Y: 0, Width: 0, Height: 0 }),
    RectClip: fd(false),
    ColorMask: fd("RGBA"),
    StencilComparison: fd("Always"),
    StencilOperation: fd("Keep"),
    StencilID: fi(0),
    StencilWriteMask: fi(255),
    StencilReadMask: fi(255),
    RenderQueue: fi(-1),
    "_shader-ID": nextId(),
    FillTint: fd([1, 1, 1, 1, "sRGB"]),
    OutlineTint: fd([1, 1, 1, 1, "sRGB"]),
    Overlay: fd(false),
    OverlayTint: fd([1, 1, 1, 0.73, "sRGB"]),
    BlendMode: fd("Opaque"),
    Sidedness: fd("Auto"),
    ZWrite: fd("On"),
    ZTest: fd("LessOrEqual"),
    OffsetFactor: fd(-10),
    OffsetUnits: fd(0),
  };
}

// UIX.OutlinedArc — procedural arc primitive. Pre-allocates the Arc and
// Offset field UUIDs so the gradient drivers we emit alongside can target
// them. Material must be a UI_CircleSegment asset (compUICircleSegment).
function compOutlinedArc(
  fillColor: { r: number; g: number; b: number; a: number },
  materialAssetId: string,
): { data: Record<string, unknown>; arcFieldId: string; offsetFieldId: string; enabledFieldId: string } {
  const base = baseComp();
  // The component's own Enabled field — exposed so the spinner can be shown/
  // hidden by driving it from a boolean value variable. Disabling the renderer
  // stops its draw call entirely (no transparent overdraw) while leaving the
  // slot's RectTransform/LayoutElement in place, so siblings don't reflow.
  const enabledFieldId = (base.Enabled as { ID: string }).ID;
  const arcFieldId = nextId();
  const offsetFieldId = nextId();
  return {
    arcFieldId,
    offsetFieldId,
    enabledFieldId,
    data: {
      ...base,
      Arc:                 { ID: arcFieldId,    Data: 180 },
      Offset:              { ID: offsetFieldId, Data: -360 },
      OuterRadiusRatio:    fd(0.84),
      InnerRadiusRatio:    fd(0.59),
      RoundedCornerRadius: fd(2),
      FillColor:           fd([fillColor.r, fillColor.g, fillColor.b, fillColor.a, "sRGB"]),
      OutlineColor:        fd([0, 0, 0, 1, "sRGB"]),
      OutlineThickness:    fd(0.1),
      Material:            fd(materialAssetId),
    },
  };
}

// ValueGradientDriver<float> — drives `targetFieldId` between `points` based
// on `Progress` (which the spinner's ProtoFlux chain writes to). Pre-allocates
// the Progress field UUID so a ValueCopy can share it across two drivers.
function compValueGradientDriverFloat(
  targetFieldId: string,
  points: Array<{ pos: number; value: number }>,
): { data: Record<string, unknown>; progressFieldId: string } {
  const base = baseComp();
  const progressFieldId = nextId();
  return {
    progressFieldId,
    data: {
      ...base,
      Progress: { ID: progressFieldId, Data: 0 },
      Target:   fd(targetFieldId),
      Interpolate: fd(true),
      Points: fd(points.map((p) => ({
        ID: nextId(),
        Position: { ID: nextId(), Data: p.pos },
        Value:    { ID: nextId(), Data: p.value },
      }))),
    },
  };
}

// ValueCopy<float> — copies one float field's value into another every frame.
// Used to feed the same Progress signal into both gradient drivers.
function compValueCopyFloat(sourceFieldId: string, targetFieldId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    Source:    fd(sourceFieldId),
    Target:    fd(targetFieldId),
    WriteBack: fd(false),
  };
}

// ── ProtoFlux node builders (spinner subtree) ─────────────────────────────
//
// Each ProtoFlux node lives on its OWN slot inside a "ProtoFlux" child of the
// spinner slot. Most nodes are a single component whose *component ID* is the
// node's output reference — downstream nodes reference the upstream node by
// its component ID directly.
//
// The ValueFieldDrive<float> slot is special: it carries TWO components, in
// this order (matches SpinnerExample/ValueFieldDrive`1):
//   1. ValueFieldDrive<float>   — `Value` field references the upstream node
//   2. FieldDriveBase<float>+Proxy — `Node` references the ValueFieldDrive
//      component's ID, `Path: []`, `Drive` is the target field UUID written
//      every frame (here, the gradient driver's Progress field).

function compWorldTimeFloat(): Record<string, unknown> {
  return { ...baseComp() };
}

function compValueInputFloat(value: number): Record<string, unknown> {
  return { ...baseComp(), Value: fd(value) };
}

function compValueMulFloat(aNodeId: string, bNodeId: string): Record<string, unknown> {
  return { ...baseComp(), A: fd(aNodeId), B: fd(bNodeId) };
}

function compValueModFloat(aNodeId: string, bNodeId: string): Record<string, unknown> {
  return { ...baseComp(), A: fd(aNodeId), B: fd(bNodeId) };
}

// ValueFieldDrive<float> wrapper. Bare value-passthrough — `Value` references
// the upstream node's component ID. Returns the drive component's own ID so
// the partner Proxy can target it.
function compValueFieldDriveFloat(sourceNodeId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    Value: fd(sourceNodeId),
  };
}

// FieldDriveBase<float>+Proxy — sibling of ValueFieldDrive<float>. Reads from
// the drive node (Node ref) and writes into the field at `driveTargetFieldId`.
function compFieldDriveProxyFloat(driveNodeId: string, driveTargetFieldId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    Node:  fd(driveNodeId),
    Path:  fd([]),
    Drive: fd(driveTargetFieldId),
  };
}

// UIX.ScrollRect — the host of the scroll behavior. `ViewportOverride`
// references the RectTransform component of the slot whose rect defines the
// visible window (typically the parent slot's RT). NormalizedPosition is the
// current scroll position as a float2 [x, y] in 0..1; Resonite updates this
// continuously based on user input.
function compScrollRect(viewportRtId: string): Record<string, unknown> {
  return {
    ...baseComp(),
    NormalizedPosition: fd([0, 0]),
    HorizontalAlign:    fd("Center"),
    VerticalAlign:      fd("Middle"),
    ViewportOverride:   fd(viewportRtId),
    "__legacyContent-ID": nextId(),
  };
}

// UIX.RectTransformComputedProperties — exposes the slot's RectTransform live
// computed rect. `Rect` references the slot's own RectTransform *component* ID;
// `LocalComputeRect` is the IValue<Rect> the scrollbar ProtoFlux reads. Returns
// the LocalComputeRect field ID so the caller can bind the GlobalReference.
function compRectTransformComputedProperties(ownRtCompId: string): {
  data: Record<string, unknown>;
  localComputeRectFieldId: string;
} {
  const localComputeRect = fd(null);
  return {
    data: {
      ...baseComp(),
      Rect: fd(ownRtCompId),
      LocalComputeRect: localComputeRect,
      BoundingRect: fd(null),
    },
    localComputeRectFieldId: localComputeRect.ID,
  };
}

// Find the first slot (depth-first) in a prebuilt slot subtree whose Name.Data
// matches. Used to reach named slots inside the emitted scrollbar (the captured
// names "Slider" / "Handel" survive the emitter's ID remap untouched).
function findPrebuiltSlotByName(
  slot: Record<string, unknown>,
  name: string,
): Record<string, unknown> | null {
  if ((slot.Name as { Data?: unknown } | undefined)?.Data === name) return slot;
  for (const c of ((slot.Children as Record<string, unknown>[]) ?? [])) {
    const found = findPrebuiltSlotByName(c, name);
    if (found) return found;
  }
  return null;
}

// Pull a component's Data out of a prebuilt slot by a field its Data must carry
// (e.g. "AnchorMin" → the RectTransform, "ColorDrivers" → the Slider).
function prebuiltCompDataWithField(
  slot: Record<string, unknown>,
  field: string,
): Record<string, unknown> | null {
  const comps = (slot.Components as { Data?: Array<{ Data: Record<string, unknown> }> } | undefined)?.Data ?? [];
  return comps.find((c) => c.Data && field in c.Data)?.Data ?? null;
}

// Lighten/darken a color toward white (positive) or black (negative), matching
// the button-theming convention in src/model/theme.ts.
function shiftColor(c: { r: number; g: number; b: number; a: number }, amt: number) {
  return {
    r: Math.max(0, Math.min(1, c.r + amt)),
    g: Math.max(0, Math.min(1, c.g + amt)),
    b: Math.max(0, Math.min(1, c.b + amt)),
    a: c.a,
  };
}

// UIX.ContentSizeFitter — drives the RectTransform of the slot it sits on so
// it grows to fit children along whichever axis is set to PreferredSize.
// For Vertical scrolling we fit the height; for Horizontal, the width; for
// Both, fit both axes.
function compContentSizeFitter(
  fitHorizontal: "Disabled" | "PreferredSize",
  fitVertical:   "Disabled" | "PreferredSize",
): Record<string, unknown> {
  return {
    ...baseComp(),
    HorizontalFit: fd(fitHorizontal),
    VerticalFit:   fd(fitVertical),
  };
}

// BoxCollider auto-added to Canvas slots. Its Offset & Size field IDs are
// referenced back from Canvas._colliderOffset / _colliderSize so resizing the
// canvas updates the collider automatically.
//
// `sizeZ` defaults to 0 (matches what Resonite emits for in-canvas UIX
// colliders — Z is irrelevant because UIX raycasting projects onto the rect's
// plane). For Hyperlink colliders *outside* a Canvas (back-logo, credits
// banner), pass a small non-zero `sizeZ` so the physics raycast actually
// intersects the box — a zero-thickness collider is a degenerate plane and
// Resonite's pointer raycast can miss it entirely.
function compBoxCollider(sizeX: number, sizeY: number, sizeZ = 0): Record<string, unknown> {
  return {
    ...baseComp(1000000),
    Offset: { ID: nextId(), Data: vec3(0, 0, 0) },
    Type: fd("Static"),
    Mass: fd(1),
    CharacterCollider: fd(false),
    IgnoreRaycasts: fd(false),
    Size: { ID: nextId(), Data: vec3(sizeX, sizeY, sizeZ) },
  };
}

// ── Component dispatcher ──────────────────────────────────────────────────────

function buildComponent(c: UixComponent, rtId?: string) {
  const p = c.props as Record<string, unknown>;
  // Popup is a UIX-Studio-side marker. At export it expands into:
  //   * a ButtonToggle on the host slot (added by serializeSlot's auto-inject
  //     block) that flips the popup modal's Active field on click
  //   * a hidden modal sub-tree under the canvas (built by buildPopupModalSlot
  //     in buildRootWrapper) — the modal has its own OK button with another
  //     ButtonToggle that flips the same Active back to false on click.
  // The marker itself never lands as a component in the exported BSON.
  let data: Record<string, unknown>;
  switch (c.type) {
    case "Canvas":           data = compCanvas(p, rtId ?? ""); break;
    case "RectTransform":    data = compRectTransform(p); break;
    case "Image":            data = compImage(p); break;
    case "Text":             data = compText(p); break;
    // TextField is intercepted by serializeSlot's TextField branch so the
    // Editor cross-ref can be wired to the sibling TextEditor. A standalone
    // build here would have no editor to point at — emit a degenerate
    // component (null editor) as defensive fallback only.
    case "TextField":        data = compTextField("00000000-0000-0000-0000-000000000000"); break;
    case "Button":           data = compButton(p); break;
    case "VerticalLayout":   data = compVerticalLayout(p); break;
    case "HorizontalLayout": data = compHorizontalLayout(p); break;
    case "GridLayout":       data = compGridLayout(p); break;
    case "LayoutElement":    data = compLayoutElement(p); break;
    case "Mask":             data = compMask(); break;
    case "IgnoreLayout":     data = compIgnoreLayout(); break;
    case "BoxCollider":      data = compBoxCollider((p.sizeX as number) ?? 100, (p.sizeY as number) ?? 100); break;
    case "Hyperlink":        data = compHyperlink(p); break;
    // Checkbox is paired-built in serializeSlot to wire field cross-refs;
    // a standalone build here is a degenerate fallback that just emits the
    // base component (no TargetState ref). Should never hit in practice.
    case "Checkbox":         data = compCheckbox("00000000-0000-0000-0000-000000000000", (p.initialState as boolean) ?? true); break;
    // Toggle is a serialize-time marker; serializeSlot intercepts it and
    // never sends it through this dispatcher in practice.
    case "Toggle":           data = compCheckbox("00000000-0000-0000-0000-000000000000", (p.initialState as boolean) ?? false); break;
    // Knob is a serialize-time marker; serializeSlot intercepts it and
    // never sends it through this dispatcher in practice.
    case "Knob":             data = { ...baseComp() }; break;
    // Slider is intercepted by serializeSlot's hasSlider branch; a fallback
    // here would have no Fill ref to drive, so emit a degenerate component.
    case "Slider":           data = { ...baseComp() }; break;
    // ProgressBar is intercepted by serializeSlot's hasProgressBar branch
    // (it builds a synthetic Fill child); the marker itself is never exported
    // as a real component. This dispatcher case is a defensive fallback.
    case "ProgressBar":      data = { ...baseComp() }; break;
    // Dropdown is intercepted by serializeSlot's hasDropdown branch (it
    // generates the trigger wiring + a spawn-window modal subtree); the
    // marker itself is never exported as a real component. Fallback only.
    case "Dropdown":         data = { ...baseComp() }; break;
    // KeypadDisplay / KeypadKey are pure markers consumed by the keypad
    // capture/inject hook in serializeSlot. They never serialize as real
    // components — these are defensive fallbacks only.
    case "KeypadDisplay":    data = { ...baseComp() }; break;
    case "KeypadKey":        data = { ...baseComp() }; break;
    // Radio is intercepted by serializeSlot's hasRadio branch (it needs to
    // know the group's shared field ID to wire ButtonValueSet/EqualityDriver);
    // a standalone build here is just a no-op marker.
    case "Radio":            data = { ...baseComp() }; break;
    // ReferenceField is intercepted by serializeSlot's hasReferenceField
    // branch. A standalone build here would be a degenerate marker.
    case "ReferenceField":   data = { ...baseComp() }; break;
    // ScrollArea is intercepted by serializeSlot's hasScrollArea branch.
    case "ScrollArea":       data = { ...baseComp() }; break;
    default:                 data = { ...baseComp() };
  }
  if (c.type === "Slider") {
    return { Type: typeIndex("SliderFloat"), Data: data };
  }
  if (c.type === "Radio") {
    // No real "Radio" component lands in the exported scene — the marker
    // gets transformed into ButtonValueSet<int> + ValueEqualityDriver<int>
    // by the hasRadio branch. The fallback returns a placeholder base
    // component just to keep the dispatcher total. ValueFieldInt is a
    // reasonable placeholder type so the dispatcher's typeIndex call resolves.
    return { Type: typeIndex("ValueFieldInt"), Data: data };
  }
  if (c.type === "ProgressBar") {
    // ProgressBar marker is consumed by serializeSlot's hasProgressBar
    // branch; the fallback here only runs if a ProgressBar somehow makes it
    // through without being intercepted (e.g., missing RT). Emit a harmless
    // placeholder typed as ValueFieldInt so the dispatch resolves.
    return { Type: typeIndex("ValueFieldInt"), Data: data };
  }
  if (c.type === "Dropdown") {
    // Dropdown marker is consumed by serializeSlot's hasDropdown branch and
    // by buildDropdownPopupSlot; it never lands as a real component in the
    // export. Same defensive placeholder as the other markers.
    return { Type: typeIndex("ValueFieldInt"), Data: data };
  }
  if (c.type === "KeypadDisplay" || c.type === "KeypadKey") {
    return { Type: typeIndex("ValueFieldInt"), Data: data };
  }
  if (c.type === "ReferenceField") {
    // Fallback only — serializeSlot intercepts ReferenceField markers and
    // builds the proper component itself. Emit a harmless placeholder typed
    // as ReferenceField<IWorldElement> so the dispatch resolves.
    return { Type: typeIndex("ReferenceFieldIWorldElement"), Data: data };
  }
  if (c.type === "ScrollArea") {
    // Fallback only — serializeSlot intercepts ScrollArea markers and
    // builds the proper hierarchy. Emit a placeholder typed as ScrollRect.
    return { Type: typeIndex("ScrollRect"), Data: data };
  }
  return { Type: typeIndex(c.type), Data: data };
}

// Describes the canonical value field an interactive control exposes, so
// serializeSlot can attach a "📚 Value" child slot mirroring it. Populated by
// each build*Slot helper (and the RadioGroup branch) and consumed in the
// Children-assembly step at the bottom of serializeSlot.
type ValueExport = {
  kind: "bool" | "int" | "float" | "string" | "reference" | "colorX";
  sourceFieldId: string;                       // the control's real value/reference field
  // seed for the exposed variable (null for reference; {r,g,b,a} for colorX)
  initial: boolean | number | string | null | { r: number; g: number; b: number; a: number };
  // Direction of the sync:
  //   false/undefined (default) — the CONTROL is authoritative; the variable
  //     mirrors it (ValueCopy Source=control → Target=variable, WriteBack on so
  //     it stays writable). Right for inputs the user manipulates (slider,
  //     checkbox, text field, dropdown, radio).
  //   true — the VARIABLE is authoritative; it DRIVES the control (ValueCopy
  //     Source=variable → Target=control). Right for OUTPUT displays that
  //     RECEIVE a value, like a progress bar — the variable is the writable
  //     input and the control's field is driven by it (not the reverse).
  drive?: boolean;
};

// Variable names already used this export, for dedup within the canvas's
// DynamicVariableSpace (two "Checkbox" slots → "Checkbox", "Checkbox 2", …).
let _valueVarNames: Set<string> = new Set();
// Master switch for the exposed-value two-way sync. The Source→Target read
// path is always correct; flip this to false only if VR testing shows the
// WriteBack (write-the-variable-to-drive-the-control) path fighting a control.
const VALUE_SLOT_WRITEBACK = true;

// Component marker types that produce an exposed value (one "📚 Value" slot each).
const MARKER_TYPES_FOR_VALUE = new Set([
  "Checkbox", "Toggle", "Slider", "ProgressBar", "TextField", "Dropdown", "RadioGroup", "ReferenceField", "ColorPicker",
]);
// markerSlot.id → the wrapper slot.id the "📚 Value" should attach to (nearest
// ancestor-or-self with a "Label" Text child — the friendly control row).
let _valueWrapperOf: Map<string, string> = new Map();
// wrapper slot.id → that wrapper's Label text, used as the variable name.
let _valueWrapperLabel: Map<string, string> = new Map();
// wrapper slot.id → value exports waiting to be appended as children once that
// wrapper finishes serializing its descendants (the marker, which produces the
// source field, is a descendant serialized DURING the wrapper's children map).
let _pendingValueSlots: Map<string, ValueExport[]> = new Map();

function hasLabelChild(slot: Slot): boolean {
  return slot.children.some((ch) => ch.name === "Label" && ch.components.some((c) => c.type === "Text"));
}
function labelTextOf(slot: Slot): string | null {
  const labelChild = slot.children.find((ch) => ch.name === "Label" && ch.components.some((c) => c.type === "Text"));
  const txt = labelChild?.components.find((c) => c.type === "Text");
  const content = txt ? (txt.props as Record<string, unknown>).content : null;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}
// Precompute, for every interactive marker slot, which wrapper its "📚 Value"
// attaches to and what to name the variable. Runs once at export start on the
// source tree (before synthetic Label children exist).
function computeValueSlotWrappers(root: Slot) {
  const ancestors: Slot[] = [];
  (function walk(slot: Slot) {
    if (slot.components.some((c) => MARKER_TYPES_FOR_VALUE.has(c.type))) {
      // Nearest ancestor-or-self carrying a "Label" Text child = the control row.
      let wrapper = slot;
      for (const cand of [slot, ...ancestors.slice().reverse()]) {
        if (hasLabelChild(cand)) { wrapper = cand; break; }
      }
      _valueWrapperOf.set(slot.id, wrapper.id);
      const lbl = labelTextOf(wrapper);
      if (lbl) _valueWrapperLabel.set(wrapper.id, lbl);
    }
    ancestors.push(slot);
    for (const ch of slot.children) walk(ch);
    ancestors.pop();
  })(root);
}

// Build the dedicated "📚 Value" child slot for an interactive control. Holds a
// DynamicValueVariable<T> (the exposed value, named after the control) kept in
// sync with the control's real field by a ValueCopy<T>. Deliberately carries NO
// RectTransform, so it never participates in UIX layout or rendering — it's a
// pure data container the end user can find and grab in the scene inspector.
function buildValueSlot(
  parentId: string,
  baseName: string,
  v: ValueExport,
): Record<string, unknown> {
  let varName = (baseName || "Value").trim() || "Value";
  if (_valueVarNames.has(varName)) {
    let n = 2;
    while (_valueVarNames.has(`${varName} ${n}`)) n++;
    varName = `${varName} ${n}`;
  }
  _valueVarNames.add(varName);

  // drive=true → the variable is authoritative and DRIVES the control
  // (Source=variable, Target=control). Otherwise the control is authoritative
  // and the variable mirrors it (Source=control, Target=variable) with
  // WriteBack so it stays two-way writable.
  let compData: Array<{ Type: Int32; Data: Record<string, unknown> }>;
  if (v.kind === "reference") {
    // Reference output: a DynamicReferenceVariable holding the dropped object,
    // kept in sync with the control's reference field by a ReferenceCopy.
    const dvr = compDynamicReferenceVariable(varName);
    const rc = v.drive
      ? compReferenceCopy(dvr.referenceFieldId, v.sourceFieldId, false)
      : compReferenceCopy(v.sourceFieldId, dvr.referenceFieldId, VALUE_SLOT_WRITEBACK);
    compData = [
      { Type: typeIndex("DynamicReferenceVariableIWorldElement"), Data: dvr.data },
      { Type: typeIndex("ReferenceCopyIWorldElement"),            Data: rc },
    ];
  } else {
    const dvvType = {
      bool:   "DynamicValueVariableBool",
      int:    "DynamicValueVariableInt",
      float:  "DynamicValueVariableFloat",
      string: "DynamicValueVariableString",
      colorX: "DynamicValueVariableColorX",
    }[v.kind];
    const vcType = {
      bool:   "ValueCopyBool",
      int:    "ValueCopyInt",
      float:  "ValueCopyFloat",
      string: "ValueCopyString",
      colorX: "ValueCopyColorX",
    }[v.kind];
    const dvv = compDynamicValueVariable(v.kind, varName, v.initial as boolean | number | string | { r: number; g: number; b: number; a: number });
    const vc = v.drive
      ? compValueCopy(dvv.valueFieldId, v.sourceFieldId, false)
      : compValueCopy(v.sourceFieldId, dvv.valueFieldId, VALUE_SLOT_WRITEBACK);
    compData = [
      { Type: typeIndex(dvvType), Data: dvv.data },
      { Type: typeIndex(vcType),  Data: vc },
    ];
  }

  return {
    ID: nextId(),
    Components: {
      ID: nextId(),
      Data: compData,
    },
    Name:           { ID: nextId(), Data: "📚 Value" },
    Tag:            { ID: nextId(), Data: "uixstudio-value" },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [],
  };
}

// ── Slot builders (extracted from serializeSlot, T4-C1) ───────────────────────
// Each builder lowers one control-type slot into its component list (+ any
// synthesized child subtree). They are pure with respect to the export's
// module-level state (ID counter, material temps, theme) — extracting them does
// NOT change emitted output, only where the code lives. `slotId` is the
// sequential ID already allocated for the host slot by serializeSlot.

type BuiltComp = { Type: Int32; Data: Record<string, unknown> };

// Spinner slot — replaces the Image with a procedural UIX.OutlinedArc + two
// ValueGradientDriver<float>s (animating Arc length and Offset angle) + a
// ValueCopy<float> mirroring gradient progress, plus a synthetic "ProtoFlux"
// child slot with the WorldTime → Mod → Mul → FieldDrive chain. Mirrors
// UIX Template/SpinnerExample exactly.
function buildSpinnerSlot(
  slot: Slot,
  rtComp: UixComponent,
  imageComp: UixComponent,
  slotId: string,
): { components: BuiltComp[]; protoFlux: Record<string, unknown>; valueExport: ValueExport } {
  const imgProps = imageComp.props as Record<string, unknown>;
  const fillTint = _exportTheme?.accent
    ?? (imgProps.tint as { r: number; g: number; b: number; a: number } | undefined)
    ?? { r: 0.272, g: 0.567, b: 0.842, a: 1 };

  // Build the OutlinedArc + drivers in order — Arc/Offset field IDs are
  // exposed by the OutlinedArc builder so the gradients can target them.
  const arc = compOutlinedArc(fillTint, _circleSegmentMatId || "00000000-0000-0000-0000-000000000000");
  const arcGrad = compValueGradientDriverFloat(arc.arcFieldId, [
    { pos: 0,     value: 180 },
    { pos: 0.504, value: 350 },
    { pos: 1,     value: 180 },
  ]);
  const offGrad = compValueGradientDriverFloat(arc.offsetFieldId, [
    { pos: 0, value: -360 },
    { pos: 1, value:  360 },
  ]);
  const copy = compValueCopyFloat(arcGrad.progressFieldId, offGrad.progressFieldId);

  const spOrdered: BuiltComp[] = [];
  spOrdered.push(buildComponent(rtComp));
  spOrdered.push({ Type: typeIndex("OutlinedArc"),               Data: arc.data });
  spOrdered.push({ Type: typeIndex("ValueGradientDriverFloat"),  Data: arcGrad.data });
  spOrdered.push({ Type: typeIndex("ValueGradientDriverFloat"),  Data: offGrad.data });
  spOrdered.push({ Type: typeIndex("ValueCopyFloat"),            Data: copy });
  // Preserve any other user-attached components (LayoutElement etc.).
  // Skip the Image (we replaced it) and the marker-style components.
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp) continue;
    spOrdered.push(buildComponent(c));
  }

  // ── ProtoFlux child subtree — drives arcGrad.Progress every frame. ──
  // Layout: each node lives on its own slot under a wrapper "ProtoFlux".
  const protofluxSlotId = nextId();
  const protofluxCompListId = nextId();

  const wrapNode = (name: string, comps: BuiltComp[]) => {
    const slotIdLocal = nextId();
    return {
      ID: slotIdLocal,
      Components: { ID: nextId(), Data: comps },
      Name:           { ID: nextId(), Data: name },
      Tag:            { ID: nextId(), Data: null },
      Active:         { ID: nextId(), Data: true },
      "Persistent-ID": nextId(),
      Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
      Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
      Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
      OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
      ParentReference: protofluxSlotId,
      Children: [],
    };
  };

  // Build nodes in dependency order so each component ID is known before
  // any downstream node references it.
  const worldTimeData = compWorldTimeFloat();
  const worldTimeId   = worldTimeData.ID as string;

  const modDivisorData = compValueInputFloat(2);   // mod divisor
  const modDivisorId   = modDivisorData.ID as string;

  const modData = compValueModFloat(worldTimeId, modDivisorId);
  const modId   = modData.ID as string;

  const mulFactorData = compValueInputFloat(0.5);  // 1 / mod-divisor — yields 0..1
  const mulFactorId   = mulFactorData.ID as string;

  const mulData = compValueMulFloat(modId, mulFactorId);
  const mulId   = mulData.ID as string;

  const driveData = compValueFieldDriveFloat(mulId);
  const driveId   = driveData.ID as string;
  const proxyData = compFieldDriveProxyFloat(driveId, arcGrad.progressFieldId);

  const protofluxChild: Record<string, unknown> = {
    ID: protofluxSlotId,
    Components: { ID: protofluxCompListId, Data: [] },
    Name:           { ID: nextId(), Data: "ProtoFlux" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: slotId,
    Children: [
      wrapNode("WorldTimeFloat",   [{ Type: typeIndex("WorldTimeFloat"),       Data: worldTimeData }]),
      wrapNode("ValueInput`1",     [{ Type: typeIndex("ValueInputFloat"),      Data: modDivisorData }]),
      wrapNode("ValueMod`1",       [{ Type: typeIndex("ValueModFloat"),        Data: modData }]),
      wrapNode("ValueInput`1",     [{ Type: typeIndex("ValueInputFloat"),      Data: mulFactorData }]),
      wrapNode("ValueMul`1",       [{ Type: typeIndex("ValueMulFloat"),        Data: mulData }]),
      wrapNode("ValueFieldDrive`1", [
        { Type: typeIndex("ValueFieldDriveFloat"),     Data: driveData },
        { Type: typeIndex("FieldDriveBaseFloatProxy"), Data: proxyData },
      ]),
    ],
  };

  // Expose a boolean "is the spinner showing?" value. drive:true → the
  // variable is authoritative and drives the OutlinedArc's Enabled field:
  // set it false to hide the spinner (renderer disabled, no draw call) without
  // deactivating the slot — so the layout row keeps its space and siblings
  // don't shift. Seeds true so the spinner is visible on import.
  const valueExport: ValueExport = {
    kind: "bool",
    sourceFieldId: arc.enabledFieldId,
    initial: true,
    drive: true,
  };

  return { components: spOrdered, protoFlux: protofluxChild, valueExport };
}

// ProgressBar slot — progress indicator with a single-float drive surface at
// the root. Host slot becomes the track (user Image + RT) plus a
// ValueField<float> (user-drivable progress) + Float2Driver writing into the
// synthesized Fill child's RT.AnchorMax. Verified against
// UIX Template/Progress Bar Fix.
function buildProgressBarSlot(
  slot: Slot,
  rtComp: UixComponent,
  imageComp: UixComponent | undefined,
  progressBarComp: UixComponent,
  slotId: string,
): { components: BuiltComp[]; fill: Record<string, unknown>; valueExport: ValueExport } {
  const pp = progressBarComp.props as Record<string, unknown>;
  const pbValue = (pp.value as number) ?? 0.6;
  const pbMin   = (pp.min   as number) ?? 0;
  const pbMax   = (pp.max   as number) ?? 1;
  const pbDir   = (pp.direction as string) ?? "Horizontal";
  const pbFill  = (pp.fillColor as { r: number; g: number; b: number; a: number })
    ?? { r: 0.18, g: 0.36, b: 0.6, a: 1 };
  const pbNorm = pbMax !== pbMin
    ? Math.max(0, Math.min(1, (pbValue - pbMin) / (pbMax - pbMin)))
    : 0;
  // For Horizontal direction the Fill grows along X (AnchorMax = (norm, 1));
  // for Vertical it grows along Y (AnchorMax = (1, norm)). The Float2Driver
  // routes X→user value, Y→constant 1 in both cases — Vertical just swaps
  // which side of the float2 receives the user value via the driver's X/Y
  // field assignments (the Image's RT is the same shape).
  const pbFillAnchorMax = pbDir === "Vertical" ? [1, pbNorm] : [pbNorm, 1];

  // Build Fill RT FIRST so its AnchorMax field ID becomes the
  // Float2Driver's Target. Build the Fill's "constant 1" ValueField
  // SECOND so its Value field ID becomes the Float2Driver's Y (Horizontal)
  // or X (Vertical) source.
  const pbFillSlotId = nextId();
  const pbFillCompListId = nextId();
  const pbFillRtBuilt = buildComponent({
    type: "RectTransform",
    props: {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: pbFillAnchorMax[0], y: pbFillAnchorMax[1] },
      offsetMin: { x: 0, y: 0 },
      offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  });
  const pbFillAnchorMaxFieldId = (
    (pbFillRtBuilt.Data as Record<string, unknown>).AnchorMax as { ID: string }
  ).ID;
  const pbFillImageBuilt = buildComponent({
    type: "Image",
    props: { tint: pbFill, preserveAspect: false, spriteUrl: "", cornerRadius: 100 },
  });
  // Fill-side constant: value = 1, feeds the "fixed" axis of the float2.
  const pbFillConstVf = compValueFieldFloat(1);

  const fill = {
    ID: pbFillSlotId,
    Components: {
      ID: pbFillCompListId,
      Data: [
        pbFillRtBuilt,
        pbFillImageBuilt,
        { Type: typeIndex("ValueFieldFloat"), Data: pbFillConstVf.data },
      ],
    },
    Name:           { ID: nextId(), Data: "Fill" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: slotId,
    Children: [],
  };

  // Host-side ValueField — the user-facing progress drive surface.
  // Seeded to the same normalized value the Fill starts at so the
  // initial visual matches the initial value at frame 0.
  const pbHostProgressVf = compValueFieldFloat(pbNorm);
  // Float2Driver routes:
  //   Horizontal: X = progress (host), Y = 1 (fill)
  //   Vertical:   X = 1 (fill),       Y = progress (host)
  const pbDriverData = pbDir === "Vertical"
    ? compFloat2Driver(pbFillConstVf.valueFieldId,    pbHostProgressVf.valueFieldId, pbFillAnchorMaxFieldId)
    : compFloat2Driver(pbHostProgressVf.valueFieldId, pbFillConstVf.valueFieldId,    pbFillAnchorMaxFieldId);

  // Host slot components: RT first, then user's Image (track) if any,
  // then any other user-authored components (LayoutElement, etc.), then
  // the Float2Driver + the user-drivable ValueField<float>. The
  // ProgressBar marker itself is filtered out — it's a build-time hint.
  const pbOrdered: BuiltComp[] = [];
  pbOrdered.push(buildComponent(rtComp));
  if (imageComp) pbOrdered.push(buildComponent(imageComp));
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === progressBarComp) continue;
    pbOrdered.push(buildComponent(c));
  }
  pbOrdered.push({ Type: typeIndex("Float2Driver"),     Data: pbDriverData });
  pbOrdered.push({ Type: typeIndex("ValueFieldFloat"),  Data: pbHostProgressVf.data });

  // A progress bar RECEIVES a value, so the exposed variable is the
  // authoritative INPUT that DRIVES the bar (drive: true): the "📚 Value"
  // variable is writable (not driven) and the bar's progress field is driven
  // by it — the opposite direction from inputs like sliders.
  return {
    components: pbOrdered,
    fill,
    valueExport: { kind: "float", sourceFieldId: pbHostProgressVf.valueFieldId, initial: pbNorm, drive: true },
  };
}

// TextField slot — full UIX.TextField + TextEditor wiring. Host slot gets RT +
// (user Image) + Button (click-to-focus) + TextField + TextEditor (+ optional
// float/int parser), and a synthesized "Text" child carries the editable
// UIX.Text the editor reads/writes.
function buildTextFieldSlot(
  slot: Slot,
  rtComp: UixComponent,
  imageComp: UixComponent | undefined,
  buttonComp: UixComponent | undefined,
  textFieldComp: UixComponent,
  slotId: string,
): { components: BuiltComp[]; text: Record<string, unknown>; valueExport: ValueExport } {
  const tfp = textFieldComp.props as Record<string, unknown>;
  const textContent = (tfp.textContent as string) ?? "";
  const fontSize    = (tfp.fontSize    as number) ?? 16;
  const textColor   = _exportTheme?.bodyTextColor
    ?? (tfp.textColor as { r: number; g: number; b: number; a: number })
    ?? { r: 0.9, g: 0.9, b: 0.9, a: 1 };
  const textAlign   = (tfp.textAlign   as string) ?? "Left";

  // Pre-allocate the child Text slot, capturing its Text component ID.
  const textSlotId = nextId();
  const textCompListId = nextId();
  const textBuilt = {
    Type: typeIndex("Text"),
    Data: compText({
      content: textContent,
      size: fontSize,
      color: textColor,
      horizontalAlign: textAlign as "Left" | "Center" | "Right",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  };
  const textComponentId = (textBuilt.Data as Record<string, unknown>).ID as string;
  // The editable string lives in this Text's Content field — that's what the
  // "📚 Value" variable mirrors.
  const tfContentFieldId = (
    (textBuilt.Data as Record<string, unknown>).Content as { ID: string }
  ).ID;
  const textRtBuilt = buildComponent({
    type: "RectTransform",
    props: {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 8, y: 0 },
      offsetMax: { x: -8, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  });

  // Build the TextEditor first (its ID is referenced by TextField.Editor),
  // then TextField pointing at it.
  const textEditorData = compTextEditor(textComponentId, textColor);
  const textEditorComponentId = textEditorData.ID as string;
  const textEditorBuilt = { Type: typeIndex("TextEditor"), Data: textEditorData };
  const textFieldBuilt = {
    Type: typeIndex("TextField"),
    Data: compTextField(textEditorComponentId),
  };

  // Order on the TextField slot: RT, Image (if authored), Button (for
  // click-to-focus), then TextField + TextEditor, then anything else.
  // If the user didn't add a Button, synthesize one — Resonite needs
  // InteractionTarget+Button on the slot to capture clicks and activate
  // the TextEditor.
  const buttonProps = buttonComp?.props ?? {
    normalColor:    { r: 0.25, g: 0.25, b: 0.25, a: 1 },
    highlightColor: { r: 0.4, g: 0.4, b: 0.4, a: 1 },
    pressColor:     { r: 0.15, g: 0.15, b: 0.15, a: 1 },
    disabledColor:  { r: 0.3, g: 0.3, b: 0.3, a: 1 },
  };
  const buttonBuiltTF = {
    Type: typeIndex("Button"),
    Data: compButton(buttonProps as Record<string, unknown>),
  };

  const ordered: BuiltComp[] = [];
  ordered.push(buildComponent(rtComp));
  if (imageComp) ordered.push(buildComponent(imageComp));
  ordered.push(buttonBuiltTF);
  ordered.push(textFieldBuilt);
  ordered.push(textEditorBuilt);

  // Exposed value: for typed fields, expose the PARSED number from the editor
  // parser's ParsedValue field (a real float/int IField), not the raw
  // Text.Content string. Plain text fields expose the string content.
  const fieldType = (tfp.fieldType as string) ?? "text";
  let tfValueExport: ValueExport;
  if (fieldType === "float") {
    const parser = compFloatTextEditorParser();
    ordered.push({ Type: typeIndex("FloatTextEditorParser"), Data: parser });
    const parsed = parseFloat(textContent);
    tfValueExport = {
      kind: "float",
      sourceFieldId: (parser.ParsedValue as { ID: string }).ID,
      initial: Number.isFinite(parsed) ? parsed : 0,
    };
  } else if (fieldType === "int") {
    const parser = compIntTextEditorParser();
    ordered.push({ Type: typeIndex("IntTextEditorParser"), Data: parser });
    const parsed = parseInt(textContent, 10);
    tfValueExport = {
      kind: "int",
      sourceFieldId: (parser.ParsedValue as { ID: string }).ID,
      initial: Number.isFinite(parsed) ? parsed : 0,
    };
  } else {
    tfValueExport = { kind: "string", sourceFieldId: tfContentFieldId, initial: textContent };
  }

  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === buttonComp || c === textFieldComp) continue;
    ordered.push(buildComponent(c));
  }

  // Synthetic Text child slot — holds the rendered+editable Text component.
  const text = {
    ID: textSlotId,
    Components: {
      ID: textCompListId,
      Data: [textRtBuilt, textBuilt],
    },
    Name:           { ID: nextId(), Data: "Text" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: slotId,
    Children: [],
  };

  return {
    components: ordered,
    text,
    valueExport: tfValueExport,
  };
}

// Knob slot — animated slide chain. Two BooleanValueDriver<float2>s write into
// SmoothValue<float2>s that drive RT.OffsetMin/OffsetMax. The two driver State
// field IDs are stashed in the module temps _lastKnobAStateId/_lastKnobBStateId
// for the parent Toggle's ValueMultiDriver<bool>.Drives list.
function buildKnobSlot(
  slot: Slot,
  rtComp: UixComponent,
  knobComp: UixComponent,
): { components: BuiltComp[] } {
  const rtBuilt = buildComponent(rtComp);
  const rtData = rtBuilt.Data as Record<string, unknown>;
  const offMinId = (rtData.OffsetMin as { ID: string }).ID;
  const offMaxId = (rtData.OffsetMax as { ID: string }).ID;

  const kp = knobComp.props as Record<string, unknown>;
  const offMin = (kp.offOffsetMin as { x: number; y: number }) ?? { x: -27, y: -13 };
  const offMax = (kp.offOffsetMax as { x: number; y: number }) ?? { x: -1,  y:  13 };
  const onMin  = (kp.onOffsetMin  as { x: number; y: number }) ?? { x:  1,  y: -13 };
  const onMax  = (kp.onOffsetMax  as { x: number; y: number }) ?? { x: 27,  y:  13 };

  // SmoothValue wraps each axis. Initial TargetValue is offMin/offMax so
  // the animation starts at the "off" position; parent's ValueMultiDriver
  // pushes drivers to the "on" state on first frame if needed.
  const smoothMin = compSmoothValueFloat2(offMinId, offMin);
  const smoothMax = compSmoothValueFloat2(offMaxId, offMax);

  // Drivers write into SmoothValue.TargetValue (instead of RT directly).
  const driverA = compBooleanValueDriverFloat2(smoothMin.targetValueId, offMin, onMin, false);
  const driverB = compBooleanValueDriverFloat2(smoothMax.targetValueId, offMax, onMax, false);
  _lastKnobAStateId = driverA.stateFieldId;
  _lastKnobBStateId = driverB.stateFieldId;

  const ordered: BuiltComp[] = [rtBuilt];
  for (const c of slot.components) {
    if (c === rtComp || c === knobComp) continue;
    ordered.push(buildComponent(c));
  }
  ordered.push({ Type: typeIndex("BooleanValueDriverFloat2"), Data: driverA.data });
  ordered.push({ Type: typeIndex("SmoothValueFloat2"),        Data: smoothMin.data });
  ordered.push({ Type: typeIndex("BooleanValueDriverFloat2"), Data: driverB.data });
  ordered.push({ Type: typeIndex("SmoothValueFloat2"),        Data: smoothMax.data });
  return { components: ordered };
}

// Stateful bool-toggle slot — both Checkbox and Toggle resolve here. Emits
// Image + Button + BooleanValueDriver<colorX> targeting Image.Tint + UIX.Checkbox.
// Toggle adds a SmoothValue<colorX> and, when a Knob child is present,
// pre-serializes it (capturing its driver State IDs via the module temps) and
// adds a ValueMultiDriver<bool> broadcasting the toggle state to color + knob.
// Returns preBuiltKnob/preBuiltKnobIdx so the caller's Children mapper can splice
// the pre-serialized knob back in at its original index.
function buildBoolToggleSlot(
  slot: Slot,
  rtComp: UixComponent | undefined,
  imageComp: UixComponent,
  buttonComp: UixComponent,
  checkboxComp: UixComponent | undefined,
  toggleComp: UixComponent | undefined,
  markerComp: UixComponent,
  slotId: string,
): { components: BuiltComp[]; preBuiltKnob: Record<string, unknown> | null; preBuiltKnobIdx: number; valueExport: ValueExport } {
  const markerProps = markerComp.props as Record<string, unknown>;
  const initialState = (markerProps.initialState as boolean) ?? !!checkboxComp;
  const baseTint = ((imageComp.props as Record<string, unknown>).tint as
    { r: number; g: number; b: number; a: number }) ?? { r: 1, g: 1, b: 1, a: 1 };

  const offTint = toggleComp
    ? (markerProps.offColor as { r: number; g: number; b: number; a: number }) ?? { r: 0.22, g: 0.22, b: 0.22, a: 1 }
    : { r: baseTint.r, g: baseTint.g, b: baseTint.b, a: 0 };
  const onTint = toggleComp
    ? (markerProps.onColor as { r: number; g: number; b: number; a: number }) ?? { r: 0.18, g: 0.36, b: 0.6, a: 1 }
    : { r: baseTint.r, g: baseTint.g, b: baseTint.b, a: baseTint.a };

  // Override the Image's authored tint to match initialState — keeps the
  // import-time render aligned with the runtime driver's first write.
  const initialTint = initialState ? onTint : offTint;
  const baseImageProps = imageComp.props as Record<string, unknown>;
  // The rocker's corner shape now follows the Image's own cornerRadius
  // (pill at 100, square at 0) — no special rocker routing needed.
  const imageProps: Record<string, unknown> = {
    ...baseImageProps,
    tint: initialTint,
  };
  const imageBuilt = { Type: typeIndex("Image"), Data: compImage(imageProps) };
  const tintFieldId = ((imageBuilt.Data as Record<string, unknown>).Tint as { ID: string }).ID;

  // Button with no ColorDriver. Clicks still register and propagate to
  // UIX.Checkbox.
  const buttonBuilt = {
    Type: typeIndex("Button"),
    Data: compButton(buttonComp.props as Record<string, unknown>),
  };

  // For Toggle slots: insert a SmoothValue<colorX> between the
  // BooleanValueDriver<colorX> and Image.Tint, so the color change
  // animates smoothly. Driver writes into SmoothValue.TargetValue,
  // SmoothValue interpolates and writes into Image.Tint.
  // (Checkbox uses alpha-toggling on an icon sprite, where instant flip is
  // visually fine — keeping it direct keeps the wiring leaner.)
  let smoothColor: { data: Record<string, unknown>; targetValueId: string } | null = null;
  let colorDriverTargetFieldId = tintFieldId;
  if (toggleComp) {
    smoothColor = compSmoothValueColorAuto(tintFieldId, initialTint);
    colorDriverTargetFieldId = smoothColor.targetValueId;
  }

  const driverResult = compBooleanValueDriverColorX(colorDriverTargetFieldId, offTint, onTint, initialState);

  // Knob extension: if this is a Toggle (not Checkbox) and has a Knob
  // child, pre-serialize it now to capture its float2 driver State IDs,
  // then add a ValueMultiDriver<bool> that broadcasts this slot's primary
  // state to (a) the color driver State and (b) both knob anchor driver
  // States. The Checkbox.TargetState then points at the MultiDriver.Value
  // so one click flips everything in lock-step.
  let multiBuilt: BuiltComp | null = null;
  let checkboxTargetStateId = driverResult.stateFieldId;
  let preBuiltKnob: Record<string, unknown> | null = null;
  let preBuiltKnobIdx = -1;
  if (toggleComp) {
    const knobIdx = slot.children.findIndex((c) =>
      c.components.some((cc) => cc.type === "Knob"),
    );
    if (knobIdx >= 0) {
      _lastKnobAStateId = "";
      _lastKnobBStateId = "";
      preBuiltKnob = serializeSlot(slot.children[knobIdx], slotId, knobIdx);
      preBuiltKnobIdx = knobIdx;
      if (_lastKnobAStateId && _lastKnobBStateId) {
        const multiResult = compValueMultiDriverBool(initialState, [
          driverResult.stateFieldId,
          _lastKnobAStateId,
          _lastKnobBStateId,
        ]);
        multiBuilt = { Type: typeIndex("ValueMultiDriverBool"), Data: multiResult.data };
        checkboxTargetStateId = multiResult.valueFieldId;
      }
    }
  }

  const checkboxBuilt = {
    Type: typeIndex("Checkbox"),
    Data: compCheckbox(checkboxTargetStateId, initialState),
  };

  const ordered: BuiltComp[] = [];
  if (rtComp) ordered.push(buildComponent(rtComp));
  ordered.push(imageBuilt, buttonBuilt);
  ordered.push({ Type: typeIndex("BooleanValueDriverColorX"), Data: driverResult.data });
  if (smoothColor) ordered.push({ Type: typeIndex("SmoothValueColorX"), Data: smoothColor.data });
  if (multiBuilt) ordered.push(multiBuilt);
  ordered.push(checkboxBuilt);
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === buttonComp) continue;
    if (c === checkboxComp || c === toggleComp) continue;
    ordered.push(buildComponent(c));
  }

  // checkboxTargetStateId is the canonical bool the click toggles (the color
  // driver State for a plain Checkbox, or the ValueMultiDriver Value for a
  // Toggle-with-knob) — that's what the "📚 Value" variable mirrors.
  return {
    components: ordered,
    preBuiltKnob,
    preBuiltKnobIdx,
    valueExport: { kind: "bool", sourceFieldId: checkboxTargetStateId, initial: initialState },
  };
}

// Slider slot — full UIX.Slider<float> wiring. Host gets RT + (user Image) +
// Slider<float>. A synthesized "Fill" child (RT + Image + SmoothValue<float2>)
// represents the filled portion (its AnchorMax is driven by the slider), and a
// "Knob" grandchild rides the Fill's leading edge.
function buildSliderSlot(
  slot: Slot,
  rtComp: UixComponent,
  imageComp: UixComponent | undefined,
  sliderComp: UixComponent,
  slotId: string,
): { components: BuiltComp[]; fill: Record<string, unknown>; valueExport: ValueExport } {
  const sp = sliderComp.props as Record<string, unknown>;
  const sliderValue   = (sp.value as number) ?? 0.5;
  const sliderMin     = (sp.min   as number) ?? 0;
  const sliderMax     = (sp.max   as number) ?? 1;
  const sliderDir     = (sp.direction as string) ?? "Horizontal";
  const fillColorProp = (sp.fillColor as { r: number; g: number; b: number; a: number })
    ?? { r: 0.18, g: 0.36, b: 0.6, a: 1 };
  // Normalize the value to 0..1 for the Fill's initial AnchorMax. Clamp so
  // the editor preview never overflows the track even if the user enters
  // out-of-range values.
  const norm = sliderMax !== sliderMin
    ? Math.max(0, Math.min(1, (sliderValue - sliderMin) / (sliderMax - sliderMin)))
    : 0;
  const fillAnchorMax = sliderDir === "Vertical" ? [1, norm] : [norm, 1];

  // Pre-allocate the Fill slot's IDs in counter order so the BSON output
  // stays deterministic. We claim: slot ID, components list ID, RT
  // component IDs (via buildComponent on a synthetic RT), Image IDs, etc.
  const fillSlotId = nextId();
  const fillCompListId = nextId();
  const fillRtBuilt = buildComponent({
    type: "RectTransform",
    props: {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: fillAnchorMax[0], y: fillAnchorMax[1] },
      offsetMin: { x: 0, y: 0 },
      offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  });
  const fillAnchorMaxFieldId = ((fillRtBuilt.Data as Record<string, unknown>)
    .AnchorMax as { ID: string }).ID;
  // Fill Image uses the pill sprite so the filled portion gets matching
  // half-circle ends — without this the fill is a flat rectangle that
  // overflows a pill-shaped track on the left.
  const fillImageBuilt = buildComponent({
    type: "Image",
    props: { tint: fillColorProp, preserveAspect: false, spriteUrl: "", cornerRadius: 100 },
  });

  // SmoothValue<float2> sits on the FILL slot, not on the Slider slot.
  // The Slider's HandleAnchorMaxDrive writes into THIS SmoothValue's
  // TargetValue field; the SmoothValue then animates Fill.RT.AnchorMax
  // (referenced via `Value`) toward TargetValue. Wiring HandleAnchorMaxDrive
  // directly to the RT.AnchorMax silently fails to move the visual — only
  // the routing through SmoothValue.TargetValue actually drives the rect.
  const fillSmooth = compSmoothValueFloat2(
    fillAnchorMaxFieldId,
    { x: fillAnchorMax[0], y: fillAnchorMax[1] },
  );

  // Build the Slider<float> pointing at the SmoothValue's TargetValue.
  const sliderBuilt = {
    Type: typeIndex("SliderFloat"),
    Data: compSliderFloat(sp, fillSmooth.targetValueId),
  };
  // The Slider's own Value field (raw, in min..max units) is the exposed value.
  const sliderValueFieldId = (
    (sliderBuilt.Data as Record<string, unknown>).Value as { ID: string }
  ).ID;

  // Order on the Slider slot: RT, Image (if user authored one), Slider,
  // then any other user-authored components (LayoutElement, etc.). The
  // SmoothValue lives on the Fill child, not here.
  const ordered: BuiltComp[] = [];
  ordered.push(buildComponent(rtComp));
  if (imageComp) ordered.push(buildComponent(imageComp));
  ordered.push(sliderBuilt);
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === sliderComp) continue;
    ordered.push(buildComponent(c));
  }

  // Build the synthetic "Knob" child slot — a white circle that rides at
  // the leading edge of the Fill (the right edge for horizontal, top edge
  // for vertical). By nesting it INSIDE the Fill slot and anchoring it to
  // the Fill's far edge, the knob automatically follows the Slider's
  // HandleAnchorMaxDrive — no extra cross-referencing required. Size
  // matches the Toggle's knob (26×26 centered, offsets ±13). Uses the
  // rounded sprite for a pill/circle shape on a 1:1 rect.
  const knobAnchor: [number, number] = sliderDir === "Vertical"
    ? [0.5, 1]
    : [1, 0.5];
  const knobSlotId = nextId();
  const knobCompListId = nextId();
  const knobRtBuilt = buildComponent({
    type: "RectTransform",
    props: {
      anchorMin: { x: knobAnchor[0], y: knobAnchor[1] },
      anchorMax: { x: knobAnchor[0], y: knobAnchor[1] },
      offsetMin: { x: -13, y: -13 },
      offsetMax: { x: 13,  y: 13 },
      pivot:     { x: 0.5, y: 0.5 },
    },
  });
  const knobImageBuilt = buildComponent({
    type: "Image",
    props: {
      tint: { r: 0.95, g: 0.95, b: 0.95, a: 1 },
      preserveAspect: false,
      spriteUrl: "",
      cornerRadius: 100,
    },
  });
  const knobSlot = {
    ID: knobSlotId,
    Components: {
      ID: knobCompListId,
      Data: [knobRtBuilt, knobImageBuilt],
    },
    Name:           { ID: nextId(), Data: "Knob" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: fillSlotId,
    Children: [],
  };

  // Stash the synthetic Fill slot for the children mapper to append. We
  // build the full slot record here so its IDs were allocated in order.
  const fill = {
    ID: fillSlotId,
    Components: {
      ID: fillCompListId,
      Data: [
        fillRtBuilt,
        fillImageBuilt,
        { Type: typeIndex("SmoothValueFloat2"), Data: fillSmooth.data },
      ],
    },
    Name:           { ID: nextId(), Data: "Fill" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: slotId,
    Children: [knobSlot],
  };

  return {
    components: ordered,
    fill,
    valueExport: { kind: "float", sourceFieldId: sliderValueFieldId, initial: sliderValue },
  };
}

// Radio button slot — one option in a mutually-exclusive group. Host gets
// RT + Image + Button + (on the group's first radio) the shared ValueField<int>
// + ButtonValueSet<int> + ValueEqualityDriver<int> + BooleanValueDriver<colorX>.
// A synthesized "Dot" child's Tint is driven opaque/transparent by selection.
// Uses the module-level _radioGroupFieldIds map to share the selected-index
// field across siblings of the same groupId.
function buildRadioSlot(
  slot: Slot,
  rtComp: UixComponent,
  imageComp: UixComponent,
  buttonComp: UixComponent | undefined,
  radioComp: UixComponent,
  slotId: string,
): { components: BuiltComp[]; dot: Record<string, unknown> } {
  const rp = radioComp.props as Record<string, unknown>;
  const groupId = (rp.groupId as string) ?? "group1";
  const idx = ((rp.index as number) ?? 0) | 0;
  const initiallySelected = (rp.initiallySelected as boolean) ?? false;
  const selectedColor = (rp.selectedColor as { r: number; g: number; b: number; a: number })
    ?? { r: 0.95, g: 0.95, b: 0.95, a: 1 };

  // 1. Pre-build the Dot child slot so its Image.Tint field ID is known
  //    before the BooleanValueDriver references it. The dot sits centered
  //    inside the radio with a 30% inset on each side (~40% of the
  //    radio's diameter, a natural radio-button proportion).
  const dotSlotId = nextId();
  const dotCompListId = nextId();
  const dotRtBuilt = buildComponent({
    type: "RectTransform",
    props: {
      anchorMin: { x: 0.3, y: 0.3 }, anchorMax: { x: 0.7, y: 0.7 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    },
  });
  // Initial Tint: opaque-selected if this radio starts selected, else
  // transparent. Matches the steady-state the EqualityDriver will write.
  const initialDotTint = initiallySelected
    ? selectedColor
    : { r: selectedColor.r, g: selectedColor.g, b: selectedColor.b, a: 0 };
  const dotImageBuilt = buildComponent({
    type: "Image",
    props: { tint: initialDotTint, preserveAspect: false, spriteUrl: "", cornerRadius: 100 },
  });
  const dotTintFieldId = ((dotImageBuilt.Data as Record<string, unknown>).Tint as { ID: string }).ID;

  // 2. Allocate or fetch the group's shared int field. First radio of a
  //    group seeds the map.
  let sharedFieldId = _radioGroupFieldIds.get(groupId);
  let valueFieldBuilt: BuiltComp | null = null;
  if (!sharedFieldId) {
    const initialIndex = initiallySelected ? idx : 0;
    const vfData = compValueFieldInt(initialIndex);
    sharedFieldId = vfData.valueFieldId;
    _radioGroupFieldIds.set(groupId, sharedFieldId);
    valueFieldBuilt = { Type: typeIndex("ValueFieldInt"), Data: vfData.data };
  }

  // 3. ButtonValueSet<int> — writes this radio's index to the shared
  //    field whenever the slot's Button fires.
  const bvsBuilt = {
    Type: typeIndex("ButtonValueSetInt"),
    Data: compButtonValueSetInt(sharedFieldId, idx),
  };

  // 4. BooleanValueDriver<colorX> — its State field is driven by the
  //    EqualityDriver below; it in turn writes a transparent vs opaque
  //    selectedColor into the dot's Tint. Build it FIRST so we can hand
  //    its State field ID to the EqualityDriver.
  const transparentTint = { r: selectedColor.r, g: selectedColor.g, b: selectedColor.b, a: 0 };
  const boolDriverResult = compBooleanValueDriverColorX(
    dotTintFieldId,
    transparentTint,
    selectedColor,
    initiallySelected,
  );

  // 5. ValueEqualityDriver<int> — compares shared field to idx, writes
  //    result into the BooleanValueDriver's State field.
  const eqDriverBuilt = {
    Type: typeIndex("ValueEqualityDriverInt"),
    Data: compValueEqualityDriverInt(
      sharedFieldId,
      idx,
      boolDriverResult.stateFieldId,
    ),
  };

  // 6. Build/order the slot's components. Match the natural Resonite
  //    save order: RT first, then Image, Button, plus the driver chain
  //    and the shared field (if owned by this radio).
  const ordered: BuiltComp[] = [];
  ordered.push(buildComponent(rtComp));
  ordered.push(buildComponent(imageComp));
  ordered.push(buildComponent(buttonComp ?? {
    type: "Button",
    props: {
      normalColor:    { r: 0.25, g: 0.25, b: 0.25, a: 1 },
      highlightColor: { r: 0.40, g: 0.40, b: 0.40, a: 1 },
      pressColor:     { r: 0.15, g: 0.15, b: 0.15, a: 1 },
      disabledColor:  { r: 0.30, g: 0.30, b: 0.30, a: 1 },
    },
  } as UixComponent));
  if (valueFieldBuilt) ordered.push(valueFieldBuilt);
  ordered.push(bvsBuilt);
  ordered.push(eqDriverBuilt);
  ordered.push({ Type: typeIndex("BooleanValueDriverColorX"), Data: boolDriverResult.data });
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === buttonComp || c === radioComp) continue;
    ordered.push(buildComponent(c));
  }

  // 7. Stash the Dot slot to be appended to children at the end of
  //    serializeSlot. ParentReference points at this Radio slot's ID.
  const dot = {
    ID: dotSlotId,
    Components: {
      ID: dotCompListId,
      Data: [dotRtBuilt, dotImageBuilt],
    },
    Name:           { ID: nextId(), Data: "Dot" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: slotId,
    Children: [],
  };

  return { components: ordered, dot };
}

// Tabs host slot — holds the shared selection state + the page-visibility
// drivers. The host is ALWAYS active, so the per-page ValueEqualityDriver<int>s
// (which gate each page slot's Active) must live HERE, never on the pages they
// hide — a component on an inactive slot stops running and would latch a hidden
// page hidden. Emits:
//   * RectTransform (the host rect)
//   * ValueField<int> — the selected tab index, seeded to activeTab. Its
//     Value-field id is stashed in _tabsSharedFieldByHost so this host's
//     TabButtons (serialized after it) can ButtonValueSet<int> into it.
//   * One ValueEqualityDriver<int> per page: (shared == pageIndex) → page.Active.
//     The page Active field UUIDs were pre-allocated in allocateTabsIds.
// Page index is positional (host child order), matching the editor + buttons.
function buildTabsHostComponents(
  slot: Slot,
  rtComp: UixComponent,
  tabsComp: UixComponent,
): { components: BuiltComp[] } {
  const tp = tabsComp.props as Record<string, unknown>;
  const pages = slot.children.filter((ch) => ch.components.some((c) => c.type === "TabPage"));
  // Clamp to a real page index (mirrors the editor's activeTabIndex). An
  // out-of-range value (stale save, deleted pages, hand-edited file) would seed
  // the shared field so NO page's ValueEqualityDriver ever matches → every page
  // exports Active=false → a blank tabbed group in-game.
  const activeTab = Math.max(0, Math.min(Math.max(0, pages.length - 1), ((tp.activeTab as number) ?? 0) | 0));

  const vf = compValueFieldInt(activeTab);
  _tabsSharedFieldByHost.set(slot.id, vf.valueFieldId);

  const out: BuiltComp[] = [];
  out.push(buildComponent(rtComp));
  out.push({ Type: typeIndex("ValueFieldInt"), Data: vf.data });
  pages.forEach((p, i) => {
    const activeId = _tabPageActiveIds.get(p.id);
    if (activeId) {
      out.push({
        Type: typeIndex("ValueEqualityDriverInt"),
        Data: compValueEqualityDriverInt(vf.valueFieldId, i, activeId),
      });
    }
  });
  // Any other host components (rare) pass through; markers are dropped.
  for (const c of slot.components) {
    if (c === rtComp || c === tabsComp) continue;
    if (c.type === "Tabs" || c.type === "TabButton" || c.type === "TabPage") continue;
    out.push(buildComponent(c));
  }
  return { components: out };
}

// One tab button in a Tabs bar. Reuses the radio selection idiom: on click,
// ButtonValueSet<int> writes this button's positional index into the host's
// shared ValueField<int>; a ValueEqualityDriver<int> (shared == index) feeds a
// BooleanValueDriver<colorX> that flips the button Image.Tint between the
// inactive and active colors — so the selected tab highlights. The button slot
// is always active, so hosting its own highlight drivers here is fine.
function buildTabButtonSlot(
  slot: Slot,
  rtComp: UixComponent,
  imageComp: UixComponent,
  buttonComp: UixComponent,
  info: { hostId: string; index: number; active: boolean; activeColor: TabRGBA; inactiveColor: TabRGBA },
): { components: BuiltComp[] } {
  const imageBuilt = buildComponent(imageComp);
  const tintFieldId = ((imageBuilt.Data as Record<string, unknown>).Tint as { ID: string }).ID;
  const sharedFieldId = _tabsSharedFieldByHost.get(info.hostId);

  const out: BuiltComp[] = [];
  out.push(buildComponent(rtComp));
  out.push(imageBuilt);
  out.push(buildComponent(buttonComp));
  if (sharedFieldId) {
    out.push({
      Type: typeIndex("ButtonValueSetInt"),
      Data: compButtonValueSetInt(sharedFieldId, info.index),
    });
    const bd = compBooleanValueDriverColorX(tintFieldId, info.inactiveColor, info.activeColor, info.active);
    out.push({
      Type: typeIndex("ValueEqualityDriverInt"),
      Data: compValueEqualityDriverInt(sharedFieldId, info.index, bd.stateFieldId),
    });
    out.push({ Type: typeIndex("BooleanValueDriverColorX"), Data: bd.data });
  }
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === buttonComp) continue;
    if (c.type === "TabButton") continue;
    out.push(buildComponent(c));
  }
  return { components: out };
}

// ReferenceField widget — RefEditor pattern (verified against the "Text to
// String with Reference Field" example). See inline body for the full wiring.
// Extracted verbatim from serializeSlot (T4-C1).
function buildReferenceFieldSlot(
  slot: Slot,
  rtComp: UixComponent | undefined,
  imageComp: UixComponent | undefined,
  referenceFieldComp: UixComponent | undefined,
  slotId: string,
): { components: BuiltComp[]; refSubtree: Record<string, unknown> | null; valueExport: ValueExport } {
  let components: BuiltComp[] = [];
  let preBuiltRefSubtree: Record<string, unknown> | null = null;
      // ReferenceField widget — RefEditor pattern (verified against the
      // "Text to String with Reference Field" example).
      //
      // Layout:
      //   Host slot (this slot):
      //     [RT (user), optional Image (user), LayoutElement (synthesized
      //      if user didn't author one), RefEditor, ReferenceField<IWorldElement>]
      //   └─ "Horizontal Layout" child (synthesized):
      //       [RT(stretch), HorizontalLayout(spacing=4, expandW+H)]
      //       ├─ "Inspector" Button (small, ⤴): opens inspector for the
      //       │   referenced object via RefEditor.OpenInspectorButton
      //       ├─ "Field" Button (large, drop target + display): no click
      //       │   handler — drag-and-drop fills it; child Text's Content.ID
      //       │   is bound to RefEditor._textDrive so Resonite drives the
      //       │   displayed name when a ref is dropped. A UIX.Mask clips the
      //       │   text glyphs to the pill background so long names don't
      //       │   overflow.
      //       └─ "Clear" Button (small, ∅): ButtonRelay → SetReference on
      //           RefEditor, which nulls the stored reference
      //
      // RefEditor's three back-references wire everything:
      //   _targetRef  → ReferenceField.Reference field UUID (the storage)
      //   _textDrive  → Field Button's child Text.Content field UUID (display)
      //   _button     → Field Button's UIX.Button component UUID (drop sink)
      // Resonite registers the named Button as the drop target; drops write
      // the IWorldElement into _targetRef and update _textDrive with the
      // object's display name.
      const rfp = referenceFieldComp!.props as Record<string, unknown>;
      // Pill color = theme controlSurface (the "input field" surface). The
      // Button.ColorDrivers + SmoothValue chain we used previously was
      // converting Image.Tint through sRGB→Linear at runtime and collapsing
      // dark colors toward (0,0,0) Linear (which renders pure black). We
      // skip the color-drive chain on Inspector/Clear entirely so Image.Tint
      // stays at the authored sRGB value with no animation interference. The
      // Field button still has its color-drive chain because RefEditor
      // overwrites it at runtime anyway.
      const fieldColor = _exportTheme?.controlSurface
        ?? { r: 0.122, g: 0.122, b: 0.122, a: 1 };
      const buttonColor = fieldColor;
      const savedTextColor = rfp.textColor as
        { r: number; g: number; b: number; a: number } | undefined;
      const textColor = _exportTheme?.bodyTextColor
        ?? savedTextColor
        ?? { r: 0.88, g: 0.88, b: 0.88, a: 1 };
      void rfp; // saved fieldColor/buttonColor knobs are intentionally ignored

      // Hover / press shades — used only on the Field button (RefEditor
      // overrides them at runtime anyway, but compButton needs a complete
      // ColorDrivers entry to round-trip). Inspector/Clear use compButton
      // WITHOUT a colorDriveTarget (= no ColorDrivers), so Image.Tint won't
      // be driven and stays at fieldColor sRGB.
      const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
      const shade = (c: { r: number; g: number; b: number; a: number }, delta: number) => ({
        r: clamp01(c.r + delta),
        g: clamp01(c.g + delta),
        b: clamp01(c.b + delta),
        a: c.a,
      });
      const pillNormal    = fieldColor;
      const pillHighlight = shade(fieldColor, 0.15);
      const pillPress     = shade(fieldColor, -0.10);
      const pillDisabled  = { r: 0.5, g: 0.5, b: 0.5, a: fieldColor.a };

      // ── Build the Field Button subtree first to capture both the Button's
      //    component ID and the inner Text's Content field ID. RefEditor needs
      //    both of those plus the ReferenceField.Reference field ID.

      // Field Button's inner Text — built first so we can pre-allocate its
      // Content field ID for RefEditor._textDrive. compText fills Content
      // with the provided string; we override to null + NullContent so it
      // displays "<i>null</i>" while empty (mirrors example 2 exactly).
      const fieldTextData = compText({
        content: "",
        size: 18,
        color: textColor,
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      });
      (fieldTextData.Content     as { Data: unknown }).Data = null;
      (fieldTextData.NullContent as { Data: unknown }).Data = "<i>null</i>";
      // Long display names (e.g. "StaticTexture2D on photo_2022-…") shrink
      // to fit the row instead of overflowing past the pill bounds. Limits
      // tuned so very long strings still stay readable (~10pt floor).
      (fieldTextData.HorizontalAutoSize as { Data: unknown }).Data = true;
      (fieldTextData.AutoSizeMin        as { Data: unknown }).Data = 10;
      (fieldTextData.AutoSizeMax        as { Data: unknown }).Data = 18;
      const fieldTextContentFieldId = (fieldTextData.Content as { ID: string }).ID;

      // Field Button (the drop target). NO ColorDrivers chain.
      //
      // Why: every other wiring we've tried for the Reference Field's
      // sub-buttons darkens or brightens the rendered color in unintended
      // ways at runtime in Resonite:
      //   * With Button.ColorDrivers + SmoothValue → pill rendered lighter
      //     than authored (slate-blue ≈ 0.17, 0.18, 0.21 instead of
      //     controlSurface) — appears RefEditor and/or the encoding chain
      //     re-tags the color through Linear and the result drifts.
      //   * With Button.ColorDrivers pointing directly at Image.Tint
      //     (matching example 2's structure) → pill rendered MUCH darker
      //     than authored at very dark sRGB values (#060607 collapses).
      //   * With no ColorDrivers at all → Image.Tint stays exactly at the
      //     authored sRGB value (controlSurface) and the pill matches every
      //     other input control on the panel.
      //
      // Trade-off: no hover/press color animation on this button. Resonite
      // still shows the pointer cursor when hovering a drop-target so the
      // affordance isn't lost, just no color brighten on hover.
      const fieldImage = {
        Type: typeIndex("Image"),
        Data: compImage({ tint: fieldColor, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      };
      const fieldButtonData = compButton({
        normalColor:    pillNormal,
        highlightColor: pillHighlight,
        pressColor:     pillPress,
        disabledColor:  pillDisabled,
        hoverVibrate: false,
      }); // no colorDriveTargetId → no ColorDrivers entry → Image.Tint untouched
      const fieldButtonComponentId = (fieldButtonData as { ID: string }).ID;
      const fieldButton = { Type: typeIndex("Button"), Data: fieldButtonData };
      const fieldLayoutElement = {
        Type: typeIndex("LayoutElement"),
        Data: compLayoutElement({
          minWidth: -1, preferredWidth: -1, flexibleWidth: 1,
          minHeight: -1, preferredHeight: -1, flexibleHeight: -1,
          priority: 1,
        }),
      };

      // ── ReferenceField<IWorldElement> + RefEditor — live on the host slot
      //    itself. Build both now so we know RefEditor's component ID for the
      //    Field Button's ButtonRelay and for the Inspector Button's Pressed
      //    event target.
      const refField = compReferenceFieldIWorldElement();
      const refEditorData = compRefEditor(
        refField.referenceFieldId,
        fieldTextContentFieldId,
        fieldButtonComponentId,
      );
      const refEditorComponentId = (refEditorData as { ID: string }).ID;

      // UIX.Mask with ShowMaskGraphic=true — the pill Image is BOTH the
      // visible background AND a stencil that clips child glyphs (the
      // displayed reference name) to the pill's rect. ShowMaskGraphic=false
      // (the default) hides the Image entirely, which broke both the
      // visual AND pointer interaction on the Field button in an earlier
      // iteration.
      const fieldMask = { Type: typeIndex("Mask"), Data: compMask(true) };

      const fieldRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const fieldTextRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 4, y: 0 }, offsetMax: { x: -4, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });

      const fieldSlotId = nextId();
      const fieldCompListId = nextId();
      const fieldTextSlotId = nextId();
      const fieldTextCompListId = nextId();
      const fieldButtonSlot = {
        ID: fieldSlotId,
        Components: {
          ID: fieldCompListId,
          Data: [fieldRt, fieldLayoutElement, fieldImage, fieldButton, fieldMask],
        },
        Name:           { ID: nextId(), Data: "Field" },
        Tag:            { ID: nextId(), Data: null },
        Active:         { ID: nextId(), Data: true },
        "Persistent-ID": nextId(),
        Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
        Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
        Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
        OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
        ParentReference: slotId,
        Children: [{
          ID: fieldTextSlotId,
          Components: {
            ID: fieldTextCompListId,
            Data: [fieldTextRt, { Type: typeIndex("Text"), Data: fieldTextData }],
          },
          Name:           { ID: nextId(), Data: "Text" },
          Tag:            { ID: nextId(), Data: null },
          Active:         { ID: nextId(), Data: true },
          "Persistent-ID": nextId(),
          Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
          Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
          Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
          OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
          ParentReference: fieldSlotId,
          Children: [],
        }],
      };

      // ── Inspector Button: click → RefEditor.OpenInspectorButton.
      //    NO ColorDrivers — same rationale as the Field button above
      //    (writing into Image.Tint via the chain shifts the rendered color).
      const inspImage = {
        Type: typeIndex("Image"),
        Data: compImage({ tint: buttonColor, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      };
      const inspButtonData = compButton({
        normalColor:    pillNormal,
        highlightColor: pillHighlight,
        pressColor:     pillPress,
        disabledColor:  pillDisabled,
        hoverVibrate: false,
      }); // no colorDriveTargetId → no ColorDrivers entry
      (inspButtonData.Pressed as { Data: unknown }).Data = {
        Target: refEditorComponentId,
        Method: "OpenInspectorButton",
      };
      const inspButton = { Type: typeIndex("Button"), Data: inspButtonData };
      const inspLayoutElement = {
        Type: typeIndex("LayoutElement"),
        Data: compLayoutElement({
          minWidth: 36, preferredWidth: 40, flexibleWidth: -1,
          minHeight: -1, preferredHeight: -1, flexibleHeight: -1,
          priority: 1,
        }),
      };
      // Inspector glyph — bundled OpenArrow PNG (Unicode arrow ⤴ isn't in the
      // bundled Noto Sans font, so the text approach rendered blank). Inset
      // 6px on each side so the icon doesn't fill the entire button.
      const inspIconImage = {
        Type: typeIndex("Image"),
        Data: compImage({
          tint: { r: 1, g: 1, b: 1, a: 1 },
          preserveAspect: true,
          spriteUrl: "",
          useOpenArrowIcon: true,
        }),
      };
      const inspRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const inspIconRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 6, y: 6 }, offsetMax: { x: -6, y: -6 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });

      const inspSlotId = nextId();
      const inspCompListId = nextId();
      const inspIconSlotId = nextId();
      const inspIconCompListId = nextId();
      const inspectorButtonSlot = {
        ID: inspSlotId,
        Components: {
          ID: inspCompListId,
          Data: [inspRt, inspLayoutElement, inspImage, inspButton],
        },
        Name:           { ID: nextId(), Data: "Inspector" },
        Tag:            { ID: nextId(), Data: null },
        Active:         { ID: nextId(), Data: true },
        "Persistent-ID": nextId(),
        Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
        Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
        Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
        OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
        ParentReference: slotId,
        Children: [{
          ID: inspIconSlotId,
          Components: {
            ID: inspIconCompListId,
            Data: [inspIconRt, inspIconImage],
          },
          Name:           { ID: nextId(), Data: "Icon" },
          Tag:            { ID: nextId(), Data: null },
          Active:         { ID: nextId(), Data: true },
          "Persistent-ID": nextId(),
          Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
          Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
          Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
          OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
          ParentReference: inspSlotId,
          Children: [],
        }],
      };

      // ── Clear Button: ButtonReferenceSet writes null into ReferenceField.
      //    NO ColorDrivers — same rationale as the Field button above.
      const clearImage = {
        Type: typeIndex("Image"),
        Data: compImage({ tint: buttonColor, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      };
      const clearButtonData = compButton({
        normalColor:    pillNormal,
        highlightColor: pillHighlight,
        pressColor:     pillPress,
        disabledColor:  pillDisabled,
        hoverVibrate: false,
      }); // no colorDriveTargetId → no ColorDrivers entry
      const clearButton = { Type: typeIndex("Button"), Data: clearButtonData };
      const clearLayoutElement = {
        Type: typeIndex("LayoutElement"),
        Data: compLayoutElement({
          minWidth: 36, preferredWidth: 40, flexibleWidth: -1,
          minHeight: -1, preferredHeight: -1, flexibleHeight: -1,
          priority: 1,
        }),
      };
      // Write null directly into ReferenceField.Reference when the Clear
      // button is pressed. Going through RefEditor.SetReference via a
      // ButtonRelay did not fire in practice; ButtonReferenceSet writes the
      // field by UUID without any method dispatch, which is the same path
      // older Resonite reference-receiver widgets used.
      const clearButtonRefSet = {
        Type: typeIndex("ButtonReferenceSetIWorldElement"),
        Data: compButtonReferenceSetIWorldElement(refField.referenceFieldId, null),
      };
      // Clear glyph — bundled Clear PNG (Unicode ∅ isn't in the bundled
      // Noto Sans font, so the text approach rendered blank). Inset 6px
      // on each side so the icon doesn't fill the entire button.
      const clearIconImage = {
        Type: typeIndex("Image"),
        Data: compImage({
          tint: { r: 1, g: 1, b: 1, a: 1 },
          preserveAspect: true,
          spriteUrl: "",
          useClearIcon: true,
        }),
      };
      const clearRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const clearIconRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 6, y: 6 }, offsetMax: { x: -6, y: -6 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const clearSlotId = nextId();
      const clearCompListId = nextId();
      const clearIconSlotId = nextId();
      const clearIconCompListId = nextId();
      const clearButtonSlot = {
        ID: clearSlotId,
        Components: {
          ID: clearCompListId,
          Data: [clearRt, clearLayoutElement, clearImage, clearButton, clearButtonRefSet],
        },
        Name:           { ID: nextId(), Data: "Clear" },
        Tag:            { ID: nextId(), Data: null },
        Active:         { ID: nextId(), Data: true },
        "Persistent-ID": nextId(),
        Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
        Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
        Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
        OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
        ParentReference: slotId,
        Children: [{
          ID: clearIconSlotId,
          Components: {
            ID: clearIconCompListId,
            Data: [clearIconRt, clearIconImage],
          },
          Name:           { ID: nextId(), Data: "Icon" },
          Tag:            { ID: nextId(), Data: null },
          Active:         { ID: nextId(), Data: true },
          "Persistent-ID": nextId(),
          Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
          Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
          Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
          OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
          ParentReference: clearSlotId,
          Children: [],
        }],
      };

      // ── "Horizontal Layout" wrapper slot — single synthesized child of the
      //    host, containing [Inspector ⤴, Field (drop+display), Clear ∅].
      const hlSlotId = nextId();
      const hlCompListId = nextId();
      const hlRt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const hlLayout = {
        Type: typeIndex("HorizontalLayout"),
        Data: compHorizontalLayout({
          spacing: 4,
          paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
          horizontalAlign: "Center",
          verticalAlign: "Middle",
          forceExpandWidth: true,
          forceExpandHeight: true,
        }),
      };
      preBuiltRefSubtree = {
        ID: hlSlotId,
        Components: { ID: hlCompListId, Data: [hlRt, hlLayout] },
        Name:           { ID: nextId(), Data: "Horizontal Layout" },
        Tag:            { ID: nextId(), Data: null },
        Active:         { ID: nextId(), Data: true },
        "Persistent-ID": nextId(),
        Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
        Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
        Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
        OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
        ParentReference: slotId,
        Children: [inspectorButtonSlot, fieldButtonSlot, clearButtonSlot],
      };

      // ── Host slot component list. RT first, then any user-authored Image,
      //    then any other user components (Mask, user LayoutElement, etc.),
      //    then a synthesized LayoutElement (if none authored) for vertical
      //    sizing in the parent layout, then RefEditor + ReferenceField.
      const refOrdered: Array<{ Type: Int32; Data: Record<string, unknown> }> = [];
      refOrdered.push(buildComponent(rtComp!));
      if (imageComp) refOrdered.push(buildComponent(imageComp));
      let hasAuthoredLayoutElement = false;
      for (const c of slot.components) {
        if (c === rtComp || c === imageComp || c === referenceFieldComp) continue;
        if (c.type === "LayoutElement") hasAuthoredLayoutElement = true;
        refOrdered.push(buildComponent(c));
      }
      if (!hasAuthoredLayoutElement) {
        refOrdered.push({
          Type: typeIndex("LayoutElement"),
          Data: compLayoutElement({
            minWidth: -1, preferredWidth: -1, flexibleWidth: -1,
            minHeight: 40, preferredHeight: 40, flexibleHeight: -1,
            priority: 1,
          }),
        });
      }
      refOrdered.push({ Type: typeIndex("RefEditor"), Data: refEditorData });
      refOrdered.push({ Type: typeIndex("ReferenceFieldIWorldElement"), Data: refField.data });
      components = refOrdered;
  // Exposed value: the dropped object, mirrored from ReferenceField.Reference
  // into the "📚 Value" slot's DynamicReferenceVariable (control authoritative).
  return {
    components,
    refSubtree: preBuiltRefSubtree,
    valueExport: { kind: "reference", sourceFieldId: refField.referenceFieldId, initial: null },
  };
}

// Dropdown trigger slot — see inline body. Host gets RT + Image + Button +
// ButtonToggle (opens the modal) + ValueField<int> (selection); a synthesized
// "Label" child Text displays the current option. The popup itself is appended
// later by buildRootWrapper. Extracted verbatim from serializeSlot (T4-C1).
function buildDropdownSlot(
  slot: Slot,
  rtComp: UixComponent | undefined,
  imageComp: UixComponent | undefined,
  buttonComp: UixComponent | undefined,
  dropdownComp: UixComponent | undefined,
  slotId: string,
): { components: BuiltComp[]; label: Record<string, unknown> | null; valueExport: ValueExport } {
  let components: BuiltComp[] = [];
  let preBuiltText: Record<string, unknown> | null = null;
      // Dropdown trigger slot — lowers to:
      //   * Host slot: RT + Image (background) + Button (click-to-open)
      //     + ButtonToggle pointing at the pre-allocated modal Active field
      //     + ValueField<int> seeded to initialIndex (the selection state)
      //   * Synthetic "Label" child slot containing a Text whose Content field
      //     is the write target for every option's ButtonValueSet<string>, so
      //     the trigger label updates immediately when an option is picked.
      //   * The popup itself is appended later in buildRootWrapper (mirrors
      //     the regular Popup spawn-window pattern). buildDropdownPopupSlot
      //     reads from `_dropdownValueFieldIds` and `_dropdownTextContentIds`
      //     to wire each option button's three action components:
      //       ButtonValueSet<int>(valueFieldId, optionIndex)
      //       ButtonValueSet<string>(triggerLabelContentId, optionLabel)
      //       ButtonToggle(modalActiveId)   ← closes the menu
      const dp = dropdownComp!.props as Record<string, unknown>;
      const optionsRaw = (dp.options as string) ?? "";
      const options = optionsRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const ddInitialIndex = ((dp.initialIndex as number) ?? 0) | 0;
      const ddSafeIdx = options.length
        ? Math.max(0, Math.min(options.length - 1, ddInitialIndex))
        : 0;
      const ddInitialLabel = options[ddSafeIdx] ?? "—";
      const ddLabelColor = _exportTheme?.bodyTextColor
        ?? (dp.optionLabelColor as { r: number; g: number; b: number; a: number } | undefined)
        ?? { r: 0.95, g: 0.95, b: 0.95, a: 1 };

      const ddModalActiveId =
        _dropdownActiveIds.get(slot.id) ?? "00000000-0000-0000-0000-000000000000";

      // ValueField<int> holds the current selection. Allocator runs inline so
      // its Value field UUID becomes available immediately for the map.
      const ddVf = compValueFieldInt(ddSafeIdx);
      _dropdownValueFieldIds.set(slot.id, ddVf.valueFieldId);

      // Synthetic "Label" child slot — centered Text inside the trigger that
      // displays the current selection. compText's Content.ID is what the
      // option buttons will write to.
      const ddLabelSlotId = nextId();
      const ddLabelCompListId = nextId();
      const ddLabelRtBuilt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 },
          anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 12, y: 0 },
          offsetMax: { x: -28, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const ddLabelTextBuilt = {
        Type: typeIndex("Text"),
        Data: compText({
          content: ddInitialLabel,
          size: 16,
          color: ddLabelColor,
          horizontalAlign: "Left",
          verticalAlign: "Middle",
          autoSize: false,
        }),
      };
      const ddLabelContentFieldId = (
        (ddLabelTextBuilt.Data as Record<string, unknown>).Content as { ID: string }
      ).ID;
      _dropdownTextContentIds.set(slot.id, ddLabelContentFieldId);

      // Component order on the trigger slot. The trigger's Image tint is
      // overridden to the theme's controlSurface so the trigger pill matches
      // every other "input control" surface (TextField, Slider, Reference
      // Field, etc.) regardless of whether the user has clicked "Apply All
      // to Panel" on their existing doc. Same theme-first rule we use in
      // the hasReferenceField branch — see commentary there.
      const ddImageTint = _exportTheme?.controlSurface
        ?? (imageComp!.props as { tint?: { r: number; g: number; b: number; a: number } }).tint
        ?? { r: 0.122, g: 0.122, b: 0.122, a: 1 };
      const ddImageProps = {
        ...(imageComp!.props as Record<string, unknown>),
        tint: ddImageTint,
      };
      const ddImageBuilt = {
        Type: typeIndex("Image"),
        Data: compImage(ddImageProps),
      };
      const ddOrdered: Array<{ Type: Int32; Data: Record<string, unknown> }> = [];
      ddOrdered.push(buildComponent(rtComp!));
      ddOrdered.push(ddImageBuilt);
      ddOrdered.push(buildComponent(buttonComp!));
      ddOrdered.push({ Type: typeIndex("ButtonToggle"), Data: compButtonToggle(ddModalActiveId) });
      ddOrdered.push({ Type: typeIndex("ValueFieldInt"), Data: ddVf.data });
      for (const c of slot.components) {
        if (c === rtComp || c === imageComp || c === buttonComp || c === dropdownComp) continue;
        ddOrdered.push(buildComponent(c));
      }
      components = ddOrdered;

      preBuiltText = {
        ID: ddLabelSlotId,
        Components: { ID: ddLabelCompListId, Data: [ddLabelRtBuilt, ddLabelTextBuilt] },
        Name:           { ID: nextId(), Data: "Label" },
        Tag:            { ID: nextId(), Data: null },
        Active:         { ID: nextId(), Data: true },
        "Persistent-ID": nextId(),
        Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
        Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
        Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
        OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
        ParentReference: slotId,
        Children: [],
      };
  // Exposed value is the selected-option index (the shared ValueField<int>).
  return {
    components,
    label: preBuiltText,
    valueExport: { kind: "int", sourceFieldId: ddVf.valueFieldId, initial: ddSafeIdx },
  };
}

// ScrollArea slot — viewport (RT + Image + Mask) wrapping the user's children
// in a synthesized "Content" slot, plus an optional ported live-scrollbar
// subtree (slider + 55-node ProtoFlux + drop shadows). Recurses on children via
// serializeSlot. Extracted verbatim from serializeSlot (T4-C1).
function buildScrollAreaSlot(
  slot: Slot,
  rtComp: UixComponent | undefined,
  scrollAreaComp: UixComponent | undefined,
  slotId: string,
): {
  components: BuiltComp[];
  content: Record<string, unknown> | null;
  suppressChildren: boolean;
  scrollbar: Record<string, unknown> | null;
  protoFlux: Record<string, unknown> | null;
  dropShadows: Record<string, unknown> | null;
} {
  let components: BuiltComp[] = [];
  let preBuiltScrollAreaContent: Record<string, unknown> | null = null;
  let scrollAreaSuppressChildren = false;
  let preBuiltScrollAreaScrollbar: Record<string, unknown> | null = null;
  let preBuiltScrollAreaProtoFlux: Record<string, unknown> | null = null;
  let preBuiltScrollAreaDropShadows: Record<string, unknown> | null = null;
      // ScrollArea — lower the host slot into the canonical Resonite scroll
      // hierarchy. Host slot becomes the visible viewport (RT + Image bg +
      // UIX.Mask). A synthetic "Content" child slot carries the actual
      // scrolling components (UIX.ScrollRect + UIX.ContentSizeFitter +
      // V/H layout) and receives every user-authored child. Optional visible
      // scrollbar sits as a sibling slot pinned to the right/bottom edge.
      // Matches UIX Template/Scroll area's structure (Mask viewport → content
      // slot with ScrollRect + ContentSizeFitter + layout).
      const sap = scrollAreaComp!.props as Record<string, unknown>;
      const direction = (sap.direction as string) ?? "Vertical";
      const bgTint    = (sap.backgroundTint as { r: number; g: number; b: number; a: number })
        ?? { r: 0.07, g: 0.08, b: 0.11, a: 1 };
      const spacing = (sap.spacing as number) ?? 4;
      // Inner padding: explicit (>= 0) wins; -1 "auto" / undefined inherits half
      // the Canvas.contentPadding (see resolvePad).
      const padding = resolvePad(sap.padding as number | undefined, _canvasContentPadding);
      const showScrollbar      = (sap.showScrollbar as boolean) ?? true;
      // NOTE: the ported live scrollbar (emitScrollbar) carries its own native
      // Resonite appearance, so the legacy scrollbarTrackTint / scrollbarThumbTint
      // / scrollbarRoundness props are not applied here. Custom scrollbar theming
      // is a follow-up; the props remain in the schema but are currently inert.
      // Scrollbar geometry — hoisted so the content layout can reserve a gutter
      // (otherwise content runs under the bar and overlaps it).
      const trackThickness = 12;
      const thumbPad       = 2;
      // Gutter the content layout adds on the scrollbar side so items don't
      // overlap the bar. Only on the axis the scrollbar sits. SCROLLBAR_GUTTER
      // (= trackThickness + thumbPad + 6) is shared with the editor preview so
      // both inset content identically.
      const scrollbarGutter = showScrollbar ? SCROLLBAR_GUTTER : 0;
      const gutterRight  = (direction === "Vertical"   || direction === "Both") ? scrollbarGutter : 0;
      const gutterBottom = (direction === "Horizontal" || direction === "Both") ? scrollbarGutter : 0;

      // ── Host slot components: RT (user) + Image (bg) + Mask. ─────────────
      // Build RT first to capture its component ID — ScrollRect's
      // ViewportOverride will reference it from the Content child below.
      const hostRtBuilt = buildComponent(rtComp!);
      const hostRtId = (hostRtBuilt.Data as Record<string, unknown>).ID as string;

      // RectTransformComputedProperties on the viewport — the ported scrollbar's
      // ProtoFlux reads its LocalComputeRect to know the visible window size.
      const hostRtcp = compRectTransformComputedProperties(hostRtId);
      const viewportRectFieldId = hostRtcp.localComputeRectFieldId;

      const saOrdered: Array<{ Type: Int32; Data: Record<string, unknown> }> = [];
      saOrdered.push(hostRtBuilt);
      saOrdered.push({ Type: typeIndex("RectTransformComputedProperties"), Data: hostRtcp.data });
      saOrdered.push({
        Type: typeIndex("Image"),
        Data: compImage({ tint: bgTint, preserveAspect: false, spriteUrl: "" }),
      });
      saOrdered.push({ Type: typeIndex("Mask"), Data: compMask() });
      // Preserve any other user-attached components (LayoutElement, etc.) but
      // skip ones we're auto-emitting (Image, Mask) and the marker itself.
      for (const c of slot.components) {
        if (c === rtComp || c === scrollAreaComp) continue;
        if (c.type === "Image" || c.type === "Mask") continue;
        saOrdered.push(buildComponent(c));
      }
      components = saOrdered;

      // ── Synthetic Content child: ScrollRect + CSF + Layout + user kids. ──
      const contentSlotId = nextId();
      const contentCompListId = nextId();
      const contentRtBuilt = buildComponent({
        type: "RectTransform",
        props: {
          anchorMin: { x: 0, y: 0 },
          anchorMax: { x: 1, y: 1 },
          offsetMin: { x: 0, y: 0 },
          offsetMax: { x: 0, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        },
      });
      const contentRtId = (contentRtBuilt.Data as Record<string, unknown>).ID as string;

      // RTCP on Content — the scrollbar ProtoFlux divides viewport/content rects
      // to size the handle; this exposes the content's full (scrollable) rect.
      const contentRtcp = compRectTransformComputedProperties(contentRtId);
      const contentRectFieldId = contentRtcp.localComputeRectFieldId;

      // Hoist the ScrollRect so we can capture its NormalizedPosition field ID —
      // the scrollbar's float2 GlobalReference reads it to position the handle.
      const contentScrollRectData = compScrollRect(hostRtId);
      const contentScrollFieldId =
        (contentScrollRectData.NormalizedPosition as { ID: string }).ID;

      // Layout container — Vertical when direction includes vertical scroll
      // (so "Both" picks Vertical, matching the editor preview). Horizontal-
      // only direction gets a HorizontalLayout.
      const layoutBuilt = direction === "Horizontal"
        ? {
            Type: typeIndex("HorizontalLayout"),
            Data: compHorizontalLayout({
              spacing, paddingTop: padding, paddingBottom: padding + gutterBottom,
              paddingLeft: padding, paddingRight: padding + gutterRight,
              horizontalAlign: "Left", verticalAlign: "Top",
              forceExpandWidth: false, forceExpandHeight: true,
            }),
          }
        : {
            Type: typeIndex("VerticalLayout"),
            Data: compVerticalLayout({
              spacing, paddingTop: padding, paddingBottom: padding + gutterBottom,
              paddingLeft: padding, paddingRight: padding + gutterRight,
              horizontalAlign: "Left", verticalAlign: "Top",
              forceExpandWidth: true, forceExpandHeight: false,
            }),
          };

      // ContentSizeFitter — fits the axis that scrolls. For "Both", fit
      // both axes (the content grows in two directions).
      const fitH: "Disabled" | "PreferredSize" =
        direction === "Horizontal" || direction === "Both" ? "PreferredSize" : "Disabled";
      const fitV: "Disabled" | "PreferredSize" =
        direction === "Vertical"   || direction === "Both" ? "PreferredSize" : "Disabled";

      const contentChildren = slot.children.map((child, i) =>
        serializeSlot(child, contentSlotId, i),
      );
      // These are the laid-out children of the VerticalLayout/HorizontalLayout
      // below — their OrderOffset genuinely drives layout order in-game.
      assignOrderOffsets(contentChildren);
      preBuiltScrollAreaContent = {
        ID: contentSlotId,
        Components: {
          ID: contentCompListId,
          Data: [
            contentRtBuilt,
            { Type: typeIndex("RectTransformComputedProperties"), Data: contentRtcp.data },
            { Type: typeIndex("ScrollRect"),        Data: contentScrollRectData },
            { Type: typeIndex("ContentSizeFitter"), Data: compContentSizeFitter(fitH, fitV) },
            layoutBuilt,
          ],
        },
        Name:           { ID: nextId(), Data: "Content" },
        Tag:            { ID: nextId(), Data: null },
        Active:         { ID: nextId(), Data: true },
        "Persistent-ID": nextId(),
        Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
        Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
        Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
        OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
        ParentReference: slotId,
        Children: contentChildren,
      };
      // The user-authored children now belong to the Content slot — keep the
      // default Children-mapper from also emitting them as siblings.
      scrollAreaSuppressChildren = true;

      // ── Live, scroll-driven scrollbar (ported from a real Resonite save). ──
      // Replaces the old static thumb. emitScrollbar clones the captured
      // Slider<float> + 55-node ProtoFlux graph + drop-shadow fades, remaps all
      // internal IDs, and binds the three external read points to the RTCP /
      // ScrollRect field IDs captured above. The handle then tracks the real
      // scroll position and sizes itself to the viewport/content ratio.
      if (showScrollbar) {
        const isVertical = direction === "Vertical" || direction === "Both";
        const emitted = emitScrollbar(
          { nextId, typeIndex: (full) => typeIndex(full) },
          { viewportRectFieldId, contentRectFieldId, contentScrollFieldId, hostSlotId: slotId },
        );

        // The captured Scrollbar root fills its parent ([0,0]-[1,1]) because the
        // source used an outer HorizontalLayout to allocate its width. Our layout
        // has no such wrapper, so pin the bar to the right edge (vertical scroll)
        // or bottom edge (horizontal scroll) by overriding its root RectTransform
        // anchors/offsets. The RectTransform is the component whose Data carries
        // an AnchorMin field; the Slider handle inside is driven by ProtoFlux and
        // adapts to whatever size the bar ends up.
        const sbRtData = prebuiltCompDataWithField(emitted.scrollbar, "AnchorMin");
        if (sbRtData) {
          const setField = (k: string, v: number[]) => { (sbRtData[k] as { Data: unknown }).Data = v; };
          if (isVertical) {
            setField("AnchorMin", [1, 0]); setField("AnchorMax", [1, 1]);
            setField("OffsetMin", [-trackThickness - thumbPad, thumbPad]);
            setField("OffsetMax", [-thumbPad, -thumbPad]);
          } else {
            setField("AnchorMin", [0, 0]); setField("AnchorMax", [1, 0]);
            setField("OffsetMin", [thumbPad, thumbPad]);
            setField("OffsetMax", [-thumbPad, trackThickness + thumbPad]);
          }
        }

        // Recolor hover/press feedback. The Slider has two ColorDrivers:
        //   [0] → Background (track) Tint — should accent on hover/press
        //   [1] → Handel (thumb) Tint — must stay white; tinting it the same accent
        //         as the track makes it invisible (blends into the background).
        const accent = _exportTheme?.accent ?? { r: 0.18, g: 0.36, b: 0.6, a: 1 };
        const hiCol = colorArr(shiftColor(accent, 0.12));
        const prCol = colorArr(shiftColor(accent, -0.12));
        const sliderSlot = findPrebuiltSlotByName(emitted.scrollbar, "Slider");
        if (sliderSlot) {
          const sliderData = prebuiltCompDataWithField(sliderSlot, "ColorDrivers");
          const drivers = (sliderData?.ColorDrivers as { Data?: Array<Record<string, unknown>> } | undefined)?.Data ?? [];
          drivers.forEach((d, i) => {
            if (i === 0) {
              // Track background: accent on hover/press so the user knows the bar is interactive.
              (d.HighlightColor as { Data: unknown }).Data = hiCol;
              (d.PressColor as { Data: unknown }).Data = prCol;
            } else {
              // Thumb: lock all states to the authored NormalColor (white) so it stays
              // visible against the accent-tinted track on hover/press.
              const normalCol = (d.NormalColor as { Data: unknown }).Data;
              (d.HighlightColor as { Data: unknown }).Data = normalCol;
              (d.PressColor as { Data: unknown }).Data = normalCol;
            }
          });

          // Center the handle. ProtoFlux drives AnchorMin/Max.x = 0 (hardcoded null
          // in the graph), so the Slider's right edge = OffsetMax.x. Set OffsetMax.x
          // to half the track width so the Slider right edge lands at the Background
          // center — the thumb is anchored there and its ±halfWidth spans symmetrically.
          const sliderRt = prebuiltCompDataWithField(sliderSlot, "AnchorMin");
          if (sliderRt) {
            const setX = (k: string, x: number) => { (((sliderRt[k] as { Data: number[] }).Data)[0]) = x; };
            setX("AnchorMin", 0); setX("AnchorMax", 0);
            setX("OffsetMin", -(trackThickness * 2)); setX("OffsetMax", trackThickness / 2);
          }
        }

        // Fix thumb X half-width. The captured ProtoFlux has a hardcoded ValueInput<float>
        // with value=20 that drives OffsetMin/Max.x of the Handel (thumb). 20px is
        // correct for the original ~44px-wide capture but blows way past our 12px track.
        // New half-width = trackThickness/2 - thumbPad (= 4px for a 12px track with 2px pad).
        const thumbHalfWidth = Math.max(1, Math.floor(trackThickness / 2 - thumbPad));
        const fixThumbWidth = (slot: Record<string, unknown>): void => {
          const comps = (slot.Components as { Data?: Array<{ Data: Record<string, unknown> }> } | undefined)?.Data ?? [];
          for (const c of comps) {
            const val = c.Data?.Value;
            if (val && typeof val === "object" && !Array.isArray(val) && (val as { Data?: unknown }).Data === 20) {
              (val as { Data: unknown }).Data = thumbHalfWidth;
            }
          }
          for (const child of ((slot.Children as Record<string, unknown>[]) ?? [])) fixThumbWidth(child);
        };
        fixThumbWidth(emitted.protoFlux);

        // Inject rounded corners onto Background (track) and Handel (thumb) images.
        // The captured template has Sprite=null on both. We use per-slot SpriteProviders
        // with NineSliceSizing="FixedSize" and a pixel cap — the equivalent of the
        // _pillFixedSizePx escape hatch used by compImage for thin elements. "RectHeight"
        // is intentionally avoided here: it bases the corner radius on the element's
        // height, which makes a tall narrow thumb look like a toothpick.
        // Cap values: track ends = half track width (6px); thumb ends = thumb half-width (4px).
        if (_pillTexId) {
          const injectRoundedSprite = (
            slot: Record<string, unknown>,
            imgData: Record<string, unknown>,
            fixedSizePx: number,
          ) => {
            const spData = compSpriteProvider(_pillTexId, [0.5, 0.5, 0.5, 0.5], 1, fixedSizePx);
            const spId = spData.ID as string;
            (slot.Components as { Data: Array<unknown> }).Data.push({ Type: typeIndex("SpriteProvider"), Data: spData });
            (imgData.Sprite as { Data: unknown }).Data = spId;
            (imgData.NineSliceSizing as { Data: unknown }).Data = "FixedSize";
            (imgData.PreserveAspect as { Data: unknown }).Data = false;
          };
          const bgSlot = findPrebuiltSlotByName(emitted.scrollbar, "Background");
          if (bgSlot) {
            const bgImg = prebuiltCompDataWithField(bgSlot, "Tint");
            // Overdrive both corners beyond half-width so Resonite renders the
            // fullest possible pill caps. Track: 8px (half-width = 6). Thumb: 6px
            // (half-width = 4). Overdriving pushes caps to the edge of the element
            // and gives a visually complete pill at the ends.
            if (bgImg) injectRoundedSprite(bgSlot, bgImg, 8);
            const handelSlot = findPrebuiltSlotByName(bgSlot, "Handel");
            if (handelSlot) {
              const handelImg = prebuiltCompDataWithField(handelSlot, "Tint");
              if (handelImg) injectRoundedSprite(handelSlot, handelImg, 6);
            }
          }
        }

        // Shrink drop shadows 50%: original template has 40px, reduce to 20px.
        const topShadow = findPrebuiltSlotByName(emitted.dropShadows, "Top Drop Shadow");
        if (topShadow) {
          const topRt = prebuiltCompDataWithField(topShadow, "OffsetMin");
          if (topRt) ((topRt.OffsetMin as { Data: number[] }).Data)[1] = -20;
        }
        const botShadow = findPrebuiltSlotByName(emitted.dropShadows, "Bottom Drop Shadow");
        if (botShadow) {
          const botRt = prebuiltCompDataWithField(botShadow, "OffsetMax");
          if (botRt) ((botRt.OffsetMax as { Data: number[] }).Data)[1] = 20;
        }

        preBuiltScrollAreaScrollbar   = emitted.scrollbar;
        preBuiltScrollAreaProtoFlux   = emitted.protoFlux;
        preBuiltScrollAreaDropShadows = emitted.dropShadows;
      }
  return {
    components,
    content: preBuiltScrollAreaContent,
    suppressChildren: scrollAreaSuppressChildren,
    scrollbar: preBuiltScrollAreaScrollbar,
    protoFlux: preBuiltScrollAreaProtoFlux,
    dropShadows: preBuiltScrollAreaDropShadows,
  };
}

// Popup + Keypad marker wiring. Runs after a slot's components are built and
// mutates the list in place: adds a ButtonToggle for Popup triggers, and wires
// KeypadKey buttons to the KeypadDisplay's Text.Content (cross-slot state flows
// via the module temps). Extracted verbatim from serializeSlot (T4-C1).
function applyPopupKeypadWiring(slot: Slot, components: BuiltComp[], isCanvasSlot: boolean): void {
  const hasPopup = slot.components.some((c) => c.type === "Popup");
  if (hasPopup && !isCanvasSlot) {
    const modalActiveId = _popupActiveIds.get(slot.id);
    if (modalActiveId) {
      components.push({
        Type: typeIndex("ButtonToggle"),
        Data: compButtonToggle(modalActiveId),
      });
    }
  }

  // Keypad wiring — runs in document order, so the KeypadDisplay slot's
  // Text.Content UUID is stashed BEFORE any KeypadKey button asks for it.
  // (Preset enforces ordering by listing the display before the key grid.)
  // If a prior KeypadDisplay slot put its Text on a child slot, this slot
  // might be that child — grab its Text.Content UUID before moving on.
  if (_keypadDisplayChildPending) {
    const textBuilt = components.find(
      (c) => (c.Data as Record<string, unknown>)?.Content !== undefined
              && (c.Data as Record<string, unknown>)?.Font !== undefined,
    );
    if (textBuilt) {
      _keypadDisplayContentId = (
        (textBuilt.Data as Record<string, unknown>).Content as { ID: string }
      ).ID;
      _keypadDisplayChildPending = false;
    }
  }

  const hasKeypadDisplay = slot.components.some((c) => c.type === "KeypadDisplay");
  if (hasKeypadDisplay && !isCanvasSlot) {
    const textBuilt = components.find(
      (c) => (c.Data as Record<string, unknown>)?.Content !== undefined
              && (c.Data as Record<string, unknown>)?.Font !== undefined,
    );
    if (textBuilt) {
      // Text is on this slot — grab the content UUID directly.
      _keypadDisplayContentId = (
        (textBuilt.Data as Record<string, unknown>).Content as { ID: string }
      ).ID;
    } else {
      // Text lives on a child slot (one-Graphic-per-slot fix). The child
      // will be serialized next; flag it so the child stashes the UUID.
      _keypadDisplayChildPending = true;
    }
  }

  const keypadKeyComp = slot.components.find((c) => c.type === "KeypadKey");
  if (keypadKeyComp && !isCanvasSlot && _keypadDisplayContentId) {
    const keyValue = ((keypadKeyComp.props as Record<string, unknown>).value as string) ?? "";
    components.push({
      Type: typeIndex("ButtonValueSetString"),
      Data: compButtonValueSetString(_keypadDisplayContentId, keyValue),
    });
  }
}

// Assign each child slot a sequential 1-based OrderOffset matching its position
// in the assembled Children array (header=1, body=2, …). Because Resonite sorts
// siblings by OrderOffset with array order as the tiebreak, mirroring the array
// index here yields the IDENTICAL effective order to the previous all-zero state
// — so z-layering and layout-container order are unchanged — while exposing
// meaningful, editable numbers in-game. Inside a layout container (e.g. the
// ScrollArea Content's VerticalLayout) these numbers actively drive child order,
// so re-numbering in Resonite reorders the laid-out elements. User-authored
// hierarchy children come first in every array, so they land at 1..N exactly as
// they read in the editor; exporter-appended helper slots (📚 Value, scrollbar,
// popup/dropdown containers, …) continue after them and thus stay on top.
function assignOrderOffsets(children: unknown[]): void {
  children.forEach((child, i) => {
    const oo = (child as { OrderOffset?: { Data: unknown } }).OrderOffset;
    if (oo) oo.Data = Long.fromNumber(i + 1);
  });
}

// Color Picker slot — the swatch. Builds the Image first to capture its Tint
// field ID, keeps the Button static (no SmoothValue color drive — that would
// fight the picker writing into Tint), and attaches a ButtonEditColorX whose
// Target IS that Tint. Clicking the swatch opens Resonite's native color picker
// and writes the result straight into Tint (Continuous), so the swatch
// live-recolors. The exposed "📚 Value" colorX variable mirrors that same Tint.
function buildColorPickerSlot(
  slot: Slot,
  rtComp: UixComponent | undefined,
  imageComp: UixComponent,
  buttonComp: UixComponent,
  colorPickerComp: UixComponent,
): { components: BuiltComp[]; valueExport: ValueExport } {
  const props = colorPickerComp.props as Record<string, unknown>;
  const initial =
    (props.initialColor as { r: number; g: number; b: number; a: number } | undefined)
    ?? { r: 0.18, g: 0.36, b: 0.6, a: 1 };
  const alpha = props.alpha !== false;
  const hdr = props.hdr === true;

  // Force the swatch Image tint to the picker's color so it shows the value
  // before any edit, then capture the Tint field ID for both the picker Target
  // and the exposed value's ValueCopy source.
  const imageBuilt = buildComponent({
    ...imageComp,
    props: { ...(imageComp.props as Record<string, unknown>), tint: initial },
  });
  const tintFieldId = ((imageBuilt.Data as Record<string, unknown>).Tint as { ID: string }).ID;

  const buttonBuilt: BuiltComp = {
    Type: typeIndex("Button"),
    Data: compButton(buttonComp.props as Record<string, unknown>),
  };
  const editBuilt: BuiltComp = {
    Type: typeIndex("ButtonEditColorX"),
    Data: compButtonEditColorX(tintFieldId, alpha, hdr),
  };

  const ordered: BuiltComp[] = [];
  if (rtComp) ordered.push(buildComponent(rtComp));
  ordered.push(imageBuilt, buttonBuilt, editBuilt);
  // Any remaining components (LayoutElement, etc.). The ColorPicker marker and
  // editor-only markers have no FrooxEngine counterpart — skip them.
  for (const c of slot.components) {
    if (c === rtComp || c === imageComp || c === buttonComp || c === colorPickerComp) continue;
    if (c.type === "Close" || c.type === "Popup" || c.type === "Spacer") continue;
    if (c.type === "PopupContent" || c.type === "PopupDismiss") continue;
    ordered.push(buildComponent(c));
  }

  return {
    components: ordered,
    valueExport: { kind: "colorX", sourceFieldId: tintFieldId, initial },
  };
}

// ── Slot serializer ───────────────────────────────────────────────────────────

function serializeSlot(
  slot: Slot,
  parentId: string | null,
  _siblingIndex = 0,
): Record<string, unknown> {
  const slotId = nextId();
  const compListId = nextId();

  const rtComp     = slot.components.find((c) => c.type === "RectTransform");
  const canvasComp = slot.components.find((c) => c.type === "Canvas");
  const isCanvasSlot = !!canvasComp;

  let components: Array<{ Type: Int32; Data: Record<string, unknown> }>;

  // When a Toggle slot has a Knob child, we pre-serialize the child here so
  // the Toggle's ValueMultiDriver<bool> can reference the knob's float2-driver
  // State field IDs. These locals get assigned in the hasBoolToggle branch and
  // consumed by the Children mapper at the end of this function.
  let preBuiltKnob: Record<string, unknown> | null = null;
  let preBuiltKnobIdx = -1;

  // Slider-synthesized "Fill" child slot. Built inline in the hasSlider branch
  // so the Slider<float> can reference the Fill RT's AnchorMax field ID, then
  // appended to the children list after the user-authored children.
  let preBuiltFill: Record<string, unknown> | null = null;

  // TextField-synthesized "Text" child slot. Built inline in the hasTextField
  // branch so the TextEditor on the parent can reference the child Text
  // component's ID. Appended to the children list after the user-authored
  // children.
  let preBuiltText: Record<string, unknown> | null = null;

  // Radio-synthesized "Dot" child slot. Built inline in the hasRadio branch —
  // a small centered Image whose Tint is driven by the radio's
  // BooleanValueDriver<colorX> (which is in turn driven by a
  // ValueEqualityDriver<int> that watches the group's shared field).
  let preBuiltDot: Record<string, unknown> | null = null;

  // ReferenceField-synthesized children: the receiver "Field" slot (drop
  // target + null-text label), the "Clear" button slot (∅), and a dedicated
  // "Ref" storage slot that carries the actual ReferenceField<IWorldElement>
  // component. RefEditor + ReferenceField<IWorldElement> ride on the host
  // slot itself; a single synthesized child carries the HorizontalLayout +
  // the two visible Buttons (drop/clear + open-inspector arrow). Pattern
  // verified against the "Text to String with Reference Field" example.
  let preBuiltRefSubtree: Record<string, unknown> | null = null;

  // Spinner-synthesized "ProtoFlux" child slot — holds the WorldTime → Mod
  // → Mul → FieldDrive chain that animates the OutlinedArc's gradient driver
  // every frame. Built inline in the hasSpinner branch.
  let preBuiltSpinnerProtoFlux: Record<string, unknown> | null = null;

  // ScrollArea-synthesized children: the inner "Content" slot (carries
  // ScrollRect + ContentSizeFitter + the layout container, and wraps every
  // user-authored child) plus an optional visible "Scrollbar" slot pinned to
  // the right/bottom edge. The host slot itself becomes the viewport
  // (RT + Image background + Mask).
  let preBuiltScrollAreaContent:   Record<string, unknown> | null = null;
  let preBuiltScrollAreaScrollbar: Record<string, unknown> | null = null;
  // Ported live-scrollbar extras: the 55-node ProtoFlux graph that drives the
  // handle, and the top/bottom drop-shadow fades over the viewport. Both are
  // spliced as siblings of the Content slot (outside the Mask so the shadows
  // aren't clipped). Emitted by emitScrollbar from scrollbarTemplate.json.
  let preBuiltScrollAreaProtoFlux:   Record<string, unknown> | null = null;
  let preBuiltScrollAreaDropShadows: Record<string, unknown> | null = null;
  // Suppress the default Children-mapper when ScrollArea is consuming them —
  // the user's children get nested into the synthetic Content slot instead.
  let scrollAreaSuppressChildren = false;

  // When set by an interactive branch below, a "📚 Value" child slot exposing
  // this control's value is appended in the Children-assembly step.
  let valueExport: ValueExport | null = null;

  // Stack-style save/reset of _pendingImageExtras so per-Image SpriteProviders
  // from compImage land on the *current* slot only, not on the parent's
  // component list. Restored at the end of this function.
  const savedPendingExtras = _pendingImageExtras;
  _pendingImageExtras = [];

  // Expose this slot's static pixel rect to compImage so an intermediate
  // cornerRadius can bake its FixedSize. Saved/restored stack-style: child
  // recursion overwrites it, then we restore the parent's on the way back up.
  const savedImageRect = _currentImageRect;
  _currentImageRect = _slotRectSizes.get(slot.id) ?? null;

  if (isCanvasSlot && rtComp && canvasComp) {
    // Canvas slot needs: Canvas, RectTransform, BoxCollider together.
    // Canvas references RT's Data.ID (_rootRect) and BoxCollider's ID + its
    // Offset.ID + Size.ID (Collider / _colliderOffset / _colliderSize). Build
    // RT and BoxCollider FIRST so we can capture their IDs, then build Canvas
    // with all four cross-references, then arrange in the canonical order
    // matching real Resonite exports: [Canvas, RectTransform, BoxCollider, ...].
    const rtDataId = `${_idCounter.toString(16).padStart(8, "0")}-0000-0000-0000-000000000000`;
    const rtBuilt = buildComponent(rtComp);

    const canvasProps = canvasComp.props as Record<string, unknown>;
    const sizeX = (canvasProps.sizeX as number) ?? 800;
    const sizeY = (canvasProps.sizeY as number) ?? 600;
    const bcData = compBoxCollider(sizeX, sizeY);
    const bcId = bcData.ID as string;
    const bcOffsetId = (bcData.Offset as { ID: string }).ID;
    const bcSizeId = (bcData.Size as { ID: string }).ID;
    const bcBuilt = { Type: typeIndex("BoxCollider"), Data: bcData };

    const canvasBuilt = {
      Type: typeIndex("Canvas"),
      Data: compCanvas(canvasProps, rtDataId, bcId, bcSizeId, bcOffsetId),
    };

    // Legacy rounded-corner SpriteProvider on the canvas slot. No longer
    // referenced by any Image (corner shaping now uses the pill texture via
    // the unified cornerRadius), but still injected when canvas.rounded so the
    // canvas component layout the rest of the export was tuned against stays
    // identical. Harmless unused asset provider.
    let spBuilt: { Type: Int32; Data: Record<string, unknown> } | null = null;
    if (canvasProps.rounded !== false && _textureId) {
      spBuilt = { Type: typeIndex("SpriteProvider"), Data: compSpriteProvider(_textureId) };
    }

    // Logo SpriteProvider — always injected on the canvas slot. Borders set
    // to zero so 9-slice doesn't carve up the icon (which is a centered
    // triangle, not a stretchable UI element). Images opt in via
    // `Image.props.useLogoSprite`.
    let logoSpBuilt: { Type: Int32; Data: Record<string, unknown> } | null = null;
    if (_logoTextureId) {
      const logoSpData = compSpriteProvider(_logoTextureId, [0, 0, 0, 0], 1, 1);
      _logoSpriteId = logoSpData.ID as string;
      logoSpBuilt = { Type: typeIndex("SpriteProvider"), Data: logoSpData };
    }

    // Per-icon SpriteProviders — same shape as the logo (no 9-slice borders).
    // Each opt-in flag on Image props (useHelpIcon, etc.) selects the matching
    // sprite ID at compImage time.
    const iconSpBuilt: Array<{ Type: Int32; Data: Record<string, unknown> }> = [];
    if (_helpTexId) {
      const d = compSpriteProvider(_helpTexId, [0, 0, 0, 0], 1, 1);
      _helpSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_closeTexId) {
      const d = compSpriteProvider(_closeTexId, [0, 0, 0, 0], 1, 1);
      _closeSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_checkTexId) {
      const d = compSpriteProvider(_checkTexId, [0, 0, 0, 0], 1, 1);
      _checkSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_backspaceTexId) {
      const d = compSpriteProvider(_backspaceTexId, [0, 0, 0, 0], 1, 1);
      _backspaceSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_spinnerTexId) {
      const d = compSpriteProvider(_spinnerTexId, [0, 0, 0, 0], 1, 1);
      _spinnerSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_openArrowTexId) {
      const d = compSpriteProvider(_openArrowTexId, [0, 0, 0, 0], 1, 1);
      _openArrowSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_clearIconTexId) {
      const d = compSpriteProvider(_clearIconTexId, [0, 0, 0, 0], 1, 1);
      _clearIconSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_imagePlaceholderTexId) {
      const d = compSpriteProvider(_imagePlaceholderTexId, [0, 0, 0, 0], 1, 1);
      _imagePlaceholderSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    if (_imageIconTexId) {
      const d = compSpriteProvider(_imageIconTexId, [0, 0, 0, 0], 1, 1);
      _imageIconSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    // Pill SpriteProvider — Borders=0.5 means the entire texture is corner
    // (no middle stretch). Paired with Image.NineSliceSizing="RectHeight" this
    // produces a true pill at any rect size. Values taken verbatim from the
    // Rocker 2 preset's pill SpriteProvider.
    if (_pillTexId) {
      const d = compSpriteProvider(_pillTexId, [0.5, 0.5, 0.5, 0.5], 1, 8);
      _pillSpriteId = d.ID as string;
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }
    // One SpriteProvider per user-uploaded image. Borders=0, no 9-slice — we
    // treat custom uploads as full-image sprites (PreserveAspect on by default
    // on the Image side). compImage routes Image.Sprite to these by hash.
    _customSpriteIds = new Map();
    for (const [hash, texId] of _customTexIds) {
      const d = compSpriteProvider(texId, [0, 0, 0, 0], 1, 1);
      _customSpriteIds.set(hash, d.ID as string);
      iconSpBuilt.push({ Type: typeIndex("SpriteProvider"), Data: d });
    }

    const otherBuilt = slot.components
      .filter((c) => c !== rtComp && c !== canvasComp)
      .map((c) => buildComponent(c));

    components = [canvasBuilt, rtBuilt, bcBuilt];
    if (spBuilt) components.push(spBuilt);
    if (logoSpBuilt) components.push(logoSpBuilt);
    components.push(...iconSpBuilt);
    components.push(...otherBuilt);
    // DynamicVariableSpace so every "📚 Value" variable on the controls below
    // binds by name. Harmless when no interactive controls are present.
    components.push({ Type: typeIndex("DynamicVariableSpace"), Data: compDynamicVariableSpace(null) });
  } else {
    // Non-canvas slot: RectTransform first (if present), then everything else.
    // SPECIAL CASE — slot has both Image + Button: insert a SmoothValue<colorX>
    // companion that animates Image.Tint based on the Button's hover/press
    // ColorDriver. Without this, the button has no visible feedback and feels
    // unclickable. Matches the Labeled button preset's wiring.
    // ADDITIONAL CASE — slot also has Checkbox: emit ValueField-free Checkbox
    // wiring (BooleanValueDriver<colorX> + UIX.Checkbox) so click toggles a
    // ✓ Text on the same slot between transparent and opaque.
    const imageComp    = slot.components.find((c) => c.type === "Image");
    const buttonComp   = slot.components.find((c) => c.type === "Button");
    const checkboxComp = slot.components.find((c) => c.type === "Checkbox");
    const toggleComp   = slot.components.find((c) => c.type === "Toggle");
    const knobComp     = slot.components.find((c) => c.type === "Knob");
    const sliderComp   = slot.components.find((c) => c.type === "Slider");
    const progressBarComp = slot.components.find((c) => c.type === "ProgressBar");
    const textFieldComp = slot.components.find((c) => c.type === "TextField");
    const radioComp    = slot.components.find((c) => c.type === "Radio");
    const dropdownComp = slot.components.find((c) => c.type === "Dropdown");
    const referenceFieldComp = slot.components.find((c) => c.type === "ReferenceField");
    const scrollAreaComp = slot.components.find((c) => c.type === "ScrollArea");
    const colorPickerComp = slot.components.find((c) => c.type === "ColorPicker");
    const markerComp   = checkboxComp ?? toggleComp;
    // Spinner slot detection — an Image with `useSpinnerIcon: true` is
    // expanded into a procedural UIX.OutlinedArc + drivers + ProtoFlux
    // subtree (see `hasSpinner` branch). Takes priority over hasButtonFeedback
    // so the Image is replaced rather than wrapped with a button-color driver.
    const isSpinnerImage = !!imageComp
      && (imageComp.props as Record<string, unknown>).useSpinnerIcon === true;
    const hasSpinner = isSpinnerImage && !!rtComp;
    const hasBoolToggle = !!markerComp && !!buttonComp && !!imageComp;
    const hasColorPicker = !!colorPickerComp && !!imageComp && !!buttonComp;
    const hasButtonFeedback = !!imageComp && !!buttonComp && !hasBoolToggle && !knobComp && !sliderComp && !progressBarComp && !textFieldComp && !radioComp && !dropdownComp && !referenceFieldComp && !colorPickerComp && !hasSpinner;
    const hasKnob = !!knobComp && !!rtComp && !hasBoolToggle;
    const hasSlider = !!sliderComp && !!rtComp;
    const hasProgressBar = !!progressBarComp && !!rtComp && !sliderComp;
    const hasTextField = !!textFieldComp && !!rtComp;
    const hasRadio = !!radioComp && !!rtComp && !!imageComp;
    const hasDropdown = !!dropdownComp && !!rtComp && !!imageComp && !!buttonComp;
    const hasReferenceField = !!referenceFieldComp && !!rtComp;
    const hasScrollArea = !!scrollAreaComp && !!rtComp;
    const tabsComp = slot.components.find((c) => c.type === "Tabs");
    const tabButtonComp = slot.components.find((c) => c.type === "TabButton");
    const hasTabs = !!tabsComp && !!rtComp;
    // A tab button carries Image + Button (so it would otherwise match
    // hasButtonFeedback) — branch it first. Require its pre-allocated info so a
    // stray marker without a Tabs ancestor harmlessly falls through to generic.
    const hasTabButton = !!tabButtonComp && !!rtComp && !!imageComp && !!buttonComp && _tabButtonInfo.has(slot.id);

    if (hasTabs) {
      // Tabs host — shared ValueField<int> + per-page Active drivers. Pages and
      // the bar serialize normally as children (no reparenting).
      const tResult = buildTabsHostComponents(slot, rtComp!, tabsComp!);
      components = tResult.components;
    } else if (hasTabButton) {
      // Tab button — ButtonValueSet<int> (select) + highlight driver chain.
      const tbResult = buildTabButtonSlot(
        slot, rtComp!, imageComp!, buttonComp!, _tabButtonInfo.get(slot.id)!,
      );
      components = tbResult.components;
    } else if (hasBoolToggle) {
      // Stateful bool-toggle slot (Checkbox + Toggle) — see buildBoolToggleSlot.
      // May pre-serialize a Knob child; preBuiltKnob/Idx are spliced back by
      // the Children mapper below.
      const btResult = buildBoolToggleSlot(
        slot, rtComp, imageComp!, buttonComp!, checkboxComp, toggleComp, markerComp!, slotId,
      );
      components = btResult.components;
      preBuiltKnob = btResult.preBuiltKnob;
      preBuiltKnobIdx = btResult.preBuiltKnobIdx;
      valueExport = btResult.valueExport;
    } else if (hasKnob) {
      // Knob slot — animated slide chain (see buildKnobSlot). Stashes its two
      // driver State IDs in the module temps for the parent Toggle's MultiDriver.
      const knobResult = buildKnobSlot(slot, rtComp!, knobComp!);
      components = knobResult.components;
    } else if (hasSlider) {
      // Slider slot — see buildSliderSlot. Emits the host Slider<float> plus a
      // synthesized "Fill" child (with SmoothValue<float2> drive) and a "Knob"
      // grandchild riding the fill's leading edge.
      const slResult = buildSliderSlot(slot, rtComp!, imageComp, sliderComp!, slotId);
      components = slResult.components;
      preBuiltFill = slResult.fill;
      valueExport = slResult.valueExport;
    } else if (hasProgressBar) {
      // ProgressBar slot — see buildProgressBarSlot. Emits the track host
      // (RT + user Image + ValueField<float> + Float2Driver) plus a synthesized
      // "Fill" child whose RT.AnchorMax is driven by the progress value.
      const pbResult = buildProgressBarSlot(slot, rtComp!, imageComp, progressBarComp!, slotId);
      components = pbResult.components;
      preBuiltFill = pbResult.fill;
      valueExport = pbResult.valueExport;
    } else if (hasRadio) {
      // Radio button slot — see buildRadioSlot. Emits the host driver chain
      // (shared ValueField<int> + ButtonValueSet + EqualityDriver + color
      // driver) and a synthesized "Dot" child whose Tint reflects selection.
      const rdResult = buildRadioSlot(slot, rtComp!, imageComp!, buttonComp, radioComp!, slotId);
      components = rdResult.components;
      preBuiltDot = rdResult.dot;
    } else if (hasTextField) {
      // TextField slot — see buildTextFieldSlot. Emits the host TextField +
      // TextEditor wiring and a synthesized "Text" child carrying the editable
      // UIX.Text the editor reads/writes.
      const tfResult = buildTextFieldSlot(slot, rtComp!, imageComp, buttonComp, textFieldComp!, slotId);
      components = tfResult.components;
      preBuiltText = tfResult.text;
      valueExport = tfResult.valueExport;
    } else if (hasDropdown) {
      // Dropdown trigger slot — see buildDropdownSlot. Emits the trigger host +
      // a synthesized "Label" child; the popup is appended by buildRootWrapper.
      const ddResult = buildDropdownSlot(slot, rtComp, imageComp, buttonComp, dropdownComp, slotId);
      components = ddResult.components;
      preBuiltText = ddResult.label;
      valueExport = ddResult.valueExport;
    } else if (hasScrollArea) {
      // ScrollArea slot — see buildScrollAreaSlot. Viewport + synthesized
      // Content (children reparented) + optional live-scrollbar subtree.
      const saResult = buildScrollAreaSlot(slot, rtComp, scrollAreaComp, slotId);
      components = saResult.components;
      preBuiltScrollAreaContent     = saResult.content;
      scrollAreaSuppressChildren    = saResult.suppressChildren;
      preBuiltScrollAreaScrollbar   = saResult.scrollbar;
      preBuiltScrollAreaProtoFlux   = saResult.protoFlux;
      preBuiltScrollAreaDropShadows = saResult.dropShadows;
    } else if (hasSpinner) {
      // Spinner slot — see buildSpinnerSlot. Replaces the Image with a
      // procedural UIX.OutlinedArc + gradient drivers and a synthesized
      // "ProtoFlux" child that animates the swirl every frame.
      const spResult = buildSpinnerSlot(slot, rtComp!, imageComp!, slotId);
      components = spResult.components;
      preBuiltSpinnerProtoFlux = spResult.protoFlux;
      valueExport = spResult.valueExport;
    } else if (hasReferenceField) {
      // ReferenceField widget — see buildReferenceFieldSlot (RefEditor pattern).
      const rfResult = buildReferenceFieldSlot(slot, rtComp, imageComp, referenceFieldComp, slotId);
      components = rfResult.components;
      preBuiltRefSubtree = rfResult.refSubtree;
      valueExport = rfResult.valueExport;
    } else if (hasColorPicker) {
      // Color Picker swatch — see buildColorPickerSlot. Image + static Button +
      // ButtonEditColorX (opens Resonite's native picker into the Tint), with
      // an exposed colorX "📚 Value" mirroring the chosen color.
      const cpResult = buildColorPickerSlot(slot, rtComp, imageComp!, buttonComp!, colorPickerComp!);
      components = cpResult.components;
      valueExport = cpResult.valueExport;
    } else if (hasButtonFeedback) {
      // Build Image first to capture its Tint field ID, then build everything
      // else preserving original order. Replace the Button slot with a driver-
      // wired version and append a SmoothValue after it.
      const imageBuilt = buildComponent(imageComp!);
      const tintFieldId = ((imageBuilt.Data as Record<string, unknown>).Tint as { ID: string }).ID;

      // "Image button" detection: the Image carries a photographic sprite
      // (custom upload, bundled icon, or http(s) sprite URL) — i.e. the image
      // IS the visual, not a shape mask. In that case skip the hover/press
      // SmoothValue chain entirely: cycling the Image.Tint between Button
      // colors would tint the icon's pixels (e.g. flash dark grey over a
      // white question mark), which reads as a colored slab behind a
      // transparent sprite. Without the SmoothValue, the Image keeps its
      // authored tint and the click is still registered.
      const imgP = imageComp!.props as Record<string, unknown>;
      const isPhotographicImage =
        !!imgP.customImageHash ||
        imgP.useHelpIcon === true || imgP.useCloseIcon === true ||
        imgP.useCheckIcon === true || imgP.useBackspaceIcon === true ||
        imgP.useSpinnerIcon === true || imgP.useOpenArrowIcon === true ||
        imgP.useClearIcon === true || imgP.useLogoSprite === true ||
        (typeof imgP.spriteUrl === "string" && /^https?:\/\//.test(imgP.spriteUrl as string));

      const ordered: Array<{ Type: Int32; Data: Record<string, unknown> }> = [];
      if (rtComp) ordered.push(buildComponent(rtComp));

      if (isPhotographicImage) {
        // No color driver target → no ColorDrivers entry on Button. Force the
        // four color states to fully-transparent so anything that reads them
        // (legacy ID slots, future tooling) doesn't paint a slab behind the
        // image. Button still emits Pressed/Released/etc. events for clicks.
        const zeroed = { r: 0, g: 0, b: 0, a: 0 };
        const buttonBuilt = {
          Type: typeIndex("Button"),
          Data: compButton({
            ...(buttonComp!.props as Record<string, unknown>),
            normalColor: zeroed,
            highlightColor: zeroed,
            pressColor: zeroed,
            disabledColor: zeroed,
          }),
        };
        ordered.push(imageBuilt, buttonBuilt);
      } else {
        const colorDriveTargetId = nextId();
        // Initial color: the rest tint (Image's normal color) — matches BaseColor.
        const initialColor = (imageComp!.props as Record<string, unknown>).tint as
          { r: number; g: number; b: number; a: number } ?? { r: 1, g: 1, b: 1, a: 1 };

        const buttonBuilt = {
          Type: typeIndex("Button"),
          Data: compButton(buttonComp!.props as Record<string, unknown>, colorDriveTargetId),
        };
        const smoothBuilt = {
          Type: typeIndex("SmoothValueColorX"),
          Data: compSmoothValueColor(colorDriveTargetId, tintFieldId, initialColor),
        };
        ordered.push(imageBuilt, buttonBuilt, smoothBuilt);
      }

      // Append remaining components (Text, LayoutElement, etc.). Close and
      // Popup are UIX-Studio-side markers handled by the auto-inject blocks
      // below — never emit them directly or we'd write stray unrecognized
      // base-components into the slot.
      for (const c of slot.components) {
        if (c === rtComp || c === imageComp || c === buttonComp) continue;
        if (c.type === "Close" || c.type === "Popup" || c.type === "Spacer") continue;
        if (c.type === "PopupContent" || c.type === "PopupDismiss") continue;
        if (c.type === "Tabs" || c.type === "TabButton" || c.type === "TabPage") continue;
        ordered.push(buildComponent(c));
      }
      components = ordered;
    } else {
      const orderedComps = rtComp
        ? [rtComp, ...slot.components.filter((c) => c !== rtComp)]
        : slot.components.slice();
      // RadioGroup marker → replace with a real ValueField<int> on this slot,
      // and stash the Value field's ID in the module-level registry keyed by
      // groupId. Child Radio slots (which serialize after this parent) will
      // look up the same groupId and reference the same field. This keeps
      // the shared "selected index" on the group root instead of burying it
      // inside the first option.
      components = [];
      for (const c of orderedComps) {
        // Close / Popup are UIX-Studio-side markers — handled by the
        // auto-inject blocks below, never emitted directly. Spacer is an
        // editor-only filler with no FrooxEngine counterpart.
        if (c.type === "Close" || c.type === "Popup" || c.type === "Spacer") continue;
        if (c.type === "PopupContent" || c.type === "PopupDismiss") continue;
        // Tab markers are lowered by the hasTabs / hasTabButton branches; a page
        // (TabPage) falls through to here, so drop its marker too.
        if (c.type === "Tabs" || c.type === "TabButton" || c.type === "TabPage") continue;
        if (c.type === "RadioGroup") {
          const rgp = c.props as Record<string, unknown>;
          const groupId = (rgp.groupId as string) ?? "group1";
          const initialIndex = ((rgp.initialIndex as number) ?? 0) | 0;
          if (!_radioGroupFieldIds.has(groupId)) {
            const vfData = compValueFieldInt(initialIndex);
            _radioGroupFieldIds.set(groupId, vfData.valueFieldId);
            components.push({ Type: typeIndex("ValueFieldInt"), Data: vfData.data });
            // Expose the group's shared selected-index on the group slot.
            valueExport = { kind: "int", sourceFieldId: vfData.valueFieldId, initial: initialIndex };
          }
          continue;
        }
        components.push(buildComponent(c));
      }
    }
  }

  // Register this control's exposed value against its wrapper slot. The wrapper
  // (an ancestor, serialized earlier but whose Children list is assembled AFTER
  // this marker) picks it up below and attaches the "📚 Value" slot as a
  // direct, visible child. Falls back to this slot when no wrapper was found.
  if (valueExport) {
    const wrapId = _valueWrapperOf.get(slot.id) ?? slot.id;
    const arr = _pendingValueSlots.get(wrapId) ?? [];
    arr.push(valueExport);
    _pendingValueSlots.set(wrapId, arr);
  }

  // Drain any per-Image extras (e.g. custom-rounded SpriteProviders) that
  // compImage pushed during this slot's component build, then restore the
  // parent's pending list. Extras land on the same slot as their owning Image.
  if (_pendingImageExtras.length > 0) {
    components.push(..._pendingImageExtras);
  }
  _pendingImageExtras = savedPendingExtras;
  _currentImageRect = savedImageRect;

  // Auto-inject a click trigger + Hyperlink when this slot has an Image with a
  // non-empty `hyperlinkUrl` prop and isn't already wired with a Hyperlink.
  //
  // CRITICAL — how the click reaches the Hyperlink depends on whether this is a
  // UIX element (inside a Canvas) or a free-standing slot, because a physics
  // BoxCollider is ALWAYS centred on the slot's transform origin
  // (compBoxCollider Offset = 0,0,0):
  //   • On-canvas (slot has a RectTransform): the element is drawn at its
  //     RectTransform rect while the slot transform stays at the origin, so a
  //     BoxCollider would sit at the origin — NOT under the visual — and the link
  //     is unclickable (the collider "doesn't line up with the button"). The fix
  //     is to route the press through a UIX Button instead: the canvas rect-routes
  //     the pointer to the button (ALWAYS aligned with the visual), and the
  //     Hyperlink receives that press via IButtonPressReceiver. Add a static
  //     Button only if the slot lacks one.
  //   • Off-canvas (no RectTransform, e.g. a free-standing logo): the slot has a
  //     real world position, so a BoxCollider centred on its origin DOES align —
  //     keep the physics-collider path with a non-zero Z thickness.
  // Never attach a bare BoxCollider to an on-canvas hyperlink — that is exactly
  // the misalignment bug this guards against.
  if (!isCanvasSlot) {
    const imgWithLink = slot.components.find((c) => {
      if (c.type !== "Image") return false;
      const url = ((c.props as { hyperlinkUrl?: string }).hyperlinkUrl ?? "").trim();
      return url.length > 0;
    });
    if (imgWithLink) {
      const alreadyHasLink = slot.components.some((c) => c.type === "Hyperlink");
      if (!alreadyHasLink) {
        const imgProps = imgWithLink.props as { hyperlinkUrl?: string; hyperlinkReason?: string };
        const url = (imgProps.hyperlinkUrl ?? "").trim();
        const authoredReason = (imgProps.hyperlinkReason ?? "").trim();
        // The @-prefix in compHyperlink keeps URL alive across import (see
        // CLAUDE.md → "Hyperlink URLs require the @ prefix"), so Reason no
        // longer has to double as a URL display. Falls back to the URL when
        // the user didn't supply a reason just so the confirmation isn't
        // empty-looking.
        const reason = authoredReason || url;
        const hasRect   = slot.components.some((c) => c.type === "RectTransform");
        const hasButton = slot.components.some((c) => c.type === "Button");
        if (hasRect) {
          // On-canvas → UIX Button rect-routing (aligned). A static Button (no
          // ColorDrivers) is clickable but leaves the graphic's tint untouched.
          if (!hasButton) {
            components.push({ Type: typeIndex("Button"), Data: compButton({}) });
          }
        } else if (!slot.components.some((c) => c.type === "BoxCollider")) {
          // Off-canvas → physics BoxCollider. sizeZ=1 (canvas-pixel units → 1 mm
          // world at the 0.001 UnitScale) gives it non-degenerate thickness so the
          // pointer raycast actually intersects it.
          const sz = _slotRectSizes.get(slot.id) ?? { w: 100, h: 100 };
          components.push({
            Type: typeIndex("BoxCollider"),
            Data: compBoxCollider(Math.max(1, sz.w), Math.max(1, sz.h), 1),
          });
        }
        components.push({
          Type: typeIndex("Hyperlink"),
          Data: compHyperlink({ url, openOnce: false, reason }),
        });
      }
    }
  }

  // Auto-inject ButtonDestroy when the slot has a Close marker. The marker
  // requires a sibling Button (which is what fires Pressed) — without it the
  // ButtonDestroy is inert. Target=slot.id + FindObjectRoot=true makes
  // Resonite walk to the panel's outer grabbable and destroy that on click,
  // which is the standard "X" button behavior.
  const closeMarker = slot.components.find((c) => c.type === "Close");
  if (closeMarker) {
    const closeProps = closeMarker.props as { findObjectRoot?: boolean };
    components.push({
      Type: typeIndex("ButtonDestroy"),
      Data: compButtonDestroy(slotId, closeProps.findObjectRoot !== false),
    });
  }

  // Popup → ButtonToggle on the host slot. The toggle's TargetValue points
  // at the pre-allocated Active-field UUID for this slot's modal; clicking
  // flips Active false→true and the modal subtree (built in buildRootWrapper)
  // becomes visible. The modal's OK button carries a second ButtonToggle
  // targeting the same UUID, so clicking it flips Active back to false.
  // ButtonToggle subscribes to the sibling UIX.Button.Pressed event
  // automatically — the host slot must therefore have a Button component to
  // be clickable. (The user's "help icon" slot in the starter template now
  // includes one for exactly this reason.)
  applyPopupKeypadWiring(slot, components, isCanvasSlot);

  // Decorate text "Label" slots with a pen emoji in the exported scene tree so
  // they read clearly in Resonite (symmetric with the "📚 Value" data slots).
  // Source name stays "Label" — the wrapper/label detection above keys off it —
  // so this is purely the exported display name. Synthetic display labels
  // (e.g. the dropdown's selection readout) are built elsewhere and untouched.
  const isTextLabelSlot = slot.name === "Label" && slot.components.some((c) => c.type === "Text");
  // Self-describing control names: a default-named labelled composite exports as
  // "<label> <type>" (e.g. "Volume Slider"); user-renamed slots keep their name.
  // Shared with the editor hierarchy via controlDisplayName.
  const exportName = isTextLabelSlot ? "🖋 Label" : controlDisplayName(slot);

  // A Tabs page reuses its pre-allocated Active field UUID (so the host's
  // ValueEqualityDriver<int> can drive it) and starts visible only if it's the
  // initially-selected tab.
  const tabPageActiveId = _tabPageActiveIds.get(slot.id);
  const activeField = tabPageActiveId
    ? { ID: tabPageActiveId, Data: _tabPageInfo.get(slot.id)?.active ?? false }
    : { ID: nextId(), Data: true };

  return {
    ID: slotId,
    Components: { ID: compListId, Data: components },
    Name:           { ID: nextId(), Data: exportName },
    Tag:            { ID: nextId(), Data: null },
    Active:         activeField,
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(slot.position?.x ?? 0, slot.position?.y ?? 0, slot.position?.z ?? 0) },
    Rotation:       { ID: nextId(), Data: vec4(slot.rotation?.x ?? 0, slot.rotation?.y ?? 0, slot.rotation?.z ?? 0, slot.rotation?.w ?? 1) },
    Scale:          { ID: nextId(), Data: slot.scale
                       ? vec3(slot.scale.x, slot.scale.y, slot.scale.z)
                       : isCanvasSlot ? vec3(0.001, 0.001, 0.001) : vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: (() => {
      // ScrollArea reparents the user's children into the synthetic Content
      // slot during its branch above — skip the default mapping in that case
      // to avoid emitting them twice.
      const out = scrollAreaSuppressChildren
        ? []
        : slot.children.map((child, idx) => {
            if (idx === preBuiltKnobIdx && preBuiltKnob) return preBuiltKnob;
            return serializeSlot(child, slotId, idx);
          });
      if (preBuiltFill) out.push(preBuiltFill);
      if (preBuiltText) out.push(preBuiltText);
      if (preBuiltDot) out.push(preBuiltDot);
      // Attach any "📚 Value" slots registered for THIS slot as their wrapper.
      const pendVals = _pendingValueSlots.get(slot.id);
      if (pendVals) {
        const baseName = _valueWrapperLabel.get(slot.id) ?? slot.name;
        for (const v of pendVals) out.push(buildValueSlot(slotId, baseName, v));
      }
      if (preBuiltRefSubtree) out.push(preBuiltRefSubtree);
      if (preBuiltSpinnerProtoFlux) out.push(preBuiltSpinnerProtoFlux);
      if (preBuiltScrollAreaContent) out.push(preBuiltScrollAreaContent);
      if (preBuiltScrollAreaScrollbar) out.push(preBuiltScrollAreaScrollbar);
      if (preBuiltScrollAreaDropShadows) out.push(preBuiltScrollAreaDropShadows);
      if (preBuiltScrollAreaProtoFlux) out.push(preBuiltScrollAreaProtoFlux);
      // Image placeholder: overlay a centered, aspect-locked glyph child on top of
      // the stretch-to-fill hatch background so the icon never distorts.
      const _phImg = slot.components.find((c) => c.type === "Image")?.props as Record<string, unknown> | undefined;
      if (_phImg && _phImg.useImagePlaceholder === true && _phImg.placeholderRemoved !== true && !_phImg.customImageHash && _imageIconSpriteId) {
        out.push(buildPlaceholderIconSlot(slotId));
      }
      assignOrderOffsets(out);
      return out;
    })(),
  };
}

// ── Root wrapper (Grabbable object) ──────────────────────────────────────────

// Inner "Back Logo" slot — child of the Credits wrapper built below. Holds the
// QuadMesh + MeshRenderer pair that draws the back-panel branding. Rotated
// 180° around Y so the quad's front face points away from the canvas (toward
// the rear viewer); paired with UnlitMaterial Sidedness=Front, the logo is
// visible only from behind. Position stays at the origin — the Credits parent
// supplies the depth offset that clears the canvas plane.
function buildBackLogoSlot(parentId: string): Record<string, unknown> {
  const slotId = nextId();
  const compListId = nextId();
  const qm = compQuadMesh();
  const meshId = qm.ID as string;
  const mr = compMeshRenderer(meshId, _backLogoMatId);
  const compData: Array<{ Type: Int32; Data: Record<string, unknown> }> = [
    { Type: typeIndex("QuadMesh"),     Data: qm },
    { Type: typeIndex("MeshRenderer"), Data: mr },
  ];
  // When the user sets a back-logo hyperlink URL on the Canvas, drop in a
  // sibling BoxCollider + Hyperlink. The slot's scale is 0.1014 (square), so
  // a 1×1×0.1 collider in local space covers the full quad with a small but
  // non-zero Z thickness (~1 cm world) — required so pointer raycasts hit
  // it.
  //
  // compHyperlink prepends "@" to the URL so it survives Resonite's import-
  // time null-coerce (see CLAUDE.md → "Hyperlink URLs require the @ prefix").
  // Reason falls back to the URL if the user didn't author one, so the
  // confirmation dialog never reads as a stray "click to go to nowhere".
  if (_backLogoHyperlinkUrl) {
    const collider = compBoxCollider(1, 1, 0.1);
    const link = compHyperlink({
      url: _backLogoHyperlinkUrl,
      openOnce: false,
      reason: _backLogoHyperlinkReason || _backLogoHyperlinkUrl,
    });
    compData.push({ Type: typeIndex("BoxCollider"), Data: collider });
    compData.push({ Type: typeIndex("Hyperlink"),   Data: link });
  }
  return {
    ID: slotId,
    Components: {
      ID: compListId,
      Data: compData,
    },
    Name:           { ID: nextId(), Data: "Back Logo" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    // Quaternion for 180° rotation around Y axis (w≈0, y=1).
    Rotation:       { ID: nextId(), Data: vec4(0, 1, 0, 0) },
    // 0.1014m square — about 17% of the 0.6m canvas height. Modest but
    // present, like a discreet logo watermark on the back of the panel.
    Scale:          { ID: nextId(), Data: vec3(0.1014, 0.1014, 0.1014) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [],
  };
}

// "Credits" parent wrapper at the Grabbable root level. Pure organizational
// slot (no components) — exists so the "Back Logo" mesh sits under a clearly-
// labeled grouping, which discourages users from deleting it when poking
// around in the scene inspector.
//
// Position.z = 0.01 (1 cm behind the canvas plane in world space) is the
// default depth offset that pushes the entire Credits subtree clear of the
// canvas back face so the QuadMesh doesn't Z-fight with the in-canvas Back
// Cover image. Tweak here to change how far the logo floats off the back.
const CREDITS_BACK_OFFSET_Z = 0.01;

// Build a non-clickable QuadMesh badge for a credits piece (logo or text).
// No BoxCollider/Hyperlink — clickability comes from a wrapping parent slot
// that covers the whole credits row.
function buildCreditsPieceMesh(
  parentId: string,
  name: string,
  materialId: string,
  meshSize: [number, number],
  localPos: { x: number; y: number; z?: number },
  scale: number,
): Record<string, unknown> {
  const slotId = nextId();
  const compListId = nextId();
  const qm = compQuadMesh(meshSize);
  const meshId = qm.ID as string;
  const mr = compMeshRenderer(meshId, materialId);
  return {
    ID: slotId,
    Components: {
      ID: compListId,
      Data: [
        { Type: typeIndex("QuadMesh"), Data: qm },
        { Type: typeIndex("MeshRenderer"), Data: mr },
      ],
    },
    Name:           { ID: nextId(), Data: name },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    // Position is in the parent's local space. Parent ("Credits Banner")
    // already carries the 180° Y rotation and world translation, so each
    // piece just specifies its offset within the row.
    Position:       { ID: nextId(), Data: vec3(localPos.x, localPos.y, localPos.z ?? 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(scale, scale, scale) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [],
  };
}

// Wrapping "Credits Banner" slot — sits at the bottom-LEFT corner of the
// back side, rotated 180° around Y so its children's front faces point at
// the back viewer. Carries one BoxCollider + Hyperlink covering the entire
// row width, so the user can click ANY piece (logo / "Made with UIX Studio"
// / "by Dalek") and land on uix.dalek.coffee. Avoids the previous design's
// big visual gap between two separately-clickable badges.
function buildCreditsBanner(
  parentId: string,
  panelWorldWidth: number,
  panelWorldHeight: number,
): Record<string, unknown> {
  const slotId = nextId();
  const compListId = nextId();

  // Layout (in the banner's local space, AFTER the 180° Y rotation flips
  // the X axis, so children appear left-to-right from back viewer's POV
  // when their local X grows in the negative direction — i.e. the LEFTMOST
  // child to the back viewer needs the LARGEST positive local X).
  //
  // The banner uniformly scales by `bannerScale` (controls overall height).
  // Within the local frame, the row is:
  //   [ logo ] [ text "Made with UIX Studio" ]
  // Pieces are positioned by their CENTERS.
  const bannerScale = 0.025;
  const textAspect = CREDITS_TEXT_ASPECT;     // ~5.71 (no "by Dalek" suffix)
  const logoSize = 1.2;                       // logo quad is 1.2×1.2 → slightly taller than text row
  const gap = 0.3;                            // local-space gap between logo and text
  // Read order from the back viewer's POV: [logo] Made with UIX Studio.
  // The banner is rotated 180° around Y so local +X maps to the back viewer's
  // RIGHT and local -X to their LEFT. For the LOGO to land on their LEFT
  // (start of the read), it needs a NEGATIVE local X — putting it BEFORE
  // the text in their reading direction. Text stays centered at local 0.
  const logoLocalX = -((textAspect / 2) + gap + (logoSize / 2));
  const textLocalX = 0;
  const logo = buildCreditsPieceMesh(
    slotId,
    "Logo",
    _badgeLogoMatId,
    [logoSize, logoSize],
    { x: logoLocalX, y: 0 },
    1,
  );
  const text = buildCreditsPieceMesh(
    slotId,
    "Text",
    _creditsTextMatId,
    [textAspect, 1],
    { x: textLocalX, y: 0 },
    1,
  );

  // Readability scrim — only when the back has a custom image. A dark quad
  // covering the whole row, nudged +Z (away from the back viewer, i.e. behind
  // the logo/text) so the credits render on top of it. Sized to the row plus a
  // small margin so it reads as a rounded-less label plate.
  const backdrop = _creditsBackdropMatId
    ? buildCreditsPieceMesh(
        slotId,
        "Backdrop",
        _creditsBackdropMatId,
        [logoSize + gap + textAspect + 0.8, Math.max(logoSize, 1) + 0.6],
        { x: (logoLocalX - logoSize / 2 + textLocalX + textAspect / 2) / 2, y: 0, z: 0.05 },
        1,
      )
    : null;

  // Wrapping collider — covers logo + gap + text. Centered between the
  // outermost edges. In local units (pre banner-scale). sizeZ=0.5 gives the
  // box a non-degenerate thickness (~1.25 cm world after banner-scale 0.025)
  // so Resonite's pointer raycast actually hits it — a flat Z=0 collider
  // sitting outside the canvas slips through the raycast entirely.
  const totalWidth = logoSize + gap + textAspect;
  const totalHeight = Math.max(logoSize, 1);
  const collider = compBoxCollider(totalWidth, totalHeight, 0.5);
  // Center the collider on the geometric midpoint of the row. With logo at
  // logoLocalX and text at 0, the row spans (logoLocalX - logoSize/2) to
  // (textLocalX + textAspect/2). Midpoint sits halfway between those.
  const rowLeft  = logoLocalX - logoSize / 2;
  const rowRight = textLocalX + textAspect / 2;
  const rowMidX  = (rowLeft + rowRight) / 2;
  (collider.Offset as { ID: string; Data: unknown[] }).Data = vec3(
    rowMidX,
    0,
    0,
  );

  const link = compHyperlink({
    url: "https://uix.dalek.coffee",
    openOnce: false,
    reason: "Made with UIX Studio — visit uix.dalek.coffee",
  });

  // Banner world position — pin to back-viewer's bottom-LEFT corner of the
  // 0.8m × 0.6m panel. Back viewer's left = world +X. Y stays toward bottom.
  // The banner is rotated 180° around Y so children's front faces face back.
  return {
    ID: slotId,
    Components: {
      ID: compListId,
      Data: [
        { Type: typeIndex("BoxCollider"), Data: collider },
        { Type: typeIndex("Hyperlink"),   Data: link },
      ],
    },
    Name:           { ID: nextId(), Data: "Credits Banner" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    // World X = +0.22 anchors the row near the back-viewer's left edge with
    // ~3.5cm clearance from the corner (the logo now sits at back-viewer's
    // far LEFT so its leading edge is what dictates the inset). World Y =
    // -0.265 puts the row 3.5cm above the bottom edge.
    // World X is computed so the row's leftmost extent (the logo's far edge,
    // after the 180° Y rotation that maps local -X → world +X) sits a modest
    // `edgePad` from the panel's left edge (back-viewer's left = world +X =
    // +0.4). Recomputed here so it tracks the credits text aspect — when
    // CREDITS_TEXT_ASPECT changes, the row width changes, and `logoLocalX`
    // (above) shifts. With the previous hardcoded 0.22 the inset was correct
    // for textAspect=8.57 (~3.5cm) but drifted to ~7cm when "by Dalek" was
    // dropped (textAspect=5.71). Driving from `edgePad` keeps it consistent.
    Position:       { ID: nextId(), Data: (() => {
      // Pin to back-viewer's bottom-LEFT corner of the actual panel in world
      // space. Back viewer's left = world +X (the panel is rotated 180° around
      // Y so local -X maps to viewer-left). Both X and Y are computed from
      // the live canvas dimensions so the banner tracks any resize.
      const edgePad = 0.025;       // 2.5 cm padding from the left edge
      const bottomPad = 0.035;     // 3.5 cm padding from the bottom edge
      const panelHalfWidth  = panelWorldWidth  / 2;
      const panelHalfHeight = panelWorldHeight / 2;
      const rowLeftWorldOffset = Math.abs(rowLeft) * bannerScale;
      const x = panelHalfWidth  - edgePad   - rowLeftWorldOffset;
      const y = -panelHalfHeight + bottomPad;
      return vec3(x, y, 0);
    })() },
    Rotation:       { ID: nextId(), Data: vec4(0, 1, 0, 0) },
    Scale:          { ID: nextId(), Data: vec3(bannerScale, bannerScale, bannerScale) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    // Backdrop first (drawn behind via its +Z offset), then logo + text.
    Children: backdrop ? [backdrop, logo, text] : [logo, text],
  };
}

function buildCreditsSlot(
  parentId: string,
  panelWorldWidth: number,
  panelWorldHeight: number,
): Record<string, unknown> {
  const slotId = nextId();
  const compListId = nextId();
  const backLogo = buildBackLogoSlot(slotId);
  const banner = buildCreditsBanner(slotId, panelWorldWidth, panelWorldHeight);
  return {
    ID: slotId,
    Components: { ID: compListId, Data: [] },
    Name:           { ID: nextId(), Data: "Credits" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, CREDITS_BACK_OFFSET_Z) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [backLogo, banner],
  };
}

// ── Popup spawn-window modal ─────────────────────────────────────────────────
//
// Constructs a hidden child slot of the canvas that becomes a full-canvas
// modal dialog when its Active field flips to true. Built directly as a BSON
// dict (not via serializeSlot) so we can pin the modal slot's Active.ID to
// the pre-allocated UUID — that UUID is what the ButtonToggle on the popup-
// host slot (and the ButtonToggle on this modal's OK button) reference. Both
// toggles flip the same bool, so click-help shows the modal and click-OK
// hides it. Layout: backdrop dims the canvas, centered card holds the title
// + body + OK button.
function buildPopupModalSlot(
  parentId: string,
  modalActiveFieldId: string,
  popupProps: { title?: string; body?: string; dismissLabel?: string },
  canvasW: number,
  canvasH: number,
): Record<string, unknown> {
  const title       = (popupProps.title       ?? "Heads up").trim()  || "Heads up";
  const body        = (popupProps.body        ?? "").trim()          || "Your message here.";
  const dismissText = (popupProps.dismissLabel ?? "OK").trim()       || "OK";

  // Pull theme colors for the modal sub-tree so the popup reads as part of
  // the panel, not as a generic dark-mode dialog floating over a sakura/
  // coffee/tech UI. Sensible fall-backs match the old hardcoded palette so
  // pre-theme save files still export identically.
  const themeBodyColor   = _exportTheme?.bodyTextColor   ?? { r: 0.82, g: 0.82, b: 0.82, a: 1 };
  const themeHeaderColor = _exportTheme?.headerTextColor ?? { r: 0.95, g: 0.95, b: 0.95, a: 1 };
  const themeSurface     = _exportTheme?.controlSurface  ?? { r: 0.12, g: 0.12, b: 0.12, a: 1 };
  const themeButtonA     = _exportTheme?.buttonA         ?? { r: 0.18, g: 0.36, b: 0.6,  a: 1 };
  const themeButtonAHi   = { r: Math.min(1, themeButtonA.r + 0.12), g: Math.min(1, themeButtonA.g + 0.12), b: Math.min(1, themeButtonA.b + 0.12), a: themeButtonA.a };
  const themeButtonAPr   = { r: Math.max(0, themeButtonA.r - 0.12), g: Math.max(0, themeButtonA.g - 0.12), b: Math.max(0, themeButtonA.b - 0.12), a: themeButtonA.a };

  // Card dimensions — large enough to read, never (much) larger than the
  // canvas. The floor keeps the title/body/OK from colliding on tiny panels
  // (Simple Dialog 240, Basic Text 200, Labeled Button 120); caps at 600×320
  // so big panels are unchanged.
  const cardW = Math.min(Math.max(canvasW - 32, 260), 600);
  const cardH = Math.min(Math.max(canvasH - 32, 160), 320);

  // Internal layout bands scale with the card and converge EXACTLY to the
  // original fixed values at the 320-tall / 600-wide cap, so large panels
  // render identically while small cards shrink their bands and fonts instead
  // of overlapping (the bug on the small dialog canvas).
  const padV       = Math.min(16, Math.round(cardH * 0.06));
  const padH       = Math.min(24, Math.round(cardW * 0.06));
  const gap        = Math.min(8,  Math.round(cardH * 0.04));
  const titleBandH = Math.min(40, Math.round(cardH * 0.16));
  const btnBandH   = Math.min(40, Math.round(cardH * 0.16));
  const btnHalfW   = Math.min(56, Math.round(cardW * 0.18));
  const titleSize  = Math.min(22, Math.max(13, Math.round(cardH * 0.085)));
  const popupBodySize = Math.min(16, Math.max(11, Math.round(cardH * 0.065)));
  const okSize     = Math.min(16, Math.max(12, Math.round(cardH * 0.07)));

  // ── Backdrop slot (dims everything behind the card) ──
  const backdropSlotId = nextId();
  const backdropCompId = nextId();
  const backdropRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
  const backdropImg = compImage({
    tint: { r: 0, g: 0, b: 0, a: 0.7 },
    preserveAspect: false, spriteUrl: "",
  });
  const backdrop = {
    ID: backdropSlotId,
    Components: { ID: backdropCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: backdropRt },
      { Type: typeIndex("Image"),         Data: backdropImg },
    ]},
    Name: { ID: nextId(), Data: "Backdrop" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [] as unknown[],
  };

  // ── Title slot ──
  const titleSlotId = nextId();
  const titleCompId = nextId();
  const titleRt = compRectTransform({
    anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: padH, y: -(padV + titleBandH) }, offsetMax: { x: -padH, y: -padV },
    pivot: { x: 0.5, y: 0.5 },
  });
  const titleText = compText({
    content: title, size: titleSize,
    color: themeHeaderColor,
    horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false,
  });
  const titleSlot = {
    ID: titleSlotId,
    Components: { ID: titleCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: titleRt },
      { Type: typeIndex("Text"),          Data: titleText },
    ]},
    Name: { ID: nextId(), Data: "Title" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [] as unknown[],
  };

  // ── Body slot ──
  const bodySlotId = nextId();
  const bodyCompId = nextId();
  const bodyRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: padH, y: padV + btnBandH + gap * 2 }, offsetMax: { x: -padH, y: -(padV + titleBandH + gap) },
    pivot: { x: 0.5, y: 0.5 },
  });
  const bodyText = compText({
    content: body, size: popupBodySize,
    color: themeBodyColor,
    horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
  });
  const bodySlot = {
    ID: bodySlotId,
    Components: { ID: bodyCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: bodyRt },
      { Type: typeIndex("Text"),          Data: bodyText },
    ]},
    Name: { ID: nextId(), Data: "Body" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [] as unknown[],
  };

  // ── OK button label child slot ──
  const okLabelSlotId = nextId();
  const okLabelCompId = nextId();
  const okLabelRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
  const okLabelText = compText({
    content: dismissText, size: okSize,
    color: { r: 1, g: 1, b: 1, a: 1 },
    horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
  });
  const okLabelSlot = {
    ID: okLabelSlotId,
    Components: { ID: okLabelCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: okLabelRt },
      { Type: typeIndex("Text"),          Data: okLabelText },
    ]},
    Name: { ID: nextId(), Data: "Label" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [] as unknown[],
  };

  // ── OK button slot — carries the ButtonToggle that flips the modal's
  // Active back to false on click. No SmoothValue hover anim (kept simple).
  const okSlotId = nextId();
  const okCompId = nextId();
  const okRt = compRectTransform({
    anchorMin: { x: 0.5, y: 0 }, anchorMax: { x: 0.5, y: 0 },
    offsetMin: { x: -btnHalfW, y: padV }, offsetMax: { x: btnHalfW, y: padV + btnBandH },
    pivot: { x: 0.5, y: 0.5 },
  });
  // Pill shape matches the user's general preference for generated buttons
  // ("pill or nothing before rounded"). The end-user `rounded` /
  // `roundedAmount` Image props remain available for slots the user
  // authors directly — this default only applies to the modal subtree
  // that the exporter generates on their behalf.
  const okImg = compImage({
    tint: themeButtonA,
    preserveAspect: false, spriteUrl: "",
    cornerRadius: 100,
  });
  const okBtn = compButton({
    normalColor:    themeButtonA,
    highlightColor: themeButtonAHi,
    pressColor:     themeButtonAPr,
    disabledColor:  { r: 0.30, g: 0.30, b: 0.30, a: 1 },
    hoverVibrate: false,
  });
  const okToggle = compButtonToggle(modalActiveFieldId);
  const okSlot = {
    ID: okSlotId,
    Components: { ID: okCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: okRt },
      { Type: typeIndex("Image"),         Data: okImg },
      { Type: typeIndex("Button"),        Data: okBtn },
      { Type: typeIndex("ButtonToggle"),  Data: okToggle },
    ]},
    Name: { ID: nextId(), Data: "OK" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [okLabelSlot],
  };

  // ── Card slot — dark rounded rectangle holding title/body/OK ──
  const cardSlotId = nextId();
  const cardCompId = nextId();
  const cardRt = compRectTransform({
    anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
    offsetMin: { x: -cardW / 2, y: -cardH / 2 },
    offsetMax: { x:  cardW / 2, y:  cardH / 2 },
    pivot: { x: 0.5, y: 0.5 },
  });
  // Modest rounded card. Set the rect locally so the intermediate-radius
  // FixedSize path bakes against the card's own size (this Image is built
  // outside serializeSlot's per-slot rect tracking).
  const savedCardRect = _currentImageRect;
  _currentImageRect = { w: cardW, h: cardH };
  const cardExtrasAt = _pendingImageExtras.length;
  const cardImg = compImage({
    tint: themeSurface,
    preserveAspect: false, spriteUrl: "",
    cornerRadius: 12,
  });
  // Drain the per-Image SpriteProvider compImage emitted onto THIS card slot
  // (it's built outside serializeSlot, which would otherwise misplace it).
  const cardExtras = _pendingImageExtras.splice(cardExtrasAt);
  _currentImageRect = savedCardRect;
  const cardSlot = {
    ID: cardSlotId,
    Components: { ID: cardCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: cardRt },
      { Type: typeIndex("Image"),         Data: cardImg },
      ...cardExtras,
    ]},
    Name: { ID: nextId(), Data: "Card" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [titleSlot, bodySlot, okSlot],
  };

  // ── Modal root slot — fills the canvas, Active=false initially. Active.ID
  // is the pre-allocated UUID so the host-slot ButtonToggle resolves to it.
  const modalSlotId = nextId();
  const modalCompId = nextId();
  const modalRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
  const modal = {
    ID: modalSlotId,
    Components: { ID: modalCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: modalRt },
    ]},
    Name:           { ID: nextId(), Data: "Popup Modal" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: modalActiveFieldId, Data: false },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [backdrop, cardSlot],
  };

  // Patch ParentReference on the descendants now that we have the IDs.
  (backdrop  as { ParentReference: string | null }).ParentReference = modalSlotId;
  (cardSlot  as { ParentReference: string | null }).ParentReference = modalSlotId;
  (titleSlot as { ParentReference: string | null }).ParentReference = cardSlotId;
  (bodySlot  as { ParentReference: string | null }).ParentReference = cardSlotId;
  (okSlot    as { ParentReference: string | null }).ParentReference = cardSlotId;
  (okLabelSlot as { ParentReference: string | null }).ParentReference = okSlotId;

  return modal;
}

// Build a popup modal from a user-authored PopupContent card (the editable
// path). The card slot, its Image, and every arranged child are serialized
// through the normal pipeline so the in-game result matches the editor exactly;
// the only synthetic piece is the dimming backdrop and the Active-toggle wired
// onto the PopupDismiss child (so it closes the modal). Legacy/un-edited popups
// use buildPopupModalSlot instead — see the caller in buildRootWrapper.
function buildPopupModalSlotFromContent(
  parentId: string,
  modalActiveFieldId: string,
  contentSlot: Slot,
): Record<string, unknown> {
  // ── Backdrop slot (dims everything behind the card) ──
  const backdropSlotId = nextId();
  const backdropCompId = nextId();
  const backdropRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
  const backdropImg = compImage({
    tint: { r: 0, g: 0, b: 0, a: 0.7 },
    preserveAspect: false, spriteUrl: "",
  });
  const backdrop = {
    ID: backdropSlotId,
    Components: { ID: backdropCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: backdropRt },
      { Type: typeIndex("Image"),         Data: backdropImg },
    ]},
    Name: { ID: nextId(), Data: "Backdrop" },
    Tag: { ID: nextId(), Data: null },
    Active: { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position: { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null as string | null,
    Children: [] as unknown[],
  };

  // ── Card slot = the serialized PopupContent slot ──
  // Serialize the card shell (no children) to capture its RT + Image, then
  // serialize each child separately so we can inject the dismiss toggle.
  const cardShell: Slot = { ...contentSlot, children: [] };
  const cardSlot = serializeSlot(cardShell, null) as Record<string, unknown> & {
    ID: string; Children: unknown[]; ParentReference: string | null;
  };
  const cardSlotId = cardSlot.ID;
  const cardChildren: unknown[] = [];
  for (const child of contentSlot.children) {
    const ser = serializeSlot(child, cardSlotId) as Record<string, unknown> & {
      Components: { Data: Array<{ Type: Int32; Data: Record<string, unknown> }> };
    };
    // The PopupDismiss child closes the modal — wire ButtonToggle to flip the
    // modal-root's Active back to false (mirrors the synthesized OK button).
    if (child.components.some((c) => c.type === "PopupDismiss")) {
      ser.Components.Data.push({ Type: typeIndex("ButtonToggle"), Data: compButtonToggle(modalActiveFieldId) });
    }
    cardChildren.push(ser);
  }
  cardSlot.Children = cardChildren;

  // ── Modal root slot — fills the canvas, Active=false initially ──
  const modalSlotId = nextId();
  const modalCompId = nextId();
  const modalRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
  const modal = {
    ID: modalSlotId,
    Components: { ID: modalCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: modalRt },
    ]},
    Name:           { ID: nextId(), Data: "Popup Modal" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: modalActiveFieldId, Data: false },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [backdrop, cardSlot],
  };
  (backdrop as { ParentReference: string | null }).ParentReference = modalSlotId;
  cardSlot.ParentReference = modalSlotId;
  return modal;
}

// Build an INLINE dropdown menu — a single panel positioned directly below
// its trigger button in canvas-space, holding a vertical stack of option
// buttons. No backdrop and no centered card; the menu IS the panel. The
// modal-root pattern (Active=modalActiveFieldId flipped by ButtonToggle on
// the trigger) is preserved so click-trigger opens the menu and click-option
// (or click-trigger-again) closes it.
//
// Positioning math: `triggerRect` is the trigger slot's full rect in canvas
// Y-up pixel coords (computed by `computeCanvasRelativeRectFor` walking the
// RT chain from the canvas down). The menu sits flush under the trigger's
// bottom edge, same width, with a 4px breathing gap. The menu's RT is
// anchored to the canvas's TOP-RIGHT corner so it tracks the trigger when
// the canvas is resized (the trigger row is anchored top, the trigger
// itself anchored to the row's right edge).
function buildDropdownPopupSlot(
  parentId: string,
  modalActiveFieldId: string,
  valueFieldId: string,
  triggerLabelContentId: string,
  options: string[],
  canvasW: number,
  canvasH: number,
  triggerRect: { left: number; bottom: number; right: number; top: number },
  optionFillColor: { r: number; g: number; b: number; a: number },
  optionLabelColor: { r: number; g: number; b: number; a: number },
): Record<string, unknown> {
  const optionH = 32;
  const optionGap = 2;
  const menuPadding = 6;
  const gapBelowTrigger = 4;
  const menuW = Math.max(120, triggerRect.right - triggerRect.left);
  const menuContentH = options.length * optionH + Math.max(0, options.length - 1) * optionGap;
  const menuH = menuContentH + menuPadding * 2;

  // Menu rect in canvas Y-up coords, sitting directly under the trigger.
  const menuLeft   = triggerRect.left;
  const menuRight  = triggerRect.left + menuW;
  const menuTop    = triggerRect.bottom - gapBelowTrigger;
  const menuBottom = menuTop - menuH;

  // Build one option button slot. Each carries the same three action
  // components subscribing to its own Button.Pressed: value set + label
  // copy + close. Options are anchored to the MENU's top edge so they
  // stack top-to-bottom in the rendered order.
  const optionSlots: Array<Record<string, unknown>> = [];
  for (let i = 0; i < options.length; i++) {
    const label = options[i] ?? `Option ${i + 1}`;
    const yTop = menuPadding + i * (optionH + optionGap);
    const optionRt = compRectTransform({
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: menuPadding, y: -(yTop + optionH) },
      offsetMax: { x: -menuPadding, y: -yTop },
      pivot: { x: 0.5, y: 0.5 },
    });
    // Pill-shaped option buttons match the trigger button's pill shape — the
    // dropdown opens "as more of the same trigger", which reads better than
    // square tiles inside a rounded menu container.
    const optionImg = compImage({
      tint: optionFillColor,
      preserveAspect: false, spriteUrl: "",
      cornerRadius: 100,
    });
    // Hover/press deltas around the base optionFillColor (clamped to [0,1]).
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const optionBtn = compButton({
      normalColor:    optionFillColor,
      highlightColor: { r: clamp01(optionFillColor.r + 0.08), g: clamp01(optionFillColor.g + 0.08), b: clamp01(optionFillColor.b + 0.08), a: 1 },
      pressColor:     { r: optionFillColor.r * 0.7, g: optionFillColor.g * 0.7, b: optionFillColor.b * 0.7, a: 1 },
      disabledColor:  { r: 0.30, g: 0.30, b: 0.30, a: 1 },
      hoverVibrate: false,
    });
    const setInt = compButtonValueSetInt(valueFieldId, i);
    const setStr = compButtonValueSetString(triggerLabelContentId, label);
    const closeToggle = compButtonToggle(modalActiveFieldId);

    // Centered label child.
    const optLabelSlotId = nextId();
    const optLabelCompId = nextId();
    const optLabelRt = compRectTransform({
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    });
    const optLabelText = compText({
      content: label, size: 16,
      color: optionLabelColor,
      horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
    });
    const optLabelSlot = {
      ID: optLabelSlotId,
      Components: { ID: optLabelCompId, Data: [
        { Type: typeIndex("RectTransform"), Data: optLabelRt },
        { Type: typeIndex("Text"),          Data: optLabelText },
      ]},
      Name: { ID: nextId(), Data: "Label" },
      Tag: { ID: nextId(), Data: null },
      Active: { ID: nextId(), Data: true },
      "Persistent-ID": nextId(),
      Position: { ID: nextId(), Data: vec3(0, 0, 0) },
      Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
      Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
      OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
      ParentReference: null as string | null,
      Children: [] as unknown[],
    };

    const optionSlotId = nextId();
    const optionCompId = nextId();
    const optionSlot = {
      ID: optionSlotId,
      Components: { ID: optionCompId, Data: [
        { Type: typeIndex("RectTransform"),      Data: optionRt },
        { Type: typeIndex("Image"),              Data: optionImg },
        { Type: typeIndex("Button"),             Data: optionBtn },
        { Type: typeIndex("ButtonValueSetInt"),    Data: setInt },
        { Type: typeIndex("ButtonValueSetString"), Data: setStr },
        { Type: typeIndex("ButtonToggle"),         Data: closeToggle },
      ]},
      Name: { ID: nextId(), Data: `Option ${i + 1}` },
      Tag: { ID: nextId(), Data: null },
      Active: { ID: nextId(), Data: true },
      "Persistent-ID": nextId(),
      Position: { ID: nextId(), Data: vec3(0, 0, 0) },
      Rotation: { ID: nextId(), Data: vec4(0, 0, 0, 1) },
      Scale: { ID: nextId(), Data: vec3(1, 1, 1) },
      OrderOffset: { ID: nextId(), Data: Long.fromNumber(0) },
      ParentReference: null as string | null,
      Children: [optLabelSlot] as unknown[],
    };
    (optLabelSlot as { ParentReference: string | null }).ParentReference = optionSlotId;
    optionSlots.push(optionSlot);
  }

  // The menu IS the modal root. RT anchored to canvas top-right so its
  // pixel position tracks the trigger when the canvas is resized (the row
  // is anchored top; the trigger anchored to row-right).
  const modalSlotId = nextId();
  const modalCompId = nextId();
  const modalRt = compRectTransform({
    anchorMin: { x: 1, y: 1 }, anchorMax: { x: 1, y: 1 },
    offsetMin: { x: menuLeft  - canvasW, y: menuBottom - canvasH },
    offsetMax: { x: menuRight - canvasW, y: menuTop    - canvasH },
    pivot: { x: 0.5, y: 0.5 },
  });
  // Menu container takes the panel BACKGROUND tone so it visually blends
  // with the panel and the pill-shaped option buttons stand out as the
  // interactive layer on top. Falls back to the old hardcoded dark grey
  // for pre-theme save files.
  const modalContainerTint =
    _exportTheme?.background ?? { r: 0.12, g: 0.12, b: 0.12, a: 1 };
  const savedMenuRect = _currentImageRect;
  _currentImageRect = { w: Math.abs(menuRight - menuLeft), h: Math.abs(menuTop - menuBottom) };
  const menuExtrasAt = _pendingImageExtras.length;
  const modalImg = compImage({
    tint: modalContainerTint,
    preserveAspect: false, spriteUrl: "",
    cornerRadius: 12,
  });
  const menuExtras = _pendingImageExtras.splice(menuExtrasAt);
  _currentImageRect = savedMenuRect;
  const modal = {
    ID: modalSlotId,
    Components: { ID: modalCompId, Data: [
      { Type: typeIndex("RectTransform"), Data: modalRt },
      { Type: typeIndex("Image"),         Data: modalImg },
      ...menuExtras,
    ]},
    Name:           { ID: nextId(), Data: "Dropdown Menu" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: modalActiveFieldId, Data: false },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: optionSlots as unknown[],
  };
  for (const opt of optionSlots) (opt as { ParentReference: string | null }).ParentReference = modalSlotId;
  return modal;
}

// ── Stack-layout lowering (Canvas.stackLayout) ───────────────────────────────
// When the panel is in "stack" mode, non-structural top-level elements are
// lowered into a real layout hierarchy so editing a slot's OrderOffset in
// Resonite physically reorders them. Mirrors the (VR-confirmed) ScrollArea
// Content pattern: one "Content" slot fills the canvas and carries a
// VerticalLayout; horizontally-adjacent elements are grouped into
// HorizontalLayout "Row" slots so side-by-side placement survives. Structural
// chrome (Background/Back Cover/Front Backing) and the popup/dropdown overlay
// containers stay absolute, outside the flow.

type FlowItem = {
  ser: Record<string, unknown>;
  size: { w: number; h: number };
  rect: { left: number; bottom: number; right: number; top: number } | null;
  // True when the source slot's horizontal anchors are collapsed to a single
  // point (anchorMin.x === anchorMax.x) — the signal that the user deliberately
  // positioned it horizontally (snap nudge or Align-in-parent), as opposed to a
  // stretch-anchored (0→1) full-width control. Only pinned items get wrapped in
  // a layout-free Row so their x/width survive the VerticalLayout.
  pinnedX: boolean;
};

// Set (or replace) the LayoutElement sizing hint on an already-serialized child
// so the parent layout reproduces the size it had under absolute positioning.
function setLayoutElementSize(
  serChild: Record<string, unknown>,
  size: { preferredWidth?: number; preferredHeight?: number },
): void {
  const leIdx = typeIndex("LayoutElement").value;
  const comps = (serChild.Components as {
    Data: Array<{ Type: Int32; Data: Record<string, { Data: unknown }> }>;
  }).Data;
  const w = size.preferredWidth;
  const h = size.preferredHeight;
  const existing = comps.find((c) => c.Type.value === leIdx);
  if (existing) {
    if (w != null) { existing.Data.PreferredWidth.Data = w; existing.Data.MinWidth.Data = w; }
    if (h != null) { existing.Data.PreferredHeight.Data = h; existing.Data.MinHeight.Data = h; }
    return;
  }
  comps.push({
    Type: typeIndex("LayoutElement"),
    Data: compLayoutElement({
      minWidth: w ?? -1, preferredWidth: w ?? -1, flexibleWidth: -1,
      minHeight: h ?? -1, preferredHeight: h ?? -1, flexibleHeight: -1,
      priority: 1,
    }) as Record<string, { Data: unknown }>,
  });
}

// Center a serialized VerticalLayout container's children. Used on a snap "Column"
// member of a side-by-side Row: the Row's HorizontalLayout has ForceExpandHeight=true
// (required — Resonite collapses a raw Image's height when it's false), so a short
// column gets stretched to the full row height. Without this its VerticalLayout
// (align Top) would bunch the controls at the top while the tall Image sibling fills
// the row; the editor centers them. No-op for non-VerticalLayout members.
function centerVerticalLayout(serChild: Record<string, unknown>): void {
  const vlIdx = typeIndex("VerticalLayout").value;
  const comps = (serChild.Components as {
    Data: Array<{ Type: Int32; Data: Record<string, { Data: unknown }> }>;
  }).Data;
  const vl = comps.find((c) => c.Type.value === vlIdx);
  const field = vl?.Data?.VerticalAlign;
  if (field) field.Data = "Middle";
}

// Centered, aspect-locked glyph child for an Image Placeholder. The parent Image
// is the hatch background (PreserveAspect=false, fills the rect); this child holds
// the "image" icon as a square sprite with PreserveAspect=true so it never
// distorts regardless of the parent's shape. Anchored to a centered fraction box
// so it scales with the placeholder.
function buildPlaceholderIconSlot(parentId: string): Record<string, unknown> {
  const slotId = nextId();
  const compListId = nextId();
  const rt = compRectTransform({
    anchorMin: { x: 0.34, y: 0.34 }, anchorMax: { x: 0.66, y: 0.66 },
    offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 }, pivot: { x: 0.5, y: 0.5 },
  });
  const img = compImage({ useImageIcon: true, tint: { r: 1, g: 1, b: 1, a: 1 }, preserveAspect: true, spriteUrl: "" });
  return {
    ID: slotId,
    Components: { ID: compListId, Data: [
      { Type: typeIndex("RectTransform"), Data: rt },
      { Type: typeIndex("Image"),         Data: img },
    ] },
    Name:           { ID: nextId(), Data: "Placeholder Icon" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: parentId,
    Children: [],
  };
}

// Rewrite an already-serialized child's RectTransform so it sits at `left` (px
// from the row's left edge) with the given `width`, filling the row vertically.
// Used when a horizontally-positioned (nudged / narrow) element is wrapped in a
// layout-free Row slot, so the element's own x/width survive the VerticalLayout
// (whose ForceExpandWidth would otherwise stretch a direct child to full width).
function placeChildInRow(serChild: Record<string, unknown>, left: number, width: number): void {
  const rtIdx = typeIndex("RectTransform").value;
  const comps = (serChild.Components as {
    Data: Array<{ Type: Int32; Data: Record<string, { Data: unknown }> }>;
  }).Data;
  const rt = comps.find((c) => c.Type.value === rtIdx);
  if (!rt) return;
  rt.Data.AnchorMin.Data = [0, 0];
  rt.Data.AnchorMax.Data = [0, 1];
  rt.Data.OffsetMin.Data = [left, 0];
  rt.Data.OffsetMax.Data = [left + width, 0];
}

// Cluster flow items into rows by vertical overlap (>50% of the shorter item),
// rows ordered top→bottom, members left→right — the same rule snapFlow uses.
function groupExportRows(items: FlowItem[]): FlowItem[][] {
  const withRect = items.filter((it) => it.rect);
  const noRect = items.filter((it) => !it.rect);
  if (withRect.length === 0) return noRect.map((it) => [it]);
  const sorted = [...withRect].sort(
    (a, b) => (b.rect!.top - a.rect!.top) || (a.rect!.left - b.rect!.left),
  );
  const rows: FlowItem[][] = [];
  let cur: FlowItem[] = [sorted[0]];
  let band = { top: sorted[0].rect!.top, bottom: sorted[0].rect!.bottom };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i].rect!;
    const ov = Math.min(r.top, band.top) - Math.max(r.bottom, band.bottom);
    const minH = Math.min(r.top - r.bottom, band.top - band.bottom);
    if (ov > 0.5 * Math.max(1, minH)) {
      cur.push(sorted[i]);
      band = { top: Math.max(band.top, r.top), bottom: Math.min(band.bottom, r.bottom) };
    } else {
      rows.push(cur);
      cur = [sorted[i]];
      band = { top: r.top, bottom: r.bottom };
    }
  }
  rows.push(cur);
  for (const row of rows) row.sort((a, b) => (a.rect!.left - b.rect!.left));
  for (const it of noRect) rows.push([it]); // un-placeable items → own rows at end
  return rows;
}

// Restructure the canvas's serialized children into [structural…, Content stack].
// `serChildren` is 1:1 (by index, in order) with canvasSlot.children.
function buildCanvasStack(
  canvasSlot: Slot,
  serChildren: Record<string, unknown>[],
  canvasId: string,
  canvasW: number,
  canvasH: number,
): Record<string, unknown>[] {
  const src = canvasSlot.children;
  const structural: Record<string, unknown>[] = [];
  // Edge-pinned rows kept ABSOLUTE (direct canvas children at their authored
  // RectTransform), NOT lowered into the stack: a full-width top bar (header)
  // stays edge-to-edge, and a bottom-anchored bar (buttons) stays pinned to the
  // bottom. Everything else flows in the VerticalLayout. This keeps the export
  // matching the editor: body rows get their authored side margins (the header
  // no longer collapses padLeft to 0), and the bottom bar doesn't leave a gap
  // beneath it.
  const pinned: Record<string, unknown>[] = [];
  let bottomReserve = 0; // canvas px of bottom space occupied by bottom-pinned bars
  const flow: FlowItem[] = [];
  for (let i = 0; i < src.length; i++) {
    const ser = serChildren[i];
    if (!ser) continue;
    if (isStructuralSlot(src[i])) { structural.push(ser); continue; }
    const size = _slotRectSizes.get(src[i].id) ?? { w: canvasW, h: 40 };
    const rect = computeCanvasRelativeRectFor(canvasSlot, src[i].id);
    const rt = src[i].components.find((c) => c.type === "RectTransform")?.props as
      | { anchorMin?: { x: number; y: number }; anchorMax?: { x: number; y: number };
          offsetMin?: { x: number }; offsetMax?: { x: number } }
      | undefined;
    const aMinX = rt?.anchorMin?.x ?? 0;
    const aMaxX = rt?.anchorMax?.x ?? 1;
    const aMinY = rt?.anchorMin?.y ?? 0;
    const aMaxY = rt?.anchorMax?.y ?? 1;
    const oMinX = rt?.offsetMin?.x ?? 0;
    const oMaxX = rt?.offsetMax?.x ?? 0;
    // Bottom-anchored bar (e.g. bottomRT buttons): both Y anchors ≈ 0.
    const isBottomPinned = aMinY < 0.01 && aMaxY < 0.01;
    // Full-width top bar (e.g. the header): X stretch 0→1 with ~0 side offsets,
    // top-anchored. Stays full-bleed instead of being inset by the content pad.
    const isFullBleedTop =
      aMaxY > 0.99 && aMinY > 0.99 &&
      aMinX < 0.01 && aMaxX > 0.99 && Math.abs(oMinX) < 1 && Math.abs(oMaxX) < 1;
    if (isBottomPinned || isFullBleedTop) {
      pinned.push(ser); // keep authored RT + ParentReference=canvasId
      if (isBottomPinned && rect) bottomReserve = Math.max(bottomReserve, Math.round(rect.top));
      continue;
    }
    const pinnedX = Math.abs(aMinX - aMaxX) < 0.001;
    flow.push({ ser, size, rect, pinnedX });
  }
  // Nothing to stack — everything is structural/pinned; leave order as authored.
  if (flow.length === 0) return serChildren;

  const rows = groupExportRows(flow);

  // Derive padding + uniform spacing from the authored positions (canvas Y-up px)
  // so the stack lands where the user designed it.
  const allRects = flow.map((f) => f.rect).filter(Boolean) as Array<{
    left: number; bottom: number; right: number; top: number;
  }>;
  let padTop = 0, padLeft = 0, padRight = 0, spacing = 8;
  if (allRects.length > 0) {
    padTop = Math.max(0, Math.round(canvasH - Math.max(...allRects.map((r) => r.top))));
    padLeft = Math.max(0, Math.round(Math.min(...allRects.map((r) => r.left))));
    padRight = Math.max(0, Math.round(canvasW - Math.max(...allRects.map((r) => r.right))));
    if (rows.length >= 2) {
      const rowTop = (row: FlowItem[]) => Math.max(...row.map((it) => it.rect ? it.rect.top : -Infinity));
      const rowBottom = (row: FlowItem[]) => Math.min(...row.map((it) => it.rect ? it.rect.bottom : Infinity));
      const gap = rowBottom(rows[0]) - rowTop(rows[1]);
      if (isFinite(gap) && gap > 0) spacing = Math.round(gap);
    }
  }

  const contentSlotId = nextId();
  const contentCompId = nextId();
  const contentRt = compRectTransform({
    anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
    // Reserve the bottom-pinned bar's height so the flow stack stops above it
    // (no overlap, and any slack sits above the bottom bar — not below it).
    offsetMin: { x: padLeft, y: bottomReserve }, offsetMax: { x: -padRight, y: -padTop },
    pivot: { x: 0.5, y: 0.5 },
  });
  const vLayout = compVerticalLayout({
    spacing, paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
    horizontalAlign: "Left", verticalAlign: "Top",
    forceExpandWidth: true, forceExpandHeight: false,
  });

  const contentW = Math.max(1, canvasW - padLeft - padRight);

  const stackChildren: Record<string, unknown>[] = rows.map((row) => {
    if (row.length === 1) {
      const it = row[0];
      const elemW = it.rect ? Math.round(it.rect.right - it.rect.left) : it.size.w;
      // Height from the actual rect too (see memberW/memberH in the multi-item
      // branch): a vertically-resized element's intrinsic size.h is stale.
      const elemH = it.rect ? Math.round(it.rect.top - it.rect.bottom) : it.size.h;
      // Deliberately positioned horizontally (point-anchored: snap nudge or
      // Align-in-parent) → wrap in a full-width, layout-free Row slot so the
      // element keeps its own x/width. Stretch-anchored full-width controls stay
      // direct children (the VerticalLayout force-expands them to fill — exactly
      // what they want — with minimal hierarchy).
      if (it.rect && it.pinnedX && elemW < contentW - 2) {
        const left = Math.max(0, Math.min(Math.round(it.rect.left - padLeft), contentW - elemW));
        placeChildInRow(it.ser, left, elemW);
        const rowSlotId = nextId();
        const rowCompId = nextId();
        (it.ser as { ParentReference: string | null }).ParentReference = rowSlotId;
        return {
          ID: rowSlotId,
          Components: { ID: rowCompId, Data: [
            { Type: typeIndex("RectTransform"), Data: compRectTransform({
                anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
                offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 }, pivot: { x: 0.5, y: 0.5 },
              }) },
            { Type: typeIndex("LayoutElement"), Data: compLayoutElement({ minHeight: elemH, preferredHeight: elemH, priority: 1 }) },
          ] },
          Name:           { ID: nextId(), Data: "Row" },
          Tag:            { ID: nextId(), Data: "uixstudio-row" },
          Active:         { ID: nextId(), Data: true },
          "Persistent-ID": nextId(),
          Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
          Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
          Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
          OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
          ParentReference: contentSlotId,
          Children: [it.ser],
        };
      }
      setLayoutElementSize(it.ser, { preferredHeight: elemH });
      (it.ser as { ParentReference: string | null }).ParentReference = contentSlotId;
      return it.ser;
    }
    // Multi-item row → HorizontalLayout wrapper. Order members left→right by their
    // on-canvas x so the in-game HorizontalLayout (which sorts by OrderOffset)
    // matches the editor's visual order regardless of canvas child-array order.
    row.sort((a, b) => (a.rect?.left ?? 0) - (b.rect?.left ?? 0));
    // Row height from each member's ACTUAL rect height (not intrinsic size.h),
    // for the same reason as memberW below — a vertically-resized element (e.g. a
    // tall Image) has a rect taller than its stale _slotRectSizes height, and
    // using the intrinsic value shipped the row (and the image) too short.
    const rowH = Math.max(...row.map((it) => it.rect ? Math.round(it.rect.top - it.rect.bottom) : it.size.h));
    const rowSlotId = nextId();
    const rowCompId = nextId();
    let rowSpacing = 8;
    if (row[0].rect && row[1].rect) {
      const g = row[1].rect.left - row[0].rect.right;
      if (g > 0) rowSpacing = Math.round(g);
    }
    const rowRt = compRectTransform({
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    });
    const hLayout = compHorizontalLayout({
      spacing: rowSpacing, paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
      horizontalAlign: "Left", verticalAlign: "Middle",
      // ForceExpandHeight=true is REQUIRED: Resonite collapses a raw Image's height
      // when it's false (it ignores the Image's min/preferred height in the cross
      // axis), so the tall Image would render short. With true, every member fills
      // the row height — the Image stays full — and a SHORT member (a snap Column of
      // a few controls) is kept centered via centerVerticalLayout() below so it
      // doesn't bunch at the top. Net: matches the editor, which centers side-by-side
      // members and shows the Image at full height.
      forceExpandWidth: false, forceExpandHeight: true,
    });
    const rowKids = row.map((it) => {
      // Use the element's ACTUAL on-canvas rect width (what the editor draws), NOT
      // its intrinsic/design size (_slotRectSizes). The two are equal for normal
      // elements, but the snap layout shrinks an element to fit beside a neighbour
      // (e.g. an Image squeezed next to a column) — feeding the intrinsic size then
      // made the member export wider than designed, so Resonite's HorizontalLayout
      // stretched it edge-to-edge and ate the designed side margin. The rect width
      // preserves the design size and leaves the leftover as a margin/gap.
      const memberW = it.rect ? Math.round(it.rect.right - it.rect.left) : it.size.w;
      const memberH = it.rect ? Math.round(it.rect.top - it.rect.bottom) : it.size.h;
      setLayoutElementSize(it.ser, { preferredWidth: memberW, preferredHeight: memberH });
      // If this member is a snap Column (VerticalLayout), center its children so they
      // don't bunch at the top once the row force-expands it to full height.
      centerVerticalLayout(it.ser);
      (it.ser as { ParentReference: string | null }).ParentReference = rowSlotId;
      return it.ser;
    });
    assignOrderOffsets(rowKids);
    return {
      ID: rowSlotId,
      Components: { ID: rowCompId, Data: [
        { Type: typeIndex("RectTransform"),    Data: rowRt },
        { Type: typeIndex("HorizontalLayout"), Data: hLayout },
        { Type: typeIndex("LayoutElement"),    Data: compLayoutElement({ minHeight: rowH, preferredHeight: rowH, priority: 1 }) },
      ] },
      Name:           { ID: nextId(), Data: "Row" },
      Tag:            { ID: nextId(), Data: "uixstudio-row" },
      Active:         { ID: nextId(), Data: true },
      "Persistent-ID": nextId(),
      Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
      Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
      Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
      OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
      ParentReference: contentSlotId,
      Children: rowKids,
    };
  });
  assignOrderOffsets(stackChildren);

  const contentSlot = {
    ID: contentSlotId,
    Components: { ID: contentCompId, Data: [
      { Type: typeIndex("RectTransform"),  Data: contentRt },
      { Type: typeIndex("VerticalLayout"), Data: vLayout },
    ] },
    Name:           { ID: nextId(), Data: "Content" },
    Tag:            { ID: nextId(), Data: "uixstudio-stack" },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: canvasId,
    Children: stackChildren,
  };

  return [...structural, ...pinned, contentSlot];
}

function buildRootWrapper(canvasSlot: Slot): Record<string, unknown> {
  const rootId = nextId();
  const compListId = nextId();
  // PopupContent cards are direct Canvas children but must NOT render inline —
  // they're lowered into the Active=false modal sub-tree below. Strip them from
  // the serialized canvas (and from the stack-lowering that indexes against it);
  // the ORIGINAL canvasSlot is kept for resolving each popup's content card.
  const canvasForSer: Slot = {
    ...canvasSlot,
    children: canvasSlot.children.filter((c) => !c.components.some((k) => k.type === "PopupContent")),
  };
  const canvasChild = serializeSlot(canvasForSer, rootId);
  // Hoist shared canvas refs used by both overlay sections below.
  let canvasChildren = (canvasChild as { Children: Record<string, unknown>[] }).Children;
  const canvasId = (canvasChild as { ID: string }).ID;
  const canvasRect = _slotRectSizes.get(canvasSlot.id) ?? { w: 800, h: 600 };

  // Stack-layout lowering (Canvas.stackLayout, default true): reparent the
  // non-structural top-level children into a VerticalLayout-driven Content slot
  // so in-game reordering moves them. Must run BEFORE the overlay pushes below
  // so the popup/dropdown containers append after the stack (and stay on top).
  const stackCanvasComp = canvasSlot.components.find((c) => c.type === "Canvas");
  const stackLayoutOn = (stackCanvasComp?.props as { stackLayout?: boolean } | undefined)?.stackLayout !== false;
  if (stackLayoutOn) {
    const lowered = buildCanvasStack(canvasForSer, canvasChildren, canvasId, canvasRect.w, canvasRect.h);
    (canvasChild as { Children: Record<string, unknown>[] }).Children = lowered;
    canvasChildren = lowered;
  }

  // Popup modals — grouped into a named "Popup Dialogues" container that sits
  // last in the canvas children so modals always render above user content.
  // References are ID-based so reparenting doesn't break toggle wiring.
  if (_popupActiveIds.size > 0) {
    const containerSlotId = nextId();
    const containerCompId = nextId();
    const popupModals: unknown[] = [];
    for (const [hostSlotId, modalActiveId] of _popupActiveIds) {
      const hostProps = findPopupPropsForSlotId(canvasSlot, hostSlotId) ?? {};
      // Editable path: an authored PopupContent card lowers its real children
      // into the modal. Legacy path: synthesize the card from title/body/dismiss
      // (byte-identical to the pre-editable exporter).
      const contentSlot = findPopupContentSlot(canvasSlot, hostSlotId);
      const modal = contentSlot
        ? buildPopupModalSlotFromContent(containerSlotId, modalActiveId, contentSlot)
        : buildPopupModalSlot(containerSlotId, modalActiveId, hostProps, canvasRect.w, canvasRect.h);
      const popupTitle = (hostProps.title as string | undefined ?? "").trim();
      (modal.Name as { ID: string; Data: string }).Data =
        popupTitle ? `${popupTitle} Popup Modal` : "Popup Modal";
      popupModals.push(modal);
    }
    const containerRt = compRectTransform({
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    });
    canvasChildren.push({
      ID: containerSlotId,
      Components: { ID: containerCompId, Data: [{ Type: typeIndex("RectTransform"), Data: containerRt }] },
      Name:           { ID: nextId(), Data: "Popup Dialogues" },
      Tag:            { ID: nextId(), Data: null },
      Active:         { ID: nextId(), Data: true },
      "Persistent-ID": nextId(),
      Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
      Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
      Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
      OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
      ParentReference: canvasId,
      Children: popupModals,
    });
  }

  // Dropdown modals — same container pattern, separate "Dropdown Menus" group.
  // Each modal is named from its host slot so the hierarchy is self-documenting.
  if (_dropdownActiveIds.size > 0) {
    const containerSlotId = nextId();
    const containerCompId = nextId();
    const dropdownModals: unknown[] = [];
    for (const [hostSlotId, modalActiveId] of _dropdownActiveIds) {
      const valueFieldId = _dropdownValueFieldIds.get(hostSlotId);
      const textContentId = _dropdownTextContentIds.get(hostSlotId);
      if (!valueFieldId || !textContentId) continue;
      const dropdownProps = findDropdownPropsForSlotId(canvasSlot, hostSlotId);
      if (!dropdownProps) continue;
      const optionsRaw = (dropdownProps.options as string) ?? "";
      const options = optionsRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (options.length === 0) continue;
      // Theme-first: popup option pills match the trigger pill (which now
      // uses controlSurface), so the spawn-window reads as the same surface
      // tier as every other input control across themes. Falls back to the
      // saved optionFillColor only when no theme is present.
      const optionFillColor = _exportTheme?.controlSurface
        ?? (dropdownProps.optionFillColor as { r: number; g: number; b: number; a: number })
        ?? { r: 0.14, g: 0.16, b: 0.20, a: 1 };
      const optionLabelColor = (dropdownProps.optionLabelColor as { r: number; g: number; b: number; a: number })
        ?? { r: 0.95, g: 0.95, b: 0.95, a: 1 };
      // Compute the trigger's canvas-relative rect so the menu can be placed
      // directly below it. Falls back to a top-left default if the slot
      // can't be located (shouldn't happen — the trigger is in the tree).
      const triggerRect = computeCanvasRelativeRectFor(canvasSlot, hostSlotId)
        ?? { left: 16, bottom: canvasRect.h - 64, right: 216, top: canvasRect.h - 32 };
      const modal = buildDropdownPopupSlot(
        containerSlotId,
        modalActiveId,
        valueFieldId,
        textContentId,
        options,
        canvasRect.w,
        canvasRect.h,
        triggerRect,
        optionFillColor,
        optionLabelColor,
      );
      const hostName = (findSlotNameById(canvasSlot, hostSlotId) ?? "").trim();
      (modal.Name as { ID: string; Data: string }).Data =
        hostName ? `${hostName} Dropdown Menu` : "Dropdown Menu";
      dropdownModals.push(modal);
    }
    const containerRt = compRectTransform({
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    });
    canvasChildren.push({
      ID: containerSlotId,
      Components: { ID: containerCompId, Data: [{ Type: typeIndex("RectTransform"), Data: containerRt }] },
      Name:           { ID: nextId(), Data: "Dropdown Menus" },
      Tag:            { ID: nextId(), Data: null },
      Active:         { ID: nextId(), Data: true },
      "Persistent-ID": nextId(),
      Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
      Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
      Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
      OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
      ParentReference: canvasId,
      Children: dropdownModals,
    });
  }
  // serializeSlot already numbered the canvas's user children 1..N; the popup /
  // dropdown overlay containers were pushed afterward, so renumber the full
  // array to give those containers the highest OrderOffsets — keeping modals
  // sorted last (rendered on top of user content), as before.
  assignOrderOffsets(canvasChildren);
  // Compute the panel's real-world dimensions so the credits banner can pin
  // itself to the actual bottom-left corner no matter what canvas size the
  // user picked. Canvas slot's Scale defaults to 0.001 (1 px → 1 mm world);
  // `Size = [sizeX, sizeY]` × scale gives the world width/height in meters.
  const canvasComp = canvasSlot.components.find((c) => c.type === "Canvas");
  const canvasProps = (canvasComp?.props ?? {}) as { sizeX?: number; sizeY?: number };
  const canvasScale = canvasSlot.scale?.x ?? 0.001;
  const panelWorldWidth  = ((canvasProps.sizeX as number) ?? 800) * canvasScale;
  const panelWorldHeight = ((canvasProps.sizeY as number) ?? 600) * canvasScale;
  const logoChild = _backLogoMatId
    ? buildCreditsSlot(rootId, panelWorldWidth, panelWorldHeight)
    : null;
  return {
    ID: rootId,
    Components: {
      ID: compListId,
      Data: [
        { Type: typeIndex("Grabbable"), Data: compGrabbable() },
      ],
    },
    Name:           { ID: nextId(), Data: "UIX Panel" },
    Tag:            { ID: nextId(), Data: null },
    Active:         { ID: nextId(), Data: true },
    "Persistent-ID": nextId(),
    Position:       { ID: nextId(), Data: vec3(0, 0, 0) },
    Rotation:       { ID: nextId(), Data: vec4(0, 0, 0, 1) },
    Scale:          { ID: nextId(), Data: vec3(1, 1, 1) },
    OrderOffset:    { ID: nextId(), Data: Long.fromNumber(0) },
    ParentReference: null,
    Children: (() => {
      const rootChildren = logoChild ? [canvasChild, logoChild] : [canvasChild];
      assignOrderOffsets(rootChildren);
      return rootChildren;
    })(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportBrsonFile(
  doc: UixDocument,
  opts?: { creditsBackdropTexHash?: string },
): Promise<Blob> {
  resetIds();
  resetTypes();
  _txtMatId = "";
  _backTxtMatId = "";
  _fontTxtMatId = "";
  _fontChainId = "";
  _backMatId = "";
  _frontBackingMatId = "";
  _frontFacingMatId = "";
  _textureId = "";
  _logoTextureId = "";
  _logoSpriteId = "";
  _backLogoMatId = "";
  _badgeLogoMatId = "";
  _creditsTextMatId = "";
  _backLogoHyperlinkUrl = "";
  _backLogoHyperlinkReason = "";
  _helpTexId      = ""; _helpSpriteId      = "";
  _closeTexId     = ""; _closeSpriteId     = "";
  _checkTexId     = ""; _checkSpriteId     = "";
  _backspaceTexId = ""; _backspaceSpriteId = "";
  _pillTexId      = ""; _pillSpriteId      = "";
  _openArrowTexId = ""; _openArrowSpriteId = "";
  _clearIconTexId = ""; _clearIconSpriteId = "";
  _imagePlaceholderTexId = ""; _imagePlaceholderSpriteId = "";
  _imageIconTexId = ""; _imageIconSpriteId = "";
  _circleSegmentMatId = "";
  _keypadDisplayContentId = "";
  _keypadDisplayChildPending = false;
  _pendingImageExtras = [];
  _customTexIds = new Map();
  _customSpriteIds = new Map();
  _creditsBackdropMatId = "";
  _creditsBackdropTexHash = opts?.creditsBackdropTexHash ?? "";
  // Does the back face carry a custom image? Drives the readability scrim
  // behind the credits banner (built in buildSharedAssets / buildCreditsBanner).
  _backHasCustomImage = (() => {
    const { backCover } = findBackgroundSlots(doc.root);
    const hash = (backCover?.components.find((c) => c.type === "Image")?.props as { customImageHash?: string } | undefined)?.customImageHash;
    return typeof hash === "string" && hash.length > 0;
  })();
  _radioGroupFieldIds = new Map();
  _popupActiveIds = new Map();
  _dropdownActiveIds = new Map();
  _tabPageActiveIds = new Map();
  _tabPageInfo = new Map();
  _tabButtonInfo = new Map();
  _tabsSharedFieldByHost = new Map();
  _exportTheme = doc.theme ?? null;
  _canvasContentPadding = (() => {
    const cc = doc.root.components.find((c) => c.type === "Canvas");
    const v = (cc?.props as { contentPadding?: number } | undefined)?.contentPadding;
    return typeof v === "number" ? v : DEFAULT_CONTENT_PADDING;
  })();
  _dropdownValueFieldIds = new Map();
  _dropdownTextContentIds = new Map();
  _valueVarNames = new Set();
  _valueWrapperOf = new Map();
  _valueWrapperLabel = new Map();
  _pendingValueSlots = new Map();
  computeSlotRectSizes(doc.root);
  // Panel corner FixedSize for `matchPanelCorners` Images (see decl). Mirrors the
  // intermediate-cornerRadius lowering in compImage: FixedSize = (cr/100)·min/2,
  // derived from the Front Backing's cornerRadius and the canvas dimensions.
  _panelCornerFixedSizePx = (() => {
    const { frontBacking } = findBackgroundSlots(doc.root);
    const cr = (frontBacking?.components.find((c) => c.type === "Image")?.props as { cornerRadius?: number } | undefined)?.cornerRadius;
    if (typeof cr !== "number" || cr <= 0) return 0;
    const cc = doc.root.components.find((c) => c.type === "Canvas");
    const cw = (cc?.props as { sizeX?: number } | undefined)?.sizeX ?? 800;
    const ch = (cc?.props as { sizeY?: number } | undefined)?.sizeY ?? 600;
    return (Math.min(100, cr) / 100) * (Math.min(cw, ch) / 2);
  })();
  computeValueSlotWrappers(doc.root);

  // Pre-allocate one Active-field UUID per Popup-bearing slot. These IDs
  // need to be visible to *both* the trigger button (which gets a
  // ButtonToggle targeting the modal's Active) and the modal slot itself
  // (whose Active field uses this exact UUID) — and the trigger button
  // serializes long before we build the modal. Allocating up front via
  // nextId() keeps every UUID unique and stable.
  (function allocatePopupIds(slot: import("../model/types").Slot) {
    if (slot.components.some((c) => c.type === "Popup")) {
      _popupActiveIds.set(slot.id, nextId());
    }
    for (const child of slot.children) allocatePopupIds(child);
  })(doc.root);

  // Same pattern for Dropdown triggers — pre-allocate the modal's Active
  // field UUID so the trigger's ButtonToggle can target it before the modal
  // itself is built later inside buildRootWrapper.
  (function allocateDropdownIds(slot: import("../model/types").Slot) {
    if (slot.components.some((c) => c.type === "Dropdown")) {
      _dropdownActiveIds.set(slot.id, nextId());
    }
    for (const child of slot.children) allocateDropdownIds(child);
  })(doc.root);

  // Tabs: pre-allocate each page slot's Active field UUID and record the
  // positional index ↔ slot mapping for both pages and buttons, so the host's
  // page-Active drivers (built when the host serializes, before its pages) and
  // each button's ButtonValueSet index line up. Buttons live under the host's
  // "Tab Bar" child; pages are the host's TabPage children — both in array
  // order. The shared ValueField id itself is allocated when the host
  // serializes (compValueFieldInt) and stashed in _tabsSharedFieldByHost.
  (function allocateTabsIds(slot: import("../model/types").Slot) {
    const tabsComp = slot.components.find((c) => c.type === "Tabs");
    if (tabsComp) {
      const tp = tabsComp.props as Record<string, unknown>;
      const activeColor = (tp.activeColor as TabRGBA) ?? { r: 0.18, g: 0.36, b: 0.60, a: 1 };
      const inactiveColor = (tp.inactiveColor as TabRGBA) ?? { r: 0.14, g: 0.16, b: 0.20, a: 1 };
      const pages = slot.children.filter((ch) => ch.components.some((c) => c.type === "TabPage"));
      // Clamp to a valid page index — must match buildTabsHostComponents so the
      // initially-Active page and the seeded shared field agree.
      const activeTab = Math.max(0, Math.min(Math.max(0, pages.length - 1), ((tp.activeTab as number) ?? 0) | 0));
      pages.forEach((p, i) => {
        _tabPageActiveIds.set(p.id, nextId());
        _tabPageInfo.set(p.id, { index: i, active: i === activeTab });
      });
      // The bar is the host child whose own children are the TabButtons.
      const bar = slot.children.find((ch) => ch.children.some((g) => g.components.some((c) => c.type === "TabButton")));
      const buttons = bar ? bar.children.filter((g) => g.components.some((c) => c.type === "TabButton")) : [];
      buttons.forEach((b, i) => {
        _tabButtonInfo.set(b.id, { hostId: slot.id, index: i, active: i === activeTab, activeColor, inactiveColor });
      });
    }
    for (const child of slot.children) allocateTabsIds(child);
  })(doc.root);

  // Pull canvas.rounded from the doc — controls whether the rounded-corner
  // sprite + StaticTexture2D + SpriteProvider get bundled & referenced.
  const canvasComp = doc.root.components.find((c) => c.type === "Canvas");
  const canvasProps = (canvasComp?.props ?? {}) as {
    rounded?: boolean;
    backLogoHyperlinkUrl?: string;
    backLogoHyperlinkReason?: string;
  };
  const rounded = canvasProps.rounded !== false;
  _backLogoHyperlinkUrl    = (canvasProps.backLogoHyperlinkUrl    ?? "").trim();
  _backLogoHyperlinkReason = (canvasProps.backLogoHyperlinkReason ?? "").trim();

  // Register outer types first for stable indices
  typeIndex("Grabbable");

  // Build shared material assets before the slot tree so their IDs are available
  // for compImage() and compText() references
  const customHashes = collectCustomImageHashes(doc.root);
  const backLogoHash = getCanvasBackLogoHash(doc.root);
  const sharedAssets = buildSharedAssets(rounded, customHashes, backLogoHash);

  const objectTree = buildRootWrapper(doc.root);

  const usedTypeVersions: Record<string, number> = {};
  for (const t of _typeRegistry) {
    if (TYPE_VERSIONS[t] !== undefined) usedTypeVersions[t] = TYPE_VERSIONS[t];
  }

  const doc_bson: Record<string, unknown> = {
    VersionNumber: "2026.5.20.291",
    FeatureFlags: {
      ColorManagement: new Int32(0),
      ResetGUID:       new Int32(0),
      ProtoFlux:       new Int32(0),
      TEXTURE_QUALITY: new Int32(0),
      TypeManagement:  new Int32(0),
      ALIGNER_FILTERING: new Int32(0),
      PhotonDust:      new Int32(0),
      Awwdio:          new Int32(0),
      NetCore:         new Int32(0),
      RESONITE_LINK:   new Int32(0),
    },
    Types: _typeRegistry,
    TypeVersions: Object.fromEntries(
      Object.entries(usedTypeVersions).map(([k, v]) => [k, new Int32(v)])
    ),
    Object: objectTree,
    Assets: sharedAssets,
  };

  const bsonBytes = serialize(doc_bson);
  const { compress } = await brotliReady;
  const compressed = compress(bsonBytes, { quality: 4 });

  const result = new Uint8Array(FRDT_HEADER.length + compressed.length);
  result.set(FRDT_HEADER, 0);
  result.set(compressed, FRDT_HEADER.length);

  return new Blob([result], { type: "application/octet-stream" });
}
