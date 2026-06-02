import { v4 as uuid } from "uuid";
import type { Slot } from "./types";
import { findSlot, findParent } from "./operations";

// ─────────────────────────────────────────────────────────────────────────────
// Tabs editing helpers. The model treats a Tabs group as: a host slot (carries
// the Tabs marker + a shared selection index) → a "Tab Bar" child (a layout of
// TabButton slots) → N TabPage slots. Index is POSITIONAL: tab i = the i-th
// TabButton in the bar ↔ the i-th TabPage among the host's children. These
// helpers + the store's tab actions are what the custom Tabs Inspector and the
// click-to-switch canvas routing build on, so users edit tabs intuitively
// instead of poking at the underlying Button/Image components.
// ─────────────────────────────────────────────────────────────────────────────

type RGBA = { r: number; g: number; b: number; a: number };
const DEFAULT_ACTIVE: RGBA = { r: 0.16, g: 0.18, b: 0.23, a: 1 };
const DEFAULT_INACTIVE: RGBA = { r: 0.11, g: 0.12, b: 0.15, a: 1 };

const has = (slot: Slot, t: string) => slot.components.some((c) => c.type === t);
export const isTabsHost = (s: Slot) => has(s, "Tabs");
export const isTabPage = (s: Slot) => has(s, "TabPage");
export const isTabButton = (s: Slot) => has(s, "TabButton");

export function tabBarOf(host: Slot): Slot | undefined {
  return host.children.find((ch) => ch.children.some(isTabButton));
}
export function tabButtonsOf(host: Slot): Slot[] {
  return tabBarOf(host)?.children.filter(isTabButton) ?? [];
}
export function tabPagesOf(host: Slot): Slot[] {
  return host.children.filter(isTabPage);
}
function tabsProps(host: Slot): Record<string, unknown> {
  return (host.components.find((c) => c.type === "Tabs")?.props ?? {}) as Record<string, unknown>;
}
export function activeTabIndex(host: Slot): number {
  const n = tabPagesOf(host).length;
  const v = ((tabsProps(host).activeTab as number) ?? 0) | 0;
  return Math.max(0, Math.min(Math.max(0, n - 1), v));
}
export function activeTabPageId(host: Slot): string | null {
  return tabPagesOf(host)[activeTabIndex(host)]?.id ?? null;
}

// True when `slot` is a TabPage that is NOT the active one of its host. The snap
// engine uses this to treat ONLY the active page as a nested container — so the
// purple group grabber + blue element grips belong to the visible tab and the
// hidden tabs contribute no grabbers (per-tab scoping).
export function isInactiveTabPage(root: Slot, slot: Slot): boolean {
  if (!isTabPage(slot)) return false;
  const host = findParent(root, slot.id);
  if (!host || !isTabsHost(host)) return false;
  const idx = tabPagesOf(host).findIndex((p) => p.id === slot.id);
  return idx >= 0 && idx !== activeTabIndex(host);
}

export function findTabsHost(root: Slot, slotId: string): Slot | null {
  let cur: Slot | null = findSlot(root, slotId);
  while (cur) {
    if (isTabsHost(cur)) return cur;
    cur = findParent(root, cur.id);
  }
  return null;
}

function labelChildOf(button: Slot): Slot | undefined {
  return button.children.find((ch) => ch.components.some((c) => c.type === "Text"));
}
export function tabButtonLabel(button: Slot): string {
  const t = labelChildOf(button)?.components.find((c) => c.type === "Text");
  return ((t?.props as { content?: string })?.content ?? "") as string;
}

export interface TabInfo {
  buttonId: string;
  pageId: string | null;
  label: string;
}
export function getTabs(host: Slot): TabInfo[] {
  const buttons = tabButtonsOf(host);
  const pages = tabPagesOf(host);
  return buttons.map((b, i) => ({ buttonId: b.id, pageId: pages[i]?.id ?? null, label: tabButtonLabel(b) }));
}

// Canvas-click resolution: if the clicked slot sits inside a TabButton, return
// which tab it is (so the click switches tabs instead of selecting the raw
// button). Clicks inside a page's CONTENT return null (those select normally).
export function resolveTabClick(root: Slot, slotId: string): { hostId: string; index: number } | null {
  let cur: Slot | null = findSlot(root, slotId);
  let btn: Slot | null = null;
  while (cur) {
    if (isTabButton(cur)) { btn = cur; break; }
    if (isTabPage(cur)) return null; // inside page content — not a tab click
    cur = findParent(root, cur.id);
  }
  if (!btn) return null;
  const host = findTabsHost(root, btn.id);
  if (!host) return null;
  const index = tabButtonsOf(host).findIndex((b) => b.id === btn!.id);
  return index >= 0 ? { hostId: host.id, index } : null;
}

