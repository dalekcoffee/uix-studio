export const UIX_COMPONENT_TYPES = [
  "Canvas",
  "RectTransform",
  "Image",
  "Text",
  "TextField",
  "Button",
  "VerticalLayout",
  "HorizontalLayout",
  "GridLayout",
  "LayoutElement",
  "Mask",
  "IgnoreLayout",
  "BoxCollider",
  "Hyperlink",
  "Checkbox",
  "Toggle",
  "Knob",
  "Popup",
  // Marks the editable content container of a popup dialog (the card the user
  // arranges elements inside). Absolute-positioned (no layout component) so it
  // gets full side-by-side snap dragging. At export its children are lowered
  // into the Active=false modal sub-tree. PopupDismiss marks the child button
  // that closes the modal so the exporter can wire its Active-toggle.
  "PopupContent",
  "PopupDismiss",
  "Slider",
  "ProgressBar",
  "Radio",
  "RadioGroup",
  "Dropdown",
  "ColorPicker",
  "KeypadDisplay",
  "KeypadKey",
  "Close",
  "ReferenceField",
  "ScrollArea",
  // Tabs: a container that holds N labelled pages, exactly one visible at a
  // time. The marker sits on the host slot and carries the orientation + sizing
  // config. Its children are a "Tab Bar" (a Horizontal/Vertical layout of
  // TabButton slots) followed by N TabPage slots. At export the host gets a
  // shared ValueField<int> (the selected index); each TabButton writes its
  // positional index to it (ButtonValueSet<int>) and each TabPage's Active is
  // driven by a ValueEqualityDriver<int> comparing the shared field to the
  // page's positional index — so only the selected page renders (no Z-fighting,
  // same hide mechanism as popups). Index is POSITIONAL (array order), never
  // stored, so reordering tabs needs no field resync.
  "Tabs",
  // Marks a button slot inside a Tabs bar. Empty — its tab index is its
  // position among the Tab Bar's children.
  "TabButton",
  // Marks a page container slot inside a Tabs host. Empty — its index is its
  // position among the host's TabPage children. Absolute container (no layout
  // component) so its children get full side-by-side snap dragging, like
  // PopupContent.
  "TabPage",
  // Editor-only layout aid: an empty, invisible row that reserves vertical
  // space. Exports as a plain empty slot (the marker itself is skipped).
  "Spacer",
  // Audio waveform visualizer. At export the host slot becomes a
  // UIX.RectMesh<AudioSourceWaveformMesh> (a procedural mesh that draws the live
  // waveform of an audio source) plus a ReferenceCast that feeds the mesh's
  // Source from a dropped "Audio source" reference (wired by `audioLinkId` ↔ a
  // ReferenceField's matching id, via a ReferenceCopy in the "🔗 Links" pass).
  // Modeled on Resonite's AudioStreamController (UIX Template/AudioStreamController).
  "Waveform",
  // User profile card: an avatar (circular image placeholder) + a name label,
  // grouped on a rounded card. Editor-only marker (skipped at export — the Card
  // Image + Avatar Image + Name Text export as ordinary slots). `avatarPosition`
  // (left/above/right) re-lays the two children. Handy for member lists / credits.
  "UserProfile",
] as const;

export type UixComponentType = (typeof UIX_COMPONENT_TYPES)[number];

export interface UixComponent {
  type: UixComponentType;
  props: Record<string, unknown>;
}

export interface Slot {
  id: string;
  name: string;
  locked?: boolean;
  /**
   * Marks a full-canvas chrome layer (panel Background, Back Cover, Front
   * Backing). Structural slots don't receive clicks on the editor canvas and
   * are never auto-targeted when adding elements — they're edited from the
   * Hierarchy tree instead. See src/model/structural.ts. Survives renames,
   * unlike the legacy name-based detection.
   */
  structural?: boolean;
  components: UixComponent[];
  children: Slot[];
  /**
   * Optional canvas-local position offset. Defaults to [0, 0, 0]. Used sparingly —
   * e.g. pushing a Background slot slightly back in Z so it occludes foreground
   * when viewed from behind. At canvas scale 0.001, each unit ≈ 1mm in world space.
   */
  position?: { x: number; y: number; z: number };
  /**
   * Optional quaternion rotation. Defaults to [0, 0, 0, 1] (identity). Use
   * `[0, 1, 0, 0]` for a 180° flip around Y — needed so back-panel branding
   * actually faces the rear viewer (instead of showing as mirrored text).
   */
  rotation?: { x: number; y: number; z: number; w: number };
  /**
   * For a labelled composite control (Slider, Toggle, Text Field, …), where its
   * "Label" child sits relative to the control. `undefined` ≡ "left" (the label
   * hugs the control's left, the classic layout). "top" stacks the label above
   * the control. Only meaningful on the composite WRAPPER slot; ignored
   * everywhere else. The BSON exporter reads geometry only, so this never
   * serializes to Resonite — it just drives the editor's internal layout.
   */
  labelPosition?: "left" | "top";
  /**
   * Optional local scale. Defaults to [1, 1, 1] for non-canvas slots and
   * [0.001, 0.001, 0.001] for the canvas slot. Useful values:
   *   - `scale.x = -1` mirrors the slot's content horizontally. Combined
   *     with a Sidedness=Back material (which itself X-mirrors back-face
   *     pixels), this yields un-mirrored visible content from the rear.
   */
  scale?: { x: number; y: number; z: number };
}

export interface UixDocument {
  schemaVersion: 1;
  appVersion: string;
  root: Slot;
  theme?: import("./theme").Theme;
}
