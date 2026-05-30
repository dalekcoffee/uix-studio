import { useStore } from "../../state/store";
import { findSlot } from "../../model/operations";
import type { UixComponent, UixComponentType } from "../../model/types";
import type { FieldDescriptor } from "../../model/components";

// Compute a context-aware "starting point" for fields whose stored value is
// undefined. The corner-radius slider starts at 0 (square) when an Image has no
// authored cornerRadius — matching the renderer/exporter, which treat absent as
// square. (Freshly-added Images carry an explicit 100 from defaultProps.)
export function computeEffectiveDefault(
  f: FieldDescriptor,
  _slot: ReturnType<typeof findSlot> | undefined,
  _component: UixComponent,
): unknown {
  if (f.key === "cornerRadius") return 0;
  return undefined;
}

interface FieldProps {
  slotId: string;
  componentType: UixComponentType;
  descriptor: FieldDescriptor;
  value: unknown;
  effectiveDefault?: unknown;
}

// Field kinds that need the full Inspector width — small kinds (number,
// boolean, color, enum) pack two-per-row in the 2-column grid.
const WIDE_KINDS = new Set(["string", "slider", "vec2"]);

export function Field({ slotId, componentType, descriptor, value, effectiveDefault }: FieldProps) {
  const setProp = useStore((s) => s.setProp);
  const update = (v: unknown) => setProp(slotId, componentType, descriptor.key, v);
  const wide = WIDE_KINDS.has(descriptor.kind);

  // Booleans get an inline layout — label and checkbox on one row — to claw
  // back the vertical real estate the stacked layout was wasting.
  if (descriptor.kind === "boolean") {
    return (
      <label className="col-span-1 flex cursor-pointer items-center justify-between gap-2 rounded border border-transparent px-1 py-1 text-xs text-slate-300 hover:border-slate-800 hover:bg-slate-900/40">
        <span className="truncate text-[10px] uppercase tracking-wide text-slate-500">
          {descriptor.label}
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
      <span className="truncate text-[10px] uppercase tracking-wide text-slate-500">
        {descriptor.label}
      </span>
      <FieldInput
        descriptor={descriptor}
        value={value}
        effectiveDefault={effectiveDefault}
        onChange={update}
      />
    </label>
  );
}

function FieldInput({
  descriptor,
  value,
  effectiveDefault,
  onChange,
}: {
  descriptor: FieldDescriptor;
  value: unknown;
  effectiveDefault?: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (descriptor.kind) {
    case "number":
      return (
        <input
          type="number"
          step={descriptor.step ?? 1}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
        />
      );
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
              {o}
            </option>
          ))}
        </select>
      );
    case "vec2": {
      const v = (value as { x: number; y: number }) ?? { x: 0, y: 0 };
      return (
        <div className="grid grid-cols-2 gap-1">
          <input
            type="number"
            step={descriptor.step ?? 1}
            value={v.x}
            onChange={(e) => onChange({ ...v, x: Number(e.target.value) })}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
          />
          <input
            type="number"
            step={descriptor.step ?? 1}
            value={v.y}
            onChange={(e) => onChange({ ...v, y: Number(e.target.value) })}
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
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={c.a}
            onChange={(e) => onChange({ ...c, a: Number(e.target.value) })}
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
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={display}
            onChange={(e) => onChange(Number(e.target.value))}
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
