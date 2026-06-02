import { v4 as uuid } from "uuid";
import type { Slot, UixComponent } from "../../model/types";
import { measureLabelWidth } from "../textMeasure";

// ─────────────────────────────────────────────────────────────────────────────
// Radial group geometry. The RadioGroup component stores an option list + a
// label position + an orientation; this module regenerates the option ring/label
// child slots from those so the user edits a list instead of hand-building slots.
// The dots/labels are absolutely positioned (matching the hand-authored preset)
// inside a "Radials" cluster container that the group row sizes itself to.
// ─────────────────────────────────────────────────────────────────────────────

export type LabelPosition = "up" | "down" | "left" | "right" | "none";
export type Orientation = "horizontal" | "vertical";

const RING = 24; // dot diameter (px)
const LABEL_FONT = 14;
const LINE_H = 18; // label line height at LABEL_FONT
const GAP_RL = 6; // gap between a dot and its label
const GAP_OPT = 12; // gap between options
const VPAD = 6; // vertical breathing room added to the group row
const BASE_ROW = 36; // a single-row group's minimum height

function rgb(r: number, g: number, b: number, a = 1) {
  return { r, g, b, a };
}
function c(type: UixComponent["type"], props: Record<string, unknown>): UixComponent {
  return { type, props };
}
function mk(name: string, components: UixComponent[], children: Slot[] = []): Slot {
  return { id: uuid(), name, locked: false, components, children };
}
// A rect anchored to the CENTER of the parent (anchor 0.5,0.5), given as a box
// centered at (cx, cy) with size (w, h). Resonite is Y-up, but a center-relative
// box is symmetric so there's no top/bottom flip to get wrong.
function centeredRT(cx: number, cy: number, w: number, h: number): UixComponent {
  return c("RectTransform", {
    anchorMin: { x: 0.5, y: 0.5 },
    anchorMax: { x: 0.5, y: 0.5 },
    offsetMin: { x: cx - w / 2, y: cy - h / 2 },
    offsetMax: { x: cx + w / 2, y: cy + h / 2 },
    pivot: { x: 0.5, y: 0.5 },
  });
}

// Intrinsic size of one option box for a given label width + position.
function optionSize(textW: number, pos: LabelPosition): { w: number; h: number } {
  switch (pos) {
    case "right":
    case "left":
      return { w: RING + GAP_RL + textW, h: RING };
    case "up":
    case "down":
      return { w: Math.max(RING, textW), h: RING + GAP_RL + LINE_H };
    case "none":
      return { w: RING, h: RING };
  }
}

// The ring (dot) + label child slots inside one option box of size (w, h),
// centered on the box. The exporter reads the Radio marker on the ring; the
// label is a plain Text whose visibility/position the user controls via `pos`.
function optionChildren(
  label: string,
  textW: number,
  pos: LabelPosition,
  groupId: string,
  index: number,
  selected: boolean,
  w: number,
  h: number,
): Slot[] {
  const hw = w / 2;
  const hh = h / 2;
  let ring = { x: 0, y: 0 };
  let lab = { x: 0, y: 0 };
  let align: "Left" | "Center" | "Right" = "Center";
  switch (pos) {
    case "right":
      ring = { x: -hw + RING / 2, y: 0 };
      lab = { x: -hw + RING + GAP_RL + textW / 2, y: 0 };
      align = "Left";
      break;
    case "left":
      lab = { x: -hw + textW / 2, y: 0 };
      ring = { x: hw - RING / 2, y: 0 };
      align = "Right";
      break;
    case "up":
      ring = { x: 0, y: -hh + RING / 2 };
      lab = { x: 0, y: hh - LINE_H / 2 };
      align = "Center";
      break;
    case "down":
      ring = { x: 0, y: hh - RING / 2 };
      lab = { x: 0, y: -hh + LINE_H / 2 };
      align = "Center";
      break;
    case "none":
      ring = { x: 0, y: 0 };
      break;
  }
  // Named after the option (matching the hand-authored preset) — the exporter
  // synthesizes its own "Dot" fill child inside this ring at build time.
  const dot = mk(label || "Radio", [
    centeredRT(ring.x, ring.y, RING, RING),
    c("Image", { tint: rgb(0.18, 0.18, 0.18), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", {
      normalColor: rgb(0.18, 0.18, 0.18), highlightColor: rgb(0.3, 0.3, 0.3),
      pressColor: rgb(0.1, 0.1, 0.1), disabledColor: rgb(0.25, 0.25, 0.25), hoverVibrate: false,
    }),
    c("Radio", { groupId, index, initiallySelected: selected, selectedColor: rgb(0.95, 0.95, 0.95) }),
  ]);
  if (pos === "none") return [dot];
  const text = mk("Label", [
    centeredRT(lab.x, lab.y, Math.max(textW, 1), LINE_H),
    c("Text", {
      content: label, size: LABEL_FONT, color: rgb(0.9, 0.9, 0.9),
      horizontalAlign: align, verticalAlign: "Middle", autoSize: false,
    }),
  ]);
  return [dot, text];
}

