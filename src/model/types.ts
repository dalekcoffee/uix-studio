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
  // Editor-only layout aid: an empty, invisible row that reserves vertical
  // space. Exports as a plain empty slot (the marker itself is skipped).
  "Spacer",
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
