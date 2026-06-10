import { useMemo } from "react";
import type { Slot, UixComponent } from "../../model/types";
import { computeChildRect, getRectTransform, type Rect } from "./rectTransform";
import { getLayoutKind, layoutChildren } from "./layoutEngine";
import { DEFAULT_CONTENT_PADDING, resolvePad } from "../../model/padding";
import { useStore } from "../../state/store";
import { useT } from "../../locale/useT";
import { colorToCss } from "./colorUtils";
import { useCustomImageUrl } from "../useCustomImageUrl";
import { isStructuralSlot } from "../../model/structural";
import { findBackgroundSlots } from "../../model/background";
import { controllingClickable, radioGroupHostOf } from "../../model/clickable";
import { resolveTabClick } from "../../model/tabs";
import { dragController } from "../dragController";
import { measureTextWidth } from "../textMeasure";
import { imageHasSprite } from "../../model/imageSprite";

// Panel corner radius in canvas px — what a `matchPanelCorners` Image (e.g. the
// header bar) rounds to: (Front Backing cornerRadius / 100) × min(canvasW,
// canvasH) / 2. This is the on-screen RADIUS — the export's
// _panelCornerFixedSizePx is twice this (corners render at half the
// SpriteProvider FixedSize), so the two stay in lockstep. Every rendered
// slot needs this, but it depends ONLY on the root, so memoize by root identity:
// the findBackgroundSlots tree-walk runs once per tree instead of once per slot
// on every unrelated store change (selection, viewport, drag…).
let _panelCornerCache: { root: Slot; val: number } | null = null;
function panelCornerPxOf(root: Slot): number {
  if (_panelCornerCache && _panelCornerCache.root === root) return _panelCornerCache.val;
  const canvas = root.components.find((c) => c.type === "Canvas");
  const cp = (canvas?.props ?? {}) as { sizeX?: number; sizeY?: number };
  const { frontBacking } = findBackgroundSlots(root);
  const cr = (frontBacking?.components.find((c) => c.type === "Image")?.props as
    | { cornerRadius?: number }
    | undefined)?.cornerRadius;
  const val =
    typeof cr !== "number" || cr <= 0
      ? 0
      : (Math.min(100, cr) / 100) * (Math.min(cp.sizeX ?? 800, cp.sizeY ?? 600) / 2);
  _panelCornerCache = { root, val };
  return val;
}

// Shared easing for graceful snap-mode reflow. Used both by the blocks (here)
// and the DragLayer overlay (selection box / handles / chip) so they glide in
// lockstep. ~150ms ease-out reads as "settling into place" without feeling
// laggy. Exported so the overlay can't drift out of sync.
const GLIDE_MS = 150;
const GLIDE_EASE = "cubic-bezier(0.22,0.61,0.36,1)";
export const DRAG_GLIDE =
  `left ${GLIDE_MS}ms ${GLIDE_EASE}, top ${GLIDE_MS}ms ${GLIDE_EASE}, ` +
  `width ${GLIDE_MS}ms ${GLIDE_EASE}, height ${GLIDE_MS}ms ${GLIDE_EASE}`;

interface Props {
  slot: Slot;
  rect: Rect;
  isRoot?: boolean;
}

function getComponent(slot: Slot, type: string): UixComponent | undefined {
  return slot.components.find((c) => c.type === type);
}

