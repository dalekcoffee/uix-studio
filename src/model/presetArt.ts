// Artwork a PRESET ships with — game-specific graphics that belong to one panel
// rather than to the editor's UI vocabulary.
//
// Why this is not `uiIcons.ts` / `systemIcons.ts`: those two lists are the
// editor's own furniture (help, close, checkmark, spinner…), offered to every
// panel from the Inspector's picker and, for the system set, plumbed through
// dedicated `useXxxIcon` exporter flags. A Palworld resource marker is neither
// — it's content, and putting it in the global picker would be clutter.
//
// So preset art rides the ordinary `customImageHash` path instead: the PNG
// lives in the Vite publicDir (`Images/PresetArt/`), a preset references it by
// the SHA-256 of its bytes, and the file is bundled into the
// .resonitepackage exactly like a user upload. Nothing in the exporter needs to
// know these exist.
//
// The hash IS the file's content hash — regenerate it (`sha256sum` over the
// PNG) if the artwork ever changes, or the reference dangles and the panel
// shows the editor's "image missing" warning.
export interface PresetArt {
  /** SHA-256 of the PNG bytes — what a preset puts in `Image.customImageHash`. */
  hash: string;
  /** URL relative to the app base (publicDir = Images). */
  url: string;
  /** Shown in the image store / Library, so a user can tell them apart. */
  name: string;
}

export const PRESET_ART: readonly PresetArt[] = [
  {
    hash: "0852d2bd83af8a66ff62091a09e11c13ede25dab96ce45a60c2b35c3ecc120da",
    url: "./PresetArt/life.png",
    name: "Life (RESOPAL)",
  },
  {
    hash: "e0865c04a116403cfea7918eb5ee308c9ecc22c57cfba51515d568ce23bc81a8",
    url: "./PresetArt/material.png",
    name: "Material (RESOPAL)",
  },
  {
    hash: "1b846abb1fc89483aa9c1f9c4194f0a5b1a5f0d89ccba30f5e32abdcbb2d3ca1",
    url: "./PresetArt/ingredient.png",
    name: "Ingredient (RESOPAL)",
  },
];

const BY_HASH = new Map(PRESET_ART.map((a) => [a.hash, a]));

/** The bundled artwork for a hash, or undefined if it's an ordinary upload. */
export function presetArtFor(hash: string): PresetArt | undefined {
  return BY_HASH.get(hash);
}
