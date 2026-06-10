import { useStore, type AlignAxis, type AlignMode } from "../state/store";
import { findSlot } from "../model/operations";
import type { Slot, UixComponent, UixComponentType } from "../model/types";
import { FIELD_DESCRIPTORS } from "../model/components";
import { DEFAULT_CONTENT_PADDING } from "../model/padding";
import { controlDisplayName, LABELLED_CONTROL_TYPES, isVerticalProgressBar, labelPositionOf } from "../model/controlName";
import { controllingClickable } from "../model/clickable";
import { tabStructuralHost, getTabs, activeTabIndex, tabsPositionOf, type TabPosition } from "../model/tabs";
import { Field, computeEffectiveDefault } from "./inspector/FieldInput";
import { CustomImagePicker } from "./inspector/ImagePicker";
import { isLayoutManaged } from "./render/slotRect";
import { alignAvailability } from "./render/alignAvail";
import {
  radioOptionLabels,
  type LabelPosition as RadioLabelPosition,
  type Orientation as RadioOrientation,
} from "./render/radioLayout";
import { BUTTON_PRESETS, detectButtonPreset } from "../model/buttonPresets";
import { useEffect, useRef, useState } from "react";
import { useT } from "../locale/useT";
import { localizedComponentLabel } from "../locale/paletteText";
import { localizedButtonPresetLabel, localizedButtonPresetDescription } from "../locale/modelText";

// The panel's Canvas.contentPadding (px). Nested container padding fields show
// HALF this as their inherited default when left on the -1 "auto" sentinel.
function canvasPadOf(root: Slot): number {
  const cc = root.components.find((c) => c.type === "Canvas");
  return ((cc?.props as { contentPadding?: number })?.contentPadding) ?? DEFAULT_CONTENT_PADDING;
}

export default function Inspector() {
  const selectedId = useStore((s) => s.selectedSlotId);
  const root = useStore((s) => s.root);
  const slot = selectedId ? findSlot(root, selectedId) : null;
  const detach = useStore((s) => s.detachComponent);
  const hidden = useStore((s) => s.rightPanelHidden);
  const toggle = useStore((s) => s.toggleRightPanel);
  const t = useT();
  const language = useStore((s) => s.language);

  if (hidden) {
    return (
      <button
        onClick={toggle}
        title={t.inspector.showPanel}
        aria-label={t.inspector.showPanel}
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
            {t.inspector.title}
          </span>
          <button
            onClick={toggle}
            title={t.inspector.hidePanel}
            aria-label={t.inspector.hidePanelAria}
            className="rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            ▶
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
          <div className="text-3xl">👆</div>
          <div>{t.inspector.emptyState}</div>
          <div className="mt-2 text-[10px] text-slate-600">
            {t.inspector.emptyTip}
          </div>
        </div>
      </div>
    );
  }

  // Selecting any structural part of a Tabs group (the host, the bar, a tab
  // button or its label, a page) shows the bespoke Tabs panel instead of the
  // confusing raw Button/Image/RectTransform fields. Content INSIDE a page is
  // edited normally (tabStructuralHost returns null for it).
  const tabHost = tabStructuralHost(root, slot.id);
  const headerSlot = tabHost ?? slot;

  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900">
      <div className="flex items-start justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t.inspector.title}
          </div>
          <div className="mt-1 text-sm text-slate-200">{controlDisplayName(headerSlot, language)}</div>
          <div className="mt-1 text-[10px] text-slate-500">{t.inspector.idLabel} {headerSlot.id.slice(0, 8)}</div>
        </div>
        <button
          onClick={toggle}
          title={t.inspector.hidePanel}
          className="rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          ▶
        </button>
      </div>

      {tabHost ? (
        <TabsInspector host={tabHost} />
      ) : (
        <>
          {slot.id !== root.id && slot.components.some((c) => c.type === "RectTransform") && (
            <AlignWidget slot={slot} />
          )}
          {slot.id !== root.id && isProgressBarComposite(slot) && (
            <DirectionField slot={slot} />
          )}
          {slot.id !== root.id && slot.components.some((c) => c.type === "UserProfile") && (
            <AvatarPositionField slot={slot} />
          )}
          {slot.id !== root.id && isLabelPositionEditable(slot) && progressBarDirectionOf(slot) !== "Vertical" && (
            <LabelPositionField slot={slot} />
          )}
          <ComponentList
            key={slot.id}
            slot={slot}
            isRoot={slot.id === root.id}
            onDetach={(t) => detach(slot.id, t)}
          />
        </>
      )}
    </div>
  );
}

