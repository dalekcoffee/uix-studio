import type { Slot } from "./types";
import { computeChildRect, getRectTransform, type Rect } from "../editor/render/rectTransform";
import { getLayoutKind, layoutChildren } from "../editor/render/layoutEngine";
import { isStructuralSlot } from "./structural";

export type WarningSeverity = "warning" | "info";

export interface DocWarning {
  slotId: string;
  slotName: string;
  code: string;
  message: string;
  severity: WarningSeverity;
}

/**
 * Walk the document and flag mis-configured components that the user almost
 * certainly didn't mean. Warnings never block export — they're surfaced as a
 * yellow chip in the toolbar with a clickable list so the author can jump to
 * the affected slot.
 */
export function collectWarnings(
  root: Slot,
  // Set of image hashes that currently exist in the user's IndexedDB store.
  // Pass `null` to skip the missing-image check (e.g. before the store has
  // loaded). When provided, any Image.customImageHash not in the set is
  // flagged so the user knows their reference is dead.
  availableImageHashes: ReadonlySet<string> | null = null,
): DocWarning[] {
  const out: DocWarning[] = [];

  function walk(slot: Slot) {
    for (const c of slot.components) {
      if (c.type === "Image") {
        const p = c.props as Record<string, unknown>;
        const customHash = typeof p.customImageHash === "string" ? (p.customImageHash as string) : "";
        const hasCustom = customHash.length > 0;
        if (
          hasCustom &&
          availableImageHashes !== null &&
          !availableImageHashes.has(customHash)
        ) {
          out.push({
            slotId: slot.id,
            slotName: slot.name,
            code: "image-missing",
            message:
              `Custom image (${customHash.slice(0, 8)}…) is referenced but no longer in your library — slot will render as a blank tinted rect. Re-upload, pick a different image, or clear the reference.`,
            severity: "warning",
          });
        }
        const hasSpriteUrl =
          typeof p.spriteUrl === "string" && /^https?:\/\//.test(p.spriteUrl as string);
        const hasIcon = p.useHelpIcon || p.useCloseIcon || p.useCheckIcon
          || p.useBackspaceIcon || p.useSpinnerIcon
          || p.useLogoSprite
          // An image drop-zone placeholder (editor hatch + bundled "drop image
          // here" sprite) is a deliberate "fill me" spot, not an empty leaf.
          || p.useImagePlaceholder;
        const isShapeOnly = typeof p.cornerRadius === "number" && (p.cornerRadius as number) > 0; // visual rounded shape, not "empty"
        // A tinted rectangle with no sprite is fine when the slot exists to
        // host child slots (e.g. the Checkbox "Box" wrapping a Check Icon, or
        // a Button background hosting a Label). Only flag truly leaf Images.
        const hostsChildren = slot.children.length > 0;
        // The Image is the BACKING for whatever else lives on the slot — a
        // label, a text input, a slider track, a button face, etc. Any
        // component beyond the purely-structural set means the tinted rect is
        // intentional backing, not an empty leaf. (Generalises the old
        // Button+Text "button face" exemption to every control + text badge.)
        const BACKING_IGNORE = new Set([
          "RectTransform", "LayoutElement", "IgnoreLayout", "Image", "BoxCollider",
        ]);
        const backsContent = slot.components.some((c2) => !BACKING_IGNORE.has(c2.type));
        // Back Cover (Sidedness=Back) and Front Backing (Sidedness=Front,
        // positive offset) are deliberate opaque backdrops layered behind the
        // panel content to plug the rounded sprite's residual alpha. They're
        // SUPPOSED to be solid tinted rects covering siblings beneath — the
        // "covers siblings" critique doesn't apply here. Same for any slot
        // flagged structural (Background + preset region panels).
        const isIntentionalBacking =
          p.useBackMaterial === true || p.useFrontBacking === true || isStructuralSlot(slot);
        if (
          !hasCustom &&
          !hasSpriteUrl &&
          !hasIcon &&
          !isShapeOnly &&
          !hostsChildren &&
          !backsContent &&
          !isIntentionalBacking
        ) {
          out.push({
            slotId: slot.id,
            slotName: slot.name,
            code: "image-empty",
            message:
              "Image has no sprite, icon, or rounded shape — it will render as a solid tinted rectangle and may cover siblings beneath it.",
            severity: "warning",
          });
        }
      }
      if (c.type === "Text") {
        const p = c.props as Record<string, unknown>;
        const content = (p.content as string | undefined) ?? "";
        if (content.trim() === "") {
          out.push({
            slotId: slot.id,
            slotName: slot.name,
            code: "text-empty",
            message: "Text component has no content — nothing will render.",
            severity: "info",
          });
        }
      }
      if (c.type === "Hyperlink") {
        const p = c.props as Record<string, unknown>;
        const url = (p.url as string | undefined) ?? "";
        if (url.trim() === "" || url.trim() === "https://") {
          out.push({
            slotId: slot.id,
            slotName: slot.name,
            code: "hyperlink-empty",
            message:
              "Hyperlink has no URL — clicking will show the confirmation but not open anything.",
            severity: "info",
          });
        }
      }
      if (c.type === "Popup") {
        // Popup lowers to a Hyperlink at export. Hyperlink fires from either a
        // sibling Button (it receives the press via IButtonPressReceiver) or
        // from a sibling BoxCollider that catches raycasts. Without either,
        // the popup will export but nothing on the slot is clickable.
        const hasButton = slot.components.some((c2) => c2.type === "Button");
        const hasCollider = slot.components.some((c2) => c2.type === "BoxCollider");
        if (!hasButton && !hasCollider) {
          out.push({
            slotId: slot.id,
            slotName: slot.name,
            code: "popup-no-trigger",
            message:
              "Popup needs a Button or BoxCollider on the same slot to be clickable. Add one via + Add.",
            severity: "warning",
          });
        }
      }
    }
    for (const child of slot.children) walk(child);
  }

  walk(root);

  // Sibling overlap check — flag pairs of children of the same free-form
  // parent whose rectangles overlap significantly. Layout-managed parents
  // (VerticalLayout/HorizontalLayout/GridLayout) are skipped because their
  // children are positioned automatically and "overlap" doesn't apply.
  const canvasComp = root.components.find((c) => c.type === "Canvas");
  const cp = canvasComp?.props as { sizeX?: number; sizeY?: number } | undefined;
  const rootRect: Rect = { x: 0, y: 0, w: cp?.sizeX ?? 800, h: cp?.sizeY ?? 600 };
  collectOverlapWarnings(root, rootRect, rootRect, out);

  return out;
}

