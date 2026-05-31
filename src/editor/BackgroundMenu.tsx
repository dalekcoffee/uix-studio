import { useRef, useState } from "react";
import { useStore } from "../state/store";
import { findBackgroundSlots } from "../model/background";
import type { Slot } from "../model/types";
import { CustomImagePicker } from "./inspector/ImagePicker";
import { useCustomImageUrl } from "./useCustomImageUrl";
import { useDialog } from "./useDialog";

// Background menu — owns the panel's backdrop. Sets a Single background (both
// faces) or Per-side (front vs back), each either a solid color or an image
// (with fit). Writes through the store's setBackground / setBackgroundFit,
// which target the hidden Front Backing (front face) + Back Cover (back face)
// structural slots. A face the user sets here is marked `backgroundKind`, so
// the Theme menu won't repaint it.

type Target = "both" | "front" | "back";
type Color = { r: number; g: number; b: number; a: number };

const FIT_HINTS: Record<"fit" | "stretch" | "full", string> = {
  fit: "Whole image visible, letterboxed (may leave bars on the sides).",
  stretch: "Stretched to fill exactly — can deform the image.",
  full: "Covers the whole canvas, cropping overflow. No deformation.",
};

function imageProps(slot: Slot | null): Record<string, unknown> {
  return (slot?.components.find((c) => c.type === "Image")?.props ?? {}) as Record<string, unknown>;
}
function faceKind(p: Record<string, unknown>): "color" | "image" {
  return (p.backgroundKind as string) === "image" || (!p.backgroundKind && p.customImageHash) ? "image" : "color";
}