// Selecting one of these structural parts (the host, the bar, a tab button or
// its label, a page) should show the custom Tabs panel rather than that slot's
// raw component fields. Returns the owning host, or null for page CONTENT (which
// is edited normally).
export function tabStructuralHost(root: Slot, slotId: string): Slot | null {
  const slot = findSlot(root, slotId);
  if (!slot) return null;
  if (isTabsHost(slot)) return slot;
  if (isTabPage(slot) || isTabButton(slot)) return findTabsHost(root, slotId);
  if (slot.children.some(isTabButton)) return findTabsHost(root, slotId); // the Tab Bar
  const parent = findParent(root, slotId);
  if (parent && isTabButton(parent)) return findTabsHost(root, parent.id); // a tab's Label child
  return null;
}

// ── Tree mutations (return a fresh root; never mutate the argument) ───────────

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function regenIds(s: Slot): Slot {
  s.id = uuid();
  for (const ch of s.children) regenIds(ch);
  return s;
}
function setOrderOffset(slot: Slot, i: number): void {
  const le = slot.components.find((c) => c.type === "LayoutElement");
  if (le) le.props = { ...le.props, orderOffset: i };
}
function setButtonLabelText(button: Slot, text: string): void {
  const t = labelChildOf(button)?.components.find((c) => c.type === "Text");
  if (t) t.props = { ...t.props, content: text };
}

// Set the active tab AND re-tint the buttons so the editor preview highlights
// the selected tab (the in-game highlight is driven separately at export; this
// keeps the authored/initial tints consistent with activeTab too).
export function applyActiveTab(root: Slot, hostId: string, index: number): Slot {
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host) return root;
  const tabs = host.components.find((c) => c.type === "Tabs");
  if (!tabs) return root;
  const pages = tabPagesOf(host);
  const idx = Math.max(0, Math.min(Math.max(0, pages.length - 1), index | 0));
  tabs.props = { ...tabs.props, activeTab: idx };
  const active = (tabs.props.activeColor as RGBA) ?? DEFAULT_ACTIVE;
  const inactive = (tabs.props.inactiveColor as RGBA) ?? DEFAULT_INACTIVE;
  tabButtonsOf(host).forEach((b, i) => {
    const tint = i === idx ? active : inactive;
    const img = b.components.find((c) => c.type === "Image");
    if (img) img.props = { ...img.props, tint };
    const btn = b.components.find((c) => c.type === "Button");
    if (btn) btn.props = { ...btn.props, normalColor: tint };
  });
  return r;
}

export function setTabLabel(root: Slot, hostId: string, index: number, text: string): Slot {
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host) return root;
  const btn = tabButtonsOf(host)[index];
  if (!btn) return root;
  setButtonLabelText(btn, text);
  return r;
}

const DEFAULT_PAGE: RGBA = DEFAULT_ACTIVE;
const DEFAULT_FRAME: RGBA = { r: 0.09, g: 0.10, b: 0.13, a: 1 };
const DEFAULT_LABEL: RGBA = { r: 0.95, g: 0.95, b: 0.95, a: 1 };

// Re-apply every Tabs color prop (active / inactive / page / frame / label) onto
// the actual Image / Button / Text components so an Appearance edit is reflected
// LIVE in the editor preview — and matches what the exporter emits (which reads
// the same props). Superset of applyActiveTab: also paints the frame, the page
// surfaces, and each tab label's text color. Active button uses activeColor;
// the rest use inactiveColor.
export function retintTabs(root: Slot, hostId: string): Slot {
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host || !isTabsHost(host)) return root;
  const tp = tabsProps(host);
  const active = (tp.activeColor as RGBA) ?? DEFAULT_ACTIVE;
  const inactive = (tp.inactiveColor as RGBA) ?? DEFAULT_INACTIVE;
  const page = (tp.pageColor as RGBA) ?? DEFAULT_PAGE;
  const frame = (tp.frameColor as RGBA) ?? DEFAULT_FRAME;
  const label = (tp.labelColor as RGBA) ?? DEFAULT_LABEL;
  const idx = activeTabIndex(host);
  // Frame Image lives on the host slot itself.
  const frameImg = host.components.find((c) => c.type === "Image");
  if (frameImg) frameImg.props = { ...frameImg.props, tint: frame };
  // Each page's content-panel Image.
  for (const pg of tabPagesOf(host)) {
    const img = pg.components.find((c) => c.type === "Image");
    if (img) img.props = { ...img.props, tint: page };
  }
  // Each tab button: Image tint + Button base color by selection, label text color.
  tabButtonsOf(host).forEach((b, i) => {
    const tint = i === idx ? active : inactive;
    const img = b.components.find((c) => c.type === "Image");
    if (img) img.props = { ...img.props, tint };
    const btn = b.components.find((c) => c.type === "Button");
    if (btn) btn.props = { ...btn.props, normalColor: tint };
    const t = labelChildOf(b)?.components.find((c) => c.type === "Text");
    if (t) t.props = { ...t.props, color: label };
  });
  return r;
}

