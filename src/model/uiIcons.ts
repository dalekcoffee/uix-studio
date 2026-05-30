// The full set of bundled UI icons shown in the Inspector's "System Images"
// grid. These live in the Vite publicDir (Images/UIIcons + the root UIX Studio
// mark), so they're served as static assets and can't be enumerated via
// import.meta.glob — hence this explicit manifest.
//
// Picking one routes through the normal customImageHash path: the PNG is fetched
// and added to the image store (lazily, on first pick), then bundled into the
// .resonitepackage exactly like a user upload. No per-icon exporter flags
// needed — adding a new icon here is the only step.

export interface UiIcon {
  name: string;
  /** URL relative to the app base (publicDir = Images). */
  url: string;
}

// Build a publicDir URL for a file under Images/UIIcons (spaces → %20; other
// path chars like & are valid in a path segment).
const icon = (file: string): string => `./UIIcons/${file.replace(/ /g, "%20")}`;

export const UI_ICONS: UiIcon[] = [
  { name: "UIX Studio", url: "./UIX%20Studio.png" },
  { name: "Help / Info", url: icon("Help&Info.png") },
  { name: "Cancel", url: icon("Cancel.png") },
  { name: "Checkmark", url: icon("Checkmark.png") },
  { name: "Check", url: icon("Check.png") },
  { name: "Clear", url: icon("Clear.png") },
  { name: "Backspace", url: icon("Backspace.png") },
  { name: "Search", url: icon("Search.png") },
  { name: "Favorite", url: icon("Favorite.png") },
  { name: "Open Arrow", url: icon("OpenArrow.png") },
  { name: "Left", url: icon("Left.png") },
  { name: "Right", url: icon("Right.png") },
  { name: "Play", url: icon("Play.png") },
  { name: "Pause", url: icon("Pause.png") },
  { name: "Repeat", url: icon("Repeat.png") },
  { name: "Repeat On", url: icon("Repeat On.png") },
  { name: "Shuffle", url: icon("Shuffle.png") },
  { name: "Shuffle On", url: icon("Shuffle On.png") },
  { name: "Playlist", url: icon("Playlist.png") },
  { name: "Volume Up", url: icon("VolumeUp.png") },
  { name: "Volume Down", url: icon("VolumeDown.png") },
  { name: "Volume Off", url: icon("Volume Off.png") },
  { name: "Progress / Spinner", url: icon("progress_activity.png") },
  { name: "Image", url: icon("image.png") },
];
