// Single source of truth for "does this Image carry a real raster sprite?" —
// a custom uploaded image, a bundled system icon, or an http(s) sprite URL.
//
// This predicate decides, across three call sites that had each reimplemented it
// (and drifted): whether the preview should skip painting the tint as a solid box
// (renderSlot), whether theming should leave the Image alone instead of re-tinting
// it (theme.ts), and whether an Image is a real graphic vs. an "empty" tinted
// leaf (warnings.ts). Keep them in lockstep by importing this — adding a new
// sprite flag is then a one-line change here.
//
// NOTE: `useImagePlaceholder` (the transparent "drop image here" hatch) is NOT a
// sprite and is deliberately excluded. Callers that treat the placeholder as
// non-empty (warnings) or as no-solid-box (renderSlot) OR it in explicitly.

export function imageHasSprite(props: Record<string, unknown>): boolean {
  return (
    !!props.customImageHash ||
    !!props.useHelpIcon ||
    !!props.useCloseIcon ||
    !!props.useCheckIcon ||
    !!props.useBackspaceIcon ||
    !!props.useSpinnerIcon ||
    !!props.useLogoSprite ||
    (typeof props.spriteUrl === "string" && /^https?:\/\//.test(props.spriteUrl))
  );
}
