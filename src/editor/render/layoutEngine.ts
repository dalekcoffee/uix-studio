import type { Slot, UixComponentType } from "../../model/types";
import type { Rect } from "./rectTransform";

export type LayoutKind = "Vertical" | "Horizontal" | "Grid" | null;

export function getLayoutKind(slot: Slot): LayoutKind {
  if (slot.components.some((c) => c.type === "VerticalLayout")) return "Vertical";
  if (slot.components.some((c) => c.type === "HorizontalLayout")) return "Horizontal";
  if (slot.components.some((c) => c.type === "GridLayout")) return "Grid";
  // ScrollArea auto-stacks its children via a synthetic layout container at
  // export time. Mirror that here so the editor preview lays children out
  // identically. Direction "Both" falls back to Vertical (the dominant axis).
  const sa = slot.components.find((c) => c.type === "ScrollArea");
  if (sa) {
    const dir = ((sa.props as Record<string, unknown>).direction as string) ?? "Vertical";
    return dir === "Horizontal" ? "Horizontal" : "Vertical";
  }
  return null;
}

function getProps(slot: Slot, type: UixComponentType): Record<string, unknown> | null {
  const c = slot.components.find((c) => c.type === type);
  return c ? (c.props as Record<string, unknown>) : null;
}

interface LayoutElement {
  minWidth: number;
  minHeight: number;
  preferredWidth: number;
  preferredHeight: number;
  flexibleWidth: number;
  flexibleHeight: number;
  orderOffset: number;
}

const DEFAULT_LE: LayoutElement = {
  minWidth: -1,
  minHeight: -1,
  preferredWidth: -1,
  preferredHeight: -1,
  flexibleWidth: -1,
  flexibleHeight: -1,
  orderOffset: 0,
};

function getLayoutElement(slot: Slot): LayoutElement {
  const props = getProps(slot, "LayoutElement");
  if (!props) return DEFAULT_LE;
  return { ...DEFAULT_LE, ...(props as Partial<LayoutElement>) };
}

function preferredSize(le: LayoutElement, axis: "w" | "h"): number {
  const pref = axis === "w" ? le.preferredWidth : le.preferredHeight;
  const min = axis === "w" ? le.minWidth : le.minHeight;
  if (pref >= 0) return pref;
  if (min >= 0) return min;
  return 60; // fallback for an unsized child
}

function flexValue(le: LayoutElement, axis: "w" | "h"): number {
  const f = axis === "w" ? le.flexibleWidth : le.flexibleHeight;
  return f > 0 ? f : 0;
}

// Unity-style distribution: every child starts at its preferred size, then any
// leftover space along the axis is split among children by their flex weight.
// If forceExpand is true and no child has flex, leftover is split equally.
function distribute(
  prefs: number[],
  flexes: number[],
  inner: number,
  forceExpand: boolean,
): number[] {
  const totalPref = prefs.reduce((a, b) => a + b, 0);
  if (totalPref >= inner) {
    const scale = inner / Math.max(1, totalPref);
    return prefs.map((p) => p * scale);
  }
  const extra = inner - totalPref;
  const totalFlex = flexes.reduce((a, b) => a + b, 0);
  if (totalFlex > 0) {
    return prefs.map((p, i) => p + (flexes[i] / totalFlex) * extra);
  }
  if (forceExpand && prefs.length > 0) {
    const per = extra / prefs.length;
    return prefs.map((p) => p + per);
  }
  return prefs.slice();
}

function alignOffset(
  available: number,
  used: number,
  align: "Left" | "Center" | "Right" | "Top" | "Middle" | "Bottom",
): number {
  if (align === "Center" || align === "Middle") return Math.max(0, (available - used) / 2);
  if (align === "Right" || align === "Bottom") return Math.max(0, available - used);
  return 0;
}

// Adapt a ScrollArea marker's props to the shape expected by the layout
// branches below. ScrollArea has no explicit VerticalLayout/HorizontalLayout
// component in the editor doc — only the marker. At export time the marker
// expands to a real layout container; here we synthesize equivalent props so
// the editor preview stacks children the same way.
function scrollAreaAsLayoutProps(slot: Slot, axis: "Vertical" | "Horizontal"): any {
  const sa = slot.components.find((c) => c.type === "ScrollArea");
  const p = (sa?.props ?? {}) as Record<string, unknown>;
  const pad = (p.padding as number) ?? 8;
  return {
    paddingTop: pad, paddingBottom: pad, paddingLeft: pad, paddingRight: pad,
    spacing: (p.spacing as number) ?? 4,
    horizontalAlign: axis === "Vertical" ? "Left" : "Left",
    verticalAlign:   "Top",
    forceExpandWidth:  axis === "Vertical",
    forceExpandHeight: axis === "Horizontal",
  };
}