export function RenderedSlot({ slot, rect, isRoot }: Props) {
  const select = useStore((s) => s.select);
  const showOverlays = useStore((s) => s.showOverlays);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const locked = !!slot.locked;
  const isSelected = useStore((s) => s.selectedSlotId === slot.id);
  const liveDrag = useStore((s) => s.liveDrag);
  // Theme body-text color drives the image-placeholder overlay so the editor
  // matches the export (which tints the placeholder sprite with bodyTextColor).
  const themeBodyColor = useStore((s) => s.theme.bodyTextColor);
  // Theme background drives the solid letterbox fill behind a "fit" background
  // image (mirrors the opaque PNG the exporter bakes).
  const themeBackground = useStore((s) => s.theme.background);
  // Panel corner radius in canvas px — what an `matchPanelCorners` Image (e.g.
  // the header bar) rounds to: (Front Backing cornerRadius / 100) ×
  // min(canvasW, canvasH) / 2 — half the export's _panelCornerFixedSizePx.
  const panelCornerPx = useStore((s) => panelCornerPxOf(s.root));
  // Canvas.contentPadding — nested container padding left on the -1 "auto"
  // sentinel inherits half of this (resolved inside layoutChildren).
  const canvasPad = useStore((s) => {
    const cc = s.root.components.find((c) => c.type === "Canvas");
    return ((cc?.props as { contentPadding?: number } | undefined)?.contentPadding) ?? DEFAULT_CONTENT_PADDING;
  });
  const nonSelectable = isStructuralSlot(slot);

  const image = getComponent(slot, "Image");
  // Back-facing layer (Back Cover): `useBackMaterial` exports as Sidedness="Back",
  // so Resonite CULLS its front faces — it's invisible when viewed from the front.
  // The editor preview IS a front-view render, so this layer must paint nothing:
  // its tint/wallpaper belong to the back side, and its (often square) fill would
  // otherwise bleed through the rounded Front Backing's transparent corners,
  // making rounded panels read as square. The visible front face comes from the
  // Front Backing + Background siblings, which carry the panel's corner radius.
  const isBackFacing = !!image && (image.props as { useBackMaterial?: boolean }).useBackMaterial === true;
  const text = getComponent(slot, "Text");
  const textField = getComponent(slot, "TextField");
  const button = getComponent(slot, "Button");
  const mask = getComponent(slot, "Mask");
  const checkbox = getComponent(slot, "Checkbox");
  const toggle = getComponent(slot, "Toggle");
  const slider = getComponent(slot, "Slider");
  const progressBar = getComponent(slot, "ProgressBar");
  const dropdown = getComponent(slot, "Dropdown");
  const radio = getComponent(slot, "Radio");
  const referenceField = getComponent(slot, "ReferenceField");
  const scrollArea = getComponent(slot, "ScrollArea");
  const colorPicker = getComponent(slot, "ColorPicker");
  const waveform = getComponent(slot, "Waveform");
  const spacer = getComponent(slot, "Spacer");
  // Tabs host: show only the page at `activeTab`. The page index is positional
  // among the host's TabPage children (matching the exporter's per-page
  // ValueEqualityDriver index), so inactive pages — which overlap the active
  // one — are hidden here, mirroring how only the selected page is Active
  // in-game. activeTab is clamped to the available page count.
  const tabs = getComponent(slot, "Tabs");
  const tabPageCount = tabs
    ? slot.children.filter((ch) => ch.components.some((c) => c.type === "TabPage")).length
    : 0;
  const tabsActive = tabs
    ? Math.max(0, Math.min(tabPageCount - 1, ((tabs.props as { activeTab?: number }).activeTab ?? 0) | 0))
    : 0;
  // Checkbox: when starting "off", hide the icon Image (matches Resonite's
  // BooleanValueDriver driving Tint alpha to 0).
  const checkboxOff = checkbox && (checkbox.props as { initialState?: boolean }).initialState === false;
  // Toggle: previews use the configured off/on color instead of the static tint.
  const toggleColorOverride = toggle && (() => {
    const tp = toggle.props as { initialState?: boolean; offColor?: { r: number; g: number; b: number; a: number }; onColor?: { r: number; g: number; b: number; a: number } };
    return tp.initialState ? tp.onColor : tp.offColor;
  })();
  const isLayoutContainer = !!getLayoutKind(slot);

  const style: React.CSSProperties = {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    boxSizing: "border-box",
    overflow: (mask || scrollArea) ? "hidden" : "visible",
    // Set explicitly so descendants always remain clickable even when an
    // ancestor (e.g. a Background slot) opts out of pointer events.
    pointerEvents: nonSelectable ? "none" : "auto",
  };

  // Graceful snap-mode reflow: while a "flow" drag is live, every block glides
  // to its new slot rather than teleporting as the stack reorders. Excluded for
  // absolute free/canvas drags — there the manipulated slot must follow the
  // cursor 1:1 with no transition lag (and nothing else moves anyway). Nested
  // children ride along smoothly because their parent's left/top transition
  // carries the whole subtree.
  if (!isRoot && liveDrag && liveDrag.kind === "flow") {
    style.transition = DRAG_GLIDE;
  }

  // Background fill: Image tint or Button normal color. Tint is suppressed
  // for photographic sprites (custom uploads, bundled icons, logo) because
  // multiplying a real picture by a tint < white visibly darkens it — and the
  // exporter forces white in those cases too. No backing color is applied
  // behind a custom upload either: transparent PNG regions should show the
  // canvas behind (matching the in-game render), not a white halo, and the
  // surrounding white was making the image read as dimmer by contrast.
  let bg: string | undefined;
  if (image) {
    const p = image.props as any;
    // Any image that carries its own visual content (NOT a shape mask). The
    // tint multiplies its pixels instead of replacing them, so the slot
    // should NOT paint the tint as a solid background — otherwise the
    // sprite's transparent regions get obscured by an opaque colored rect.
    // Shape via cornerRadius is intentionally absent here because the Image's
    // tint IS the visible color of a corner-shaped (non-photographic) Image.
    const hasPhotographicSprite = imageHasSprite(p);
    // The image placeholder paints no solid box — its themed hatched overlay
    // (drawn below) sits directly over the panel so the stripes read against the
    // background, matching the exported frosted-card look.
    bg = (hasPhotographicSprite || p.useImagePlaceholder || isBackFacing) ? undefined : colorToCss(p.tint);
    // Mirror the exporter's unified cornerRadius: a proportional corner radius
    // equal to (cornerRadius/100) × half the shorter dim. 0 → square, 100 →
    // full pill. Matches the pill-texture + FixedSize / RectHeight lowering.
    const halfMin = Math.min(rect.h, rect.w) * 0.5;
    // Background backdrop layers (Front Backing / Back Cover) carrying a custom
    // wallpaper still honor cornerRadius — the export bakes the same radius into
    // the PNG as transparent corners, so the panel's rounded shape is preserved
    // rather than overridden by a square fill. The <img> child below inherits
    // this radius and overflow:hidden (set when bgFit) clips it.
    const isBackdrop = p.useFrontBacking === true || p.useBackMaterial === true;
    if (radio) {
      // Radio outer: always a perfect circle in the editor preview.
      style.borderRadius = halfMin;
    } else if (p.matchPanelCorners === true && panelCornerPx > 0) {
      // Panel-edge chrome (header bar): round to the panel's absolute radius,
      // capped to this element's own half-min so it can't over-round.
      style.borderRadius = Math.min(panelCornerPx, halfMin);
    } else if (!hasPhotographicSprite || isBackdrop) {
      const cr = typeof p.cornerRadius === "number" ? p.cornerRadius : 0;
      if (cr > 0) style.borderRadius = (Math.min(100, cr) / 100) * halfMin;
    }
  } else if (button) {
    const p = button.props as any;
    bg = colorToCss(p.normalColor);
  }
  // Toggle preview color override takes precedence over the Image's static tint.
  if (toggleColorOverride) bg = colorToCss(toggleColorOverride);
  // Color Picker swatch: preview the marker's initialColor so editing it in the
  // inspector updates the swatch (it drives the exported Image.Tint at export).
  if (colorPicker) {
    const cp = colorPicker.props as { initialColor?: { r: number; g: number; b: number; a: number } };
    if (cp.initialColor) bg = colorToCss(cp.initialColor);
  }
  // Use backgroundColor (non-shorthand) rather than `background` so it can
  // safely coexist with backgroundImage/Size/Repeat set later for sprite-based
  // Images. Using the shorthand here trips React's "mixing shorthand and
  // longhand" warning.
  if (bg) style.backgroundColor = bg;
  // Reflect Checkbox initial state in editor preview: when off, hide the icon.
  if (checkboxOff) style.opacity = 0;

  // Image sprite — http URL or one of the bundled icon flags. Bundled icons
  // are served from the public dir at /UIIcons/<file>.
  const imgProps = (image?.props as Record<string, unknown> | undefined) ?? {};
  const spriteUrl = imgProps.spriteUrl as string | undefined;
  const customImageHash = imgProps.customImageHash as string | undefined;
  const customImageUrl = useCustomImageUrl(customImageHash);
  const useSpinnerIcon = imgProps.useSpinnerIcon === true;
  const localIconUrl =
    imgProps.useHelpIcon      ? "/UIIcons/Help&Info.png" :
    imgProps.useCloseIcon     ? "/UIIcons/Cancel.png" :
    imgProps.useCheckIcon     ? "/UIIcons/Checkmark.png" :
    imgProps.useBackspaceIcon ? "/UIIcons/Backspace.png" :
    imgProps.useLogoSprite    ? "/UIX%20Studio.png" :
    null;
  const resolvedSpriteUrl = isBackFacing
    ? null
    : customImageUrl ??
      localIconUrl ??
      (spriteUrl && /^https?:\/\//.test(spriteUrl) ? spriteUrl : null);
  // Icon tint preview — multiplies the icon's pixels (matches the exporter's
  // Image.Tint multiply). Rendered as a masked overlay with mix-blend-mode
  // multiply so it tints only the icon's opaque pixels. Skipped when the tint
  // is pure white (× white = identity).
  // Backspace icon uses `tint` as its icon color (no separate iconTint prop),
  // so fall back to tint when iconTint isn't explicitly set.
  const iconTint = (imgProps.iconTint as { r: number; g: number; b: number; a: number } | undefined)
    ?? (imgProps.useBackspaceIcon
      ? (imgProps.tint as { r: number; g: number; b: number; a: number } | undefined)
      : undefined)
    ?? { r: 1, g: 1, b: 1, a: 1 };
  const iconTintIsWhite = iconTint.r >= 1 && iconTint.g >= 1 && iconTint.b >= 1 && iconTint.a >= 1;
  // Editor-only affordance: an Image with no sprite/icon/rounded-shape and no
  // child slots is almost certainly a placeholder the user dropped in to fill
  // later. Render an unmistakable hatched overlay with "Image Placeholder"
  // text so it can't be mistaken for an opaque colored rectangle. Mirrors the
  // empty-image rule in src/model/warnings.ts.
  const isImagePlaceholder = !!image && !resolvedSpriteUrl &&
    // Explicitly removed (via the Inspector's Remove Placeholder, or auto-set
    // when the graphic was made clickable). A plain tinted Image, not a hatch.
    imgProps.placeholderRemoved !== true &&
    !imgProps.useLogoSprite &&
    // Structural backing fills (rear Back Cover / opaque Front Backing) are
    // intentional solid layers, NOT a missing image the user meant to fill.
    !imgProps.useBackMaterial &&
    !imgProps.useFrontBacking &&
    // Any structural backdrop (Background, brand header stripe, region panels)
    // is a deliberate solid fill — don't dress it up as a "drop image here"
    // placeholder. Matches the warnings.ts image-empty exemption.
    !isStructuralSlot(slot) &&
    slot.children.length === 0 &&
    !slot.components.some((c) => c.type === "Button") &&
    !slot.components.some((c) => c.type === "Text") &&
    !slot.components.some((c) => c.type === "TextField");
  // Sprite rendering. Custom user uploads render via a real <img> child so the
  // browser color-manages and downscales them with gamma-correct filtering —
  // CSS `background-image` under the canvas's `transform: scale(<1)` uses
  // gamma-incorrect bilinear interpolation in Chromium, which visibly darkens
  // photographic content. Bundled icons (Help/Close/Check) stay on
  // `background-image` because they're tiny pre-aligned glyphs where the
  // sub-pixel scaling difference doesn't matter and the existing centering /
  // contain behavior is exactly what we want.
  const renderAsImgElement = !isBackFacing && !!customImageUrl;
  const useContain = imgProps.preserveAspect || !!localIconUrl;
  // Background backdrop layers (Front Backing / Back Cover) carrying a custom
  // image honor the backgroundFit layout knob: fit=contain, stretch=fill,
  // full=cover (crops overflow to the canvas rect). object-fit:cover already
  // clips within the element box, and overflow:hidden below guarantees the crop
  // (and rounded corners) hold. Inert on every other Image.
  const isBackdropLayer = imgProps.useFrontBacking === true || imgProps.useBackMaterial === true;
  const bgFit: "fit" | "stretch" | "full" | null =
    isBackdropLayer && customImageUrl
      ? (((imgProps.backgroundFit as string) ?? "full") as "fit" | "stretch" | "full")
      : null;
  const imgObjectFit: "contain" | "fill" | "cover" = bgFit
    ? ({ fit: "contain", stretch: "fill", full: "cover" } as const)[bgFit]
    : useContain
      ? "contain"
      : "fill";
  // "full" framing: pan via object-position + zoom via a scale about the focal
  // point. Mirrors the export bake's focus/zoom cover crop.
  const bgFocus = (imgProps.backgroundFocus as { x: number; y: number } | undefined) ?? { x: 0.5, y: 0.5 };
  const bgZoom = (imgProps.backgroundZoom as number | undefined) ?? 1;
  const bgPosCss = bgFit === "full" ? `${bgFocus.x * 100}% ${bgFocus.y * 100}%` : "center";
  const bgTransform = bgFit === "full" && bgZoom > 1 ? `scale(${bgZoom})` : undefined;
  if (bgFit) style.overflow = "hidden";
  // "fit" letterboxes the image — fill the bars with the (opaque) theme
  // background so the preview matches the baked export and nothing shows
  // through. The <img> renders on top of this.
  if (bgFit === "fit") {
    const b = themeBackground;
    style.background = `rgb(${Math.round(b.r * 255)}, ${Math.round(b.g * 255)}, ${Math.round(b.b * 255)})`;
  }
  if (resolvedSpriteUrl && !renderAsImgElement) {
    style.backgroundImage = `url(${resolvedSpriteUrl})`;
    style.backgroundSize = useContain ? "contain" : "100% 100%";
    style.backgroundRepeat = "no-repeat";
    style.backgroundPosition = "center";
  }

  // Subtle in-bound border (boxShadow inset follows border-radius; outline doesn't)
  // Locked badge stays visible even when outlines are hidden so the user can
  // still tell which slots are locked at a glance. Opacity dim and inset border
  // are skipped on the root — dimming the canvas root cascades through every
  // descendant in the panel and lets the wrapper background bleed in, which
  // visibly mutes colors and tints photographic content.
  if (locked && !isRoot) {
    style.opacity = 0.7;
    style.boxShadow = "inset 0 0 0 1px rgba(250,204,21,0.3)";
  } else if (!isRoot && showOverlays) {
    style.boxShadow = "inset 0 0 0 1px rgba(148, 163, 184, 0.2)";
  }
  // Draggable bodies advertise themselves: a grab cursor on every selectable
  // element (both modes drag from the body) so "what can I move" is obvious
  // without clicking first. Skipped on the root canvas, locked, and structural
  // slots (none are body-draggable).
  if (!isRoot && !locked && !nonSelectable && showOverlays) {
    style.cursor = "grab";
  }
  // Spacer: an editor-only dashed placeholder so the otherwise-invisible filler
  // row is visible and grabbable. Exports as an empty slot (no pixels).
  if (spacer) {
    style.border = "1px dashed rgba(56,189,248,0.5)";
    style.background = "rgba(56,189,248,0.05)";
    style.display = "flex";
    style.alignItems = "center";
    style.justifyContent = "center";
  }

  const layoutKind = getLayoutKind(slot);
  const containerRect: Rect = { x: 0, y: 0, w: rect.w, h: rect.h };
  // Memoized on the slot identity + container dimensions: the layout pass (sort +
  // distribute) only needs to re-run when the slot subtree (immutable → new ref on
  // edit) or its box changes, not on every unrelated re-render during a drag.
  const layoutRects = useMemo(
    () => layoutChildren(containerRect, slot, layoutKind, canvasPad),
    [slot, rect.w, rect.h, layoutKind, canvasPad],
  );

  // Scroll area: compute natural content extent from the (unbounded) layout rects.
  const saProps = scrollArea ? (scrollArea.props as any) : null;
  const saDir = (saProps?.direction as string) ?? "Vertical";
  const saPad = resolvePad(saProps?.padding as number | undefined, canvasPad);
  let scrollContentH = rect.h;
  let scrollContentW = rect.w;
  if (scrollArea && layoutRects && layoutRects.length > 0) {
    if (saDir === "Vertical" || saDir === "Both") {
      scrollContentH = Math.max(...layoutRects.map((r) => r.y + r.h)) + saPad;
    }
    if (saDir === "Horizontal" || saDir === "Both") {
      scrollContentW = Math.max(...layoutRects.map((r) => r.x + r.w)) + saPad;
    }
  }

  const className = !isRoot && !locked && showOverlays ? "uix-block" : undefined;

  return (
    <div
      className={className}
      data-selected={isSelected ? "true" : undefined}
      style={style}
      onMouseDown={(e) => {
        // Grab-and-drag an element in one motion (both modes). The mousedown
        // SELECTS immediately, so even a click (or a micro-drag that never
        // passes the drag threshold) selects the object — revealing its resize
        // handles without a trip to the Hierarchy tree. The actual drag only
        // begins once the pointer moves (handled in DragLayer).
        if (e.button !== 0 || isRoot || (locked && !isRoot)) return;
        if (dragController.spaceHeld) return; // let the Viewport pan instead
        const store = useStore.getState();
        // Clicking a tab switches to it (and selects the Tabs host so the custom
        // Tabs panel shows) rather than selecting the underlying button + starting
        // a drag. Page CONTENT clicks fall through to normal select/drag.
        const tabClick = resolveTabClick(store.root, slot.id);
        if (tabClick) {
          e.preventDefault();
          e.stopPropagation();
          store.selectTab(tabClick.hostId, tabClick.index);
          return;
        }
        const ctrl = controllingClickable(store.root, slot.id);
        let targetId = ctrl && !ctrl.isSelf ? ctrl.slot.id : slot.id;
        // A radial group moves as ONE unit — redirect any option/label grab to the
        // group wrap so the whole cluster drags/resizes together (label position is
        // component-defined, so individual moves are meaningless).
        const rgHost = radioGroupHostOf(store.root, targetId);
        if (rgHost) targetId = rgHost;
        if (targetId === store.root.id) return;
        e.preventDefault();
        e.stopPropagation();
        select(targetId);
        dragController.begin?.(targetId, e.clientX, e.clientY);
      }}
      onClick={(e) => {
        e.stopPropagation();
        // The Canvas root is locked (so it can't be dragged) but should still
        // be selectable: clicking empty panel space falls through the
        // structural backing layers (pointerEvents:none) to this root div, and
        // the user expects that to select the Canvas — not nothing. Other
        // locked slots stay unselectable by click (use the Hierarchy tree).
        if (locked && !isRoot) return;
        const tabClickSel = resolveTabClick(useStore.getState().root, slot.id);
        if (tabClickSel) {
          useStore.getState().selectTab(tabClickSel.hostId, tabClickSel.index);
          return;
        }
        // Composite buttons (close, popup, text buttons, checkboxes…) put the
        // icon/label on a child slot that draws on top, so a canvas click lands
        // on the glyph. Select the button it belongs to instead, so the user
        // gets the full pre-filled control config rather than the bare icon.
        // The glyph stays directly selectable from the Hierarchy tree.
        const clickRoot = useStore.getState().root;
        const ctrl = controllingClickable(clickRoot, slot.id);
        const baseTarget = ctrl && !ctrl.isSelf ? ctrl.slot.id : slot.id;
        // Radial members select the whole group (see the mousedown handler).
        select(radioGroupHostOf(clickRoot, baseTarget) ?? baseTarget);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, slot.id);
      }}
    >
      {spacer && (
        <span
          style={{
            pointerEvents: "none",
            fontSize: 10,
            letterSpacing: "0.05em",
            color: "rgba(56,189,248,0.85)",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          ↕ Spacer
        </span>
      )}
      {text && <TextPreview props={text.props as any} rect={rect} />}
      {textField && <TextFieldPreview props={textField.props as any} radius={typeof style.borderRadius === "number" ? style.borderRadius : 0} />}
      {slider && <SliderFillPreview props={slider.props as any} rect={rect} trackRadius={typeof style.borderRadius === "number" ? style.borderRadius : 0} />}
      {progressBar && <ProgressBarFillPreview props={progressBar.props as any} trackRadius={typeof style.borderRadius === "number" ? style.borderRadius : 0} />}
      {waveform && <WaveformPreview props={waveform.props as any} />}
      {dropdown && <DropdownLabelPreview props={dropdown.props as any} />}
      {radio && <RadioDotPreview props={radio.props as any} />}
      {referenceField && <ReferenceFieldPreview props={referenceField.props as any} />}
      {scrollArea && <ScrollAreaBackground props={scrollArea.props as any} />}
      {renderAsImgElement && customImageUrl && (
        <img
          src={customImageUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: imgObjectFit,
            objectPosition: bgPosCss,
            transform: bgTransform,
            transformOrigin: bgTransform ? bgPosCss : undefined,
            pointerEvents: "none",
            borderRadius: "inherit",
          }}
        />
      )}
      {useSpinnerIcon && (
        // Geometric SVG arc rather than the spinning PNG. The PNG glyph isn't
        // perfectly centered in its own pixel bounds, so spinning it orbits
        // (off-center/wobbly). The SVG circle is centered at the viewBox center
        // (= the element's rotation origin via preserveAspectRatio), so it spins
        // perfectly round — matching the in-game OutlinedArc. Color comes from
        // the `tint` prop (driven by the theme accent via applyAccent), mirroring
        // the exporter's `_exportTheme.accent ?? tint` for the arc FillColor.
        <svg
          viewBox="0 0 100 100"
          className="animate-spin"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
        >
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke={colorToCss(
              (imgProps.tint as { r: number; g: number; b: number; a: number } | undefined)
                ?? { r: 0.272, g: 0.567, b: 0.842, a: 1 },
            )}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="170 56"
          />
        </svg>
      )}
      {resolvedSpriteUrl && !iconTintIsWhite && (
        // Icon tint overlay: a tint-colored layer masked to the icon's alpha,
        // multiplied onto the icon below so full-color icons darken/shift and
        // white-mask icons recolor — matching the exporter's Tint multiply.
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: colorToCss(iconTint),
            mixBlendMode: "multiply",
            WebkitMaskImage: `url(${resolvedSpriteUrl})`,
            maskImage: `url(${resolvedSpriteUrl})`,
            WebkitMaskSize: useContain ? "contain" : "100% 100%",
            maskSize: useContain ? "contain" : "100% 100%",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            pointerEvents: "none",
            borderRadius: "inherit",
          }}
        />
      )}
      {isImagePlaceholder && showOverlays && <ImagePlaceholderOverlay rect={rect} color={themeBodyColor} />}

      {scrollArea ? (
        // Real scrollable container so the preview matches the in-game behaviour.
        // Children are laid out at natural (un-squished) sizes; the outer slot
        // div clips via overflow:hidden while this inner div handles the scroll.
        <>
          <div
            // Tagged so the editor's DragLayer can read this scroll offset (and
            // drive the external purple scrollbar) and keep the child
            // grab-handles aligned with the scrolled items. `hide-native-scrollbar`
            // hides the browser scrollbar — the editor's scrollbar lives outside
            // on the right rail (DragLayer); wheel-scroll still works.
            data-scroll-container={slot.id}
            className="hide-native-scrollbar"
            style={{
              position: "absolute",
              inset: 0,
              overflowY: (saDir === "Vertical" || saDir === "Both") ? "auto" : "hidden",
              overflowX: (saDir === "Horizontal" || saDir === "Both") ? "auto" : "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                width: (saDir === "Horizontal" || saDir === "Both") ? scrollContentW : "100%",
                height: (saDir === "Vertical" || saDir === "Both") ? scrollContentH : "100%",
              }}
            >
              {slot.children.map((child, i) => {
                const childLocalRect = layoutRects
                  ? layoutRects[i]
                  : computeChildRect(containerRect, getRectTransform(child));
                return <RenderedSlot key={child.id} slot={child} rect={childLocalRect} />;
              })}
            </div>
          </div>
          {/* In-game scrollbar PREVIEW — static visual showing how the scrollbar
              looks in VR. Editor-only (pointer-events:none, never intercepts);
              the FUNCTIONAL editor scrollbar is the purple rail outside on the
              right (DragLayer). */}
          <ScrollAreaScrollbar props={saProps} />
        </>
      ) : (
        (() => {
          // Running positional index of TabPage children, so only the active
          // page renders (the rest overlap it and are hidden).
          let pageSeen = -1;
          return slot.children.map((child, i) => {
            // A popup card is a root child but floats as a centered overlay shown
            // only while editing its popup — never inline here (see PopupEditOverlay).
            if (child.components.some((c) => c.type === "PopupContent")) return null;
            if (tabs && child.components.some((c) => c.type === "TabPage")) {
              pageSeen++;
              if (pageSeen !== tabsActive) return null;
            }
            const childLocalRect = layoutRects
              ? layoutRects[i]
              : computeChildRect(containerRect, getRectTransform(child));
            return <RenderedSlot key={child.id} slot={child} rect={childLocalRect} />;
          });
        })()
      )}

      {isLayoutContainer && showOverlays && (
        <div
          className="pointer-events-none absolute left-0 top-0 px-1 text-[9px] uppercase tracking-wider"
          style={{ color: "rgba(56, 189, 248, 0.5)" }}
        >
          {layoutKind}
        </div>
      )}
      {locked && !isRoot && (
        <div className="pointer-events-none absolute right-0.5 top-0.5 text-[10px] text-yellow-400/60">
          🔒
        </div>
      )}
      {/* Per-slot "opens popup on click" hint, shown when this slot has a
          Popup component attached. Stays subtle so it doesn't fight with the
          actual button design. */}
      {!isRoot && slot.components.some((c) => c.type === "Popup") && showOverlays && (
        <div className="pointer-events-none absolute right-0.5 top-0.5 rounded bg-purple-500/30 px-1 text-[9px] text-purple-100">
          💬 popup
        </div>
      )}
      {/* The popup editing surface used to overlay the card centered ON the
          canvas here; it now floats in the surrounding dead space and is rendered
          at the Viewport level (PopupEditSurface) so it doesn't cover the panel
          and isn't clipped by the canvas. */}
    </div>
  );
}

