import { useStore, type AlignAxis, type AlignMode } from "../state/store";
import { findSlot } from "../model/operations";
import type { Slot, UixComponent, UixComponentType } from "../model/types";
import { FIELD_DESCRIPTORS } from "../model/components";
import { componentLabel } from "../model/palette";
import { controlDisplayName } from "../model/controlName";
import { controllingClickable } from "../model/clickable";
import { Field, computeEffectiveDefault } from "./inspector/FieldInput";
import { CustomImagePicker } from "./inspector/ImagePicker";
import { isLayoutManaged } from "./render/slotRect";
import { BUTTON_PRESETS, detectButtonPreset } from "../model/buttonPresets";
import { useState } from "react";

export default function Inspector() {
  const selectedId = useStore((s) => s.selectedSlotId);
  const root = useStore((s) => s.root);
  const slot = selectedId ? findSlot(root, selectedId) : null;
  const detach = useStore((s) => s.detachComponent);
  const hidden = useStore((s) => s.rightPanelHidden);
  const toggle = useStore((s) => s.toggleRightPanel);

  if (hidden) {
    return (
      <button
        onClick={toggle}
        title="Show Inspector panel"
        aria-label="Show Inspector panel"
        className="flex h-full w-6 items-center justify-center border-l border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-sky-300"
      >
        <span className="text-xs">◀</span>
      </button>
    );
  }

  if (!slot) {
    return (
      <div className="flex h-full flex-col border-l border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Inspector
          </span>
          <button
            onClick={toggle}
            title="Hide panel"
            aria-label="Hide Inspector panel"
            className="rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            ▶
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
          <div className="text-3xl">👆</div>
          <div>Click an element on the canvas, or pick one from the Hierarchy panel, to edit its properties.</div>
          <div className="mt-2 text-[10px] text-slate-600">
            Tip: drag in the canvas to move · drag in Hierarchy to reorder
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900">
      <div className="flex items-start justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Inspector
          </div>
          <div className="mt-1 text-sm text-slate-200">{controlDisplayName(slot)}</div>
          <div className="mt-1 text-[10px] text-slate-500">id: {slot.id.slice(0, 8)}</div>
        </div>
        <button
          onClick={toggle}
          title="Hide panel"
          className="rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          ▶
        </button>
      </div>

      {slot.id !== root.id && slot.components.some((c) => c.type === "RectTransform") && (
        <AlignWidget slot={slot} />
      )}

      <ComponentList
        key={slot.id}
        slot={slot}
        isRoot={slot.id === root.id}
        onDetach={(t) => detach(slot.id, t)}
      />
    </div>
  );
}

// Components that are mostly plumbing — every slot needs a RectTransform,
// layout containers manage their children's positions, BoxColliders are
// invisible hit areas, etc. These get tucked into a collapsed "System
// components" section at the bottom of the Inspector so the user-facing
// components (the actual visual building blocks) sit up top where the focus
// belongs.
const SYSTEM_COMPONENTS: ReadonlySet<UixComponentType> = new Set([
  "RectTransform",
  "LayoutElement",
  "BoxCollider",
  "Mask",
  "IgnoreLayout",
  // Close is plumbing for the "Close window" button preset (→ ButtonDestroy at
  // export). It's configured via the preset, not edited directly, so tuck it
  // under System Components rather than showing it as a confusing primary card.
  "Close",
]);

function ComponentList({
  slot,
  isRoot,
  onDetach,
}: {
  slot: Slot;
  isRoot: boolean;
  onDetach: (type: UixComponentType) => void;
}) {
  const [systemOpen, setSystemOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<UixComponentType>>(new Set());

  const primary = slot.components.filter((c) => !SYSTEM_COMPONENTS.has(c.type));
  const system = slot.components.filter((c) => SYSTEM_COMPONENTS.has(c.type));

  const toggle = (t: UixComponentType) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const collapseAll = () =>
    setCollapsed(new Set(slot.components.map((c) => c.type)));
  const expandAll = () => setCollapsed(new Set());

  const anyExpanded = slot.components.some((c) => !collapsed.has(c.type));

  return (
    <div className="flex flex-col gap-2 px-3 pb-6">
      {slot.components.length > 1 && (
        <div className="-mt-1 mb-1 flex items-center justify-end gap-1 text-[10px]">
          <button
            onClick={anyExpanded ? collapseAll : expandAll}
            className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            title={anyExpanded ? "Collapse every component" : "Expand every component"}
          >
            {anyExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}

      {primary.map((comp) => (
        <ComponentEditor
          key={comp.type}
          slotId={slot.id}
          component={comp}
          isRoot={isRoot}
          collapsed={collapsed.has(comp.type)}
          onToggleCollapsed={() => toggle(comp.type)}
          onRemove={() => onDetach(comp.type)}
        />
      ))}

      {system.length > 0 && (
        <div className="mt-2 rounded border border-slate-800 bg-slate-950/30">
          <button
            onClick={() => setSystemOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-slate-800/40"
            title="Plumbing components that Resonite needs — rarely edited directly"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {systemOpen ? "▼" : "▶"} System Components
              <span className="ml-1 text-slate-600">({system.length})</span>
            </span>
            <span className="text-[10px] text-slate-600">
              {system.map((c) => c.type).join(" · ")}
            </span>
          </button>
          {systemOpen && (
            <div className="flex flex-col gap-2 border-t border-slate-800 p-2">
              <div className="rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 text-[10px] leading-snug text-amber-300/90">
                ⚠ These components make the panel work. Editing them by hand can
                break or change behavior in ways the web editor won't account for
                — adjust only if you know what you're doing.
              </div>
              {system.map((comp) => (
                <ComponentEditor
                  key={comp.type}
                  slotId={slot.id}
                  component={comp}
                  isRoot={isRoot}
                  collapsed={collapsed.has(comp.type)}
                  onToggleCollapsed={() => toggle(comp.type)}
                  onRemove={() => onDetach(comp.type)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ComponentEditorProps {
  slotId: string;
  component: UixComponent;
  isRoot: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onRemove: () => void;
}

function ComponentEditor({
  slotId,
  component,
  isRoot,
  collapsed,
  onToggleCollapsed,
  onRemove,
}: ComponentEditorProps) {
  const fields = FIELD_DESCRIPTORS[component.type];
  const isRootCanvas = isRoot && component.type === "Canvas";
  const props = component.props as Record<string, unknown>;
  const root = useStore((s) => s.root);
  const slot = findSlot(root, slotId);

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40">
      <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1">
        <button
          onClick={onToggleCollapsed}
          className="flex flex-1 items-center gap-1 text-left text-xs font-semibold text-sky-300 hover:text-sky-200"
          title={collapsed ? "Expand component" : "Collapse component"}
        >
          <span className="inline-block w-3 text-[10px] text-slate-500">
            {collapsed ? "▶" : "▼"}
          </span>
          <span>{componentLabel(component.type)}</span>
          {collapsed && fields.length > 0 && (
            <span className="ml-2 truncate text-[10px] font-normal text-slate-500">
              {fields.length} field{fields.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {!isRootCanvas && (
          <button
            onClick={onRemove}
            className="rounded px-1 text-xs text-slate-500 hover:text-rose-300"
            title="Remove component"
          >
            ✕
          </button>
        )}
      </div>
      {collapsed ? null : (
      <div className="grid grid-cols-2 gap-x-2 gap-y-2 px-2 py-2">
        {component.type === "Image" && (
          <div className="col-span-2">
            <CustomImagePicker
              slotId={slotId}
              currentHash={(props.customImageHash as string) || ""}
              imageProps={props}
            />
          </div>
        )}
        {component.type === "Image" && slot && (
          <div className="col-span-2">
            <GraphicControls slot={slot} />
          </div>
        )}
        {component.type === "Button" && slot && (
          <div className="col-span-2">
            <ButtonPresetSection slot={slot} />
          </div>
        )}
        {component.type === "TextField" && slot && (
          <div className="col-span-2">
            <InputFieldTypeSection slot={slot} />
          </div>
        )}
        {component.type === "Spacer" && slot && (
          <div className="col-span-2">
            <SpacerSection slot={slot} />
          </div>
        )}
        {fields.map((f) => {
          // Skip fields whose visibleWhen condition isn't satisfied on the
          // current props (e.g. ScrollArea scrollbar colors hidden until
          // showScrollbar=true).
          if (f.visibleWhen && props[f.visibleWhen.key] !== f.visibleWhen.value) {
            return null;
          }
          return (
            <Field
              key={f.key}
              slotId={slotId}
              componentType={component.type}
              descriptor={f}
              value={props[f.key]}
              effectiveDefault={computeEffectiveDefault(f, slot, component)}
            />
          );
        })}
      </div>
      )}
    </div>
  );
}

// Interactivity control for any graphic (Image): a one-click Make-clickable /
// Make-static toggle. This is what "aligns" static images and buttons — the
// visual settings are the same; interactivity is just a switch. (Icon choice
// lives in the visual System Images grid above, not duplicated here.)
function GraphicControls({ slot }: { slot: Slot }) {
  const root = useStore((s) => s.root);
  const select = useStore((s) => s.select);
  const setImageClickable = useStore((s) => s.setImageClickable);
  const setProps = useStore((s) => s.setProps);
  const ctrl = controllingClickable(root, slot.id);

  // The clickable element is an ancestor (this is an icon/glyph nested inside a
  // button). Report what it's part of and offer to jump to the controlling
  // slot rather than letting the user add a redundant nested button.
  if (ctrl && !ctrl.isSelf) {
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Interactivity
          </div>
          <div className="truncate text-[10px] text-slate-500">
            Part of “{ctrl.slot.name}” — {ctrl.reason}
          </div>
        </div>
        <button
          onClick={() => select(ctrl.slot.id)}
          title={`Select the “${ctrl.slot.name}” slot that handles the click`}
          className="flex-shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 transition hover:border-sky-500 hover:text-sky-200"
        >
          Select button
        </button>
      </div>
    );
  }

  const isClickable = ctrl !== null; // ctrl.isSelf
  const img = slot.components.find((c) => c.type === "Image");
  const imgProps = (img?.props ?? {}) as Record<string, unknown>;
  // The placeholder concept only applies to "empty" graphics. An Image carrying
  // a real picture/icon has nothing to place-hold, so the control is hidden.
  const hasContent =
    !!imgProps.customImageHash ||
    !!imgProps.useHelpIcon || !!imgProps.useCloseIcon || !!imgProps.useCheckIcon ||
    !!imgProps.useBackspaceIcon || !!imgProps.useSpinnerIcon || !!imgProps.useOpenArrowIcon ||
    !!imgProps.useClearIcon || !!imgProps.useLogoSprite ||
    (typeof imgProps.spriteUrl === "string" && /^https?:\/\//.test(imgProps.spriteUrl as string));
  const placeholderRemoved = imgProps.placeholderRemoved === true;
  // Removing sets BOTH flags: placeholderRemoved hides the overlay/export bake,
  // placeholderUserRemoved marks it as a deliberate choice so toggling clickable
  // off never brings the placeholder back. Restoring clears both, resuming the
  // automatic (clickable-driven) behavior.
  const togglePlaceholder = () =>
    setProps(slot.id, "Image", [
      ["placeholderRemoved", !placeholderRemoved],
      ["placeholderUserRemoved", !placeholderRemoved],
    ]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Interactivity
          </div>
          <div className="truncate text-[10px] text-slate-500">
            {isClickable ? `Clickable — ${ctrl!.reason}` : "Static image"}
          </div>
        </div>
        <button
          onClick={() => setImageClickable(slot.id, !isClickable)}
          title={
            isClickable
              ? "Make this a static image again (removes its click behavior)"
              : "Add a transparent Button so this image is clickable. Its look is unchanged."
          }
          className={`flex-shrink-0 rounded border px-2 py-1 text-[11px] transition ${
            isClickable
              ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-rose-500 hover:text-rose-300"
              : "border-sky-500 bg-sky-600/20 text-sky-200 hover:bg-sky-600/30"
          }`}
        >
          {isClickable ? "Make static" : "Make clickable"}
        </button>
      </div>
      {!hasContent && (
        <button
          onClick={togglePlaceholder}
          title={
            placeholderRemoved
              ? "Bring back the hatched “drop image here” placeholder."
              : "Remove the placeholder, leaving a plain image. Stays removed even if you later make this static."
          }
          className={`w-full rounded border px-2 py-1 text-[11px] transition ${
            placeholderRemoved
              ? "border-sky-500 bg-sky-600/20 text-sky-200 hover:bg-sky-600/30"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:border-rose-500 hover:text-rose-300"
          }`}
        >
          {placeholderRemoved ? "Restore Placeholder" : "Remove Placeholder"}
        </button>
      )}
    </div>
  );
}

// Input-field type picker — mirrors the button-preset chooser. The underlying
// `fieldType` prop drives which TextEditor parser the exporter emits
// (string / float / int).
const INPUT_FIELD_TYPES: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: "text", label: "String", hint: "Free text" },
  { id: "float", label: "Float", hint: "Decimal number" },
  { id: "int", label: "Integer", hint: "Whole number" },
];

function InputFieldTypeSection({ slot }: { slot: Slot }) {
  const setProp = useStore((s) => s.setProp);
  const tf = slot.components.find((c) => c.type === "TextField");
  const current = ((tf?.props as { fieldType?: string })?.fieldType) ?? "text";
  const currentHint = INPUT_FIELD_TYPES.find((t) => t.id === current)?.hint;

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Type</span>
        <span className="text-[10px] text-slate-500">
          current: {INPUT_FIELD_TYPES.find((t) => t.id === current)?.label ?? "String"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {INPUT_FIELD_TYPES.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setProp(slot.id, "TextField", "fieldType", t.id)}
              title={t.hint}
              className={`rounded border px-2 py-1.5 text-xs transition ${
                active
                  ? "border-sky-500 bg-sky-500/10 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:text-slate-100"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {currentHint && (
        <div className="text-[10px] leading-snug text-slate-500">{currentHint}</div>
      )}
    </div>
  );
}

// Spacer height control — edits the slot's RectTransform directly (the spacer
// has no real props; its size IS its rect). Assumes the standard top-anchored
// spacer row: keeps the top edge fixed and grows/shrinks downward.
function SpacerSection({ slot }: { slot: Slot }) {
  const setProp = useStore((s) => s.setProp);
  const rt = slot.components.find((c) => c.type === "RectTransform");
  const p = (rt?.props ?? {}) as { offsetMin?: { x: number; y: number }; offsetMax?: { x: number; y: number } };
  const top = p.offsetMax?.y ?? 16;
  const bottom = p.offsetMin?.y ?? -16;
  const height = Math.max(1, Math.round(top - bottom));

  const setHeight = (h: number) => {
    const nh = Math.max(1, Math.round(h));
    setProp(slot.id, "RectTransform", "offsetMin", {
      x: p.offsetMin?.x ?? 0,
      y: (p.offsetMax?.y ?? 16) - nh,
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">Spacer</span>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Height</span>
        <input
          type="number"
          min={1}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
        />
      </label>
      <div className="text-[10px] leading-snug text-slate-500">
        An empty, invisible row that reserves vertical space. Drag its row tab to
        reposition; it exports as nothing.
      </div>
    </div>
  );
}

function ButtonPresetSection({ slot }: { slot: Slot }) {
  const apply = useStore((s) => s.applyButtonPreset);
  const current = detectButtonPreset(slot);
  const currentDesc = BUTTON_PRESETS.find((p) => p.id === current)?.description;

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Preset
        </span>
        {current && (
          <span className="text-[10px] text-slate-500">
            current: {BUTTON_PRESETS.find((p) => p.id === current)?.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {BUTTON_PRESETS.map((p) => {
          const active = current === p.id;
          return (
            <button
              key={p.id}
              onClick={() => apply(slot.id, p.id)}
              title={p.description}
              className={`rounded border px-2 py-1.5 text-left text-xs transition ${
                active
                  ? "border-sky-500 bg-sky-500/10 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:text-slate-100"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {currentDesc && (
        <div className="text-[10px] leading-snug text-slate-500">{currentDesc}</div>
      )}
    </div>
  );
}

function AlignWidget({ slot }: { slot: Slot }) {
  const root = useStore((s) => s.root);
  const alignSlot = useStore((s) => s.alignSlot);
  const managed = isLayoutManaged(root, slot.id);

  function btn(label: string, caption: string, title: string, axis: AlignAxis, mode: AlignMode) {
    return (
      <button
        key={`${axis}-${mode}-${label}`}
        title={title}
        aria-label={title}
        disabled={managed}
        onClick={() => alignSlot(slot.id, axis, mode)}
        className="flex flex-col items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-800 py-1 text-slate-200 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-sm leading-none">{label}</span>
        <span className="text-[9px] leading-none text-slate-400">{caption}</span>
      </button>
    );
  }

  return (
    <div className="border-b border-slate-800 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Align in Parent
        </span>
        {managed && (
          <span className="text-[10px] text-slate-500">managed by layout</span>
        )}
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Horizontal</div>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {btn("⇤", "Left", "Align left", "h", "start")}
        {btn("⇔", "Center", "Center horizontally", "h", "center")}
        {btn("⇥", "Right", "Align right", "h", "end")}
        {btn("⇿", "Stretch", "Stretch horizontally", "h", "stretch")}
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Vertical</div>
      <div className="grid grid-cols-4 gap-1">
        {btn("⇡", "Top", "Align top", "v", "start")}
        {btn("⇕", "Middle", "Center vertically", "v", "center")}
        {btn("⇣", "Bottom", "Align bottom", "v", "end")}
        {btn("⇳", "Stretch", "Stretch vertically", "v", "stretch")}
      </div>
    </div>
  );
}

