import { useStore } from "../state/store";
import type { Color, ThemePresetId } from "../model/theme";
import { useT } from "../locale/useT";

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
  const t = useT();
  const setTheme = useStore((s) => s.setTheme);
  const selectPreset = useStore((s) => s.selectThemePreset);
  const applyAll = useStore((s) => s.applyThemeAll);
  const applyBackground = useStore((s) => s.applyThemeBackground);
  const applyHeader = useStore((s) => s.applyThemeHeaderText);
  const applyBody = useStore((s) => s.applyThemeBodyText);
  const applyAccent = useStore((s) => s.applyThemeAccent);
  const applyControlSurface = useStore((s) => s.applyThemeControlSurface);
  const applyContainerSurface = useStore((s) => s.applyThemeContainerSurface);
  const applyButtonA = useStore((s) => s.applyThemeButtonA);
  const applyButtonB = useStore((s) => s.applyThemeButtonB);
  const applyCorner = useStore((s) => s.applyThemeCornerRadius);

  return (
    <div
      className="w-[340px] max-h-[80vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">{t.theme.title}</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200"
          title={t.theme.close}
        >
          ✕
        </button>
      </div>

      <Section title={t.theme.presetSection}>
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
                {t.theme.presets[p.id as keyof typeof t.theme.presets] ?? p.label}
              </button>
            );
          })}
          <div
            className={`flex items-center gap-1.5 rounded border px-2 py-1 ${
              theme.preset === "custom"
                ? "border-sky-500 bg-sky-500/15 text-sky-100"
                : "border-slate-700/50 bg-slate-800/40 text-slate-500"
            }`}
            title={t.theme.customTip}
          >
            {t.theme.custom}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          {t.theme.presetHint}
        </p>
      </Section>

      <Section title={t.theme.colors}>
        <ColorRow
          label={t.theme.background}
          value={theme.background}
          onChange={(c) => { setTheme({ background: c }); applyBackground(); }}
          hint={t.theme.backgroundHint}
        />
        <ColorRow
          label={t.theme.accent}
          value={theme.accent}
          onChange={(c) => { setTheme({ accent: c }); applyAccent(); }}
          hint={t.theme.accentHint}
        />
        <ColorRow
          label={t.theme.controls}
          value={theme.controlSurface}
          onChange={(c) => { setTheme({ controlSurface: c }); applyControlSurface(); }}
          hint={t.theme.controlsHint}
        />
        <ColorRow
          label={t.theme.container}
          value={theme.containerSurface}
          onChange={(c) => { setTheme({ containerSurface: c }); applyContainerSurface(); }}
          hint={t.theme.containerHint}
        />
        <ColorRow
          label={t.theme.buttonA}
          value={theme.buttonA}
          onChange={(c) => { setTheme({ buttonA: c }); applyButtonA(); }}
          hint={t.theme.buttonAHint}
        />
        <ColorRow
          label={t.theme.buttonB}
          value={theme.buttonB}
          onChange={(c) => { setTheme({ buttonB: c }); applyButtonB(); }}
          hint={t.theme.buttonBHint}
        />
      </Section>

      <Section title={t.theme.text}>
        <TextRow
          label={t.theme.header}
          color={theme.headerTextColor}
          size={theme.headerTextSize}
          presets={HEADER_SIZE_PRESETS}
          onChangeColor={(c) => { setTheme({ headerTextColor: c }); applyHeader(); }}
          onChangeSize={(n) => { setTheme({ headerTextSize: n }); applyHeader(); }}
        />
        <TextRow
          label={t.theme.body}
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
          title={t.theme.applyAllTip}
        >
          {t.theme.applyAll}
        </button>
        <p className="mt-1 text-[10px] text-slate-500">
          {t.theme.applyAllHint}
        </p>
      </div>

      <Section title={t.theme.layout}>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-slate-300">{t.theme.radius}</span>
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
          <ApplyButton onClick={applyCorner} title={t.theme.radiusApplyTip} />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {t.theme.radiusHintPre}<em>{t.theme.radiusHintNot}</em>{t.theme.radiusHintMid}<code>cornerRadius</code>{t.theme.radiusHintPost}
        </p>
      </Section>
    </div>
  );
}

function ApplyButton({ onClick, title }: { onClick: () => void; title?: string }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200 transition hover:bg-sky-500/25"
      title={title ?? t.theme.applyTip}
    >
      {t.theme.apply}
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
  const t = useT();
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
        <span className="text-[10px] text-slate-500">{t.theme.size}</span>
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onChangeSize(p.value)}
            className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
              size === p.value
                ? "border-sky-500 bg-sky-500/15 text-sky-100"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
            }`}
            title={t.theme.sizeTip(p.label, p.value)}
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
