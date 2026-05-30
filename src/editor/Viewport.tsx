import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useStore } from "../state/store";
import { RenderedSlot } from "./render/renderSlot";
import { findSlot } from "../model/operations";
import type { Rect } from "./render/rectTransform";
import DragLayer from "./DragLayer";
import { snapFitness } from "./render/snapFlow";
import { dragController } from "./dragController";

export default function Viewport() {
  const root = useStore((s) => s.root);
  const selectedSlotId = useStore((s) => s.selectedSlotId);
  const select = useStore((s) => s.select);
  const viewport = useStore((s) => s.viewport);
  const setViewport = useStore((s) => s.setViewport);
  const resetViewport = useStore((s) => s.resetViewport);
  const snap = useStore((s) => s.snap);
  const setSnap = useStore((s) => s.setSnap);
  const editMode = useStore((s) => s.editMode);
  const setEditMode = useStore((s) => s.setEditMode);
  const autoArrange = useStore((s) => s.autoArrange);
  const freeEditsDirty = useStore((s) => s.freeEditsDirty);
  const setProp = useStore((s) => s.setProp);

  // Snap and Free imply different EXPORT layouts, persisted as Canvas.stackLayout:
  //   Snap → true  (layout-driven: in-game reordering moves elements)
  //   Free → false (absolute positions: NOT rearrangeable once exported)
  // The toggle is the warned control for this — see switchToSnap/switchToFree.
  const setStackLayout = (on: boolean) => setProp(root.id, "Canvas", "stackLayout", on);

  // Switching Free → Snap re-flows everything into rows, which can discard the
  // manual positions the user set in Free mode. Warn once (only if they made
  // free-mode edits) before doing it. autoArrange clears the dirty flag.
  const switchToSnap = () => {
    if (editMode === "snap") return;
    if (
      freeEditsDirty &&
      !window.confirm(
        "Switch to Snap?\n\nSnap mode arranges elements into rows and will re-flow your layout. Manual positions you set in Free mode may be lost.\n\nSnap also re-enables Stack Layout, so the exported panel stays reorderable in-game.",
      )
    ) {
      return;
    }
    setEditMode("snap");
    setStackLayout(true);
    if (freeEditsDirty) autoArrange();
  };

  // Switching Snap → Free drops to absolute positioning and turns off Stack
  // Layout, so the exported panel can no longer be rearranged in-game (changing
  // a slot's order won't move it). Warn before committing to that.
  const switchToFree = () => {
    if (editMode === "free") return;
    if (
      !window.confirm(
        "Switch to Free?\n\nFree mode positions every element by exact coordinates — great for precise design. But the exported panel becomes HARD to edit in Resonite: reordering slots in-game will NOT move elements.\n\nSnap mode keeps the panel reorderable in-game. Continue to Free?",
      )
    ) {
      return;
    }
    setEditMode("free");
    setStackLayout(false);
  };
  const scaleCanvasContents = useStore((s) => s.scaleCanvasContents);
  const setScaleCanvasContents = useStore((s) => s.setScaleCanvasContents);
  const canvasResizeView = useStore((s) => s.canvasResizeView);
  const showOverlays = useStore((s) => s.showOverlays);
  const toggleOverlays = useStore((s) => s.toggleOverlays);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Track space key for hold-to-pan
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setSpaceDown(true);
        dragController.spaceHeld = true;
      }
    }
    function up(e: KeyboardEvent) {
      if (e.code === "Space") {
        setSpaceDown(false);
        dragController.spaceHeld = false;
      }
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const canvasComp = root.components.find((c) => c.type === "Canvas");
  const canvasSize = useMemo(() => {
    const p = canvasComp?.props as { sizeX?: number; sizeY?: number } | undefined;
    return { w: p?.sizeX ?? 800, h: p?.sizeY ?? 600 };
  }, [canvasComp]);

  // Some templates (ID cards, single-block panels, layered designs) have nothing
  // meaningful to reorder and reflow poorly — nudge the user toward Free mode.
  const snapPoorFit = useMemo(
    () => snapFitness(root, canvasSize).complex,
    [root, canvasSize],
  );

  // Breadcrumb: name + most salient component type of the selected slot, so the
  // user can always tell what they're about to edit/resize (catches the
  // "I grabbed the backing by accident" confusion early).
  const selectedLabel = useMemo(() => {
    if (!selectedSlotId) return "nothing selected";
    const slot = findSlot(root, selectedSlotId);
    if (!slot) return "nothing selected";
    const skip = new Set(["RectTransform", "LayoutElement", "BoxCollider"]);
    const primary = slot.components.find((c) => !skip.has(c.type))?.type;
    return primary ? `${slot.name} · ${primary}` : slot.name;
  }, [root, selectedSlotId]);

  const padding = 32;
  const avail = {
    w: Math.max(0, size.w - padding * 2),
    h: Math.max(0, size.h - padding * 2),
  };
  const fitScale =
    avail.w > 0 && avail.h > 0
      ? Math.min(avail.w / canvasSize.w, avail.h / canvasSize.h, 1)
      : 1;
  // While a Canvas resize handle is being dragged, hold the zoom captured at
  // drag start so the panel visibly extends in the drag direction instead of
  // shrinking to re-fit each frame (which looked like it was "narrowing").
  const scale = canvasResizeView ? canvasResizeView.scale : fitScale * viewport.zoom;
  const scaledW = canvasSize.w * scale;
  const scaledH = canvasSize.h * scale;
  // Centering half-extents. Pinned to drag-start during a resize so the preview's
  // top-left stays put and the panel grows down/right with the cursor, instead of
  // expanding symmetrically about the centre (which halves apparent handle speed).
  const halfW = canvasResizeView ? canvasResizeView.halfW : scaledW / 2;
  const halfH = canvasResizeView ? canvasResizeView.halfH : scaledH / 2;

  // Wheel: ctrl+wheel zooms, plain wheel pans vertically
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        const factor = Math.exp(dir * 0.1);
        const newZoom = Math.max(0.1, Math.min(8, viewport.zoom * factor));
        setViewport({ zoom: newZoom });
      } else if (e.shiftKey) {
        e.preventDefault();
        setViewport({ panX: viewport.panX - e.deltaY });
      } else {
        e.preventDefault();
        setViewport({ panX: viewport.panX - e.deltaX, panY: viewport.panY - e.deltaY });
      }
    },
    [viewport, setViewport],
  );

  // Native non-passive wheel listener (React's onWheel is passive in some browsers)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handler(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    }
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    const isPan = e.button === 1 || (e.button === 0 && spaceDown);
    if (!isPan) return;
    e.preventDefault();
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
    };
  }

  useEffect(() => {
    function move(e: MouseEvent) {
      const p = panRef.current;
      if (!p) return;
      setViewport({
        panX: p.panX + (e.clientX - p.startX),
        panY: p.panY + (e.clientY - p.startY),
      });
    }
    function up() {
      panRef.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [setViewport]);

  const rootRect: Rect = { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h };

  const gridBg = snap.enabled
    ? `linear-gradient(to right, rgba(56,189,248,0.08) 1px, transparent 1px) 0 0 / ${snap.size * scale}px ${snap.size * scale}px,
       linear-gradient(to bottom, rgba(56,189,248,0.08) 1px, transparent 1px) 0 0 / ${snap.size * scale}px ${snap.size * scale}px`
    : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none"
      style={{
        // Soft warm off-white — easier on the eyes than pure white, still reads as a working canvas surface.
        background: "#E8E6E0",
        cursor: spaceDown ? (panRef.current ? "grabbing" : "grab") : "default",
      }}
      // Left-clicking the bare white space around the panel DESELECTS — the
      // natural "click away to deselect" gesture. Guards:
      //  - only the container itself (e.target===currentTarget), so clicks on
      //    the canvas / slots / grab rails / scrollbar are untouched;
      //  - a small buffer around the canvas forgives misclicks just outside the
      //    panel edge while editing;
      //  - skipped while space-panning. Right-click still opens the Canvas
      //    add-menu (onContextMenu below) — only the LEFT click deselects.
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (spaceDown || panRef.current) return;
        if (!selectedSlotId) return;
        const el = containerRef.current;
        if (el) {
          const b = el.getBoundingClientRect();
          const cx = e.clientX - b.left;
          const cy = e.clientY - b.top;
          const left = b.width / 2 - halfW + viewport.panX;
          const top = b.height / 2 - halfH + viewport.panY;
          const BUF = 32; // misclick forgiveness around the panel edge
          const insideBuffered =
            cx >= left - BUF && cx <= left + scaledW + BUF &&
            cy >= top - BUF && cy <= top + scaledH + BUF;
          if (insideBuffered) return;
        }
        select(null);
      }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        // Right-clicks inside the canvas itself are stopped by RenderedSlot,
        // so reaching this handler always means white space around the panel.
        // Treat it like right-clicking the Canvas root: opens the "add new
        // slot under Canvas" menu regardless of what's currently selected.
        openContextMenu(e.clientX, e.clientY, root.id);
      }}
    >
      <div
        className="absolute"
        style={{
          left: `calc(50% - ${halfW}px + ${viewport.panX}px)`,
          top: `calc(50% - ${halfH}px + ${viewport.panY}px)`,
          width: scaledW,
          height: scaledH,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden shadow-2xl shadow-black/50"
          style={{
            width: canvasSize.w,
            height: canvasSize.h,
            transform: `scale(${scale})`,
            // Transparency checkerboard — NOT the Canvas component's
            // backgroundColor. In Resonite a Canvas is invisible on its own
            // (compCanvas emits no background); a panel's visible backdrop comes
            // only from an actual Background/Image slot in the hierarchy, which
            // RenderedSlot already draws on top of this checker. Presets with a
            // full-canvas Background look identical (the opaque fill hides the
            // checker); backgroundless presets (dialogs, floating text) now read
            // as "transparent — content floats", matching the export instead of
            // inventing a phantom backdrop.
            backgroundColor: "#d6d4ce",
            backgroundImage:
              "linear-gradient(45deg, #bdbbb4 25%, transparent 25%, transparent 75%, #bdbbb4 75%, #bdbbb4), linear-gradient(45deg, #bdbbb4 25%, transparent 25%, transparent 75%, #bdbbb4 75%, #bdbbb4)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 12px 12px",
            border: "1px solid #1e293b",
          }}
        >
          <RenderedSlot slot={root} rect={rootRect} isRoot />
        </div>

        {gridBg && (
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{
              width: scaledW,
              height: scaledH,
              background: gridBg,
            }}
          />
        )}

        <DragLayer scale={scale} canvasSize={canvasSize} />
      </div>

      {/* Floating viewport controls */}
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs shadow-lg backdrop-blur">
        <button
          title="Zoom out"
          onClick={() =>
            setViewport({ zoom: Math.max(0.1, Math.round(viewport.zoom * 10 - 1) / 10) })
          }
          className="rounded px-1 text-slate-300 hover:bg-slate-700"
        >
          −
        </button>
        <button
          onClick={resetViewport}
          className="min-w-[3rem] rounded px-1 text-slate-200 hover:bg-slate-700"
          title="Reset view (fit)"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          title="Zoom in"
          onClick={() =>
            setViewport({ zoom: Math.min(8, Math.round(viewport.zoom * 10 + 1) / 10) })
          }
          className="rounded px-1 text-slate-300 hover:bg-slate-700"
        >
          +
        </button>
        <button
          title="Recenter canvas (F)"
          onClick={resetViewport}
          className="rounded px-1.5 text-slate-300 hover:bg-slate-700"
        >
          ⊙ Recenter
        </button>
        <div className="mx-1 h-4 w-px bg-slate-700" />
        <label
          className="flex cursor-pointer items-center gap-1 text-slate-300"
          title="Snap to grid"
        >
          <input
            type="checkbox"
            checked={snap.enabled}
            onChange={(e) => setSnap({ enabled: e.target.checked })}
            className="h-3 w-3"
          />
          <span>Grid</span>
        </label>
        {snap.enabled && (
          <input
            type="number"
            min={1}
            max={128}
            value={snap.size}
            onChange={(e) => setSnap({ size: Math.max(1, Number(e.target.value) || 1) })}
            className="w-12 rounded border border-slate-700 bg-slate-800 px-1 text-slate-100"
            title="Grid size (px)"
          />
        )}
        <div className="mx-1 h-4 w-px bg-slate-700" />
        {/* Edit mode: Snap (block-editor reorder) vs Free (absolute drag) */}
        <div
          className="flex items-center overflow-hidden rounded border border-slate-700"
          title="Snap: dragging a block reorders it and shifts the others out of the way. Free: drag to any position."
        >
          <button
            onClick={switchToSnap}
            className={`px-1.5 py-0.5 ${editMode === "snap" ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-700"}`}
          >
            ▤ Snap
          </button>
          <button
            onClick={switchToFree}
            className={`px-1.5 py-0.5 ${editMode === "free" ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-700"}`}
          >
            ✥ Free
          </button>
        </div>
        {snapPoorFit && editMode === "snap" && (
          <span
            className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300"
            title="This template's elements overlap or there's only one block to move, so Snap reordering won't help much (and may shift things around). Free mode lets you position each element precisely."
          >
            ℹ Tip: this template is easier to edit in Free mode
          </span>
        )}
        {editMode === "snap" && (
          <>
            <button
              onClick={autoArrange}
              title="Tidy the rows into a clean vertical stack — removes overlaps and evens out spacing"
              className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:border-sky-500 hover:text-sky-200"
            >
              ⤓ Auto-arrange
            </button>
            <label
              className="flex cursor-pointer items-center gap-1 text-slate-300"
              title="Vertical gap (px) kept between stacked rows when reflowing in Snap mode"
            >
              <span>Gap</span>
              <input
                type="number"
                min={0}
                max={200}
                value={snap.rowGap}
                onChange={(e) =>
                  setSnap({ rowGap: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-12 rounded border border-slate-700 bg-slate-800 px-1 text-slate-100"
              />
            </label>
          </>
        )}
        <label
          className="flex cursor-pointer items-center gap-1 text-slate-300"
          title="When resizing the Canvas (select it, then drag a handle): OFF = elements keep their size, the canvas just gains/loses empty space; ON = scale every child proportionally so the whole panel grows/shrinks uniformly."
        >
          <input
            type="checkbox"
            checked={scaleCanvasContents}
            onChange={(e) => setScaleCanvasContents(e.target.checked)}
            className="h-3 w-3"
          />
          <span>Scale contents</span>
        </label>
        <div className="mx-1 h-4 w-px bg-slate-700" />
        <label
          className="flex cursor-pointer items-center gap-1 text-slate-300"
          title="Show per-element outlines, layout labels, and the image-placeholder hatched fill (editor-only overlays)"
        >
          <input
            type="checkbox"
            checked={showOverlays}
            onChange={toggleOverlays}
            className="h-3 w-3"
          />
          <span>Overlay</span>
        </label>
      </div>

      <div className="absolute bottom-2 left-3 flex items-center gap-2 rounded bg-white/60 px-2 py-1 text-[10px] text-slate-600 backdrop-blur">
        <span>
          Canvas {canvasSize.w}×{canvasSize.h} @ {(scale * 100).toFixed(0)}%
        </span>
        <span className="text-slate-400">·</span>
        <span>zoom {viewport.zoom.toFixed(2)}×</span>
        <span className="text-slate-400">·</span>
        <span>{snap.enabled ? `snap ${snap.size}px` : "snap off"}</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium text-sky-700" title="Currently selected slot">
          {selectedLabel}
        </span>
      </div>
    </div>
  );
}