// A "background" slot is intentionally full-canvas / oversized and is meant
// to sit underneath everything else — flagging it for overlap is just noise.
// We treat any slot named "Background" (case-insensitive) as one, and skip
// both: (a) pairs where either sibling is a Background, and (b) the entire
// subtree underneath a Background (its children almost always sit on top of
// each other by design — header bars, content panels, footers, etc.).
function isBackgroundSlot(slot: Slot): boolean {
  return slot.name.trim().toLowerCase() === "background";
}

// A pure grouping/layout container (e.g. the radio "Radials" wrapper) has no
// Image/Text of its own — it only positions child slots. Its RectTransform
// often spans a large area (a full row) for convenience while its visible
// children sit in one corner, so flagging a SIBLING for "overlapping" it is a
// false positive: the container itself draws nothing and can't visually cover
// anything. Overlaps among its actual (visible) children are still caught when
// the recursion descends into it. Skip overlap pairs that involve one.
function isNonVisualGroup(slot: Slot): boolean {
  if (slot.children.length === 0) return false;
  return !slot.components.some((c) => c.type === "Image" || c.type === "Text");
}

// The popup content card (carries a PopupContent component) is an INACTIVE modal
// overlay: it's centered over the panel but only becomes visible when its trigger
// is clicked in-game (Active=false at rest). Flagging siblings for "overlapping"
// it is noise — it isn't drawn until shown, and it's MEANT to cover the panel
// then. Skip overlap pairs that involve one; its own children are still checked.
function isPopupOverlaySlot(slot: Slot): boolean {
  return slot.components.some((c) => c.type === "PopupContent");
}

// True when `outer` fully encloses `inner` (within a small slack). When a slot
// sits entirely inside an earlier sibling, it's content layered ON a backdrop
// (avatar on a card, label on a panel, icon on a header stripe) — intentional,
// not a partial-overlap collision. Only meaningful when `outer` renders behind
// `inner` (earlier in the child array), so the caller passes them in that order.
function rectContains(outer: Rect, inner: Rect, slack = 2): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  );
}

