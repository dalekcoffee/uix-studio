// Shared padding constants + resolver for the Canvas "content padding" system.
//
// Canvas.contentPadding is the panel-level side margin for top-level body
// content. Nested container types (Vertical/Horizontal/Grid Layout, ScrollArea,
// Tabs) DEFAULT their own inner padding to HALF the canvas padding — unless the
// user sets an explicit value. The "unset/inherit" sentinel is -1 (mirrors the
// LayoutElement min/preferred -1 convention). `resolvePad` collapses an unset
// value to the inherited half; an explicit (>= 0) value wins.

// Default Canvas.contentPadding. Matches the historical hardcoded 16px margin
// every preset was authored against, so the default is visually a no-op.
export const DEFAULT_CONTENT_PADDING = 16;

// Width the export reserves on the scrollbar side of a ScrollArea's content so
// items don't run under the bar (= track 12 + thumbPad 2 + 6). Shared so the
// editor preview reserves exactly the same gutter the exporter does.
export const SCROLLBAR_GUTTER = 20;

// An unset container padding (undefined, or the -1 sentinel) inherits half the
// canvas padding; an explicit >= 0 value is used verbatim.
export function resolvePad(value: number | undefined | null, canvasPad: number): number {
  return value === undefined || value === null || value < 0
    ? Math.round(canvasPad / 2)
    : value;
}
