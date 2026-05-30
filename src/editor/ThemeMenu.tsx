import { useStore } from "../state/store";
import type { Color, ThemePresetId } from "../model/theme";

const PRESET_CHIPS: { id: ThemePresetId; label: string; swatch: string }[] = [
  { id: "dark",    label: "Dark",    swatch: "#0d0d0d" },
  { id: "light",   label: "Light",   swatch: "#f5f5f5" },
  { id: "sakura",  label: "Sakura",  swatch: "#e88aa5" },
  { id: "tech",    label: "Tech",    swatch: "#00d9ff" },
  { id: "coffee",  label: "Coffee",  swatch: "#7d5c43" },
  { id: "frosted", label: "Frosted", swatch: "rgba(180,200,240,0.45)" },
];

const TEXT_SIZE_PRESETS = [
  { label: "S", value: 11 },
  { label: "M", value: 13 },
  { label: "L", value: 16 },
  { label: "XL", value: 20 },
];

const HEADER_SIZE_PRESETS = [
  { label: "S", value: 14 },
  { label: "M", value: 18 },
  { label: "L", value: 22 },
  { label: "XL", value: 28 },
];

export default function ThemeMenu({ onClose }: { onClose: () => void }) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const selectPreset = useStore((s) => s.selectThemePreset);
  const applyAll = useStore((s) => s.applyThemeAll);
  const applyBackground = useStore((s) => s.applyThemeBackground);
  const applyHeader = useStore((s) => s.applyThemeHeaderText);
  const applyBody = useStore((s) => s.applyThemeBodyText);
  const applyAccent = useStore((s) => s.applyThemeAccent);
  const applyControlSurface = useStore((s) => s.applyThemeControlSurface);
  const applyButtonA = useStore((s) => s.applyThemeButtonA);
  const applyButtonB = useStore((s) => s.applyThemeButtonB);
  const applyCorner = useStore((s) => s.applyThemeCornerRadius);

  return (
    <div
      className="w-[340px] max-h-[80vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">Theme</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200"
          title="Close"
        >
          ✕
        </button>
      </div>

      <Section title="Preset">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_CHIPS.map((p) => {
            const active = theme.preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => selectPreset(p.id)}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 transition ${
                  active
                    ? "border-sky-500 bg-sky-500/15 text-sky-100"
                    : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
                }`}
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm ring-1 ring-slate-600"
                  style={{ background: p.swatch }}
                />
                {p.label}
              </button>
            );
          })}
          <div
            className={`flex items-center gap-1.5 rounded border px-2 py-1 ${
              theme.preset === "custom"
                ? "border-sky-500 bg-sky-500/15 text-sky-100"
                : "border-slate-700/50 bg-slate-800/40 text-slate-500"
            }`}
            title="Set automatically when you manually edit any theme value"
          >
            Custom
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Picking a preset replaces all theme values and applies them to the panel.
        </p>
      </Section>

      <Section title="Colors">
        <ColorRow
          label="Background"
          value={theme.background}
          onChange={(c) => { setTheme({ background: c }); applyBackground(); }}
          hint="Panel fill · header · body surface"
        />
        <ColorRow
          label="Accent"
          value={theme.accent}
          onChange={(c) => { setTheme({ accent: c }); applyAccent(); }}
          hint="Slider fill · progress · toggle · radio dot · spinner"
        />
        <ColorRow
          label="Controls"
          value={theme.controlSurface}
          onChange={(c) => { setTheme({ controlSurface: c }); applyControlSurface(); }}
          hint="Slider track · text field · checkbox · pill · dropdown · radio bg"
        />
        <ColorRow
          label="Button A"
          value={theme.buttonA}
          onChange={(c) => { setTheme({ buttonA: c }); applyButtonA(); }}
          hint="Primary action — hover/press shades auto-derived"
        />
        <ColorRow
          label="Button B"
          value={theme.buttonB}
          onChange={(c) => { setTheme({ buttonB: c }); applyButtonB(); }}
          hint="Secondary action"
        />
      </Section>

      <Section title="Text">
        <TextRow
          label="Header"
          color={theme.headerTextColor}
          size={theme.headerTextSize}
          presets={HEADER_SIZE_PRESETS}
          onChangeColor={(c) => { setTheme({ headerTextColor: c }); applyHeader(); }}
          onChangeSize={(n) => { setTheme({ headerTextSize: n }); applyHeader(); }}
        />
        <TextRow
          label="Body"
          color={theme.bodyTextColor}
          size={theme.bodyTextSize}
          presets={TEXT_SIZE_PRESETS}
          onChangeColor={(c) => { setTheme({ bodyTextColor: c }); applyBody(); }}
          onChangeSize={(n) => { setTheme({ bodyTextSize: n }); applyBody(); }}
        />
      </Section>

      <div className="mt-2 border-t border-slate-700 pt-2">
        <button
          onClick={applyAll}
          className="w-full rounded border border-sky-500 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
          title="Re-push every theme value onto the panel — useful after loading a saved file or manually editing a slot"
        >
          Apply All to Panel
        </button>
        <p className="mt-1 text-[10px] text-slate-500">
          Colors update the panel live as you edit. Use this to resync after loading a file or manually editing slots. Corner radius is excluded — apply it separately below.
        </p>
      </div>

      <Section title="Layout">
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-slate-300">Radius</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={theme.cornerRadius}
            onChange={(e) => setTheme({ cornerRadius: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-10 shrink-0 text-right text-slate-400 tabular-nums">
            {theme.cornerRadius}%
          </span>
          <ApplyButton onClick={applyCorner} title="Push this radius to every colored-shape Image" />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Manual only — does <em>not</em> auto-apply. Click Apply to bulk-set <code>cornerRadius</code> on every colored-shape Image (0 = square, 100 = pill). Skips photo/icon Images and overrides per-element radii.
        </p>
      </Section>
    </div>
  );
}

function ApplyButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200 transition hover:bg-sky-500/25"
      title={title ?? "Apply this value to every matching slot"}
    >
      Apply
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 border-t border-slate-800 pt-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: Color;
  onChange: (c: Color) => void;
  hint?: string;
}) {
  const hex = rgbToHex(value.r, value.g, value.b);
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-slate-300">{label}</span>
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const { r, g, b } = hexToRgb(e.target.value);
            onChange({ r, g, b, a: value.a });
          }}
          className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-800"
        />
        <span className="flex-1 font-mono text-[10px] text-slate-500">{hex}</span>
      </div>
      {hint && <div className="mt-0.5 pl-[88px] text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function TextRow({
  label,
  color,
  size,
  presets,
  onChangeColor,
  onChangeSize,
}: {
  label: string;
  color: Color;
  size: number;
  presets: { label: string; value: number }[];
  onChangeColor: (c: Color) => void;
  onChangeSize: (n: number) => void;
}) {
  const hex = rgbToHex(color.r, color.g, color.b);
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-slate-300">{label}</span>
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const { r, g, b } = hexToRgb(e.target.value);
            onChangeColor({ r, g, b, a: color.a });
          }}
          className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-800"
        />
        <span className="flex-1 font-mono text-[10px] text-slate-500">{hex}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 pl-[88px]">
        <span className="text-[10px] text-slate-500">Size</span>
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onChangeSize(p.value)}
            className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
              size === p.value
                ? "border-sky-500 bg-sky-500/15 text-sky-100"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
            }`}
            title={`${p.label} = ${p.value}px`}
          >
            {p.label}
          </button>
        ))}
        <input
          type="number"
          min={6}
          max={64}
          step={1}
          value={size}
          onChange={(e) => onChangeSize(Number(e.target.value) || 0)}
          className="w-12 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-right text-[10px] text-slate-200"
        />
        <span className="text-[10px] text-slate-500">px</span>
      </div>
    </div>
  );
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