function placeholderPage(label: string): Slot {
  return {
    id: uuid(), name: "Label", locked: false,
    components: [
      { type: "RectTransform", props: { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, offsetMin: { x: 12, y: 12 }, offsetMax: { x: -12, y: -12 }, pivot: { x: 0.5, y: 0.5 } } },
      { type: "Text", props: { content: `${label} content`, size: 16, color: { r: 0.95, g: 0.95, b: 0.95, a: 1 }, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false } },
    ],
    children: [],
  };
}

// Add a tab: clone the last button + page (preserving the group's styling/
// geometry), relabel, give the new page a fresh placeholder, renumber, and
// make the new tab active. Returns the new root + the new tab index.
export function addTab(root: Slot, hostId: string): { root: Slot; index: number } {
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host) return { root, index: -1 };
  const bar = tabBarOf(host);
  const buttons = tabButtonsOf(host);
  const pages = tabPagesOf(host);
  if (!bar || buttons.length === 0 || pages.length === 0) return { root, index: -1 };
  const newIdx = buttons.length;
  const newBtn = regenIds(clone(buttons[buttons.length - 1]));
  newBtn.name = `Tab ${newIdx + 1}`;
  setButtonLabelText(newBtn, `Tab ${newIdx + 1}`);
  bar.children.push(newBtn);
  const newPage = regenIds(clone(pages[pages.length - 1]));
  newPage.name = `Page ${newIdx + 1}`;
  newPage.children = [placeholderPage(`Tab ${newIdx + 1}`)];
  host.children.push(newPage);
  tabButtonsOf(host).forEach((b, i) => setOrderOffset(b, i));
  return { root: applyActiveTab(r, hostId, newIdx), index: newIdx };
}

// Remove tab `index` (its button + page). Keeps at least one tab. Clamps the
// active index sensibly. Returns the new root + the resulting active index.
export function removeTab(root: Slot, hostId: string, index: number): { root: Slot; active: number } {
  const host0 = findTabsHost(root, hostId);
  const oldActive = host0 ? activeTabIndex(host0) : 0;
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host) return { root, active: oldActive };
  const bar = tabBarOf(host);
  const buttons = tabButtonsOf(host);
  const pages = tabPagesOf(host);
  if (!bar || buttons.length <= 1) return { root, active: oldActive };
  const btn = buttons[index];
  const page = pages[index];
  if (btn) bar.children = bar.children.filter((c) => c.id !== btn.id);
  if (page) host.children = host.children.filter((c) => c.id !== page.id);
  tabButtonsOf(host).forEach((b, i) => setOrderOffset(b, i));
  const newCount = tabPagesOf(host).length;
  let active = oldActive;
  if (index < oldActive) active = oldActive - 1;
  active = Math.max(0, Math.min(newCount - 1, active));
  return { root: applyActiveTab(r, hostId, active), active };
}

// ── Tab bar position (top / bottom / left / right) ───────────────────────────
// top/bottom ⇒ a horizontal strip (HorizontalLayout); left/right ⇒ a vertical
// strip (VerticalLayout). Re-lays the bar + every page RectTransform and swaps
// the bar's layout component. The exporter serializes whatever RTs result, so no
// export-side change is needed.

export type TabPosition = "top" | "bottom" | "left" | "right";

const TAB_EDGE = 6;     // page inset from the frame edges (frame = thin border)
const TAB_OVERLAP = 8;  // page tucks under the bar this much (folder-tab merge)
const H_BAR = 40;       // default strip thickness when horizontal (height)
const V_BAR = 96;       // …when vertical (width — wide enough for horizontal labels)

type RT = { anchorMin: { x: number; y: number }; anchorMax: { x: number; y: number }; offsetMin: { x: number; y: number }; offsetMax: { x: number; y: number } };