function ImagePlaceholderOverlay({ rect, color }: { rect: Rect; color?: { r: number; g: number; b: number; a: number } }) {
  const t = useT();
  // Pick label size proportional to the rect so tiny placeholders don't
  // overflow with giant text. Hide the label entirely when there's no room.
  const minSide = Math.min(rect.w, rect.h);
  const showLabel = minSide > 60;
  const showIcon = minSide > 30;
  const labelSize = Math.max(10, Math.min(16, minSide * 0.08));
  // Theme-driven color (bodyTextColor) so the editor matches the export's
  // themed placeholder. Build rgba() strings at the same alphas the baked PNG
  // uses for stripes / border / icon. Falls back to the original sky blue.
  const c = color ?? { r: 0.22, g: 0.74, b: 0.97, a: 1 };
  const rgba = (a: number) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1"
      style={{
        background:
          `repeating-linear-gradient(45deg, ${rgba(0.08)} 0 8px, ${rgba(0.16)} 8px 16px)`,
        outline: `2px dashed ${rgba(0.6)}`,
        outlineOffset: -2,
        color: rgba(0.85),
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      }}
    >
      {showIcon && (
        <svg
          width={Math.min(40, minSide * 0.25)}
          height={Math.min(40, minSide * 0.25)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="M21 16l-5-5L5 21" />
        </svg>
      )}
      {showLabel && (
        <div style={{ fontSize: labelSize, fontWeight: 600, letterSpacing: 0.5 }}>
          {t.placeholder.title}
        </div>
      )}
      {showLabel && (
        <div style={{ fontSize: labelSize * 0.7, opacity: 0.7 }}>
          {t.placeholder.sub}
        </div>
      )}
    </div>
  );
}

