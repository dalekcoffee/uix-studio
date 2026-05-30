// Bundled icons that ship with every exported .resonitepackage. Listed in the
// Library menu's "System Images" tab and the per-slot Inspector image picker so
// users can discover and select them. Each maps to a boolean `useXxxIcon` flag
// on Image props (NOT a customImageHash) — picking one sets that flag and clears
// the others. Read-only — these can't be deleted from the web app.
export interface SystemIcon {
  name: string;
  url: string;
  /** The Image-component boolean prop this icon toggles. */
  flag: string;
  description: string;
}

export const SYSTEM_ICONS: SystemIcon[] = [
  { name: "Help",      url: "./UIIcons/Help&Info.png",         flag: "useHelpIcon",      description: "Filled question mark — info / about buttons" },
  { name: "Close",     url: "./UIIcons/Cancel.png",            flag: "useCloseIcon",     description: "White X in a red circle — destructive close button" },
  { name: "Check",     url: "./UIIcons/Checkmark.png",         flag: "useCheckIcon",     description: "Checkmark — for checkbox indicators" },
  { name: "Backspace", url: "./UIIcons/Backspace.png",         flag: "useBackspaceIcon", description: "Delete-left — keypad/clear actions" },
  { name: "Spinner",   url: "./UIIcons/progress_activity.png", flag: "useSpinnerIcon",   description: "Loading indicator — spins in preview" },
  { name: "UIX Logo",  url: "./UIX%20Studio.png",              flag: "useLogoSprite",    description: "UIX Studio mark — back-panel branding" },
];

/** Every icon flag, so a picker can clear all of them before setting one. */
export const SYSTEM_ICON_FLAGS: string[] = SYSTEM_ICONS.map((i) => i.flag);
