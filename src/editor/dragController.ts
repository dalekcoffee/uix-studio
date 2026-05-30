// Tiny shared bridge so a mousedown on a slot (renderSlot) can start a drag
// owned by DragLayer — without lifting DragLayer's drag state into the store.
//
// DragLayer registers `begin` on mount; renderSlot calls it to grab-and-drag an
// element directly in snap mode (no pre-click select needed). `spaceHeld` is
// set by the Viewport so renderSlot can defer to space-to-pan.
export const dragController: {
  begin: ((slotId: string, clientX: number, clientY: number) => void) | null;
  spaceHeld: boolean;
} = {
  begin: null,
  spaceHeld: false,
};