// TextMeshPro auto-size (the exporter emits VerticalAutoSize with AutoSizeMin:8,
// AutoSizeMax:64) GROWS the glyph to fill the box, shrinking only when the text
// would overflow. The old preview merely clamped the authored size DOWN
// (min(size, rect.h*0.6)), which inverted WYSIWYG — labels looked small in the
// editor but rendered large in-world. fitAutoSize returns the largest size in
// [8,64] whose word-wrapped text fits the padded rect in both axes.
const AUTOSIZE_MIN = 8;
const AUTOSIZE_MAX = 64;
const TEXT_LINE_HEIGHT = 1.25; // matches exportBrson Text.LineHeight
const TEXT_PAD = 4; // matches TextPreview padding below

// CJK ideographs / kana / hangul / fullwidth forms. Each is an independent line-
// break opportunity (UAX #14), so text wraps BETWEEN them — exactly how CSS and
// Resonite lay out CJK. Without this, spaceless Japanese/Chinese is one giant
// "word" that never fits, collapsing auto-size text to the 8px floor.
const CJK_CHAR =
  /[ᄀ-ᇿ　-〿぀-ヿ㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/;

// Split a whitespace-delimited word into wrap units: each CJK character becomes
// its own breakable unit; runs of Latin/digits stay whole (a Latin token like
// "UIX" embedded in Japanese must not break mid-word). Pure-Latin words skip the
// per-char walk entirely.
function breakUnits(word: string): string[] {
  if (!CJK_CHAR.test(word)) return [word];
  const units: string[] = [];
  let buf = "";
  for (const ch of word) {
    if (CJK_CHAR.test(ch)) {
      if (buf) {
        units.push(buf);
        buf = "";
      }
      units.push(ch);
    } else buf += ch;
  }
  if (buf) units.push(buf);
  return units;
}

function fitAutoSize(text: string, rect: Rect): number {
  const availW = Math.max(1, rect.w - TEXT_PAD * 2);
  const availH = Math.max(1, rect.h - TEXT_PAD * 2);
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  for (let size = AUTOSIZE_MAX; size >= AUTOSIZE_MIN; size--) {
    const spaceW = measureTextWidth(" ", size);
    let lines = 1;
    let lineW = 0;
    let overflow = false;
    outer: for (const word of words) {
      // CJK chars wrap between themselves; a real space precedes only the FIRST
      // unit of each word (CJK sub-units within a word join with no separator).
      const units = breakUnits(word);
      for (let i = 0; i < units.length; i++) {
        const uw = measureTextWidth(units[i], size);
        if (uw > availW) {
          overflow = true; // an unbreakable unit can't fit the width at this size
          break outer;
        }
        const sep = lineW > 0 && i === 0 ? spaceW : 0;
        if (lineW + sep + uw <= availW) lineW += sep + uw;
        else {
          lines++;
          lineW = uw;
        }
      }
    }
    if (overflow) continue;
    if (lines * size * TEXT_LINE_HEIGHT <= availH) return size;
  }
  return AUTOSIZE_MIN;
}

function TextPreview({ props, rect }: { props: any; rect: Rect }) {
  const align = props.horizontalAlign as string;
  const valign = props.verticalAlign as string;
  const justify =
    align === "Center" ? "center" : align === "Right" ? "flex-end" : "flex-start";
  const items =
    valign === "Middle" ? "center" : valign === "Bottom" ? "flex-end" : "flex-start";

  let fontSize = Number(props.size ?? 24);
  if (props.autoSize) {
    fontSize = fitAutoSize(String(props.content ?? ""), rect);
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 flex"
      style={{
        justifyContent: justify,
        alignItems: items,
        color: colorToCss(props.color),
        fontSize,
        padding: TEXT_PAD,
        lineHeight: TEXT_LINE_HEIGHT,
        textAlign: align.toLowerCase() as React.CSSProperties["textAlign"],
        whiteSpace: "pre-wrap",
        // Mirror Resonite's wrapping exactly: wrap at spaces (word wrap), and
        // only char-break a single word when it physically can't fit its box —
        // Resonite's own last-resort fallback. break-word (not break-all)
        // breaks ONLY on overflow, so normal words stay intact.
        overflowWrap: "break-word",
        overflow: "hidden",
      }}
    >
      {String(props.content ?? "")}
    </div>
  );
}

// Slider preview overlay — renders a filled bar inside the track Image showing
// the current value. Matches the exporter's synthetic Fill child: horizontal
// fills left-to-right, vertical fills bottom-to-top. Uses fillColor prop with a
// matching border radius so the fill hugs the track's rounded corners.
function SliderFillPreview({
  props,
  rect,
  trackRadius,
}: {
  props: any;
  rect: Rect;
  trackRadius: number;
}) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 1);
  const value = Number(props.value ?? 0.5);
  const pct = max !== min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const dir = (props.direction as string) ?? "Horizontal";
  const fillStyle: React.CSSProperties = {
    position: "absolute",
    background: colorToCss(props.fillColor),
    borderRadius: trackRadius,
    pointerEvents: "none",
  };
  // Knob — a 26×26 white circle that sits at the fill's leading edge. Matches
  // the exporter's synthetic Knob child of the Fill slot (same anchor pattern
  // as the Toggle's knob). For horizontal sliders the knob's center rides the
  // right edge of the fill; for vertical, the top edge.
  const knobSize = 26;
  const knobStyle: React.CSSProperties = {
    position: "absolute",
    width: knobSize,
    height: knobSize,
    background: "rgb(242, 242, 242)",
    borderRadius: "50%",
    boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
    pointerEvents: "none",
  };
  if (dir === "Vertical") {
    fillStyle.left = 0;
    fillStyle.right = 0;
    fillStyle.bottom = 0;
    fillStyle.height = `${pct * 100}%`;
    knobStyle.left = (rect.w - knobSize) / 2;
    knobStyle.bottom = pct * rect.h - knobSize / 2;
  } else {
    fillStyle.left = 0;
    fillStyle.top = 0;
    fillStyle.bottom = 0;
    fillStyle.width = `${pct * 100}%`;
    knobStyle.top = (rect.h - knobSize) / 2;
    knobStyle.left = pct * rect.w - knobSize / 2;
  }
  return (
    <>
      <div style={fillStyle} />
      <div style={knobStyle} />
    </>
  );
}

