import type { Slot, UixComponentType } from "./types";
import { findParent, findSlot } from "./operations";

// Components that make a slot interactive/clickable on their own — not just
// Button. A graphic can be clickable because it's a close button (Close), a
// popup trigger (Popup), or a link (Hyperlink, or an Image with hyperlinkUrl).
// "Make static" strips all of these.
export const INTERACTIVITY_COMPONENTS: readonly UixComponentType[] = [
  "Button",
  "Hyperlink",
  "Popup",
  "Close",
];

function imageHasUrl(slot: Slot): boolean {
  const img = slot.components.find((c) => c.type === "Image");
  const url = (img?.props as { hyperlinkUrl?: unknown } | undefined)?.hyperlinkUrl;
  return typeof url === "string" && url.length > 0;
}

export function isSlotClickable(slot: Slot): boolean {
  return (
    slot.components.some((c) => INTERACTIVITY_COMPONENTS.includes(c.type)) ||
    imageHasUrl(slot)
  );
}

// A short action label for *why* a slot is clickable, for the Inspector's
// Interactivity readout. Most-specific role wins (a close button also carries a
// Button; describe it by what it does).
export function clickableReason(slot: Slot): string | null {
  if (slot.components.some((c) => c.type === "Close")) return "closes the window";
  if (slot.components.some((c) => c.type === "Popup")) return "opens a popup";
  if (slot.components.some((c) => c.type === "Hyperlink") || imageHasUrl(slot)) return "opens a link";
  if (slot.components.some((c) => c.type === "Button")) return "button";
  return null;
}

// Find the slot that actually makes this graphic clickable: the slot itself if
// it's interactive, otherwise the nearest ancestor that is. Icons live on a
// child "glyph" slot nested inside the clickable background slot (one graphic
// per slot), so selecting the icon should still report the button it's part of
// — not "static". Returns null only when nothing in the chain is clickable.
export function controllingClickable(
  root: Slot,
  slotId: string,
): { slot: Slot; reason: string; isSelf: boolean } | null {
  const self = findSlot(root, slotId);
  if (!self) return null;
  if (isSlotClickable(self)) {
    return { slot: self, reason: clickableReason(self)!, isSelf: true };
  }
  let parent = findParent(root, slotId);
  while (parent) {
    if (isSlotClickable(parent)) {
      return { slot: parent, reason: clickableReason(parent)!, isSelf: false };
    }
    parent = findParent(root, parent.id);
  }
  return null;
}
