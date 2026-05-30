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
 * Components keep their structure; only slot identity changes.
 */
function reassignIds(slot: Slot): Slot {
  slot.id = uuid();
  for (const child of slot.children) reassignIds(child);
  return slot;
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
  const copy = reassignIds(clone(original));
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
            for (const k of ["paddingLeft", "paddingRight"])
              if (typeof p[k] === "number") p[k] *= fx;
            for (const k of ["paddingTop", "paddingBottom"])
              if (typeof p[k] === "number") p[k] *= fy;
            if (typeof p.spacing === "number") p.spacing *= avg;
            break;
          case "GridLayout":
            if (typeof p.cellSizeX === "number") p.cellSizeX *= fx;
            if (typeof p.cellSizeY === "number") p.cellSizeY *= fy;
            if (typeof p.spacingX === "number") p.spacingX *= fx;
            if (typeof p.spacingY === "number") p.spacingY *= fy;
            for (const k of ["paddingLeft", "paddingRight"])
              if (typeof p[k] === "number") p[k] *= fx;
            for (const k of ["paddingTop", "paddingBottom"])
              if (typeof p[k] === "number") p[k] *= fy;
            break;
          case "Knob":
            p.offOffsetMin = sv(p.offOffsetMin, fx, fy);
            p.offOffsetMax = sv(p.offOffsetMax, fx, fy);
            p.onOffsetMin = sv(p.onOffsetMin, fx, fy);
            p.onOffsetMax = sv(p.onOffsetMax, fx, fy);
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
