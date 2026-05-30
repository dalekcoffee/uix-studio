import { useEffect, type RefObject } from "react";

/**
 * Dismiss a floating UI surface (dropdown / popover / context menu) on:
 *   - mousedown outside the referenced element, or
 *   - Escape keypress.
 *
 * No-ops while `open` is false. Listeners are attached at the document level
 * during the open window only, so multiple dismissable surfaces can coexist
 * without leaking handlers.
 */
export function useDismissable(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}
