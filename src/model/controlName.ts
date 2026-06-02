import type { Slot } from "./types";
import { localizedControlType } from "../locale/modelText";
import { DEFAULT_LANG, type Lang } from "../locale/types";

// Labelled composite controls get a self-describing name "<label> <type>" (e.g.
// a "Slider" labelled "Volume" → "Volume Slider"), shown in the editor hierarchy
// and used as the exported slot name. Only these default-named composites
// qualify; if the user renamed the slot it's left alone, and rows / structural
// chrome / sub-parts are unaffected. Shared by the editor and the exporter so
// the two never drift.
export const LABELLED_CONTROL_TYPES = new Set<string>([
  "Checkbox", "Toggle", "Slider", "Progress Bar", "Text Field", "Float Field",
  "Integer Field", "Radio Group", "Dropdown", "Reference Field", "Color Picker",
]);

// Where a composite's label sits relative to its control.
export type LabelPosition = "left" | "top";

// Read a wrapper's label position; absent ≡ "left" (the classic layout, so every
// existing preset / saved panel keeps its exact geometry).
export function labelPositionOf(slot: Slot): LabelPosition {
  return slot.labelPosition === "top" ? "top" : "left";
}

// Composites whose control STRETCHES to the full wrapper width when the label is
// placed on top (wide, variable-content controls). Everything else (Checkbox,
// Toggle, Color Picker, Radio Group) keeps its natural width, left-aligned under
// the label — stretching a 28px checkbox to full width looks wrong.
export const STRETCHY_CONTROL_TYPES = new Set<string>([
  "Slider", "Progress Bar", "Text Field", "Float Field", "Integer Field",
  "Dropdown", "Reference Field",
]);

// The visible label of a composite control = the trimmed `content` of the Text
// in its direct "Label" child; "" if none.
export function controlLabelText(slot: Slot): string {
  const labelSlot = slot.children.find((c) => c.name === "Label");
  if (!labelSlot) return "";
  const txt = labelSlot.components.find((c) => c.type === "Text");
  const content = (txt?.props as { content?: unknown } | undefined)?.content;
  return typeof content === "string" ? content.trim() : "";
}

// Join a label and a type into one name without duplicated words:
//   "Volume"+"Slider"             → "Volume Slider"
//   "Float"+"Float Field"         → "Float Field"   (type already leads with label)
//   "Color Picker"+"Color Picker" → "Color Picker"
//   "Volume Slider"+"Slider"      → "Volume Slider" (label already ends with type)
export function combineControlName(label: string, type: string): string {
  const L = label.replace(/\s+/g, " ").trim();
  const T = type.trim();
  if (!L) return T;
  const lt = L.toLowerCase();
  const tt = T.toLowerCase();
  if (lt === tt) return T;
  if (tt.startsWith(lt + " ")) return T;
  if (lt.endsWith(" " + tt)) return L;
  return `${L} ${T}`;
}

// The display/export name for a slot: a default-named labelled composite becomes
// "<label> <type>"; everything else keeps its own name (so user renames win).
//
// `lang` localizes ONLY the type suffix and is for DISPLAY (hierarchy/inspector).
// The exporter calls this WITHOUT lang so exported slot names stay English/stable.
// The detection still keys off the English `slot.name`, so it's unaffected.
export function controlDisplayName(slot: Slot, lang: Lang = DEFAULT_LANG): string {
  if (!LABELLED_CONTROL_TYPES.has(slot.name)) return slot.name;
  return combineControlName(controlLabelText(slot), localizedControlType(slot.name, lang));
}