// ProgressBar preview overlay — same fill geometry as Slider but without
// a draggable knob. Mirrors the exporter's synthetic Fill child.
function ProgressBarFillPreview({
  props,
  trackRadius,
}: {
  props: any;
  trackRadius: number;
}) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 1);
  const value = Number(props.value ?? 0.6);
  const pct = max !== min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const dir = (props.direction as string) ?? "Horizontal";
  const fillStyle: React.CSSProperties = {
    position: "absolute",
    background: colorToCss(props.fillColor),
    borderRadius: trackRadius,
    pointerEvents: "none",
  };
  if (dir === "Vertical") {
    fillStyle.left = 0;
    fillStyle.right = 0;
    fillStyle.bottom = 0;
    fillStyle.height = `${pct * 100}%`;
  } else {
    fillStyle.left = 0;
    fillStyle.top = 0;
    fillStyle.bottom = 0;
    fillStyle.width = `${pct * 100}%`;
  }
  return <div style={fillStyle} />;
}

// Waveform preview — a stylized audio trace so the Output area reads as a
// visualizer in the editor. The real export is a UIX.RectMesh<AudioSourceWaveformMesh>
// that draws the LIVE waveform of the linked audio source in Resonite; here we
// draw a static representative trace tinted with the authored color.
function WaveformPreview({ props }: { props: any }) {
  const stroke = colorToCss(props?.color ?? { r: 0.88, g: 0.88, b: 0.88, a: 1 });
  const thickness = Math.max(1, Number(props?.thickness ?? 4) * 0.5);
  // A representative trace: a few summed sine harmonics sampled across the width,
  // mirrored top/bottom about the centerline like the in-game waveform.
  const N = 96;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * 100;
    const t = (i / N) * Math.PI * 2;
    const a =
      Math.sin(t * 3) * 0.55 +
      Math.sin(t * 7 + 1.3) * 0.25 +
      Math.sin(t * 13 + 0.7) * 0.12;
    // Taper the envelope toward the edges so it reads as a centered burst.
    const env = Math.sin((i / N) * Math.PI);
    const y = 50 - a * env * 42;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const mirror = pts
    .slice()
    .reverse()
    .map((p) => {
      const [x, y] = p.split(",").map(Number);
      return `${x.toFixed(2)},${(100 - y).toFixed(2)}`;
    });
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth={thickness} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.95} />
      <polyline points={mirror.join(" ")} fill="none" stroke={stroke} strokeWidth={thickness} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.35} />
    </svg>
  );
}