export function layoutChildren(parent: Rect, slot: Slot, kind: LayoutKind): Rect[] | null {
  if (!kind) return null;
  if (slot.children.length === 0) return [];

  const sorted = [...slot.children].sort(
    (a, b) => getLayoutElement(a).orderOffset - getLayoutElement(b).orderOffset,
  );
  const isScrollArea = slot.components.some((c) => c.type === "ScrollArea");

  if (kind === "Vertical") {
    const p = isScrollArea
      ? scrollAreaAsLayoutProps(slot, "Vertical")
      : (getProps(slot, "VerticalLayout") as any);
    const innerW = parent.w - (p.paddingLeft + p.paddingRight);
    // For ScrollArea, leave the scroll axis unbounded so distribute() never
    // squishes children — the preview renders them in a real scrollable div.
    const innerH = isScrollArea
      ? 99999
      : parent.h - (p.paddingTop + p.paddingBottom);
    const totalSpacing = p.spacing * Math.max(0, sorted.length - 1);
    const heights = distribute(
      sorted.map((c) => preferredSize(getLayoutElement(c), "h")),
      sorted.map((c) => flexValue(getLayoutElement(c), "h")),
      innerH - totalSpacing,
      !!p.forceExpandHeight,
    );
    const usedHeight = heights.reduce((a, b) => a + b, 0) + totalSpacing;
    let y = p.paddingTop + alignOffset(innerH, usedHeight, p.verticalAlign);
    const result: Rect[] = new Array(slot.children.length);
    sorted.forEach((child, i) => {
      const h = heights[i];
      const le = getLayoutElement(child);
      const w = p.forceExpandWidth ? innerW : preferredSize(le, "w");
      const x = p.paddingLeft + alignOffset(innerW, w, p.horizontalAlign);
      const idx = slot.children.findIndex((c) => c.id === child.id);
      result[idx] = { x, y, w, h };
      y += h + p.spacing;
    });
    return result;
  }

  if (kind === "Horizontal") {
    const p = isScrollArea
      ? scrollAreaAsLayoutProps(slot, "Horizontal")
      : (getProps(slot, "HorizontalLayout") as any);
    // For ScrollArea, leave the scroll axis unbounded — same reasoning as Vertical above.
    const innerW = isScrollArea
      ? 99999
      : parent.w - (p.paddingLeft + p.paddingRight);
    const innerH = parent.h - (p.paddingTop + p.paddingBottom);
    const totalSpacing = p.spacing * Math.max(0, sorted.length - 1);
    const widths = distribute(
      sorted.map((c) => preferredSize(getLayoutElement(c), "w")),
      sorted.map((c) => flexValue(getLayoutElement(c), "w")),
      innerW - totalSpacing,
      !!p.forceExpandWidth,
    );
    const usedWidth = widths.reduce((a, b) => a + b, 0) + totalSpacing;
    let x = p.paddingLeft + alignOffset(innerW, usedWidth, p.horizontalAlign);
    const result: Rect[] = new Array(slot.children.length);
    sorted.forEach((child, i) => {
      const w = widths[i];
      const le = getLayoutElement(child);
      const h = p.forceExpandHeight ? innerH : preferredSize(le, "h");
      const y = p.paddingTop + alignOffset(innerH, h, p.verticalAlign);
      const idx = slot.children.findIndex((c) => c.id === child.id);
      result[idx] = { x, y, w, h };
      x += w + p.spacing;
    });
    return result;
  }

  if (kind === "Grid") {
    const p = getProps(slot, "GridLayout") as any;
    const innerW = parent.w - (p.paddingLeft + p.paddingRight);
    const innerH = parent.h - (p.paddingTop + p.paddingBottom);
    const cellsPerRow = Math.max(
      1,
      Math.floor((innerW + p.spacingX) / (p.cellSizeX + p.spacingX)),
    );
    const rows = Math.ceil(sorted.length / cellsPerRow);
    const usedW = cellsPerRow * p.cellSizeX + (cellsPerRow - 1) * p.spacingX;
    const usedH = rows * p.cellSizeY + (rows - 1) * p.spacingY;
    const startX = p.paddingLeft + alignOffset(innerW, usedW, p.horizontalAlign);
    const startY = p.paddingTop + alignOffset(innerH, usedH, p.verticalAlign);
    const result: Rect[] = new Array(slot.children.length);
    sorted.forEach((child, i) => {
      const col = i % cellsPerRow;
      const row = Math.floor(i / cellsPerRow);
      const x = startX + col * (p.cellSizeX + p.spacingX);
      const y = startY + row * (p.cellSizeY + p.spacingY);
      const idx = slot.children.findIndex((c) => c.id === child.id);
      result[idx] = { x, y, w: p.cellSizeX, h: p.cellSizeY };
    });
    return result;
  }

  return null;
}