function barRT(pos: TabPosition, T: number): RT {
  switch (pos) {
    case "top":    return { anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 }, offsetMin: { x: 0, y: -T }, offsetMax: { x: 0, y: 0 } };
    case "bottom": return { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 0 }, offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: T } };
    case "left":   return { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0, y: 1 }, offsetMin: { x: 0, y: 0 }, offsetMax: { x: T, y: 0 } };
    case "right":  return { anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 }, offsetMin: { x: -T, y: 0 }, offsetMax: { x: 0, y: 0 } };
  }
}
function pageRT(pos: TabPosition, T: number): RT {
  const inset = T - TAB_OVERLAP;
  const base = { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 } };
  switch (pos) {
    case "top":    return { ...base, offsetMin: { x: TAB_EDGE, y: TAB_EDGE }, offsetMax: { x: -TAB_EDGE, y: -inset } };
    case "bottom": return { ...base, offsetMin: { x: TAB_EDGE, y: inset }, offsetMax: { x: -TAB_EDGE, y: -TAB_EDGE } };
    case "left":   return { ...base, offsetMin: { x: inset, y: TAB_EDGE }, offsetMax: { x: -TAB_EDGE, y: -TAB_EDGE } };
    case "right":  return { ...base, offsetMin: { x: TAB_EDGE, y: TAB_EDGE }, offsetMax: { x: -inset, y: -TAB_EDGE } };
  }
}
function setRT(slot: Slot, rt: RT): void {
  const rtc = slot.components.find((c) => c.type === "RectTransform");
  if (rtc) rtc.props = { ...rtc.props, ...rt, pivot: { x: 0.5, y: 0.5 } };
  else slot.components.unshift({ type: "RectTransform", props: { ...rt, pivot: { x: 0.5, y: 0.5 } } });
}
function setBarLayout(bar: Slot, pos: TabPosition, spacing: number): void {
  bar.components = bar.components.filter((c) => c.type !== "HorizontalLayout" && c.type !== "VerticalLayout");
  const common = { spacing, forceExpandWidth: true, forceExpandHeight: true };
  // The page tucks over the bar's edge nearest the page by TAB_OVERLAP, so that
  // strip of the bar is hidden. Pad that COVERED side by the overlap and center
  // the buttons so the labels sit in the middle of the *visible* tab area (not
  // jammed against the tucked-under edge). The opposite side gets a small lead.
  const O = TAB_OVERLAP;
  const lead = 4;
  if (pos === "top" || pos === "bottom") {
    bar.components.push({ type: "HorizontalLayout", props: {
      ...common,
      paddingTop: pos === "bottom" ? O : lead,    // bottom tabs: top edge is covered
      paddingBottom: pos === "top" ? O : lead,     // top tabs: bottom edge is covered
      paddingLeft: 6, paddingRight: 6,
      horizontalAlign: "Center", verticalAlign: "Middle",
    } });
  } else {
    bar.components.push({ type: "VerticalLayout", props: {
      ...common,
      // A vertical strip must NOT force-expand height — otherwise N tabs each
      // grab 1/N of the whole column and become giant. Tabs keep a fixed
      // preferredHeight (set in applyTabButtonSizing) and stack from the top.
      forceExpandHeight: false,
      paddingTop: 6, paddingBottom: 6,
      // The COVERED side gets ZERO padding so each tab runs flush to the bar edge
      // and TUCKS under the page (which overlaps that edge by TAB_OVERLAP) — the
      // tab's inner edge disappears behind the page instead of floating beside it
      // with a visible sharp edge. The label is re-centered into the *visible*
      // area by applyTabLabelInset. Top/bottom tabs keep their existing inset.
      paddingLeft: pos === "right" ? 0 : lead,      // right tabs: left edge covered → tuck
      paddingRight: pos === "left" ? 0 : lead,      // left tabs: right edge covered → tuck
      horizontalAlign: "Center", verticalAlign: "Top",
    } });
  }
}

// A left/right tab now extends UNDER the page on its inner edge (see setBarLayout),
// so its centered label would drift toward the page. Inset each tab's Label child
// off the covered side by TAB_OVERLAP to keep the text centered in the *visible*
// tab area. Horizontal tabs aren't tucked, so their labels reset to fill.
function applyTabLabelInset(host: Slot, pos: TabPosition): void {
  const O = TAB_OVERLAP;
  // offsets from the button's fill rect, by which the label is pulled off the
  // covered (page-facing) edge.
  const offMin = { x: pos === "right" ? O : 0, y: 0 };
  const offMax = { x: pos === "left" ? -O : 0, y: 0 };
  for (const b of tabButtonsOf(host)) {
    const label = b.children.find((ch) => ch.components.some((c) => c.type === "Text"));
    const rt = label?.components.find((c) => c.type === "RectTransform");
    if (!rt) continue;
    rt.props = {
      ...rt.props,
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: offMin, offsetMax: offMax, pivot: { x: 0.5, y: 0.5 },
    };
  }
}