// Dropdown trigger preview — shows the current selection label on the left
// and a ▼ chevron on the right. Mirrors the trigger's synthetic Label child
// slot that the exporter creates (Text whose Content gets re-written on each
// option pick at runtime). The popup itself is not rendered in the editor
// because it starts with Active=false at runtime; pop it open in Resonite.
function DropdownLabelPreview({ props }: { props: any }) {
  const optionsRaw = String(props?.options ?? "");
  const options = optionsRaw
    .split(/\r?\n/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  const idx = Math.max(0, Math.min(options.length - 1, Number(props?.initialIndex ?? 0) | 0));
  const label = options[idx] ?? "—";
  // Read the authored label color so theme changes (body text → dropdown
  // label) are reflected in the preview. Default near-white when missing.
  const labelColor = props?.optionLabelColor
    ? colorToCss(props.optionLabelColor)
    : "rgb(242, 242, 242)";
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-between overflow-hidden"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        fontSize: 16,
        color: labelColor,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ opacity: 0.7, marginLeft: 8 }}>▼</span>
    </div>
  );
}

// Radio inner-dot preview overlay. Shown only when this radio is the
// `initiallySelected: true` option in its group — the editor doesn't run the
// ValueEqualityDriver chain, so the visible dot reflects the user's authored
// initial state. Mirrors the synthetic "Dot" child slot the exporter creates.
function RadioDotPreview({ props }: { props: any }) {
  if (!props.initiallySelected) return null;
  const color = props.selectedColor ?? { r: 0.95, g: 0.95, b: 0.95, a: 1 };
  return (
    <div
      style={{
        position: "absolute",
        left: "30%",
        top: "30%",
        right: "30%",
        bottom: "30%",
        borderRadius: "50%",
        background: colorToCss(color),
        pointerEvents: "none",
      }}
    />
  );
}