// Bespoke editor for a Tabs group: manage the tabs (switch / rename / reorder /
// add / remove) up top, with the visual settings tucked into a collapsible
// "Appearance" section. Replaces the raw component list so users never have to
// edit the underlying TabButton/Image/Button plumbing by hand.
function TabsInspector({ host }: { host: Slot }) {
  const t = useT();
  const root = useStore((s) => s.root);
  const selectTab = useStore((s) => s.selectTab);
  const setTabLabel = useStore((s) => s.setTabLabel);
  const addTab = useStore((s) => s.addTab);
  const removeTab = useStore((s) => s.removeTab);
  const moveTab = useStore((s) => s.moveTab);
  const setTabsAppearance = useStore((s) => s.setTabsAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const setTabsPosition = useStore((s) => s.setTabsPosition);
  const tabs = getTabs(host);
  const active = activeTabIndex(host);

  // Auto-focus the new tab's rename field right after "+ Add tab" (addTab makes
  // the new tab active), so the user can name it immediately.
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const prevCount = useRef(tabs.length);
  useEffect(() => {
    if (tabs.length > prevCount.current && activeInputRef.current) {
      activeInputRef.current.focus();
      activeInputRef.current.select();
    }
    prevCount.current = tabs.length;
  }, [tabs.length]);
  const tabsComp = host.components.find((c) => c.type === "Tabs");
  const tabPos = tabsPositionOf(host);
  const TAB_POSITIONS: { value: TabPosition; label: string; glyph: string }[] = [
    { value: "top", label: t.inspector.posTop, glyph: "▔" },
    { value: "bottom", label: t.inspector.posBottom, glyph: "▁" },
    { value: "left", label: t.inspector.posLeft, glyph: "▏" },
    { value: "right", label: t.inspector.posRight, glyph: "▕" },
  ];

  return (
    <div className="flex flex-col gap-3 px-3 pb-6 pt-3">
      <div className="rounded border border-sky-800/50 bg-sky-950/20 px-2 py-1.5 text-[10px] leading-snug text-sky-200/80">
        {t.inspector.tabsHint}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t.inspector.tabs}</div>
        {tabs.map((tab, i) => {
          const isActive = i === active;
          return (
            <div
              key={tab.buttonId}
              className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                isActive ? "border-sky-500 bg-sky-500/10" : "border-slate-700 bg-slate-800/40"
              }`}
            >
              <button
                onClick={() => selectTab(host.id, i)}
                title={t.inspector.showTabOnCanvas}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] ${
                  isActive ? "bg-sky-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {i + 1}
              </button>
              <input
                ref={isActive ? activeInputRef : undefined}
                type="text"
                value={tab.label}
                placeholder={`Tab ${i + 1}`}
                onFocus={() => selectTab(host.id, i)}
                onChange={(e) => setTabLabel(host.id, i, e.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
              />
              <button
                onClick={() => moveTab(host.id, i, -1)}
                disabled={i === 0}
                title={t.inspector.moveTabEarlier}
                className="rounded px-1 text-xs text-slate-400 hover:text-sky-300 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => moveTab(host.id, i, +1)}
                disabled={i === tabs.length - 1}
                title={t.inspector.moveTabLater}
                className="rounded px-1 text-xs text-slate-400 hover:text-sky-300 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                onClick={() => removeTab(host.id, i)}
                disabled={tabs.length <= 1}
                title={tabs.length <= 1 ? t.inspector.needOneTab : t.inspector.deleteTab}
                className="rounded px-1 text-xs text-slate-500 hover:text-rose-300 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          onClick={() => addTab(host.id)}
          className="mt-0.5 rounded border border-sky-500 bg-sky-600/20 px-2 py-1.5 text-xs text-sky-200 transition hover:bg-sky-600/30"
        >
          {t.inspector.addTab}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t.inspector.tabBarPosition}</div>
        <div className="grid grid-cols-4 gap-1">
          {TAB_POSITIONS.map((p) => (
            <button
              key={p.value}
              title={t.inspector.tabBarOn(p.label)}
              aria-pressed={tabPos === p.value}
              onClick={() => setTabsPosition(host.id, p.value)}
              className={`flex flex-col items-center gap-0.5 rounded border px-1 py-1.5 text-[10px] transition ${
                tabPos === p.value
                  ? "border-sky-500 bg-sky-600/20 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-sky-500 hover:text-sky-300"
              }`}
            >
              <span className="text-sm leading-none">{p.glyph}</span>
              {p.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] leading-snug text-slate-500">
          {t.inspector.tabSideNote}
        </div>
      </div>

      {tabsComp && (
        <div className="rounded border border-slate-800 bg-slate-950/30">
          <button
            onClick={() => setAppearanceOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-slate-800/40"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {appearanceOpen ? "▼" : "▶"} {t.inspector.appearance}
            </span>
            <span className="text-[10px] text-slate-600">{t.inspector.appearanceSub}</span>
          </button>
          {appearanceOpen && (
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-t border-slate-800 p-2">
              {FIELD_DESCRIPTORS["Tabs"]
                // `activeTab` is set by clicking a tab; `orientation` is superseded
                // by the Tab Bar Position control above (editing it here wouldn't
                // re-lay the bar). Hide both so every remaining field actually does
                // something when changed.
                .filter((f) => f.key !== "activeTab" && f.key !== "orientation")
                .map((f) => (
                  <Field
                    key={f.key}
                    slotId={host.id}
                    componentType="Tabs"
                    descriptor={f}
                    value={(tabsComp.props as Record<string, unknown>)[f.key]}
                    effectiveDefault={computeEffectiveDefault(f, host, tabsComp, canvasPadOf(root))}
                    onChange={(v) => setTabsAppearance(host.id, f.key, v)}
                  />
                ))}
            </div>
          )}
        </div>
      )}
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
  // Layout containers arrange a group's children automatically — their spacing/
  // padding are advanced knobs, not something a user picks a group to edit. Tuck
  // them under System Components so selecting a group/row doesn't lead with them.
  "HorizontalLayout",
  "VerticalLayout",
  "GridLayout",
  // Close is plumbing for the "Close window" button preset (→ ButtonDestroy at
  // export). It's configured via the preset, not edited directly, so tuck it
  // under System Components rather than showing it as a confusing primary card.
  "Close",
]);

// Display order for a slot's component sections: behaviour/interactivity reads
// top-down (Button, then Popup — so the "Edit popup dialog…" button is easy to
// find) and the bulky visual (Image) sits at the bottom. Everything else keeps
// its natural order in the middle. Display-only — the stored component array is
// untouched.
const COMPONENT_DISPLAY_PRIORITY: Partial<Record<UixComponentType, number>> = {
  Popup: 0,
  Button: 1,
  Image: 100,
};
const componentDisplayRank = (t: UixComponentType) => COMPONENT_DISPLAY_PRIORITY[t] ?? 50;

// Component sections that are pure plumbing for a Radio option (the clickable
// ring + its fill) and must never be hand-edited on that element — hidden
// entirely when the slot is a radio option. The radio is configured on the
// group, not per-ring.
const HIDDEN_ON_RADIO: ReadonlySet<UixComponentType> = new Set(["Button", "Image"]);

function ComponentList({
  slot,
  isRoot,
  onDetach,
}: {
  slot: Slot;
  isRoot: boolean;
  onDetach: (type: UixComponentType) => void;
}) {
  const t = useT();
  const [systemOpen, setSystemOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<UixComponentType>>(new Set());

  const isRadioOption = slot.components.some((c) => c.type === "Radio");
  const primary = slot.components
    .filter((c) => !SYSTEM_COMPONENTS.has(c.type))
    .filter((c) => !(isRadioOption && HIDDEN_ON_RADIO.has(c.type)))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => componentDisplayRank(a.c.type) - componentDisplayRank(b.c.type) || a.i - b.i)
    .map((x) => x.c);
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
            title={anyExpanded ? t.inspector.collapseEvery : t.inspector.expandEvery}
          >
            {anyExpanded ? t.inspector.collapseAll : t.inspector.expandAll}
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
            title={t.inspector.systemPlumbingTip}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {systemOpen ? "▼" : "▶"} {t.inspector.systemComponents}
              <span className="ml-1 text-slate-600">({system.length})</span>
            </span>
            <span className="text-[10px] text-slate-600">
              {system.map((c) => c.type).join(" · ")}
            </span>
          </button>
          {systemOpen && (
            <div className="flex flex-col gap-2 border-t border-slate-800 p-2">
              <div className="rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 text-[10px] leading-snug text-amber-300/90">
                {t.inspector.systemWarning}
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
  const t = useT();
  const lang = useStore((s) => s.language);
  const fields = FIELD_DESCRIPTORS[component.type];
  const isRootCanvas = isRoot && component.type === "Canvas";
  const props = component.props as Record<string, unknown>;
  const root = useStore((s) => s.root);
  const setContentPadding = useStore((s) => s.setContentPadding);
  const slot = findSlot(root, slotId);
  const canvasPad = canvasPadOf(root);

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40">
      <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1">
        <button
          onClick={onToggleCollapsed}
          className="flex flex-1 items-center gap-1 text-left text-xs font-semibold text-sky-300 hover:text-sky-200"
          title={collapsed ? t.inspector.expandComponent : t.inspector.collapseComponent}
        >
          <span className="inline-block w-3 text-[10px] text-slate-500">
            {collapsed ? "▶" : "▼"}
          </span>
          <span>{localizedComponentLabel(component.type, lang)}</span>
          {collapsed && fields.length > 0 && (
            <span className="ml-2 truncate text-[10px] font-normal text-slate-500">
              {t.inspector.fieldCount(fields.length)}
            </span>
          )}
        </button>
        {!isRootCanvas && (
          <button
            onClick={onRemove}
            className="rounded px-1 text-xs text-slate-500 hover:text-rose-300"
            title={t.inspector.removeComponent}
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
          <div className="col-span-2 flex flex-col gap-2">
            <ButtonLabelField slot={slot} />
            <ButtonPresetSection slot={slot} />
          </div>
        )}
        {component.type === "Popup" && slot && (
          <div className="col-span-2">
            <PopupEditSection slot={slot} />
          </div>
        )}
        {component.type === "RadioGroup" && slot && (
          <div className="col-span-2">
            <RadioGroupInspector slot={slot} />
          </div>
        )}
        {component.type === "Dropdown" && slot && (
          <div className="col-span-2">
            <DropdownInspector slot={slot} />
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
          // Canvas content padding re-insets all top-level body content, so it
          // routes through the dedicated store action (which bakes the inset
          // into each body slot's RectTransform) instead of a plain prop write.
          const onChange = isRootCanvas && f.key === "contentPadding"
            ? (v: unknown) => setContentPadding(Number(v))
            : undefined;
          return (
            <Field
              key={f.key}
              slotId={slotId}
              componentType={component.type}
              descriptor={f}
              value={props[f.key]}
              effectiveDefault={computeEffectiveDefault(f, slot, component, canvasPad)}
              onChange={onChange}
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
  const t = useT();
  const lang = useStore((s) => s.language);
  const root = useStore((s) => s.root);
  const select = useStore((s) => s.select);
  const setImageClickable = useStore((s) => s.setImageClickable);
  const setProps = useStore((s) => s.setProps);
  const ctrl = controllingClickable(root, slot.id, lang);

  // The clickable element is an ancestor (this is an icon/glyph nested inside a
  // button). Report what it's part of and offer to jump to the controlling
  // slot rather than letting the user add a redundant nested button.
  if (ctrl && !ctrl.isSelf) {
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            {t.inspector.interactivity}
          </div>
          <div className="truncate text-[10px] text-slate-500">
            {t.inspector.partOf(ctrl.slot.name, ctrl.reason)}
          </div>
        </div>
        <button
          onClick={() => select(ctrl.slot.id)}
          title={t.inspector.selectHandlingSlot(ctrl.slot.name)}
          className="flex-shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 transition hover:border-sky-500 hover:text-sky-200"
        >
          {t.inspector.selectButton}
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
            {t.inspector.interactivity}
          </div>
          <div className="truncate text-[10px] text-slate-500">
            {isClickable ? t.inspector.clickable(ctrl!.reason) : t.inspector.staticImage}
          </div>
        </div>
        <button
          onClick={() => setImageClickable(slot.id, !isClickable)}
          title={isClickable ? t.inspector.makeStaticTip : t.inspector.makeClickableTip}
          className={`flex-shrink-0 rounded border px-2 py-1 text-[11px] transition ${
            isClickable
              ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-rose-500 hover:text-rose-300"
              : "border-sky-500 bg-sky-600/20 text-sky-200 hover:bg-sky-600/30"
          }`}
        >
          {isClickable ? t.inspector.makeStatic : t.inspector.makeClickable}
        </button>
      </div>
      {!hasContent && (
        <button
          onClick={togglePlaceholder}
          title={placeholderRemoved ? t.inspector.restorePlaceholderTip : t.inspector.removePlaceholderTip}
          className={`w-full rounded border px-2 py-1 text-[11px] transition ${
            placeholderRemoved
              ? "border-sky-500 bg-sky-600/20 text-sky-200 hover:bg-sky-600/30"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:border-rose-500 hover:text-rose-300"
          }`}
        >
          {placeholderRemoved ? t.inspector.restorePlaceholder : t.inspector.removePlaceholder}
        </button>
      )}
    </div>
  );
}

// Input-field type picker — mirrors the button-preset chooser. The underlying
// `fieldType` prop drives which TextEditor parser the exporter emits
// (string / float / int).
function InputFieldTypeSection({ slot }: { slot: Slot }) {
  const t = useT();
  const setProp = useStore((s) => s.setProp);
  const TYPES: ReadonlyArray<{ id: string; label: string; hint: string }> = [
    { id: "text", label: t.inspector.ftString, hint: t.inspector.ftStringHint },
    { id: "float", label: t.inspector.ftFloat, hint: t.inspector.ftFloatHint },
    { id: "int", label: t.inspector.ftInteger, hint: t.inspector.ftIntegerHint },
  ];
  const tf = slot.components.find((c) => c.type === "TextField");
  const current = ((tf?.props as { fieldType?: string })?.fieldType) ?? "text";
  const currentType = TYPES.find((x) => x.id === current);

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">{t.inspector.typeLabel}</span>
        <span className="text-[10px] text-slate-500">
          {t.inspector.current(currentType?.label ?? t.inspector.ftString)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {TYPES.map((x) => {
          const active = current === x.id;
          return (
            <button
              key={x.id}
              onClick={() => setProp(slot.id, "TextField", "fieldType", x.id)}
              title={x.hint}
              className={`rounded border px-2 py-1.5 text-xs transition ${
                active
                  ? "border-sky-500 bg-sky-500/10 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:text-slate-100"
              }`}
            >
              {x.label}
            </button>
          );
        })}
      </div>
      {currentType?.hint && (
        <div className="text-[10px] leading-snug text-slate-500">{currentType.hint}</div>
      )}
    </div>
  );
}

// Spacer height control — edits the slot's RectTransform directly (the spacer
// has no real props; its size IS its rect). Assumes the standard top-anchored
// spacer row: keeps the top edge fixed and grows/shrinks downward.
function SpacerSection({ slot }: { slot: Slot }) {
  const t = useT();
  const setProp = useStore((s) => s.setProp);
  const rt = slot.components.find((c) => c.type === "RectTransform");
  const p = (rt?.props ?? {}) as { offsetMin?: { x: number; y: number }; offsetMax?: { x: number; y: number } };
  const top = p.offsetMax?.y ?? 16;
  const bottom = p.offsetMin?.y ?? -16;
  const height = Math.max(1, Math.round(top - bottom));

  const setHeight = (h: number) => {
    if (!Number.isFinite(h)) return; // ignore empty / partial ("-") input
    const nh = Math.max(1, Math.round(h));
    setProp(slot.id, "RectTransform", "offsetMin", {
      x: p.offsetMin?.x ?? 0,
      y: (p.offsetMax?.y ?? 16) - nh,
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{t.inspector.spacer}</span>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{t.inspector.height}</span>
        <input
          type="number"
          min={1}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
        />
      </label>
      <div className="text-[10px] leading-snug text-slate-500">
        {t.inspector.spacerHint}
      </div>
    </div>
  );
}

// Locate the caption Text a button drives. Resonite renders one Graphic per
// slot, so a button's text lives on a nested "Label" child (the standard preset
// pattern) rather than co-located with the Button's Image. Resolve, in order:
// a direct child named "Label" carrying a Text, then any direct child with a
// Text, then a Text co-located on the button slot itself. Icon-only buttons
// (a child icon Image, no Text anywhere) return null.
function findButtonCaption(slot: Slot): { slotId: string; text: string } | null {
  const textOf = (s: Slot) => {
    const t = s.components.find((c) => c.type === "Text");
    return t ? (((t.props as Record<string, unknown>).content as string) ?? "") : null;
  };
  const named = slot.children.find(
    (ch) => ch.name.trim().toLowerCase() === "label" && ch.components.some((c) => c.type === "Text"),
  );
  if (named) return { slotId: named.id, text: textOf(named) ?? "" };
  const anyChild = slot.children.find((ch) => ch.components.some((c) => c.type === "Text"));
  if (anyChild) return { slotId: anyChild.id, text: textOf(anyChild) ?? "" };
  const self = textOf(slot);
  if (self !== null) return { slotId: slot.id, text: self };
  return null;
}

// Editable button caption, surfaced directly in the Button component's section
// so the label is customizable without hunting for the nested "Label" slot.
// Writes straight to the caption Text's `content` (same store path the Text
// component's own field uses). Hidden for icon-only buttons (no text to edit).
function ButtonLabelField({ slot }: { slot: Slot }) {
  const t = useT();
  const setProp = useStore((s) => s.setProp);
  const caption = findButtonCaption(slot);
  if (!caption) return null;
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
      <span className="truncate text-[10px] uppercase tracking-wide text-slate-500">{t.inspector.labelField}</span>
      <input
        type="text"
        value={caption.text}
        placeholder={t.inspector.buttonTextPlaceholder}
        onChange={(e) => setProp(caption.slotId, "Text", "content", e.target.value)}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 outline-none focus:border-sky-500"
      />
    </label>
  );
}

// The popup's dialog card is edited in a floating surface that's opened ON
// DEMAND from here — NOT by selecting the trigger button (which would make the
// button itself impossible to select/resize). The button sits at the top of the
// Popup section, above the Title/Body/Dismiss fields.
function PopupEditSection({ slot }: { slot: Slot }) {
  const t = useT();
  const editPopup = useStore((s) => s.editPopup);
  const closePopupEdit = useStore((s) => s.closePopupEdit);
  const editing = useStore((s) => s.editingPopupId) === slot.id;
  return (
    <button
      onClick={() => (editing ? closePopupEdit() : editPopup(slot.id))}
      className={`w-full rounded border px-2 py-2 text-xs font-semibold transition ${
        editing
          ? "border-purple-500 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25"
          : "border-sky-600 bg-sky-600/90 text-white hover:bg-sky-500"
      }`}
      title={t.inspector.editPopupTip}
    >
      {editing ? t.inspector.doneEditingDialog : t.inspector.editPopupDialog}
    </button>
  );
}

// Radial group editor: edit the options as a LIST (add / remove / rename) and
// pick the per-option label position + row/column layout — instead of hand-
// building each option ring + label. Every change regenerates the option slots
// via setRadioOptions. The label text inputs are kept in local state and only
// committed on blur/Enter so typing doesn't rebuild the whole subtree per stroke.
function RadioGroupInspector({ slot }: { slot: Slot }) {
  const t = useT();
  const setRadioOptions = useStore((s) => s.setRadioOptions);
  const rg = slot.components.find((c) => c.type === "RadioGroup");
  const rp = (rg?.props ?? {}) as {
    labelPosition?: RadioLabelPosition;
    orientation?: RadioOrientation;
    initialIndex?: number;
  };
  const pos = rp.labelPosition ?? "right";
  const orient = rp.orientation ?? "horizontal";
  const initial = Math.max(0, rp.initialIndex ?? 0);

  // Local copy of the option labels so typing doesn't rebuild the subtree per
  // keystroke. Re-sync from the model whenever the options change OUTSIDE this
  // editor (undo/redo, switching groups, an external edit): the model's labels
  // form a signature, and while the user is mid-type the slot is unchanged so
  // the signature holds and local edits survive until blur commits them.
  const slotLabels = radioOptionLabels(slot);
  const sig = slotLabels.join("\n");
  const [labels, setLabels] = useState<string[]>(slotLabels);
  const sigRef = useRef(sig);
  useEffect(() => {
    if (sigRef.current !== sig) {
      sigRef.current = sig;
      setLabels(slotLabels);
    }
    // slotLabels is derived from sig; depending on sig alone is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const apply = (L: string[], p: RadioLabelPosition = pos, o: RadioOrientation = orient, init = initial) =>
    setRadioOptions(slot.id, L, p, o, Math.min(init, Math.max(0, L.length - 1)));

  const setLabelAt = (i: number, v: string) =>
    setLabels((prev) => prev.map((l, j) => (j === i ? v : l)));
  const commitLabels = () => apply(labels);
  const addOption = () => {
    const L = [...labels, `Option ${labels.length + 1}`];
    setLabels(L);
    apply(L);
  };
  const removeOption = (i: number) => {
    if (labels.length <= 1) return;
    const L = labels.filter((_, j) => j !== i);
    setLabels(L);
    apply(L, pos, orient, initial > i ? initial - 1 : initial);
  };

  const POSNS: { id: RadioLabelPosition; label: string }[] = [
    { id: "left", label: t.inspector.radioPosLeft },
    { id: "right", label: t.inspector.radioPosRight },
    { id: "up", label: t.inspector.radioPosUp },
    { id: "down", label: t.inspector.radioPosDown },
    { id: "none", label: t.inspector.radioPosNone },
  ];

  const cellBtn = (active: boolean) =>
    `rounded border px-2 py-1 text-[11px] transition ${
      active
        ? "border-sky-500 bg-sky-500/10 text-sky-200"
        : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
    }`;

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{t.inspector.options}</span>
          <span className="text-[10px] text-slate-500">{t.inspector.defaultMark}</span>
        </div>
        <div className="flex flex-col gap-1">
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <button
                onClick={() => apply(labels, pos, orient, i)}
                title={t.inspector.makeInitiallySelected}
                aria-label={t.inspector.setAsDefault}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  i === initial ? "border-sky-400 bg-sky-400" : "border-slate-500"
                }`}
              >
                {i === initial && <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
              </button>
              <input
                type="text"
                value={label}
                placeholder={t.inspector.optionPlaceholder(i + 1)}
                onChange={(e) => setLabelAt(i, e.target.value)}
                onBlur={commitLabels}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
              />
              <button
                onClick={() => removeOption(i)}
                disabled={labels.length <= 1}
                title={t.inspector.removeOption}
                className="shrink-0 rounded px-1 text-xs text-slate-500 hover:text-rose-300 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addOption}
          className="mt-1.5 w-full rounded border border-dashed border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-300"
        >
          {t.inspector.addOption}
        </button>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{t.inspector.labelPosition}</div>
        <div className="grid grid-cols-5 gap-1">
          {POSNS.map((p) => (
            <button key={p.id} onClick={() => apply(labels, p.id)} className={cellBtn(pos === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{t.inspector.layout}</div>
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => apply(labels, pos, "horizontal")} className={cellBtn(orient === "horizontal")}>
            {t.inspector.row}
          </button>
          <button onClick={() => apply(labels, pos, "vertical")} className={cellBtn(orient === "vertical")}>
            {t.inspector.column}
          </button>
        </div>
      </div>
    </div>
  );
}

// Dropdown option editor — the SAME list UX as the radial group (add / remove /
// rename + pick the default selection). The dropdown stores its options as a
// single multiline string (one per line) on the Dropdown component, so unlike the
// radio there's no option subtree to rebuild: each change just rewrites `options`
// and clamps `initialIndex` (which the trigger preview reads to show the current
// label). Labels are kept in local state and committed on blur/Enter so typing a
// rename doesn't churn the model per keystroke — matching RadioGroupInspector.
function DropdownInspector({ slot }: { slot: Slot }) {
  const t = useT();
  const setProps = useStore((s) => s.setProps);
  const dd = slot.components.find((c) => c.type === "Dropdown");
  const dp = (dd?.props ?? {}) as { options?: string; initialIndex?: number };
  const modelLabels = String(dp.options ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const initial = Math.max(0, Math.min(modelLabels.length - 1, dp.initialIndex ?? 0));

  // Re-sync local labels only when the options change OUTSIDE this editor (undo,
  // switching elements): the joined labels form a signature; while mid-type the
  // model is unchanged so the signature holds and local edits survive to blur.
  const sig = modelLabels.join("\n");
  const [labels, setLabels] = useState<string[]>(modelLabels);
  const sigRef = useRef(sig);
  useEffect(() => {
    if (sigRef.current !== sig) {
      sigRef.current = sig;
      setLabels(modelLabels);
    }
    // modelLabels is derived from sig; depending on sig alone is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const apply = (L: string[], init = initial) => {
    const opts = L.map((s) => s.trim()).filter((s) => s.length > 0);
    const safe = opts.length ? opts : ["Option 1"];
    setProps(slot.id, "Dropdown", [
      ["options", safe.join("\n")],
      ["initialIndex", Math.max(0, Math.min(init, safe.length - 1))],
    ]);
  };

  const setLabelAt = (i: number, v: string) =>
    setLabels((prev) => prev.map((l, j) => (j === i ? v : l)));
  const commitLabels = () => apply(labels);
  const addOption = () => {
    const L = [...labels, `Option ${labels.length + 1}`];
    setLabels(L);
    apply(L);
  };
  const removeOption = (i: number) => {
    if (labels.length <= 1) return;
    const L = labels.filter((_, j) => j !== i);
    setLabels(L);
    apply(L, initial > i ? initial - 1 : initial);
  };

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{t.inspector.options}</span>
          <span className="text-[10px] text-slate-500">{t.inspector.shownByDefaultMark}</span>
        </div>
        <div className="flex flex-col gap-1">
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <button
                onClick={() => apply(labels, i)}
                title={t.inspector.showByDefault}
                aria-label={t.inspector.setAsDefault}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  i === initial ? "border-sky-400 bg-sky-400" : "border-slate-500"
                }`}
              >
                {i === initial && <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
              </button>
              <input
                type="text"
                value={label}
                placeholder={t.inspector.optionPlaceholder(i + 1)}
                onChange={(e) => setLabelAt(i, e.target.value)}
                onBlur={commitLabels}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
              />
              <button
                onClick={() => removeOption(i)}
                disabled={labels.length <= 1}
                title={t.inspector.removeOption}
                className="shrink-0 rounded px-1 text-xs text-slate-500 hover:text-rose-300 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addOption}
          className="mt-1.5 w-full rounded border border-dashed border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-300"
        >
          {t.inspector.addOption}
        </button>
      </div>
      <div className="text-[10px] leading-snug text-slate-500">
        {t.inspector.dropdownHint}
      </div>
    </div>
  );
}

function ButtonPresetSection({ slot }: { slot: Slot }) {
  const t = useT();
  const lang = useStore((s) => s.language);
  const apply = useStore((s) => s.applyButtonPreset);
  const current = detectButtonPreset(slot);
  const currentPreset = BUTTON_PRESETS.find((p) => p.id === current);
  const currentDesc = currentPreset
    ? localizedButtonPresetDescription(currentPreset.id, currentPreset.description, lang)
    : undefined;

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {t.inspector.preset}
        </span>
        {current && (
          <span className="text-[10px] text-slate-500">
            {t.inspector.current(currentPreset ? localizedButtonPresetLabel(currentPreset.id, currentPreset.label, lang) : "")}
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
              title={localizedButtonPresetDescription(p.id, p.description, lang)}
              className={`rounded border px-2 py-1.5 text-left text-xs transition ${
                active
                  ? "border-sky-500 bg-sky-500/10 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500 hover:text-slate-100"
              }`}
            >
              {localizedButtonPresetLabel(p.id, p.label, lang)}
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

// A labelled composite (Slider, Toggle, Text Field, …) can show its label on the
// left of, or above, its control — except multi-part Radio Group, which keeps its
// authored left layout. Editable only when a "Label" child + exactly one control
// child are present (the single-control shape the layout engine re-flows).
function isLabelPositionEditable(slot: Slot): boolean {
  if (!LABELLED_CONTROL_TYPES.has(slot.name)) return false;
  if (slot.components.some((c) => c.type === "RadioGroup")) return false;
  const label = slot.children.find((c) => c.name === "Label");
  if (!label) return false;
  const controls = slot.children.filter(
    (c) => c !== label && c.components.some((k) => k.type === "RectTransform"),
  );
  return controls.length === 1;
}

// Left / Top toggle for a composite's label. Calls setLabelPosition, which
// re-lays the internals, resizes the wrapper, and reflows the container.
function LabelPositionField({ slot }: { slot: Slot }) {
  const t = useT();
  const setLabelPosition = useStore((s) => s.setLabelPosition);
  const pos = labelPositionOf(slot);
  const opt = (value: "left" | "top", label: string, hint: string) => (
    <button
      key={value}
      title={hint}
      aria-pressed={pos === value}
      onClick={() => setLabelPosition(slot.id, value)}
      className={`flex-1 rounded border px-2 py-1 text-xs transition ${
        pos === value
          ? "border-sky-500 bg-sky-600/20 text-sky-200"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-sky-500 hover:text-sky-300"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="border-b border-slate-800 px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t.inspector.labelPosition}
      </div>
      <div className="flex gap-1">
        {opt("left", t.inspector.labelLeft, t.inspector.labelLeftHint)}
        {opt("top", t.inspector.labelTop, t.inspector.labelTopHint)}
      </div>
    </div>
  );
}

// A Progress Bar composite (a labelled single-control composite whose control
// child carries the ProgressBar marker). Eligible for the Direction toggle.
function isProgressBarComposite(slot: Slot): boolean {
  if (!isLabelPositionEditable(slot)) return false;
  return slot.children.some((c) => c.components.some((k) => k.type === "ProgressBar"));
}
function progressBarDirectionOf(slot: Slot): "Horizontal" | "Vertical" {
  // Same Track scan as the shared predicate — keep them in lockstep.
  return isVerticalProgressBar(slot) ? "Vertical" : "Horizontal";
}

// Horizontal / Vertical toggle for a Progress Bar. Calls setProgressBarDirection,
// which reshapes the bar (vertical = tall narrow column, top label + fill Track)
// and reflows the container.
function DirectionField({ slot }: { slot: Slot }) {
  const t = useT();
  const setProgressBarDirection = useStore((s) => s.setProgressBarDirection);
  const dir = progressBarDirectionOf(slot);
  const opt = (value: "Horizontal" | "Vertical", label: string) => (
    <button
      key={value}
      aria-pressed={dir === value}
      onClick={() => setProgressBarDirection(slot.id, value)}
      className={`flex-1 rounded border px-2 py-1 text-xs transition ${
        dir === value
          ? "border-sky-500 bg-sky-600/20 text-sky-200"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-sky-500 hover:text-sky-300"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="border-b border-slate-800 px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t.inspector.direction}
      </div>
      <div className="flex gap-1">
        {opt("Horizontal", t.inspector.directionHorizontal)}
        {opt("Vertical", t.inspector.directionVertical)}
      </div>
    </div>
  );
}

// Left / Above / Right toggle for a User Profile card's avatar. Calls
// setUserProfileLayout, which re-lays the Avatar + Name children and resizes the
// card. Mirrors DirectionField / LabelPositionField.
function avatarPositionOf(slot: Slot): "left" | "above" | "right" {
  const m = slot.components.find((c) => c.type === "UserProfile");
  const p = (m?.props as { avatarPosition?: string } | undefined)?.avatarPosition;
  return p === "above" || p === "right" ? p : "left";
}
function AvatarPositionField({ slot }: { slot: Slot }) {
  const t = useT();
  const setUserProfileLayout = useStore((s) => s.setUserProfileLayout);
  const pos = avatarPositionOf(slot);
  const opt = (value: "left" | "above" | "right", label: string) => (
    <button
      key={value}
      aria-pressed={pos === value}
      onClick={() => setUserProfileLayout(slot.id, value)}
      className={`flex-1 rounded border px-2 py-1 text-xs transition ${
        pos === value
          ? "border-sky-500 bg-sky-600/20 text-sky-200"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-sky-500 hover:text-sky-300"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="border-b border-slate-800 px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t.inspector.avatarPosition}
      </div>
      <div className="flex gap-1">
        {opt("left", t.inspector.avatarLeft)}
        {opt("above", t.inspector.avatarAbove)}
        {opt("right", t.inspector.avatarRight)}
      </div>
    </div>
  );
}

function AlignWidget({ slot }: { slot: Slot }) {
  const t = useT();
  const root = useStore((s) => s.root);
  const editMode = useStore((s) => s.editMode);
  const alignSlot = useStore((s) => s.alignSlot);
  const note = isLayoutManaged(root, slot.id) ? t.inspector.managedByLayout : null;

  function btn(label: string, caption: string, title: string, axis: AlignAxis, mode: AlignMode) {
    const { disabled, tip } = alignAvailability(root, slot.id, editMode, axis, mode, title);
    // A disabled <button> doesn't surface its own title tooltip in Chrome, so the
    // wrapper span carries it — every greyed button still explains itself on hover.
    return (
      <span
        key={`${axis}-${mode}-${label}`}
        title={tip}
        className={`block ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <button
          aria-label={title}
          disabled={disabled}
          onClick={() => alignSlot(slot.id, axis, mode)}
          className="flex w-full flex-col items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-800 py-1 text-slate-200 transition hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-sm leading-none">{label}</span>
          <span className="text-[9px] leading-none text-slate-400">{caption}</span>
        </button>
      </span>
    );
  }

  return (
    <div className="border-b border-slate-800 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t.contextMenu.alignInParent}
        </span>
        {note && (
          <span className="text-[10px] text-slate-500">{note}</span>
        )}
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t.contextMenu.horizontal}</div>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {btn("⇤", t.align.captionLeft, t.align.titleLeft, "h", "start")}
        {btn("⇔", t.align.captionCenter, t.align.titleCenterH, "h", "center")}
        {btn("⇥", t.align.captionRight, t.align.titleRight, "h", "end")}
        {btn("⇿", t.align.captionStretch, t.align.titleStretchH, "h", "stretch")}
      </div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t.contextMenu.vertical}</div>
      <div className="grid grid-cols-4 gap-1">
        {btn("⇡", t.align.captionTop, t.align.titleTop, "v", "start")}
        {btn("⇕", t.align.captionMiddle, t.align.titleCenterV, "v", "center")}
        {btn("⇣", t.align.captionBottom, t.align.titleBottom, "v", "end")}
        {btn("⇳", t.align.captionStretch, t.align.titleStretchV, "v", "stretch")}
      </div>
    </div>
  );
}

