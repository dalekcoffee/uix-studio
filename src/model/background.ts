import { v4 as uuid } from "uuid";
import type { Slot, UixComponent } from "./types";
import { isStructuralName } from "./structural";

// The Background "chrome" trio — the dark backdrop layers shared by the
// flagship template and the blank canvas (kept here so the two can't drift):
//
//   Background        own Image (Double-sided) + IgnoreLayout
//     ├─ Back Cover      Image, Sidedness="Back"  → visible only from behind
//     └─ Front Backing   Image, Sidedness="Front" → visible from the front, behind UI
//
// Children render ON TOP of their parent in Resonite UIX, so the Background
// slot's own Image is never visible in-world — Front Backing covers it from the
// front and Back Cover from the back. That is why the user-facing "background
// image" must be cascaded onto Front Backing (front face) + Back Cover (back
// face) rather than the Background slot itself (see store.setBackgroundImage).

function c(type: UixComponent["type"], props: Record<string, unknown>): UixComponent {
  return { type, props };
}

function slot(name: string, components: UixComponent[], children: Slot[] = []): Slot {
  return {
    id: uuid(),
    name,
    locked: false,
    structural: isStructuralName(name) || undefined,
    components,
    children,
  };
}

function fillRT(): UixComponent {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 0 },
    anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 },
    offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
}

const DARK = { r: 0.05, g: 0.05, b: 0.05, a: 1 };

type Rgba = { r: number; g: number; b: number; a: number };

/** Build the Background + Back Cover + Front Backing subtree. Values mirror the
 *  flagship template 1:1 so a fresh blank panel reads identically.
 *
 *  `tint` recolors all three layers (default = the flagship's near-black);
 *  presets with a coloured backdrop (ID cards, login forms) pass their own.
 *  `cornerRadius` rounds all three in lockstep so the back rounds the same as
 *  the front (exportBundle also enforces this back==front sync). This helper is
 *  the single source of truth — presets MUST call it rather than hand-rolling
 *  the trio, or the layers drift (missing IgnoreLayout, mismatched corners). */
export function buildBackgroundTrio(tint: Rgba = DARK, cornerRadius = 10): Slot {
  const backCover = slot("Back Cover", [
    fillRT(),
    // Sidedness="Back" opaque rear face; carries the back-side custom background
    // when set. cornerRadius matches the Front Backing so the back rounds the
    // same as the front even with no wallpaper.
    c("Image", {
      tint,
      preserveAspect: false,
      spriteUrl: "",
      cornerRadius,
      useBackMaterial: true,
    }),
  ]);
  const frontBacking = slot("Front Backing", [
    fillRT(),
    // Sidedness="Front", positive polygon offset — visible from the front and
    // sits behind the UI widgets. Carries the front-side custom background.
    c("Image", {
      tint,
      preserveAspect: false,
      spriteUrl: "",
      cornerRadius,
      useFrontBacking: true,
    }),
  ]);
  return slot(
    "Background",
    [
      fillRT(),
      c("Image", { tint, preserveAspect: false, spriteUrl: "", cornerRadius }),
      c("IgnoreLayout", {}),
    ],
    [backCover, frontBacking],
  );
}

function findByName(root: Slot, name: string): Slot | null {
  const target = name.trim().toLowerCase();
  const stack: Slot[] = [root];
  while (stack.length) {
    const s = stack.pop()!;
    if (s.name.trim().toLowerCase() === target) return s;
    for (const ch of s.children) stack.push(ch);
  }
  return null;
}

/** Locate the Background chrome trio in a document. Front Backing = front face,
 *  Back Cover = back face. Any may be null on a document without the trio. */
export function findBackgroundSlots(root: Slot): {
  background: Slot | null;
  frontBacking: Slot | null;
  backCover: Slot | null;
} {
  const background = findByName(root, "background");
  const childByName = (name: string) =>
    background?.children.find((ch) => ch.name.trim().toLowerCase() === name) ?? null;
  return {
    background,
    frontBacking: childByName("front backing"),
    backCover: childByName("back cover"),
  };
}