// ScrollArea background — paints the host slot with the configured background
// tint. Drawn beneath the children so they read on top.
function ScrollAreaBackground({ props }: { props: any }) {
  const bg = props?.backgroundTint ?? { r: 0.07, g: 0.08, b: 0.11, a: 1 };
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: colorToCss(bg) }}
    />
  );
}

// ScrollArea scrollbar visual — thin track + centered thumb, drawn over the
// children. Indicates that scrolling is available; thumb is static in the
// editor (Resonite drives the real position at runtime).
function ScrollAreaScrollbar({ props }: { props: any }) {
  if (props?.showScrollbar === false) return null;
  const dir = (props?.direction as string) ?? "Vertical";
  const track = props?.scrollbarTrackTint ?? { r: 0.15, g: 0.17, b: 0.21, a: 1 };
  const thumb = props?.scrollbarThumbTint ?? { r: 0.55, g: 0.60, b: 0.68, a: 1 };
  const showVertical   = dir === "Vertical"   || dir === "Both";
  const showHorizontal = dir === "Horizontal" || dir === "Both";
  return (
    <>
      {showVertical && (
        <div
          className="pointer-events-none absolute"
          style={{ right: 2, top: 4, bottom: 4, width: 6, background: colorToCss(track), borderRadius: 3 }}
        >
          <div
            style={{
              position: "absolute",
              left: 0, right: 0, top: "30%", height: "40%",
              background: colorToCss(thumb),
              borderRadius: 3,
            }}
          />
        </div>
      )}
      {showHorizontal && (
        <div
          className="pointer-events-none absolute"
          style={{ left: 4, right: 4, bottom: 2, height: 6, background: colorToCss(track), borderRadius: 3 }}
        >
          <div
            style={{
              position: "absolute",
              top: 0, bottom: 0, left: "30%", width: "40%",
              background: colorToCss(thumb),
              borderRadius: 3,
            }}
          />
        </div>
      )}
    </>
  );
}

