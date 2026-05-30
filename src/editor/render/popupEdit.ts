import type { Slot } from "../../model/types";
import { findSlot } from "../../model/operations";

// Resolve which popup content card (if any) the current selection puts the user
// "inside" — used to render the popup editing surface and to scope the snap
// grips to just that card. A popup's content card is a Canvas-root child
// carrying a PopupContent component; the selection is either the popup trigger
// (a slot with a Popup component, linking to its card via contentSlotId) or the
// card itself / something nested in it. Returns null when no popup is in play.
export function findActivePopupCard(root: Slot, selectedId: string | null): Slot | null {
  if (!selectedId) return null;
  const sel = findSlot(root, selectedId);
  if (!sel) return null;
  const popup = sel.components.find((c) => c.type === "Popup");
  if (popup) {
    const cid = (popup.props as { contentSlotId?: string }).contentSlotId;
    return cid ? findSlot(root, cid) : null;
  }
  for (const child of root.children) {
    if (
      child.components.some((c) => c.type === "PopupContent") &&
      findSlot(child, selectedId)
    ) {
      return child;
    }
  }
  return null;
}
