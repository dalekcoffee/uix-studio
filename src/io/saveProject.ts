// Save Project (.uixstudio.json) as a single action, shared by the toolbar
// button and the Ctrl+S shortcut so both behave identically.

import { useStore } from "../state/store";
import { exportNativeFile, downloadBlob } from "./exportNative";

export function saveProject(): void {
  const { documentSnapshot, markClean } = useStore.getState();
  downloadBlob(exportNativeFile(documentSnapshot()), "panel.uixstudio.json");
  // The editable project is now persisted to a file the user controls — clear
  // the unsaved-changes flag so the close-tab guard stops warning (markClean
  // also drops the now-redundant browser autosave).
  markClean();
}
