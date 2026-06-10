import { v4 as uuid } from "uuid";
import type { Slot, UixComponent, UixComponentType } from "./types";
import { defaultProps } from "./components";

export function newSlot(name = "Slot", components: UixComponent[] = []): Slot {
  return { id: uuid(), name, locked: false, components, children: [] };
}

export function newComponent<T extends UixComponentType>(type: T): UixComponent {
  return { type, props: defaultProps(type) as Record<string, unknown> };
}

function find(
  slot: Slot,
  id: string,
  parent: Slot | null = null,
): { node: Slot; parent: Slot | null } | null {
  if (slot.id === id) return { node: slot, parent };
  for (const c of slot.children) {
    const r = find(c, id, slot);
    if (r) return r;
  }
  return null;
}

export function findSlot(root: Slot, id: string): Slot | null {
  return find(root, id)?.node ?? null;
}

export function findParent(root: Slot, id: string): Slot | null {
  return find(root, id)?.parent ?? null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function addChildSlot(root: Slot, parentId: string, child: Slot): Slot {
  const r = clone(root);
  const target = findSlot(r, parentId);
  if (!target) return root;
  target.children.push(child);
  return r;
}

export function removeSlot(root: Slot, id: string): Slot {
  if (root.id === id) return root;
  const r = clone(root);
  const parent = findParent(r, id);
  if (!parent) return root;
  parent.children = parent.children.filter((c) => c.id !== id);
  return r;
}

export function renameSlot(root: Slot, id: string, name: string): Slot {
  const r = clone(root);
  const target = findSlot(r, id);
  if (!target) return root;
  target.name = name;
  return r;
}

export function toggleLock(root: Slot, id: string): Slot {
  const r = clone(root);
  const target = findSlot(r, id);
  if (!target) return root;
  target.locked = !target.locked;
  return r;
}

// Set a composite wrapper's label position ("left" | "top"). Stored on the slot
// itself (not a component) so it survives native save/load; the editor reads it
// via labelPositionOf to drive the internal label/control layout.
export function setLabelPositionField(root: Slot, id: string, pos: "left" | "top"): Slot {
  const r = clone(root);
  const target = findSlot(r, id);
  if (!target) return root;
  target.labelPosition = pos;
  return r;
}

// Replace a slot's children wholesale (used by generators that rebuild a
// subtree from data — e.g. the radial group regenerating its option slots).
export function setSlotChildren(root: Slot, id: string, children: Slot[]): Slot {
  const r = clone(root);
  const target = findSlot(r, id);
  if (!target) return root;
  target.children = children;
  return r;
}

export function addComponent(root: Slot, slotId: string, type: UixComponentType): Slot {
  const r = clone(root);
  const target = findSlot(r, slotId);
  if (!target) return root;
  if (target.components.some((c) => c.type === type)) return root;
  // Adding a Button to a slot without an Image: also push a fully transparent
  // Image so Resonite's pointer raycast has a hit-target on the same slot
  // (UIX.Button needs a UIX Graphic with InteractionTarget=true on its slot
  // to be clickable — without one, the Button is inert). Image is added
  // BEFORE the Button so component order stays RT → Image → Button. User
  // can edit the Image's tint/alpha later to make the button visible; the
  // default transparent Image keeps the click target invisible by default.
  if (type === "Button" && !target.components.some((c) => c.type === "Image")) {
    const transparent = newComponent("Image");
    (transparent.props as Record<string, unknown>).tint = { r: 1, g: 1, b: 1, a: 0 };
    target.components.push(transparent);
  }
  target.components.push(newComponent(type));
  return r;
}

export function removeComponent(root: Slot, slotId: string, type: UixComponentType): Slot {
  if (type === "Canvas" && root.id === slotId) return root;
  const r = clone(root);
  const target = findSlot(r, slotId);
  if (!target) return root;
  target.components = target.components.filter((c) => c.type !== type);
  return r;
}

export function updateComponentProp(
  root: Slot,
  slotId: string,
  type: UixComponentType,
  key: string,
  value: unknown,
): Slot {
  const r = clone(root);
  const target = findSlot(r, slotId);
  if (!target) return root;
  const comp = target.components.find((c) => c.type === type);
  if (!comp) return root;
  comp.props = { ...comp.props, [key]: value };
  return r;
}

/**
 * Move slot `id` to become the child of `newParentId` at the given index.
 * If moving within the same parent, indices are computed against the
 * post-removal children list (caller should pass the target index in the
 * *visual* list — we adjust automatically).
 */
export function moveSlotTo(
  root: Slot,
  id: string,
  newParentId: string,
  index: number,
): Slot {
  if (id === newParentId) return root;
  const subtree = findSlot(root, id);
  if (!subtree) return root;
  // Disallow moving into own descendant
  if (findSlot(subtree, newParentId)) return root;
  const oldParent = findParent(root, id);
  const movingWithinSameParent = oldParent?.id === newParentId;
  const oldIndex = oldParent ? oldParent.children.findIndex((c) => c.id === id) : -1;
  const subtreeCopy = clone(subtree);
  const without = removeSlot(root, id);
  const r = clone(without);
  const target = findSlot(r, newParentId);
  if (!target) return root;
  let insertAt = index;
  if (movingWithinSameParent && oldIndex >= 0 && oldIndex < index) insertAt = index - 1;
  insertAt = Math.max(0, Math.min(insertAt, target.children.length));
  target.children.splice(insertAt, 0, subtreeCopy);
  return r;
}

/**
 * Deep-clone a slot subtree and reassign every slot id to a fresh uuid.
 * Components keep their structure; only slot identity changes. When `mapping`
 * is supplied it records old id → new id for every slot in the subtree (so
 * component props that reference in-subtree slots by id can be remapped after).
 */
function reassignIds(slot: Slot, mapping?: Map<string, string>): Slot {
  const fresh = uuid();
  if (mapping) mapping.set(slot.id, fresh);
  slot.id = fresh;
  for (const child of slot.children) reassignIds(child, mapping);
  return slot;
}

function walkComponents(slot: Slot, fn: (c: UixComponent) => void): void {
  for (const c of slot.components) fn(c);
  for (const ch of slot.children) walkComponents(ch, fn);
}

// Cross-element link plumbing: props whose string id pairs a driving SOURCE
// (slider / picker / reference field) with driven TARGET(s) (float field / bar /
// waveform) at export — see the "🔗 Links" pass in exportBrson.ts. The exporter
// keys SOURCES by id (last write wins), so ids must stay unique per source.
const LINK_SOURCE_PROPS: ReadonlyArray<{ type: string; key: string }> = [
  { type: "Slider", key: "linkId" },
  { type: "ColorPicker", key: "linkId" },
  { type: "ReferenceField", key: "audioLinkId" },
];
const LINK_TARGET_PROPS: ReadonlyArray<{ type: string; key: string }> = [
  { type: "TextField", key: "bindSliderId" },
  { type: "ProgressBar", key: "colorLinkId" },
  { type: "Waveform", key: "audioLinkId" },
];

/**
 * Fix up cross-element link ids on a freshly duplicated subtree:
 *  1. Every link SOURCE in the copy gets a fresh id — a copy keeping its id
 *     would silently UNBIND the original control (exporter source map is
 *     last-wins). Targets inside the copy follow their source to the fresh id,
 *     so a duplicated picker+bar (or slider+field, reference+waveform) pair
 *     stays linked to itself. Targets whose source stayed outside the copy
 *     keep the old id — they remain driven by the original source.
 *  2. A "Take ownership" Button references a UserProfile card by EDITOR slot
 *     id; if the card came along in the copy, follow it to the reassigned id
 *     (left pointing outside, both buttons would assign the original card).
 */
function remapLinkRefs(slot: Slot, slotIdMap: Map<string, string>): void {
  const freshLinkIds = new Map<string, string>();
  walkComponents(slot, (c) => {
    for (const s of LINK_SOURCE_PROPS) {
      if (c.type !== s.type) continue;
      const cur = (c.props as Record<string, unknown>)[s.key];
      if (typeof cur === "string" && cur.length > 0) {
        if (!freshLinkIds.has(cur)) freshLinkIds.set(cur, uuid());
        (c.props as Record<string, unknown>)[s.key] = freshLinkIds.get(cur);
      }
    }
  });
  walkComponents(slot, (c) => {
    for (const t of LINK_TARGET_PROPS) {
      if (c.type !== t.type) continue;
      const cur = (c.props as Record<string, unknown>)[t.key];
      if (typeof cur === "string" && freshLinkIds.has(cur)) {
        (c.props as Record<string, unknown>)[t.key] = freshLinkIds.get(cur);
      }
    }
    if (c.type === "Button") {
      const cur = (c.props as Record<string, unknown>).takeOwnershipLinkId;
      if (typeof cur === "string" && slotIdMap.has(cur)) {
        (c.props as Record<string, unknown>).takeOwnershipLinkId = slotIdMap.get(cur);
      }
    }
  });
}

/**
 * After a subtree is cloned with fresh slot ids, clear component props that hold
 * the id of a slot OUTSIDE the copied subtree, so the duplicate doesn't silently
 * share the original's linked slot. The concrete case is `Popup.contentSlotId`,
 * which points at a dialog card living as a Canvas-root sibling (not inside the
 * host) — nulling it makes ensurePopupContent build the copy its own card on the
 * first "Edit popup". (Self-contained refs that live inside the subtree, e.g. a
 * RefEditor's same-slot field links, are unaffected.)
 */
function clearStaleSlotRefs(slot: Slot): void {
  for (const c of slot.components) {
    if (c.type === "Popup") {
      (c.props as Record<string, unknown>).contentSlotId = undefined;
    }
  }
  for (const child of slot.children) clearStaleSlotRefs(child);
}

/**
 * Duplicate the slot with id `id`. The copy is inserted immediately after the
 * original in its parent's children list and gets fresh slot ids throughout.
 * Returns the new root and the new top-level slot id (so callers can select it).
 */
export function duplicateSlot(
  root: Slot,
  id: string,
): { root: Slot; newId: string | null } {
  if (root.id === id) return { root, newId: null };
  const r = clone(root);
  const parent = findParent(r, id);
  if (!parent) return { root, newId: null };
  const idx = parent.children.findIndex((c) => c.id === id);
  if (idx < 0) return { root, newId: null };
  const original = parent.children[idx];
  const idMap = new Map<string, string>();
  const copy = reassignIds(clone(original), idMap);
  clearStaleSlotRefs(copy);
  remapLinkRefs(copy, idMap);
  copy.name = uniqueCopyName(parent, original.name);
  parent.children.splice(idx + 1, 0, copy);
  return { root: r, newId: copy.id };
}

function uniqueCopyName(parent: Slot, baseName: string): string {
  const taken = new Set(parent.children.map((c) => c.name));
  if (!taken.has(baseName + " copy")) return baseName + " copy";
  let n = 2;
  while (taken.has(`${baseName} copy ${n}`)) n++;
  return `${baseName} copy ${n}`;
}

export function isDescendant(root: Slot, ancestorId: string, descendantId: string): boolean {
  const a = findSlot(root, ancestorId);
  if (!a) return false;
  return !!findSlot(a, descendantId);
}

/** Set the Canvas component's pixel dimensions on the root slot. */
export function setCanvasSize(root: Slot, w: number, h: number): Slot {
  const r = clone(root);
  const canvas = r.components.find((c) => c.type === "Canvas");
  if (canvas) {
    canvas.props = {
      ...canvas.props,
      sizeX: Math.max(1, Math.round(w)),
      sizeY: Math.max(1, Math.round(h)),
    };
  }
  return r;
}

type V2 = { x?: number; y?: number } | undefined;

/**
 * Proportionally scale every descendant's pixel-space geometry by (fx, fy).
 * The root Canvas slot itself is left untouched (its size is set separately via
 * setCanvasSize) — only its children and below are scaled. Powers the
 * "resize canvas + contents" mode so the whole panel grows/shrinks uniformly
 * instead of only the frame. Returns a new tree; `root` is not mutated.
 */
export function scaleSlotTree(root: Slot, fx: number, fy: number): Slot {
  const avg = (fx + fy) / 2;
  const r = clone(root);
  const sv = (v: V2, sx: number, sy: number) =>
    v && typeof v === "object" ? { x: (v.x ?? 0) * sx, y: (v.y ?? 0) * sy } : v;

  function walk(slot: Slot, isRoot: boolean) {
    if (!isRoot) {
      for (const comp of slot.components) {
        const p = comp.props as Record<string, any>;
        switch (comp.type) {
          case "RectTransform":
            p.offsetMin = sv(p.offsetMin, fx, fy);
            p.offsetMax = sv(p.offsetMax, fx, fy);
            break;
          case "Text":
            if (typeof p.size === "number") p.size *= avg;
            break;
          case "LayoutElement":
            for (const k of ["minWidth", "preferredWidth"])
              if (typeof p[k] === "number" && p[k] >= 0) p[k] *= fx;
            for (const k of ["minHeight", "preferredHeight"])
              if (typeof p[k] === "number" && p[k] >= 0) p[k] *= fy;
            break;
          case "VerticalLayout":
          case "HorizontalLayout":
            // Guard >= 0: negative is the -1 "auto/inherit" sentinel, not a
            // pixel inset to scale (padding follows the canvas).
            for (const k of ["paddingLeft", "paddingRight"])
              if (typeof p[k] === "number" && p[k] >= 0) p[k] *= fx;
            for (const k of ["paddingTop", "paddingBottom"])
              if (typeof p[k] === "number" && p[k] >= 0) p[k] *= fy;
            if (typeof p.spacing === "number") p.spacing *= avg;
            break;
          case "GridLayout":
            if (typeof p.cellSizeX === "number") p.cellSizeX *= fx;
            if (typeof p.cellSizeY === "number") p.cellSizeY *= fy;
            if (typeof p.spacingX === "number") p.spacingX *= fx;
            if (typeof p.spacingY === "number") p.spacingY *= fy;
            for (const k of ["paddingLeft", "paddingRight"])
              if (typeof p[k] === "number" && p[k] >= 0) p[k] *= fx;
            for (const k of ["paddingTop", "paddingBottom"])
              if (typeof p[k] === "number" && p[k] >= 0) p[k] *= fy;
            break;
          case "Knob":
            p.offOffsetMin = sv(p.offOffsetMin, fx, fy);
            p.offOffsetMax = sv(p.offOffsetMax, fx, fy);
            p.onOffsetMin = sv(p.onOffsetMin, fx, fy);
            p.onOffsetMax = sv(p.onOffsetMax, fx, fy);
            break;
          case "ScrollArea":
            // Inner content padding + row spacing are pixel values — scale them
            // with the container so a proportional ("scale contents") resize
            // keeps the scroll area's insets in proportion.
            // Guard >= 0: a negative value is the -1 "auto/inherit" sentinel
            // (padding follows the canvas), not a real pixel inset to scale.
            if (typeof p.padding === "number" && p.padding >= 0) p.padding *= avg;
            if (typeof p.spacing === "number") p.spacing *= avg;
            break;
          case "Tabs":
            // Tab-strip thickness scales on the strip's axis; page padding is a
            // uniform inset → average. Keeps the tab bar/page insets proportional.
            if (typeof p.tabBarSize === "number")
              p.tabBarSize *= (p.tabPosition === "left" || p.tabPosition === "right") ? fx : fy;
            if (typeof p.tabSpacing === "number") p.tabSpacing *= avg;
            if (typeof p.pagePadding === "number" && p.pagePadding >= 0) p.pagePadding *= avg;
            break;
        }
      }
      if (slot.position)
        slot.position = {
          x: slot.position.x * fx,
          y: slot.position.y * fy,
          z: slot.position.z,
        };
    }
    for (const child of slot.children) walk(child, false);
  }

  walk(r, true);
  return r;
}