function collectOverlapWarnings(
  parent: Slot,
  parentAbsRect: Rect,
  canvasRect: Rect,
  out: DocWarning[],
  // True when an ancestor is a ScrollArea viewport. Content inside a scroll
  // area is MEANT to overflow its viewport (that's what scrolling is for) — the
  // viewport clips/scrolls it, so it never actually spills off the canvas. Skip
  // the off-canvas check for everything under a ScrollArea.
  insideScroll = false,
) {
  const layoutKind = getLayoutKind(parent);
  const parentIsScroll = parent.components.some((c) => c.type === "ScrollArea");
  const scrollScope = insideScroll || parentIsScroll;
  const containerRect: Rect = { x: 0, y: 0, w: parentAbsRect.w, h: parentAbsRect.h };
  const childRects = layoutKind
    ? layoutChildren(containerRect, parent, layoutKind)
    : parent.children.map((c) => computeChildRect(containerRect, getRectTransform(c)));

  // Off-canvas / clipping check — flag any child whose canvas-space rect
  // extends meaningfully past the canvas edges. Background slots are
  // intentionally full-canvas; skip them and their descendants for this check
  // (handled by the early-return below for the overlap pass too). ScrollArea
  // descendants are skipped too — overflow is expected there.
  if (!isBackgroundSlot(parent) && !scrollScope && childRects) {
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (isBackgroundSlot(child)) continue;
      const local = childRects[i];
      const absX = parentAbsRect.x + local.x;
      const absY = parentAbsRect.y + local.y;
      const offLeft = canvasRect.x - absX;
      const offTop = canvasRect.y - absY;
      const offRight = absX + local.w - (canvasRect.x + canvasRect.w);
      const offBottom = absY + local.h - (canvasRect.y + canvasRect.h);
      // 2px slack for rounding; one of the four must exceed it.
      const worst = Math.max(offLeft, offTop, offRight, offBottom);
      if (worst > 2) {
        const sides: string[] = [];
        if (offLeft > 2) sides.push("left");
        if (offTop > 2) sides.push("top");
        if (offRight > 2) sides.push("right");
        if (offBottom > 2) sides.push("bottom");
        out.push({
          slotId: child.id,
          slotName: child.name,
          code: "off-canvas",
          message: `Extends past the canvas ${sides.join(" / ")} edge by ${Math.round(worst)}px — will be clipped or invisible in Resonite.`,
          severity: "warning",
        });
      }
    }
  }

  // Don't check overlaps anywhere under a Background slot.
  if (isBackgroundSlot(parent)) {
    // Still recurse so deeper non-Background subtrees get checked for clipping
    // (clipping check above already bailed for Background-rooted subtrees).
    if (childRects) {
      for (let i = 0; i < parent.children.length; i++) {
        const childAbs: Rect = {
          x: parentAbsRect.x + childRects[i].x,
          y: parentAbsRect.y + childRects[i].y,
          w: childRects[i].w,
          h: childRects[i].h,
        };
        collectOverlapWarnings(parent.children[i], childAbs, canvasRect, out, scrollScope);
      }
    }
    return;
  }

  if (!layoutKind && parent.children.length > 1) {
    // Track unique offending pairs so we don't emit the same warning twice.
    const seen = new Set<string>();
    for (let i = 0; i < parent.children.length; i++) {
      for (let j = i + 1; j < parent.children.length; j++) {
        if (!childRects) break;
        const ca = parent.children[i];
        const cb = parent.children[j];
        // Skip pairs that involve a Background or other structural backdrop
        // (Back Cover / Front Backing) — these are intentional full-canvas
        // layers meant to sit behind everything, so "overlap" is by design.
        if (isStructuralSlot(ca) || isStructuralSlot(cb)) continue;
        // Skip pairs where one side is a non-visual grouping container (e.g.
        // "Radials") — its rect overlapping a sibling isn't a visual conflict.
        if (isNonVisualGroup(ca) || isNonVisualGroup(cb)) continue;
        // Skip pairs involving the inactive popup modal card — it's hidden until
        // triggered and is meant to cover the panel when shown.
        if (isPopupOverlaySlot(ca) || isPopupOverlaySlot(cb)) continue;
        const a = childRects[i];
        const b = childRects[j];
        // Skip content layered on a backdrop: when the EARLIER sibling (drawn
        // behind, ca) fully contains the LATER one (cb), cb sits on top of ca
        // by design (avatar on a card, icon on a panel) — not a collision. The
        // reverse (a later, larger sibling swallowing an earlier one) is left
        // flagged, since that genuinely hides the earlier element.
        if (rectContains(a, b)) continue;
        const ovX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const ovY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ovX <= 4 || ovY <= 4) continue;
        const overlapArea = ovX * ovY;
        const smallerArea = Math.min(a.w * a.h, b.w * b.h) || 1;
        // Require at least 8% area coverage of the smaller rect — avoids
        // noise from rounding / borders that happen to touch by a pixel.
        if (overlapArea / smallerArea < 0.08) continue;
        const key = `${ca.id}::${cb.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          slotId: ca.id,
          slotName: ca.name,
          code: "siblings-overlap",
          message: `Overlaps "${cb.name}" — one may visually cover the other. Move, resize, or change anchors to fix.`,
          severity: "info",
        });
      }
    }
  }

  if (childRects) {
    for (let i = 0; i < parent.children.length; i++) {
      const local = childRects[i];
      const childAbs: Rect = {
        x: parentAbsRect.x + local.x,
        y: parentAbsRect.y + local.y,
        w: local.w,
        h: local.h,
      };
      collectOverlapWarnings(parent.children[i], childAbs, canvasRect, out, scrollScope);
    }
  } else {
    for (const c of parent.children) {
      collectOverlapWarnings(c, parentAbsRect, canvasRect, out, scrollScope);
    }
  }
}
