import { useEffect } from "react";
import { useStore } from "../state/store";
import HierarchyTree from "./HierarchyTree";
import Viewport from "./Viewport";
import Inspector from "./Inspector";
import Toolbar from "./Toolbar";
import ContextMenu from "./ContextMenu";
import { useDialog } from "./useDialog";
import { confirmDeleteSlot } from "./deleteConfirm";

export default function Editor() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const selectedSlotId = useStore((s) => s.selectedSlotId);
  const remove = useStore((s) => s.remove);
  const duplicate = useStore((s) => s.duplicate);
  const resetViewport = useStore((s) => s.resetViewport);
  const root = useStore((s) => s.root);
  const toggleLeft = useStore((s) => s.toggleLeftPanel);
  const toggleRight = useStore((s) => s.toggleRightPanel);
  const leftHidden = useStore((s) => s.leftPanelHidden);
  const rightHidden = useStore((s) => s.rightPanelHidden);
  const dialog = useDialog();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const meta = e.ctrlKey || e.metaKey;
      // While typing in a field, let the input own its keys — Ctrl+Z must be the
      // browser's native input-undo (not app-level undo), Ctrl+D must not
      // duplicate the selected slot, and Delete/Backspace must edit text, not the
      // canvas. App shortcuts only apply when focus isn't in an editable field.
      if (inField) return;
      if (meta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (meta && (e.key === "d" || e.key === "D")) {
        if (selectedSlotId && selectedSlotId !== root.id) {
          e.preventDefault();
          duplicate(selectedSlotId);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedSlotId && selectedSlotId !== root.id) {
        e.preventDefault();
        const id = selectedSlotId;
        confirmDeleteSlot(dialog.confirm, root, id).then((ok) => { if (ok) remove(id); });
        return;
      }
      if ((e.key === "f" || e.key === "F") && !meta) {
        e.preventDefault();
        resetViewport();
        return;
      }
      if (e.key === "[" && !meta) {
        e.preventDefault();
        toggleLeft();
      }
      if (e.key === "]" && !meta) {
        e.preventDefault();
        toggleRight();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selectedSlotId,
    root.id,
    remove,
    duplicate,
    resetViewport,
    toggleLeft,
    toggleRight,
  ]);

  const leftCol = leftHidden ? "24px" : "260px";
  // Inspector is denser now (2-column field grid) — give it a touch more
  // breathing room so colors / number pairs don't collide.
  const rightCol = rightHidden ? "24px" : "360px";

  return (
    <div className="flex h-full w-full flex-col">
      <Toolbar />
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `${leftCol} 1fr ${rightCol}` }}
      >
        <HierarchyTree />
        <Viewport />
        <Inspector />
      </div>
      <ContextMenu />
    </div>
  );
}
