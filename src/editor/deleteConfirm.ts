import type { Slot } from "../model/types";
import { findSlot } from "../model/operations";
import { controlDisplayName } from "../model/controlName";
import { useStore } from "../state/store";
import { getDict } from "../locale";

type ConfirmFn = (
  message: string,
  opts?: { confirmLabel?: string; destructive?: boolean; title?: string },
) => Promise<boolean>;

// Shared delete confirmation so EVERY delete path prompts identically — the
// hierarchy ✕, the context-menu Delete, the keyboard Delete/Backspace, and the
// on-canvas selection ✕. Previously only the first two confirmed, so a stray
// Delete keypress or a quick canvas click deleted without warning. Returns true
// when the user confirms; the caller performs the actual remove.
export async function confirmDeleteSlot(
  confirm: ConfirmFn,
  root: Slot,
  slotId: string,
): Promise<boolean> {
  // Non-React module: read the current language straight from the store so
  // every delete path (keyboard, canvas ✕) prompts in the active language
  // without threading a dictionary through every caller.
  const lang = useStore.getState().language;
  const d = getDict(lang).dialogs.deleteSlot;
  const slot = findSlot(root, slotId);
  const name = slot ? controlDisplayName(slot, lang) : d.unnamed;
  return confirm(d.message(name), {
    destructive: true,
    confirmLabel: d.confirmLabel,
  });
}
