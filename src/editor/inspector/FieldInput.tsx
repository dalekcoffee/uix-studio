import { useState } from "react";
import { useStore } from "../../state/store";
import { findSlot } from "../../model/operations";
import type { UixComponent, UixComponentType } from "../../model/types";
import type { FieldDescriptor } from "../../model/components";
import { localizedFieldLabel, localizedEnumOption } from "../../locale/fieldText";
import { DEFAULT_CONTENT_PADDING } from "../../model/padding";

// Container padding fields that inherit HALF the Canvas.contentPadding when left
// at the -1 "auto" sentinel (see resolvePad in model/padding.ts).
const INHERIT_PAD_KEYS = new Set([
  "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", // layouts
  "padding",      // ScrollArea inner padding
  "pagePadding",  // Tabs page padding
]);

// Compute a context-aware "starting point" for fields whose stored value is
// undefined OR sits at an "auto" sentinel. The corner-radius slider starts at 0
// (square) when an Image has no authored cornerRadius — matching the
// renderer/exporter, which treat absent as square. Container padding fields show
// the inherited half-of-canvas value (instead of the raw -1 sentinel) so the
// number reads as what's actually applied.
export function computeEffectiveDefault(
  f: FieldDescriptor,
  _slot: ReturnType<typeof findSlot> | undefined,
  _component: UixComponent,
  canvasPad: number = DEFAULT_CONTENT_PADDING,
): unknown {
  if (f.key === "cornerRadius") return 0;
  // Canvas content padding: presets don't bake the prop, so show the schema
  // default (16) rather than blank/0 when unset.
  if (f.key === "contentPadding") return DEFAULT_CONTENT_PADDING;
  if (INHERIT_PAD_KEYS.has(f.key)) return Math.round(canvasPad / 2);
  return undefined;
}

interface FieldProps {
  slotId: string;
  componentType: UixComponentType;
  descriptor: FieldDescriptor;
  value: unknown;
  effectiveDefault?: unknown;
  // Optional write override. When omitted, the field writes straight through
  // store.setProp (the default for every plain component field). Callers that
  // need a side effect on edit (e.g. the Tabs Appearance panel, which must
  // re-lay / re-tint the preview) pass their own handler.
  onChange?: (value: unknown) => void;
}

// Field kinds that need the full Inspector width — small kinds (number,
// boolean, color, enum) pack two-per-row in the 2-column grid.
const WIDE_KINDS = new Set(["string", "slider", "vec2"]);

export function Field({ slotId, componentType, descriptor, value, effectiveDefault, onChange }: FieldProps) {
  const setProp = useStore((s) => s.setProp);
  const lang = useStore((s) => s.language);
  const update = (v: unknown) =>
    onChange ? onChange(v) : setProp(slotId, componentType, descriptor.key, v);
  const wide = WIDE_KINDS.has(descriptor.kind);
  const label = localizedFieldLabel(descriptor.label, lang);

  // Booleans get an inline layout — label and checkbox on one row — to claw
  // back the vertical real estate the stacked layout was wasting.
  if (descriptor.kind === "boolean") {
    return (
      <label className="col-span-1 flex cursor-pointer items-center justify-between gap-2 rounded border border-transparent px-1 py-1 text-xs text-slate-300 hover:border-slate-800 hover:bg-slate-900/40">
        <span
          className="truncate text-[10px] uppercase tracking-wide text-slate-500"
          title={label}
        >
          {label}
        </span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => update(e.target.checked)}
          className="h-4 w-4 flex-shrink-0"
        />
      </label>
    );
  }

  return (
    <label
      className={`${wide ? "col-span-2" : "col-span-1"} flex min-w-0 flex-col gap-1 text-xs text-slate-300`}
    >
      <span
        className="truncate text-[10px] uppercase tracking-wide text-slate-500"
        title={label}
      >
        {label}
      </span>
      <FieldInput
        descriptor={descriptor}
        value={value}
        effectiveDefault={effectiveDefault}
        onChange={update}
        lang={lang}
      />
    </label>
  );
}