// ReferenceField preview — three sections matching the exporter's synthesized
// children: ⤴ Inspector (left), Field display + "null" placeholder (middle),
// ∅ Clear (right). Icons drawn as inline SVG so they don't depend on a Unicode
// glyph being in the runtime font (the exported widget uses bundled PNGs for
// the same reason).
function ReferenceFieldPreview({ props }: { props: any }) {
  const fieldBg  = props?.fieldColor  ?? { r: 0.024, g: 0.028, b: 0.036, a: 1 };
  // Side button backgrounds are tied to the pill they sit next to — the
  // exporter does the same (see hasReferenceField branch in exportBrson.ts).
  // Preview ignores the schema's separate buttonColor knob to match.
  const buttonBg = fieldBg;
  const txt      = props?.textColor   ?? { r: 0.88,  g: 0.88,  b: 0.88,  a: 1 };
  const iconColor = colorToCss(txt);
  return (
    <div
      className="pointer-events-none absolute inset-0 flex gap-1"
      style={{ padding: 2 }}
    >
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ background: colorToCss(buttonBg), width: 36 }}
        title="Open inspector"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7" />
          <path d="M9 7h8v8" />
        </svg>
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        style={{
          background: colorToCss(fieldBg),
          color: colorToCss({ ...txt, a: 0.55 }),
          fontStyle: "italic",
          fontSize: 14,
          padding: "0 6px",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        null
      </div>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ background: colorToCss(buttonBg), width: 36 }}
        title="Clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l12 12" />
          <path d="M6 18L18 6" />
        </svg>
      </div>
    </div>
  );
}

function TextFieldPreview({ props, radius = 3 }: { props: any; radius?: number }) {
  const bg = props.backgroundTint ?? { r: 0.12, g: 0.12, b: 0.12, a: 1 };
  const textColor = props.textColor ?? { r: 0.9, g: 0.9, b: 0.9, a: 1 };
  const phColor = props.placeholderColor ?? { r: 0.45, g: 0.45, b: 0.45, a: 1 };
  const textAlign = (props.textAlign as string) ?? "Left";
  const content = String(props.textContent ?? "");
  const hasContent = content.length > 0;
  const displayText = hasContent ? content : String(props.placeholder ?? "");
  const justify = textAlign === "Center" ? "center" : textAlign === "Right" ? "flex-end" : "flex-start";
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3"
      style={{
        background: colorToCss(bg),
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: radius,
        fontSize: props.fontSize ?? 16,
        color: hasContent ? colorToCss(textColor) : colorToCss(phColor),
        whiteSpace: "nowrap",
        justifyContent: justify,
      }}
    >
      {displayText}
      {!hasContent && (
        <span
          className="ml-0.5 inline-block h-4 w-px animate-pulse"
          style={{ background: colorToCss(phColor) }}
        />
      )}
    </div>
  );
}
