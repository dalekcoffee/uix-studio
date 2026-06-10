// Bakes a background image into a canvas-aspect, fully-opaque PNG in-browser so
// the export bundles a pre-correct image and Resonite just stretches it (no
// stencil Mask, no FillRect UV tricks — Resonite can't crop a sprite to a rect).
//   • "full" → COVER: scale to fill the canvas aspect, center, crop the excess.
//   • "fit"  → CONTAIN: letterbox the image centered on an opaque theme-colored
//              field (so the bars are solid, not see-through).
// Stretch needs no bake (it intentionally fills/deforms the original).

export type BakeMode = "fit" | "full" | "stretch";
type Color = { r: number; g: number; b: number; a: number };

// Cap the baked PNG's long edge so a huge source (e.g. 4K) doesn't bloat the
// .resonitepackage — a panel backdrop doesn't need more than this.
const MAX_EDGE = 2048;

// Trace a rounded-rect path on a 2D context (shared by the alpha-mask bake and
// the wallpaper corner-clip below). Uses the native roundRect when available,
// otherwise the equivalent arcTo path.
function traceRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }
  ctx.closePath();
}

function colorToCss(c: Color): string {
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  // Always opaque — the whole point of the fit bake is a solid backing.
  return `rgb(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)})`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface BakedImage {
  bytes: Uint8Array;
  hash: string;
  width: number;
  height: number;
}

// Bake a white rounded-rectangle on transparent — an alpha MASK. Used as the
// texture for the back-side credits backdrop quad so its corners round (a flat
// 3D quad can't round itself, and MeshRenderer has no 9-slice). Baked at the
// quad's aspect so the corners aren't distorted; the material's dark TintColor
// multiplies the white interior to the scrim color.
export async function bakeRoundedRectMask(
  w: number,
  h: number,
  radius: number,
): Promise<BakedImage> {
  const outW = Math.max(2, Math.round(w));
  const outH = Math.max(2, Math.round(h));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context to bake the credits backdrop.");
  const r = Math.max(0, Math.min(radius, Math.min(outW, outH) / 2));
  ctx.fillStyle = "#ffffff";
  traceRoundRect(ctx, 0, 0, outW, outH, r);
  ctx.fill();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode credits backdrop PNG."))), "image/png"),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes);
  return { bytes, hash, width: outW, height: outH };
}

export async function bakeBackgroundImage(
  srcBytes: Uint8Array,
  mode: BakeMode,
  target: { w: number; h: number },
  letterboxColor: Color,
  opts?: {
    focus?: { x: number; y: number };
    zoom?: number;
    // Panel corner radius (0-100, same scale as Image.cornerRadius). When > 0
    // the baked PNG's corners are clipped to transparent so a custom wallpaper
    // honors the panel's rounded corners instead of overriding them with a
    // square fill. 0 → square (unchanged).
    cornerRadius?: number;
  },
): Promise<BakedImage> {
  const bitmap = await createImageBitmap(new Blob([srcBytes as BufferSource]));

  // Output canvas keeps the panel's aspect, capped to MAX_EDGE on the long side.
  let outW = Math.max(1, Math.round(target.w));
  let outH = Math.max(1, Math.round(target.h));
  const longEdge = Math.max(outW, outH);
  if (longEdge > MAX_EDGE) {
    const k = MAX_EDGE / longEdge;
    outW = Math.max(1, Math.round(outW * k));
    outH = Math.max(1, Math.round(outH * k));
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context to bake the background image.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const iw = bitmap.width;
  const ih = bitmap.height;

  if (mode === "full") {
    // Cover with optional pan (focus) + zoom. coverScale fills the output; zoom
    // scales further in. The visible source sub-rect (sw×sh) shrinks with the
    // effective scale, and focus (0..1) slides it across the croppable range.
    const fx = Math.max(0, Math.min(1, opts?.focus?.x ?? 0.5));
    const fy = Math.max(0, Math.min(1, opts?.focus?.y ?? 0.5));
    const zoom = Math.max(1, Math.min(4, opts?.zoom ?? 1));
    const coverScale = Math.max(outW / iw, outH / ih);
    const eff = coverScale * zoom;
    const sw = Math.min(iw, outW / eff);
    const sh = Math.min(ih, outH / eff);
    const sx = fx * (iw - sw);
    const sy = fy * (ih - sh);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
  } else if (mode === "stretch") {
    // Fill the whole output, deforming to the panel aspect (the user opted into
    // stretch). Baked here only so the corner-clip below can round it.
    ctx.drawImage(bitmap, 0, 0, iw, ih, 0, 0, outW, outH);
  } else {
    // Contain on an opaque theme-colored field.
    ctx.fillStyle = colorToCss(letterboxColor);
    ctx.fillRect(0, 0, outW, outH);
    const scale = Math.min(outW / iw, outH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(bitmap, 0, 0, iw, ih, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
  }
  bitmap.close?.();

  // Round the corners to transparent so the wallpaper matches the panel's
  // rounded-corner shape (a square fill would otherwise override it). Clipping
  // here — after the image is drawn — keeps the crop/letterbox math untouched.
  const cr = Math.max(0, Math.min(100, opts?.cornerRadius ?? 0));
  if (cr > 0) {
    // The panel's backing rounds via a pill SpriteProvider with Borders=0.5 and
    // FixedSize = (cr/100)·min. Resonite renders the corner at Borders×FixedSize
    // — i.e. HALF the FixedSize on screen — so the visible panel radius is
    // (cr/100)·min/2, the same proportional radius the editor preview draws.
    // Bake the wallpaper at exactly that radius so it stays flush with the
    // backing's sprite corner (over-rounding exposed the sharper backing as a
    // dark crescent). The Background's own Image is also forced to a full pill
    // at export so it can never poke through even if this is slightly off —
    // see exportBundle.
    const half = Math.min(outW, outH) / 2;
    // cr=100 → the backing uses NineSliceSizing="RectHeight" (full pill, radius =
    // half the short side), not the FixedSize path; mirror that at the top end.
    const rPx = cr >= 100 ? half : (cr / 100) * half;
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#ffffff";
    traceRoundRect(ctx, 0, 0, outW, outH, rPx);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode baked background PNG."))), "image/png"),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes);
  return { bytes, hash, width: outW, height: outH };
}