export default function BackgroundMenu({ onClose }: { onClose: () => void }) {
  const root = useStore((s) => s.root);
  const ensureBackgroundTrio = useStore((s) => s.ensureBackgroundTrio);
  const { background, frontBacking, backCover } = findBackgroundSlots(root);

  const fb = imageProps(frontBacking);
  const bc = imageProps(backCover);
  // Default to Per-side when the two faces already differ, so an existing
  // front≠back setup isn't silently flattened on open.
  const facesDiffer =
    faceKind(fb) !== faceKind(bc) ||
    (fb.customImageHash ?? "") !== (bc.customImageHash ?? "") ||
    JSON.stringify(fb.tint ?? null) !== JSON.stringify(bc.tint ?? null);
  const [perSide, setPerSide] = useState(facesDiffer);

  return (
    <div className="w-[340px] max-h-[80vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">Background</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200" title="Close">✕</button>
      </div>

      {!background ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] leading-snug text-slate-400">
            This panel has no background layer. Add one to set a front/back color or image.
          </p>
          <button
            onClick={ensureBackgroundTrio}
            className="rounded border border-sky-500 bg-sky-600 px-2 py-1.5 text-white transition hover:bg-sky-500"
          >
            Add background
          </button>
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-center gap-1">
            <ModeBtn active={!perSide} onClick={() => setPerSide(false)} label="Single" hint="One background for the whole panel" />
            <ModeBtn active={perSide} onClick={() => setPerSide(true)} label="Per-side" hint="Different front and back" />
          </div>

          {perSide ? (
            <>
              <FaceEditor target="front" label="Front" props={fb} />
              <FaceEditor target="back" label="Back" props={bc} />
            </>
          ) : (
            <FaceEditor target="both" label="" props={fb} />
          )}
        </>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={`flex-1 rounded border px-2 py-1 text-[11px] transition ${
        active ? "border-sky-500 bg-sky-600/20 text-sky-100" : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function FaceEditor({ target, label, props }: { target: Target; label: string; props: Record<string, unknown> }) {
  const setBackground = useStore((s) => s.setBackground);
  const setBackgroundFit = useStore((s) => s.setBackgroundFit);
  const dialog = useDialog();
  const kind = faceKind(props);
  // The active tab follows the face's actual kind (so applying an image reveals
  // the Image tab + framing immediately) unless the user explicitly switched.
  const [tabOverride, setTabOverride] = useState<"color" | "image" | null>(null);
  const tab = tabOverride ?? kind;
  const color = (props.tint as Color) ?? { r: 0.05, g: 0.05, b: 0.05, a: 1 };
  const currentHash = (props.customImageHash as string) || "";
  const fit = ((props.backgroundFit as string) ?? "full") as "fit" | "stretch" | "full";

  const applyImage = async (hash: string) => {
    const res = setBackground(target, { kind: "image", hash });
    if (!res.ok && res.reason === "mismatch") {
      if (await dialog.confirm("The front and back currently use different background images. Replace both with this image?", { confirmLabel: "Replace Both" })) {
        setBackground(target, { kind: "image", hash }, { force: true });
      }
    }
  };

  return (
    <div className="mt-2 border-t border-slate-800 pt-2">
      {label && <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>}
      <div className="mb-2 flex items-center gap-1">
        <TabBtn active={tab === "color"} onClick={() => { setTabOverride("color"); setBackground(target, { kind: "color", color }); }} label="Color" />
        <TabBtn active={tab === "image"} onClick={() => setTabOverride("image")} label="Image" />
      </div>

      {tab === "color" ? (
        <div className="flex flex-col gap-2">
          <ColorRow value={color} onChange={(c) => setBackground(target, { kind: "color", color: c })} />
          {/* Front transparency — only the front stack can fade (the rear stays
              an opaque occluder in-world). Hidden on the back-only editor. */}
          {(target === "front" || target === "both") && (
            <TransparencyRow target={target} alpha={color.a ?? 1} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <CustomImagePicker slotId="" currentHash={currentHash} label="Image" onHashChange={applyImage} />
          {currentHash && (
            <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-400">Layout</div>
              <div className="grid grid-cols-3 gap-1">
                {(["fit", "stretch", "full"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setBackgroundFit(target, m)}
                    title={FIT_HINTS[m]}
                    className={`rounded border px-2 py-1 text-[11px] capitalize transition ${
                      fit === m ? "border-sky-500 bg-sky-600/20 text-sky-200" : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-slate-500">{FIT_HINTS[fit]}</div>
            </div>
          )}
          {currentHash && fit === "full" && (
            <FramingControl
              target={target}
              hash={currentHash}
              focus={(props.backgroundFocus as { x: number; y: number }) ?? { x: 0.5, y: 0.5 }}
              zoom={(props.backgroundZoom as number) ?? 1}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Live crop framing for a "full" background: drag the thumbnail to pan (focus)
// and use the slider to zoom. Mirrors the export bake + on-canvas preview.
// Drag/slide are bracketed by dragStart()/dragCommit() so the gesture is one
// undo step; intermediate updates are live (no history). All inside the menu
// popover — no canvas interaction, so nothing gets deselected.
function FramingControl({
  target,
  hash,
  focus,
  zoom,
}: {
  target: Target;
  hash: string;
  focus: { x: number; y: number };
  zoom: number;
}) {
  const setBackgroundCrop = useStore((s) => s.setBackgroundCrop);
  const dragStart = useStore((s) => s.dragStart);
  const dragCommit = useStore((s) => s.dragCommit);
  const canvasProps = useStore((s) => s.root.components.find((c) => c.type === "Canvas")?.props) as
    | { sizeX?: number; sizeY?: number }
    | undefined;
  const url = useCustomImageUrl(hash);
  const boxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const aspect = `${canvasProps?.sizeX ?? 800} / ${canvasProps?.sizeY ?? 600}`;
  const posCss = `${focus.x * 100}% ${focus.y * 100}%`;

  const focusFromEvent = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };

  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Framing</span>
        <button
          onClick={() => setBackgroundCrop(target, { focus: { x: 0.5, y: 0.5 }, zoom: 1 })}
          className="text-[10px] text-slate-500 hover:text-sky-300"
          title="Re-center and reset zoom"
        >
          reset
        </button>
      </div>
      <div
        ref={boxRef}
        className="relative w-full cursor-move select-none overflow-hidden rounded border border-slate-700 bg-checker"
        style={{ aspectRatio: aspect }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          draggingRef.current = true;
          dragStart();
          const f = focusFromEvent(e);
          if (f) setBackgroundCrop(target, { focus: f }, { live: true });
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const f = focusFromEvent(e);
          if (f) setBackgroundCrop(target, { focus: f }, { live: true });
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          dragCommit();
        }}
        title="Drag to reposition the visible area"
      >
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full"
            style={{
              objectFit: "cover",
              objectPosition: posCss,
              transform: zoom > 1 ? `scale(${zoom})` : undefined,
              transformOrigin: zoom > 1 ? posCss : undefined,
            }}
          />
        )}
        {/* Focal-point marker */}
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.6)" }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-10 shrink-0 text-[10px] text-slate-400">Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onPointerDown={dragStart}
          onChange={(e) => setBackgroundCrop(target, { zoom: parseFloat(e.target.value) }, { live: true })}
          onPointerUp={dragCommit}
          className="flex-1"
        />
        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-slate-500">{zoom.toFixed(1)}×</span>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded border px-2 py-1 text-[11px] transition ${
        active ? "border-sky-500 bg-sky-600/20 text-sky-100" : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function ColorRow({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  const hex = rgbToHex(value.r, value.g, value.b);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-slate-300">Color</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const { r, g, b } = hexToRgb(e.target.value);
          onChange({ r, g, b, a: value.a ?? 1 });
        }}
        className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-800"
      />
      <span className="flex-1 font-mono text-[10px] text-slate-500">{hex}</span>
    </div>
  );
}

// Front transparency slider. Stores opacity as the tint's alpha (1 = solid),
// but presents it as "transparency %" (0 = solid, 100 = fully clear) to match
// how users think about a see-through panel. Drives both the Front Backing and
// the shared Background slot via setBackgroundOpacity; the rear stays opaque.
// Bracketed with dragStart/dragCommit so a drag is a single undo step.
function TransparencyRow({ target, alpha }: { target: Target; alpha: number }) {
  const setBackgroundOpacity = useStore((s) => s.setBackgroundOpacity);
  const dragStart = useStore((s) => s.dragStart);
  const dragCommit = useStore((s) => s.dragCommit);
  const pct = Math.round((1 - alpha) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-slate-300" title="How see-through the front of the panel is. The back stays opaque so it still shows only the logo + credits.">
        Clear
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onPointerDown={dragStart}
        onChange={(e) => setBackgroundOpacity(target, 1 - parseInt(e.target.value, 10) / 100, { live: true })}
        onPointerUp={dragCommit}
        className="flex-1"
        title="Front transparency"
      />
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-slate-500">{pct}%</span>
    </div>
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
