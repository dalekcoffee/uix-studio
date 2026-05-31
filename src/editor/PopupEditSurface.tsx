import { useStore } from "../state/store";
import type { Slot } from "../model/types";
import { RenderedSlot } from "./render/renderSlot";
import { computeChildRect, getRectTransform } from "./render/rectTransform";

// The popup editing surface — a floating "secondary canvas" that lifts the
// popup's content card out into the dead space above (or below) the main canvas
// instead of covering the panel. It renders the card at its real model position
// inside a canvas-sized wrapper, then translates the whole wrapper by `shift`
// (canvas units). DragLayer translates the popup's grips by the SAME shift (its
// container transform), so the card and its grabbers move together and stay
// aligned, while the snap/drag math underneath still runs in unshifted canvas
// coordinates (getBoundingClientRect on the shifted container auto-corrects the
// pointer mapping — see DragLayer's popupShift handling).
//
// Rendered as a sibling of the canvas wrapper in the Viewport's positioned box
// (which does NOT clip), so the lifted card is visible in the surrounding dead
// space — unlike the old centered overlay, which lived inside the clipped canvas.
interface Props {
  card: Slot;
  shift: { x: number; y: number }; // canvas units
  scale: number;
  canvasSize: { w: number; h: number };
}

const HEADER_H = 34; // canvas px, the labelled band above the card

export default function PopupEditSurface({ card, shift, scale, canvasSize }: Props) {
  const select = useStore((s) => s.select);

  const scaledW = canvasSize.w * scale;
  const scaledH = canvasSize.h * scale;
  const cardRect = computeChildRect(
    { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h },
    getRectTransform(card),
  );

  const close = () => select(null);

  return (
    <>
      {/* Dim the main canvas (signals it's in the background) and catch
          click-outside to close. Covers only the canvas, not the dead space. */}
      <div
        className="absolute"
        style={{ left: 0, top: 0, width: scaledW, height: scaledH, background: "rgba(0,0,0,0.5)" }}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      />

      {/* The lifted card. The outer wrapper is translated by shift*scale (screen
          px); the inner wrapper is the canvas-unit space scaled to match, so the
          card renders at its true model rect — exactly where DragLayer's lifted
          grips expect it. */}
      <div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: scaledW,
          height: scaledH,
          transform: `translate(${shift.x * scale}px, ${shift.y * scale}px)`,
        }}
        // Clicks on the empty area around the card (in the dead space) close too.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: canvasSize.w,
            height: canvasSize.h,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          // This scaled canvas-space fills the lifted wrapper, so it — not the
          // wrapper — is what a click in the dead space around the card actually
          // hits. Close when the bare surface is clicked (clicking the card
          // itself targets a card element, so it's left open for editing).
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              e.stopPropagation();
              close();
            }
          }}
        >
          {/* Accent ring + drop shadow framing the card as its own surface. */}
          <div
            className="pointer-events-none absolute rounded-md"
            style={{
              left: cardRect.x - 3,
              top: cardRect.y - 3,
              width: cardRect.w + 6,
              height: cardRect.h + 6,
              boxShadow: "0 0 0 2px rgba(168,85,247,0.9), 0 16px 50px rgba(0,0,0,0.55)",
            }}
          />
          {/* Header band — labels this as the popup's own editing surface. */}
          <div
            className="pointer-events-none absolute flex items-center gap-2 rounded-t-md bg-purple-600/95 px-3 font-semibold text-white"
            style={{
              left: cardRect.x,
              top: cardRect.y - HEADER_H,
              width: cardRect.w,
              height: HEADER_H,
              fontSize: 15,
            }}
          >
            <span>💬 Popup — editing</span>
            <span className="ml-auto text-[11px] font-normal text-purple-100/90">
              click the panel or outside to close
            </span>
          </div>
          <RenderedSlot slot={card} rect={cardRect} />
        </div>
      </div>
    </>
  );
}
