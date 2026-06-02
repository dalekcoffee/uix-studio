export function colorToCss(c: { r: number; g: number; b: number; a: number }): string {
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  const to255 = (v: number) => Math.round(cl(v) * 255);
  // Clamp alpha and default a non-finite/missing value to opaque — an out-of-range
  // or NaN alpha (e.g. from a malformed prop) yields an invalid rgba() string the
  // browser silently drops, which would render the element fully opaque anyway.
  const a = Number.isFinite(c.a) ? cl(c.a) : 1;
  return `rgba(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)}, ${a})`;
}
