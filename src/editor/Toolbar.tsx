import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useDialog } from "./useDialog";
import { APP_AUTHOR, APP_VERSION, APP_CHANNEL } from "../version";
import { exportNativeFile, downloadBlob } from "../io/exportNative";
import { importNativeFile } from "../io/importNative";
import { exportBundleZip } from "../io/exportBundle";
import AddMenu from "./AddMenu";
import PresetMenu from "./PresetMenu";
import WarningsMenu from "./WarningsMenu";
import LibraryMenu from "./LibraryMenu";
import HelpMenu from "./HelpMenu";
import ShortcutsMenu from "./ShortcutsMenu";
import LanguageMenu from "./LanguageMenu";
import WhatsNew from "./WhatsNew";
import { useT } from "../locale/useT";

export default function Toolbar() {
  const documentSnapshot = useStore((s) => s.documentSnapshot);
  const loadDocument = useStore((s) => s.loadDocument);
  const markClean = useStore((s) => s.markClean);
  const reset = useStore((s) => s.reset);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.history.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const dialog = useDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const whatsNewOpen = useStore((s) => s.whatsNewOpen);
  const setWhatsNewOpen = useStore((s) => s.setWhatsNewOpen);
  const t = useT();

  function onSave() {
    const blob = exportNativeFile(documentSnapshot());
    downloadBlob(blob, "panel.uixstudio.json");
    // The editable project is now persisted to a file the user controls — clear
    // the unsaved-changes flag so the close-tab guard stops warning.
    markClean();
  }

  async function onExportBrson() {
    if (isExporting) return;
    setIsExporting(true);
    setExportDone(false);
    try {
      const blob = await exportBundleZip(documentSnapshot());
      downloadBlob(blob, "UIX Panel.resonitepackage");
      setExportDone(true);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      await dialog.alert(t.toolbar.exportFailed((err as Error).message));
    } finally {
      setIsExporting(false);
      setExportDone(false);
    }
  }

  async function onLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Opening a project replaces the whole canvas — confirm first if there's
    // unsaved work, matching the New / Preset flows (which already guard).
    if (useStore.getState().dirty) {
      const ok = await dialog.confirm(t.toolbar.openConfirm);
      if (!ok) return;
    }
    try {
      const doc = await importNativeFile(file);
      loadDocument(doc);
    } catch (err) {
      await dialog.alert(t.toolbar.importFailed((err as Error).message));
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/90 px-3 py-2 text-xs">
      <img
        src="./UIX%20Studio.png"
        alt="UIX Studio"
        className="h-6 w-6"
      />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-slate-100">UIX Studio</span>
        <button
          type="button"
          onClick={() => setWhatsNewOpen(true)}
          title={t.toolbar.whatsNewTip}
          className="flex items-center gap-1 rounded text-[10px] text-slate-500 transition hover:text-sky-300 hover:underline"
        >
          v{APP_VERSION}
          {APP_CHANNEL && (
            <span className="rounded bg-amber-500/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
              {APP_CHANNEL}
            </span>
          )}
        </button>
      </div>
      <Divider />

      <ToolbarGroup label="File">
        <ToolbarButton
          onClick={onSave}
          title={t.toolbar.saveProjectTip}
        >
          {t.toolbar.saveProject}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title={t.toolbar.openProjectTip}
        >
          {t.toolbar.openProject}
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.uixstudio.json,application/json"
          className="hidden"
          onChange={onLoadFile}
        />
        <div className="relative">
          <ToolbarButton
            onClick={onExportBrson}
            disabled={isExporting}
            title={t.toolbar.exportTip}
            variant="primary"
          >
            {t.toolbar.exportResonite}
          </ToolbarButton>
          {isExporting && (
            <div
              role="status"
              aria-live="polite"
              className="absolute left-1/2 top-full z-50 mt-2 flex -translate-x-1/2 flex-col items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-500/60 bg-slate-900/95 px-4 py-2.5 text-sm text-sky-100 shadow-xl"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`inline-block h-4 w-4 rounded-full border-2 border-sky-300 border-t-transparent ${exportDone ? "opacity-0" : "animate-spin"}`}
                />
                {exportDone ? t.toolbar.exported : t.toolbar.exporting}
              </div>
              <span className="text-[0.7rem] text-sky-300/70">
                {t.toolbar.exportSaveHint}
              </span>
            </div>
          )}
        </div>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup label="Edit">
        <ToolbarButton onClick={undo} disabled={!canUndo} title={t.toolbar.undoTip}>
          {t.toolbar.undo}
        </ToolbarButton>
        <ToolbarButton onClick={redo} disabled={!canRedo} title={t.toolbar.redoTip}>
          {t.toolbar.redo}
        </ToolbarButton>
        <ToolbarButton
          onClick={async () => {
            if (await dialog.confirm(t.toolbar.newConfirm, { confirmLabel: t.toolbar.newConfirmLabel, destructive: true })) reset();
          }}
          title={t.toolbar.newTip}
        >
          {t.toolbar.newBtn}
        </ToolbarButton>
      </ToolbarGroup>

      <Divider />

      <ToolbarGroup label="Add">
        <AddMenu />
        <PresetMenu />
        <LibraryMenu />
      </ToolbarGroup>

      <WarningsMenu />

      <Divider />

      <ShortcutsMenu />
      <HelpMenu />

      <div className="ml-auto flex items-center gap-2 text-slate-400">
        <span className="hidden md:inline text-[10px] text-amber-300">
          {t.toolbar.protofluxNote}
        </span>
        <LanguageMenu />
        <CreditHoverMenu />
      </div>

      {whatsNewOpen && <WhatsNew onClose={() => setWhatsNewOpen(false)} />}
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-slate-700" />;
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      {children}
    </div>
  );
}

