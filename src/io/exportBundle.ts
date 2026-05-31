// Produces a Resonite .resonitepackage — which is literally a zip with this structure:
//   R-Main.record              JSON metadata with assetManifest
//   Assets/<main-hash>         The FrDT BSON blob (our exportBrson output)
//   Assets/<font-hash>         Bundled font binary referenced by @packdb URLs
//   Assets/<sprite-hash>       Bundled rounded-corner sprite (when canvas.rounded)
//
// User drags the .resonitepackage directly into Resonite, chooses "Individual import".
// Without bundling these assets, @packdb:///<hash> URLs in the BSON cannot resolve.
import JSZip from "jszip";
import { collectCustomImageHashes, exportBrsonFile, CREDITS_BACKDROP_ASPECT } from "./exportBrson";
import { getImage } from "./imageStore";
import { bakeBackgroundImage, bakeRoundedRectMask, type BakeMode } from "./bakeBackground";
import { findBackgroundSlots } from "../model/background";
import type { UixDocument } from "../model/types";

const FONT_HASH = "8c1dc004996029f804283dd398ca2a05d4d33ebcba5c0d25ea13fd2026572279";
const FONT_BYTES = 631052;
const SPRITE_HASH = "bc05f293ccbf972aa17a93e7a379f28296124beeb4d8ebd1e66191d7119a6861";
const SPRITE_BYTES = 7973;
const LOGO_HASH = "75dc848ea37322f2d6ffa64565c0bd48662023dc3dca35b9eb891d89090d5e1a";
const LOGO_BYTES = 22058;
// UI icon sprites — small white-on-transparent PNGs. Always bundled.
// Help icon — UIIcons/Help&Info.png (filled question mark in a soft circle).
const HELP_ICON_HASH  = "bbd7ddee64db15cae88246800434f81d41c99eb931e2cd6819f7f58f779f038a";
const HELP_ICON_BYTES = 21305;
// Close icon — UIIcons/Cancel.png (white X in a #FF7676 soft circle).
const CLOSE_ICON_HASH = "c0227d6bb40a93cc0eeaa46327b009d088e42dc5c457104393b95d9d2264c863";
const CLOSE_ICON_BYTES = 20440;
const CHECK_ICON_HASH = "a06fe347c5d05a8e9c4db7f57953f4186bd4f402f4dac7090056537453fdae0c";
const CHECK_ICON_BYTES = 1830;
const BACKSPACE_ICON_HASH  = "ffd79aad917edc57353d05e829ab35ac3b1f83205722302c87f03c3359cc7436";
const BACKSPACE_ICON_BYTES = 14026;
const SPINNER_ICON_HASH  = "bb9de64e158db9afc27101136bb146049a0e44edf3a9a5d4714e21f2b969583e";
const SPINNER_ICON_BYTES = 15577;
// OpenArrow icon (UIIcons/OpenArrow.png) — small "↗" used on the Reference
// Field's Inspector button (opens an inspector on the dropped IWorldElement).
const OPENARROW_ICON_HASH  = "2781fa55bc5fdf45b34e9c2dd9f109ea8797857478fccb492369032a3db8030a";
const OPENARROW_ICON_BYTES = 4284;
// Clear icon (UIIcons/Clear.png) — used on the Reference Field's Clear
// button (fires RefEditor.SetReference to null out the stored reference).
const CLEAR_ICON_HASH  = "b066141720509dd4323139facf84fcc7e6d76f07528b0aa02e81f0143e42c9a4";
const CLEAR_ICON_BYTES = 12890;
// Pill sprite (extracted from Rocker 2 preset) — 4-quadrant quarter-circle
// PNG designed for Borders=0.5 + NineSliceSizing=RectHeight.
const PILL_SPRITE_HASH = "cb7ba11c8a391d6c8b4b5c5122684888a6a719179996e88c954a49b6b031a845";
const PILL_SPRITE_BYTES = 13225;
// Back-side credits text — a single rasterized "Made with UIX Studio  by Dalek"
// PNG on transparent background. Paired with a small UIX Studio logo to its
// left and one big BoxCollider/Hyperlink to uix.dalek.coffee covering both.
const CREDITS_TEXT_HASH  = "b97bbd70290cd774c5c5524956b39a1c47db1900c5cfa724ae1bb11bf6a49595";
const CREDITS_TEXT_BYTES = 16568;
const IMAGE_PLACEHOLDER_HASH  = "e38064f93c6984cc88189db8a41566bf064f83001ef1630917193551eda9358a";
const IMAGE_PLACEHOLDER_BYTES = 48689;
const IMAGE_ICON_HASH  = "9a61203b3a3b092cbbcc14dc3bfd008c7188b389e7acec600ea3132177306ffe";
const IMAGE_ICON_BYTES = 3489;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchAsset(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function buildRecordJson(
  mainHash: string,
  name: string,
  manifest: Array<{ hash: string; bytes: number }>,
): string {
  const now = new Date().toISOString();
  const record = {
    id: "R-Main",
    ownerId: "U-UIXStudio",
    assetUri: `packdb:///${mainHash}`,
    version: {
      globalVersion: 0,
      localVersion: 0,
      lastModifyingUserId: null,
      lastModifyingMachineId: null,
    },
    name,
    description: null,
    recordType: "object",
    ownerName: null,
    tags: null,
    path: null,
    thumbnailUri: null,
    lastModificationTime: now,
    creationTime: now,
    firstPublishTime: null,
    isDeleted: false,
    isPublic: false,
    isForPatrons: false,
    isListed: false,
    isReadOnly: false,
    visits: 0,
    rating: 0,
    randomOrder: 0,
    submissions: null,
    assetManifest: manifest,
    migrationMetadata: null,
  };
  return JSON.stringify(record);
}

export async function exportBundleZip(
  doc: UixDocument,
  name = "UIX Panel",
): Promise<Blob> {
  // Pick up canvas.rounded — controls whether to bundle the sprite asset.
  const canvasComp = doc.root.components.find((c) => c.type === "Canvas");
  const canvasP = (canvasComp?.props ?? {}) as { rounded?: boolean; sizeX?: number; sizeY?: number };
  const rounded = canvasP.rounded !== false;

  // Bake fit/full background images to a canvas-aspect, opaque PNG so Resonite
  // shows a pre-correct image (it can't crop a sprite). We work on a CLONE so
  // the live document is untouched; the clone's faces get the baked hash and
  // backgroundFit="stretch" (the baked image already matches the canvas aspect).
  const work: UixDocument = structuredClone(doc);
  const bakedBytes = new Map<string, Uint8Array>();
  {
    const target = { w: canvasP.sizeX ?? 800, h: canvasP.sizeY ?? 600 };
    const letterbox = work.theme?.background ?? { r: 0.05, g: 0.05, b: 0.05, a: 1 };
    const { background, frontBacking, backCover } = findBackgroundSlots(work.root);
    // The front backing's cornerRadius is the canonical panel radius (a fresh
    // trio defaults it to 10). The back cover is built without a cornerRadius,
    // so it falls back to this value — both faces round identically.
    const frontImgProps = frontBacking?.components.find((c) => c.type === "Image")?.props as
      | { cornerRadius?: number } | undefined;
    const panelCornerRadius =
      typeof frontImgProps?.cornerRadius === "number" ? frontImgProps.cornerRadius : 10;
    // The back face must always round the same as the front. Most presets ship a
    // Back Cover with no cornerRadius (square) while the Front Backing rounds, so
    // a wallpaper-less panel exported a square back + rounded front. Sync the
    // Back Cover's cornerRadius to the Front Backing's (covers every preset and
    // older saved docs, not just the canonical buildBackgroundTrio).
    {
      const bcImg = backCover?.components.find((c) => c.type === "Image");
      if (bcImg) (bcImg.props as { cornerRadius?: number }).cornerRadius = frontImgProps?.cornerRadius;
    }
    // The Back Cover is the panel's REAR OCCLUDER, not a themeable surface: its
    // Sidedness="Back" material (exportBrson `_backMatId`) sits — via a negative
    // polygon offset — IN FRONT of the front-UI's mirrored back-faces when viewed
    // from behind, hiding them by being OPAQUE so the rear shows only a clean
    // backdrop + the bundled logo/credits. A translucent theme (Frosted, panel
    // alpha 0.30) applies that low alpha to the Back Cover too, so it only
    // partially covers the mirrored widgets and the front UI bleeds through from
    // behind. Clamp the rear occluder back to fully opaque so every theme reads
    // clean from the back. The FRONT stays frosted — the Front Backing/Background
    // keep their translucency, and the Back Cover is culled from the front anyway.
    //
    // FUTURE (Option 2 — see-through back): to keep the back ALSO see-through to
    // the world while hiding front content, do NOT clamp here; instead, when the
    // panel is translucent (back-cover alpha < 1), make the front content
    // single-sided (Sidedness="Front") so it has no back-faces to bleed. Front
    // text is cheap/safe (flip the shared `_txtMatId` to Front in exportBrson);
    // front Images are the risk (they use Material:null for the Z-fighting fix, so
    // culling their back-faces needs per-image Sidedness="Front" materials and a
    // VR Z-fight check). This clamp is the safe fallback that path would replace.
    {
      const bcImg = backCover?.components.find((c) => c.type === "Image");
      const bcTint = (bcImg?.props as { tint?: { a?: number } } | undefined)?.tint;
      if (bcTint && typeof bcTint.a === "number") bcTint.a = 1;
    }
    let bakedAnyWallpaper = false;
    for (const face of [frontBacking, backCover]) {
      if (!face) continue;
      const img = face.components.find((c) => c.type === "Image");
      const p = img?.props as {
        customImageHash?: string;
        backgroundFit?: string;
        backgroundFocus?: { x: number; y: number };
        backgroundZoom?: number;
        cornerRadius?: number;
      } | undefined;
      if (!img || !p?.customImageHash) continue;
      // The wallpaper must honor the panel's rounded corners. Use the face's own
      // cornerRadius when set (front backing), else the canonical panel radius
      // (back cover). Baked into the PNG as transparent corners so the panel's
      // rounded shape is preserved instead of overridden by a square fill.
      // 0 → square (nothing to round). Gated on canvas.rounded.
      const faceCornerRadius =
        typeof p.cornerRadius === "number" ? p.cornerRadius : panelCornerRadius;
      const cornerRadius = rounded ? faceCornerRadius : 0;
      const fit = p.backgroundFit;
      // Bake when there's framing to apply (fit/full) OR corners to round.
      const mode: BakeMode | null =
        fit === "fit" ? "fit" : fit === "full" ? "full" : cornerRadius > 0 ? "stretch" : null;
      if (!mode) continue;
      const src = await getImage(p.customImageHash);
      if (!src) continue; // missing source surfaces as the clear error in the loop below
      const baked = await bakeBackgroundImage(src.bytes, mode, target, letterbox, {
        focus: p.backgroundFocus,
        zoom: p.backgroundZoom,
        cornerRadius,
      });
      p.customImageHash = baked.hash;
      p.backgroundFit = "stretch"; // baked image is canvas-aspect → plain fill
      bakedBytes.set(baked.hash, baked.bytes);
      if (cornerRadius > 0) bakedAnyWallpaper = true;
    }
    // Safety net: the Background slot's own Image is documented as "never visible
    // in-world" (Front Backing covers the front, Back Cover the back). Once a
    // wallpaper rounds its face to transparent corners, that dark backing pokes
    // through the corner gap as a crescent. Forcing the backing to a full pill
    // (cornerRadius 100 = maximally cut) makes its solid region a strict subset
    // of any wallpaper corner, so it can never show through — independent of how
    // precisely the baked wallpaper radius matches the pill render.
    if (bakedAnyWallpaper && background) {
      const bgImg = background.components.find((c) => c.type === "Image");
      if (bgImg) (bgImg.props as { cornerRadius?: number }).cornerRadius = 100;
    }
  }

  // Credits backdrop corner-rounding: the back-side credits scrim (only present
  // when the back has a custom image) gets a baked rounded-rect alpha mask when
  // the panel is rounded, so its corners match; square (no texture) otherwise.
  let creditsBackdrop: { hash: string; bytes: Uint8Array } | null = null;
  {
    const backImg = findBackgroundSlots(work.root).backCover?.components.find((c) => c.type === "Image")?.props as
      | { customImageHash?: string } | undefined;
    if (rounded && backImg?.customImageHash) {
      const h = 200;
      const baked = await bakeRoundedRectMask(Math.round(h * CREDITS_BACKDROP_ASPECT), h, Math.round(h * 0.2));
      creditsBackdrop = { hash: baked.hash, bytes: baked.bytes };
    }
  }

  const fontBytes = await fetchAsset(`./fonts/${FONT_HASH}`);
  const spriteBytes = rounded
    ? await fetchAsset(`./sprites/${SPRITE_HASH}`)
    : null;
  // Logo is always bundled — referenced by the back-panel branding image.
  const logoBytes = await fetchAsset(`./sprites/${LOGO_HASH}`);
  // UI icons (Help/Close/Check) — always bundled, fetched the same way.
  const helpIconBytes      = await fetchAsset(`./sprites/${HELP_ICON_HASH}`);
  const closeIconBytes     = await fetchAsset(`./sprites/${CLOSE_ICON_HASH}`);
  const checkIconBytes     = await fetchAsset(`./sprites/${CHECK_ICON_HASH}`);
  const backspaceIconBytes = await fetchAsset(`./sprites/${BACKSPACE_ICON_HASH}`);
  const spinnerIconBytes   = await fetchAsset(`./sprites/${SPINNER_ICON_HASH}`);
  const openArrowIconBytes = await fetchAsset(`./sprites/${OPENARROW_ICON_HASH}`);
  const clearIconBytes     = await fetchAsset(`./sprites/${CLEAR_ICON_HASH}`);
  const pillSpriteBytes = await fetchAsset(`./sprites/${PILL_SPRITE_HASH}`);
  const creditsTextBytes        = await fetchAsset(`./sprites/${CREDITS_TEXT_HASH}`);
  const imagePlaceholderBytes   = await fetchAsset(`./sprites/${IMAGE_PLACEHOLDER_HASH}`);
  const imageIconBytes          = await fetchAsset(`./sprites/${IMAGE_ICON_HASH}`);
  // Gather every user-uploaded image referenced in the document and pull
  // its bytes out of IndexedDB. We do this BEFORE exporting the BSON so a
  // missing image fails the export cleanly rather than producing a broken
  // .resonitepackage that loads but can't resolve some sprites.
  const customHashes = collectCustomImageHashes(work.root);
  const customAssets: Array<{ hash: string; bytes: Uint8Array }> = [];
  for (const hash of customHashes) {
    // Baked background images live only in memory (not IndexedDB); everything
    // else is a user upload pulled from the store.
    const baked = bakedBytes.get(hash);
    if (baked) {
      customAssets.push({ hash, bytes: baked });
      continue;
    }
    const stored = await getImage(hash);
    if (!stored) {
      throw new Error(
        `Custom image ${hash.slice(0, 8)}… is referenced but missing from local storage. Re-upload it before exporting.`,
      );
    }
    customAssets.push({ hash, bytes: stored.bytes });
  }

  const brsonBlob = await exportBrsonFile(work, { creditsBackdropTexHash: creditsBackdrop?.hash });
  const brsonBytes = new Uint8Array(await brsonBlob.arrayBuffer());
  const mainHash = await sha256Hex(brsonBytes);

  const manifest = [{ hash: FONT_HASH, bytes: FONT_BYTES }];
  if (rounded) manifest.push({ hash: SPRITE_HASH, bytes: SPRITE_BYTES });
  manifest.push({ hash: LOGO_HASH, bytes: LOGO_BYTES });
  manifest.push({ hash: HELP_ICON_HASH,  bytes: HELP_ICON_BYTES });
  manifest.push({ hash: CLOSE_ICON_HASH, bytes: CLOSE_ICON_BYTES });
  manifest.push({ hash: CHECK_ICON_HASH, bytes: CHECK_ICON_BYTES });
  manifest.push({ hash: BACKSPACE_ICON_HASH, bytes: BACKSPACE_ICON_BYTES });
  manifest.push({ hash: SPINNER_ICON_HASH,   bytes: SPINNER_ICON_BYTES });
  manifest.push({ hash: OPENARROW_ICON_HASH, bytes: OPENARROW_ICON_BYTES });
  manifest.push({ hash: CLEAR_ICON_HASH,     bytes: CLEAR_ICON_BYTES });
  manifest.push({ hash: PILL_SPRITE_HASH, bytes: PILL_SPRITE_BYTES });
  manifest.push({ hash: CREDITS_TEXT_HASH, bytes: CREDITS_TEXT_BYTES });
  manifest.push({ hash: IMAGE_PLACEHOLDER_HASH, bytes: IMAGE_PLACEHOLDER_BYTES });
  manifest.push({ hash: IMAGE_ICON_HASH, bytes: IMAGE_ICON_BYTES });
  if (creditsBackdrop) manifest.push({ hash: creditsBackdrop.hash, bytes: creditsBackdrop.bytes.byteLength });
  for (const a of customAssets) {
    manifest.push({ hash: a.hash, bytes: a.bytes.byteLength });
  }
  const recordJson = buildRecordJson(mainHash, name, manifest);

  const zip = new JSZip();
  zip.file("R-Main.record", recordJson);
  zip.file(`Assets/${mainHash}`, brsonBytes);
  zip.file(`Assets/${FONT_HASH}`, fontBytes);
  if (rounded && spriteBytes) zip.file(`Assets/${SPRITE_HASH}`, spriteBytes);
  zip.file(`Assets/${LOGO_HASH}`, logoBytes);
  zip.file(`Assets/${HELP_ICON_HASH}`,  helpIconBytes);
  zip.file(`Assets/${CLOSE_ICON_HASH}`, closeIconBytes);
  zip.file(`Assets/${CHECK_ICON_HASH}`, checkIconBytes);
  zip.file(`Assets/${BACKSPACE_ICON_HASH}`, backspaceIconBytes);
  zip.file(`Assets/${SPINNER_ICON_HASH}`,   spinnerIconBytes);
  zip.file(`Assets/${OPENARROW_ICON_HASH}`, openArrowIconBytes);
  zip.file(`Assets/${CLEAR_ICON_HASH}`,     clearIconBytes);
  zip.file(`Assets/${PILL_SPRITE_HASH}`, pillSpriteBytes);
  zip.file(`Assets/${CREDITS_TEXT_HASH}`, creditsTextBytes);
  zip.file(`Assets/${IMAGE_PLACEHOLDER_HASH}`, imagePlaceholderBytes);
  zip.file(`Assets/${IMAGE_ICON_HASH}`, imageIconBytes);
  if (creditsBackdrop) zip.file(`Assets/${creditsBackdrop.hash}`, creditsBackdrop.bytes);
  for (const a of customAssets) {
    zip.file(`Assets/${a.hash}`, a.bytes);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
