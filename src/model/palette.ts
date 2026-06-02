import { UIX_COMPONENT_TYPES, type UixComponentType } from "./types";

// Single source of truth for the "add element" palette shared by the toolbar
// + Add menu (AddMenu.tsx) and the right-click ContextMenu. Previously each
// kept its own hardcoded group list and they drifted — the context menu was
// missing every widget (Slider, Dropdown, Radio, ScrollArea, …) the model
// already supports. Edit here and both menus update together.

// A palette entry is usually a real component type, but a few entries are
// "widget-only" pseudo-types: they have no single UixComponent counterpart and
// only exist as a multi-slot subtree built by widgets.ts (e.g. the Loading
// Spinner, which is an Image+RectTransform the exporter expands procedurally).
export type WidgetOnlyItem = "Spinner";
export type PaletteItem = UixComponentType | WidgetOnlyItem;

// Widget-only palette items, kept out of UIX_COMPONENT_TYPES so they never leak
// into the low-level component lists (Inspector, ComponentPalette) — they're
// only meaningful as a whole subtree added from the Add/context menus.
export const WIDGET_ONLY_ITEMS: ReadonlySet<PaletteItem> = new Set<PaletteItem>([
  "Spinner",
]);

// True if a palette item is something the model can actually add — either a
// declared component type or a known widget-only pseudo-type. The Add/context
// menus filter their groups through this so stale entries can't render.
export function isKnownPaletteItem(t: PaletteItem): boolean {
  return WIDGET_ONLY_ITEMS.has(t) || UIX_COMPONENT_TYPES.includes(t as UixComponentType);
}

export interface PaletteGroup {
  label: string;
  hint?: string;
  types: ReadonlyArray<PaletteItem>;
}

export const PALETTE_GROUPS: ReadonlyArray<PaletteGroup> = [
  {
    label: "Visuals",
    // Spinner = a procedural loading indicator (Image + useSpinnerIcon). The
    // exporter expands it into an animated OutlinedArc and auto-adds a boolean
    // "📚 Value" slot that shows/hides it without shifting surrounding layout.
    types: ["Image", "Text", "Spinner"],
  },
  {
    // Composite controls. Adding one of these builds a full multi-slot widget
    // subtree (see widgets.ts buildWidget) — not a bare marker component.
    label: "Controls",
    types: [
      "Checkbox",
      "Toggle",
      "Slider",
      "ProgressBar",
      "Radio",
      "RadioGroup",
      "Dropdown",
      "ColorPicker",
      // Input field (TextField) — typed text entry; pick string/float/int from
      // its inspector. Reference field stays separate.
      "TextField",
      "ScrollArea",
      "ReferenceField",
    ],
  },
  {
    // Knob is intentionally omitted — only meaningful as a Toggle's sliding
    // knob child, set up automatically by the Toggle widget.
    label: "Interaction",
    types: ["Button", "Hyperlink", "Popup"],
  },
  {
    label: "Layout",
    // Spacer = an empty invisible row that reserves vertical space; handy for
    // adding gaps between rows when arranging in snap mode.
    // Tabs = a multi-page container (one page visible at a time) built as a full
    // widget subtree by widgets.ts buildTabs.
    types: ["Tabs", "Spacer", "VerticalLayout", "HorizontalLayout", "GridLayout"],
  },
];

// User-facing display names that differ from the internal component type.
// The underlying type stays "TextField" everywhere in the model/exporter; only
// the label the user sees changes.
export const COMPONENT_LABELS: Partial<Record<PaletteItem, string>> = {
  TextField: "Input Field",
  Spinner: "Spinner",
  ColorPicker: "Color Picker",
};

export function componentLabel(t: PaletteItem): string {
  return COMPONENT_LABELS[t] ?? t;
}

// Plumbing components — surfaced in a secondary "System" section so the
// common building blocks stay at the top of the menu.
export const SYSTEM_TYPES: ReadonlySet<UixComponentType> = new Set([
  "RectTransform",
  "LayoutElement",
  "BoxCollider",
  "Mask",
  "IgnoreLayout",
]);

// System types, filtered to those the model actually declares, preserving the
// canonical UIX_COMPONENT_TYPES order.
export const SYSTEM_TYPE_LIST: ReadonlyArray<UixComponentType> =
  UIX_COMPONENT_TYPES.filter((t) => SYSTEM_TYPES.has(t));