// Hover-triggered credit menu. Two-option popover (website + ko-fi).
//
// Forgiving hover behavior: a 600ms close-delay timer fires on mouse-leave
// from either the trigger row OR the popover. Entering either element
// cancels the pending close. This lets users cross the small visual gap
// between the trigger and the menu without it disappearing on them.
// (Without the delay, the gap between the row and the absolute popover is
// a dead zone — the cursor briefly leaves both elements and the menu vanishes.)
const CREDIT_HOVER_CLOSE_DELAY_MS = 600;

function CreditHoverMenu() {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const t = useT();

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }
  function handleEnter() {
    cancelClose();
    setOpen(true);
  }
  function handleLeave() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(
      () => setOpen(false),
      CREDIT_HOVER_CLOSE_DELAY_MS,
    );
  }
  useEffect(() => () => cancelClose(), []);

  return (
    // onFocus/onBlur (which bubble from the trigger + the links inside) give the
    // popover keyboard parity with hover; the same close-delay timer bridges the
    // focus moving from trigger → link. Click toggles it for touch users.
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-slate-400"
        title={APP_AUTHOR}
      >
        <span className="text-white">{t.toolbar.slopcodedBy(APP_AUTHOR)}</span>
        <img
          src="./Dalek.png"
          alt={APP_AUTHOR}
          className="h-6 w-6 rounded-full ring-1 ring-slate-700"
        />
      </button>
      {open && (
        <div
          // pt-1 (rather than mt-1 on the popover) bakes the breathing-room
          // gap INTO the popover's own bounding box, so the cursor never
          // leaves a hover target while traversing from trigger to menu.
          className="absolute right-0 top-full z-50 w-56 pt-1"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            <a
              href="https://dalek.coffee"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800 hover:text-sky-200"
            >
              <span aria-hidden>🌐</span>
              <span>{t.toolbar.visitWebsite}</span>
            </a>
            <a
              href="https://ko-fi.com/dalekcoffee"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800 hover:text-rose-200"
            >
              <span aria-hidden>☕</span>
              <span>{t.toolbar.buyCoffee}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
  variant?: "default" | "primary";
}) {
  const { variant = "default", active } = props;
  const base =
    "rounded border px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "border-sky-500 bg-sky-600 text-white hover:bg-sky-500"
      : active
        ? "border-sky-500/60 bg-slate-800 text-sky-200 hover:bg-slate-700"
        : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-slate-100";
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`${base} ${styles}`}
    >
      {props.children}
    </button>
  );
}