// The button thickness used when the strip is vertical (left/right). Horizontal
// tabs flex to share the bar width; vertical tabs need an explicit height so the
// VerticalLayout (forceExpandHeight off) stacks them compactly instead of
// squishing/stretching.
const V_TAB_H = 34;

// Size every tab button's LayoutElement for the strip orientation:
//   horizontal — flex to share the bar WIDTH, expand to the bar height.
//   vertical   — flex to share the bar WIDTH, fixed preferredHeight (no vertical
//                flex) so the stack is compact.
function applyTabButtonSizing(host: Slot, horizontal: boolean): void {
  for (const b of tabButtonsOf(host)) {
    const le = b.components.find((c) => c.type === "LayoutElement");
    if (!le) continue;
    le.props = horizontal
      ? { ...le.props, flexibleWidth: 1, flexibleHeight: 1, preferredWidth: -1, preferredHeight: -1 }
      : { ...le.props, flexibleWidth: 1, flexibleHeight: -1, preferredWidth: -1, preferredHeight: V_TAB_H };
  }
}

export function setTabsPosition(root: Slot, hostId: string, position: TabPosition): Slot {
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host || !isTabsHost(host)) return root;
  const tabs = host.components.find((c) => c.type === "Tabs");
  const bar = tabBarOf(host);
  if (!tabs || !bar) return root;
  const horizontal = position === "top" || position === "bottom";
  const wasHorizontal = ((tabs.props.orientation as string) ?? "Horizontal") === "Horizontal";
  const spacing = (tabs.props.tabSpacing as number) ?? 3;
  // Keep the user's thickness when staying in the same orientation class; reset
  // to a sensible default when flipping horizontal↔vertical.
  let T = (tabs.props.tabBarSize as number) ?? (horizontal ? H_BAR : V_BAR);
  if (horizontal !== wasHorizontal) T = horizontal ? H_BAR : V_BAR;

  setRT(bar, barRT(position, T));
  setBarLayout(bar, position, spacing);
  applyTabButtonSizing(host, horizontal);
  applyTabLabelInset(host, position);
  for (const page of tabPagesOf(host)) setRT(page, pageRT(position, T));

  tabs.props = { ...tabs.props, tabPosition: position, orientation: horizontal ? "Horizontal" : "Vertical", tabBarSize: T };
  return r;
}

// The host's current tab position (defaults "top").
export function tabsPositionOf(host: Slot): TabPosition {
  const p = (tabsProps(host).tabPosition as string) ?? "top";
  return (["top", "bottom", "left", "right"].includes(p) ? p : "top") as TabPosition;
}

function swapById(arr: Slot[], idA: string, idB: string): void {
  const a = arr.findIndex((s) => s.id === idA);
  const b = arr.findIndex((s) => s.id === idB);
  if (a < 0 || b < 0) return;
  const tmp = arr[a];
  arr[a] = arr[b];
  arr[b] = tmp;
}

// Move tab `index` by `dir` (-1 = left/up, +1 = right/down), swapping BOTH the
// button (in the bar) and the page (in the host) so they stay paired. Active
// follows the moved tab.
export function moveTab(root: Slot, hostId: string, index: number, dir: number): Slot {
  const host0 = findTabsHost(root, hostId);
  const oldActive = host0 ? activeTabIndex(host0) : 0;
  const j = index + dir;
  const r = clone(root);
  const host = findSlot(r, hostId);
  if (!host) return root;
  const bar = tabBarOf(host);
  const buttons = tabButtonsOf(host);
  const pages = tabPagesOf(host);
  // Guard BOTH ends: a stale `index` (out of range) would otherwise deref
  // buttons[index]/pages[index] = undefined and throw.
  if (!bar || index < 0 || index >= buttons.length || j < 0 || j >= buttons.length) return root;
  swapById(bar.children, buttons[index].id, buttons[j].id);
  swapById(host.children, pages[index].id, pages[j].id);
  tabButtonsOf(host).forEach((b, i) => setOrderOffset(b, i));
  let active = oldActive;
  if (oldActive === index) active = j;
  else if (oldActive === j) active = index;
  return applyActiveTab(r, hostId, active);
}
