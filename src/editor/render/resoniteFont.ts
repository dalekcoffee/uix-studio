// The preview must render in-world text using the SAME font Resonite uses,
// otherwise glyph widths diverge and the editor lies about wrapping: a label
// that fits on one line here (system Segoe UI) char-wraps mid-word in-game
// ("Dropdown" → "Dropdo wn") because Noto Sans renders wider. We ship the exact
// font binary Resonite loads (Noto Sans, hash 8c1dc004…) in the bundle, so we
// register that same file as a web font and paint every rendered slot's text
// with it — what you see in the editor is what you get in Resonite.

// font-family applied to rendered slot text (Viewport canvas, popup surface,
// drag layer). Falls back to system sans until the binary finishes loading.
export const RESONITE_FONT =
  '"Resonite Noto Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Same bundled hash exportBrson.ts ships inside the .resonitepackage. Served
// from publicDir ("Images") → "<base>fonts/<hash>". The file is extension-less;
// the FontFace API sniffs the format from the bytes, so no format() hint needed.
const NOTO_SANS_HASH =
  "8c1dc004996029f804283dd398ca2a05d4d33ebcba5c0d25ea13fd2026572279";

let started = false;

// Load once at app startup. Idempotent and best-effort — if the font fails to
// load (offline asset, etc.) the preview silently falls back to system sans.
export function loadResoniteFont(): void {
  if (started || typeof document === "undefined" || !("fonts" in document)) return;
  started = true;
  // Relative URL resolves against the document base URI, honoring Vite's "./"
  // base for both root and sub-path deployments without needing import.meta.env.
  const url = `fonts/${NOTO_SANS_HASH}`;
  const face = new FontFace("Resonite Noto Sans", `url("${url}")`, {
    display: "swap",
  });
  face
    .load()
    .then((loaded) => document.fonts.add(loaded))
    .catch(() => {
      /* fall back to system sans — wrapping preview just won't be exact */
    });
}
