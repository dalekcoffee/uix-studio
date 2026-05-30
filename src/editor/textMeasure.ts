// Approximate text-width measurement for snap layout decisions (how much room a
// label/control's content actually needs, so dead space can be trimmed). Uses a
// single cached offscreen canvas 2d context. This is a layout heuristic for the
// editor — it doesn't need to match Resonite's font metrics exactly; callers add
// a little breathing room (measureLabelWidth) to absorb the difference.

// Matches the editor's body font (src/index.css) so measured widths track what
// the preview renders.
const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

let _ctx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (_ctx) return _ctx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  _ctx = canvas.getContext("2d");
  return _ctx;
}

// Raw measured width (px) of `text` at `fontPx`. Falls back to a coarse
// per-character estimate if no canvas is available (SSR / tests).
export function measureTextWidth(text: string, fontPx: number, family = FONT_FAMILY): number {
  const t = text ?? "";
  if (!t) return 0;
  const c = ctx();
  if (!c) return t.length * fontPx * 0.55; // coarse fallback
  c.font = `${fontPx}px ${family}`;
  return c.measureText(t).width;
}

// A label's usable minimum width: the measured text plus a small pad so it never
// sits flush against its container edge and survives minor font-metric drift
// between the editor and Resonite.
export function measureLabelWidth(text: string, fontPx: number): number {
  const w = measureTextWidth(text, fontPx);
  return w > 0 ? Math.ceil(w + 8) : 0;
}