export interface RadialBuild {
  radials: Slot; // the "Radials" cluster container, ready to drop into the group
  clusterW: number;
  clusterH: number;
  rowHeight: number; // height the group row should take to fit the cluster
}

// Regenerate the "Radials" cluster (the option ring/label slots) from a list.
export function buildRadials(
  labels: string[],
  pos: LabelPosition,
  orientation: Orientation,
  groupId: string,
  initialIndex: number,
): RadialBuild {
  const opts = labels.map((label, i) => {
    const textW = pos === "none" ? 0 : measureLabelWidth(label, LABEL_FONT);
    const { w, h } = optionSize(textW, pos);
    return { label, textW, w, h, index: i, selected: i === initialIndex };
  });

  const horizontal = orientation === "horizontal";
  const clusterW = horizontal
    ? opts.reduce((s, o) => s + o.w, 0) + Math.max(0, opts.length - 1) * GAP_OPT
    : Math.max(RING, ...opts.map((o) => o.w));
  const clusterH = horizontal
    ? Math.max(RING, ...opts.map((o) => o.h))
    : opts.reduce((s, o) => s + o.h, 0) + Math.max(0, opts.length - 1) * GAP_OPT;

  // Place each option box inside the cluster, then build its dot/label children.
  let cursor = 0;
  const optionSlots = opts.map((o) => {
    const children = optionChildren(o.label, o.textW, pos, groupId, o.index, o.selected, o.w, o.h);
    let outerRT: UixComponent;
    if (horizontal) {
      // left→right, vertically centered in the cluster
      const leftX = cursor;
      outerRT = c("RectTransform", {
        anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
        offsetMin: { x: leftX, y: -o.h / 2 }, offsetMax: { x: leftX + o.w, y: o.h / 2 },
        pivot: { x: 0.5, y: 0.5 },
      });
      cursor += o.w + GAP_OPT;
    } else {
      // top→bottom, left-aligned (Y-up: top edge is y=1, grow downward = negative)
      const topY = cursor;
      outerRT = c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0, y: 1 },
        offsetMin: { x: 0, y: -(topY + o.h) }, offsetMax: { x: o.w, y: -topY },
        pivot: { x: 0.5, y: 0.5 },
      });
      cursor += o.h + GAP_OPT;
    }
    return mk(`Radio ${o.label || o.index + 1}`, [outerRT], children);
  });

  // The cluster hugs the row's right edge, vertically centered, sized to content.
  const radials = mk(
    "Radials",
    [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: -clusterW, y: -clusterH / 2 }, offsetMax: { x: 0, y: clusterH / 2 },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ],
    optionSlots,
  );

  return { radials, clusterW, clusterH, rowHeight: Math.max(BASE_ROW, clusterH + 2 * VPAD) };
}

// The option labels for a group: from the `options` prop (one per line) when set,
// otherwise derived from the existing option slots (migrates legacy/preset groups
// that predate the list field). Reads the label Text of each Radio-bearing slot.
export function radioOptionLabels(group: Slot): string[] {
  const raw = (group.components.find((c) => c.type === "RadioGroup")?.props as
    | { options?: string }
    | undefined)?.options;
  if (raw && raw.trim()) return raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  // Derive from slots: each option outer slot holds a Radio dot + a label Text.
  const out: string[] = [];
  const walkOptions = (s: Slot) => {
    for (const child of s.children) {
      const hasRadio = (function has(n: Slot): boolean {
        return n.components.some((c) => c.type === "Radio") || n.children.some(has);
      })(child);
      if (!hasRadio) continue;
      // Find the label Text inside this option subtree.
      let label = "";
      (function findText(n: Slot) {
        for (const cc of n.children) {
          const t = cc.components.find((c) => c.type === "Text");
          if (t && !label) label = ((t.props as { content?: string }).content ?? "").trim();
          findText(cc);
        }
      })(child);
      out.push(label);
    }
  };
  // Options may sit directly under the group or inside a "Radials" wrapper.
  const radials = group.children.find((ch) => ch.name === "Radials");
  walkOptions(radials ?? group);
  return out.length ? out : ["Option 1"];
}
