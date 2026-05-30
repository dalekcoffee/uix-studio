import type { Slot } from "./types";

// "Structural" slots are full-canvas filler layers — the panel Background, the
// rear-facing Back Cover, and the opaque Front Backing. They are part of the
// panel chrome, not interactive content. On the editor canvas they must NOT
// swallow clicks (otherwise picking the actual content underneath, or the
// Canvas itself, becomes impossible) and adding new elements should never
// target them. They remain fully editable from the Hierarchy tree.
//
// Detection is two-pronged: an explicit `structural` flag on the slot (set by
// the preset/template builders, survives renames) OR a name match (covers
// older saved documents authored before the flag existed).
const STRUCTURAL_NAMES: ReadonlySet<string> = new Set([
  "background",
  "back cover",
  "front backing",
]);

export function isStructuralName(name: string): boolean {
  return STRUCTURAL_NAMES.has(name.trim().toLowerCase());
}

export function isStructuralSlot(slot: Slot): boolean {
  return slot.structural === true || isStructuralName(slot.name);
}