// A numeric <input> that never writes NaN into the model and clamps to the
// field's declared range. Keeps a local string buffer while focused so a
// partially-typed value ("-", "0.", "1e") survives keystroke-to-keystroke
// instead of being normalized away by the controlled value — only finite,
// in-range parses are committed (live, so the preview stays responsive). On
// blur the buffer is dropped and the input re-syncs to the stored value.
function NumberField({
  value,
  step,
  min,
  max,
  onCommit,
  className,
  title,
}: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (n: number) => void;
  className?: string;
  title?: string;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const shown = buf ?? (Number.isFinite(value) ? String(value) : "");
  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  return (
    <input
      type="number"
      step={step ?? 1}
      min={min}
      max={max}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        setBuf(raw);
        const n = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(n)) onCommit(clamp(n));
      }}
      onBlur={() => setBuf(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape")
          (e.target as HTMLInputElement).blur();
      }}
      className={className}
      title={title}
    />
  );
}

function FieldInput({
  descriptor,
  value,
  effectiveDefault,
  onChange,
  lang,
}: {
  descriptor: FieldDescriptor;
  value: unknown;
  effectiveDefault?: unknown;
  onChange: (v: unknown) => void;
  lang: import("../../locale/types").Lang;
}) {
  switch (descriptor.kind) {
    case "number": {
      // An "auto" sentinel (value < 0 with a numeric effectiveDefault, i.e. a
      // container padding inheriting half the canvas padding) shows the
      // effective value rather than the raw -1. Fields without an effective
      // default (sizes, offsets) keep their stored value, negatives included.
      const eff = typeof effectiveDefault === "number" ? effectiveDefault : undefined;
      const num = typeof value === "number" ? value : undefined;
      const display = num !== undefined && (num >= 0 || eff === undefined)
        ? num
        : (eff ?? 0);
      return (
        <NumberField
          value={display}
          step={descriptor.step}
          min={descriptor.min}
          max={descriptor.max}
          onCommit={onChange}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
        />
      );
    }
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 self-start"
        />
      );
    case "string":
      return (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
        />
      );
    case "enum":
      return (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
        >
          {descriptor.options!.map((o) => (
            <option key={o} value={o}>
              {localizedEnumOption(o, lang)}
            </option>
          ))}
        </select>
      );
    case "vec2": {
      const v = (value as { x: number; y: number }) ?? { x: 0, y: 0 };
      return (
        <div className="grid grid-cols-2 gap-1">
          <NumberField
            value={v.x}
            step={descriptor.step}
            onCommit={(n) => onChange({ ...v, x: n })}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
          />
          <NumberField
            value={v.y}
            step={descriptor.step}
            onCommit={(n) => onChange({ ...v, y: n })}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
          />
        </div>
      );
    }
    case "color": {
      const c = (value as { r: number; g: number; b: number; a: number }) ?? {
        r: 1,
        g: 1,
        b: 1,
        a: 1,
      };
      const hex = rgbToHex(c.r, c.g, c.b);
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              const { r, g, b } = hexToRgb(e.target.value);
              onChange({ r, g, b, a: c.a });
            }}
            className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-800"
          />
          <NumberField
            value={c.a}
            min={0}
            max={1}
            step={0.05}
            onCommit={(n) => onChange({ ...c, a: n })}
            className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            title="alpha"
          />
        </div>
      );
    }
    case "slider": {
      // Display the stored value when set; otherwise pre-fill with the
      // context-aware effective default so the slider position matches what
      // the user is currently seeing rendered.
      const fallback = typeof effectiveDefault === "number" ? effectiveDefault : (descriptor.min ?? 0);
      const display = typeof value === "number" ? value : fallback;
      const min = descriptor.min ?? 0;
      const max = descriptor.max ?? 100;
      const step = descriptor.step ?? 1;
      const unit = descriptor.unit ?? "";
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={display}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-sky-400"
          />
          <NumberField
            value={display}
            min={min}
            max={max}
            step={step}
            onCommit={onChange}
            className="w-14 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
          />
          {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
        </div>
      );
    }
  }
}


function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}
