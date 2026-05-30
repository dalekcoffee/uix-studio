import type { Slot } from "./types";
import {
  addComponent,
  findSlot,
  removeComponent,
  updateComponentProp,
} from "./operations";

export type ButtonPresetId = "blank" | "close" | "url" | "popup";

export interface ButtonPreset {
  id: ButtonPresetId;
  label: string;
  description: string;
}

export const BUTTON_PRESETS: readonly ButtonPreset[] = [
  {
    id: "blank",
    label: "Blank",
    description: "A plain button with no behavior. Configure colors and add components manually.",
  },
  {
    id: "close",
    label: "Close window",
    description: "Red round button with the ✕ icon. Use on the panel header to close.",
  },
  {
    id: "url",
    label: "Open URL",
    description: "Clicking shows a confirmation, then opens the URL in the user's browser.",
  },
  {
    id: "popup",
    label: "Open popup",
    description:
      "Clicking opens a popup dialog with a title, body, dismiss button, and red ✕ close. Configure it in the Popup component below.",
  },
] as const;

/**
 * Apply a button preset to the given slot. The slot must already have a
 * Button component — this helper only mutates components related to the
 * preset (Image icon flags, Hyperlink/BoxCollider, Button colors). Calling
 * with "blank" strips preset-specific extras and resets the Button colors
 * to the neutral default.
 */
export function applyButtonPreset(
  root: Slot,
  slotId: string,
  preset: ButtonPresetId,
): Slot {
  const slot = findSlot(root, slotId);
  if (!slot) return root;
  if (!slot.components.some((c) => c.type === "Button")) return root;

  let r = root;

  // Always strip preset-specific extras first so switching presets cleans up.
  // The Close component (→ ButtonDestroy at export) is part of the "close"
  // preset only; removing it here means Blank/URL/Popup never leave a stray
  // close behavior behind.
  r = removeComponent(r, slotId, "Hyperlink");
  r = removeComponent(r, slotId, "Popup");
  r = removeComponent(r, slotId, "Close");
  r = clearCloseIcon(r, slotId);

  switch (preset) {
    case "blank":
      r = updateComponentProp(r, slotId, "Button", "normalColor", {
        r: 0.85,
        g: 0.85,
        b: 0.85,
        a: 1,
      });
      r = updateComponentProp(r, slotId, "Button", "highlightColor", { r: 1, g: 1, b: 1, a: 1 });
      r = updateComponentProp(r, slotId, "Button", "pressColor", { r: 0.6, g: 0.6, b: 0.6, a: 1 });
      break;

    case "close": {
      // The Close marker is what actually makes it destroy the panel at export
      // (→ ButtonDestroy). Without it you'd get a red X that does nothing.
      r = ensureComponent(r, slotId, "Close");
      r = updateComponentProp(r, slotId, "Close", "findObjectRoot", true);
      r = ensureComponent(r, slotId, "Image");
      r = updateComponentProp(r, slotId, "Image", "useCloseIcon", true);
      r = updateComponentProp(r, slotId, "Image", "useHelpIcon", false);
      r = updateComponentProp(r, slotId, "Image", "useCheckIcon", false);
      r = updateComponentProp(r, slotId, "Image", "preserveAspect", true);
      r = updateComponentProp(r, slotId, "Image", "tint", { r: 1, g: 1, b: 1, a: 1 });
      r = updateComponentProp(r, slotId, "Button", "normalColor", {
        r: 0.78,
        g: 0.22,
        b: 0.22,
        a: 1,
      });
      r = updateComponentProp(r, slotId, "Button", "highlightColor", {
        r: 0.95,
        g: 0.35,
        b: 0.35,
        a: 1,
      });
      r = updateComponentProp(r, slotId, "Button", "pressColor", {
        r: 0.55,
        g: 0.15,
        b: 0.15,
        a: 1,
      });
      break;
    }

    case "url":
      r = ensureComponent(r, slotId, "BoxCollider");
      r = ensureComponent(r, slotId, "Hyperlink");
      r = updateComponentProp(r, slotId, "Hyperlink", "url", "https://");
      r = updateComponentProp(r, slotId, "Hyperlink", "reason", "Open this link?");
      r = updateComponentProp(r, slotId, "Hyperlink", "openOnce", false);
      break;

    case "popup":
      r = ensureComponent(r, slotId, "BoxCollider");
      r = ensureComponent(r, slotId, "Popup");
      // Default values come from the Popup schema; no need to seed them here
      // unless you want a different starting point for this preset.
      break;
  }

  return r;
}

/**
 * Detect which preset (if any) the current slot configuration matches.
 * Returns "blank" when a Button exists but no preset-specific markers are set.
 */
export function detectButtonPreset(slot: Slot): ButtonPresetId | null {
  if (!slot.components.some((c) => c.type === "Button")) return null;
  // The Close component is the real marker of a close-window button — the close
  // icon may live on a child "glyph" slot (the template's colored-circle close),
  // so don't rely on useCloseIcon being on this slot's own Image.
  if (slot.components.some((c) => c.type === "Close")) return "close";
  const image = slot.components.find((c) => c.type === "Image");
  if (image && (image.props as { useCloseIcon?: boolean }).useCloseIcon) return "close";
  if (slot.components.some((c) => c.type === "Popup")) return "popup";
  if (slot.components.some((c) => c.type === "Hyperlink")) return "url";
  return "blank";
}

function ensureComponent(root: Slot, slotId: string, type: Parameters<typeof addComponent>[2]): Slot {
  const slot = findSlot(root, slotId);
  if (!slot) return root;
  if (slot.components.some((c) => c.type === type)) return root;
  return addComponent(root, slotId, type);
}

function clearCloseIcon(root: Slot, slotId: string): Slot {
  const slot = findSlot(root, slotId);
  if (!slot) return root;
  if (!slot.components.some((c) => c.type === "Image")) return root;
  return updateComponentProp(root, slotId, "Image", "useCloseIcon", false);
}
