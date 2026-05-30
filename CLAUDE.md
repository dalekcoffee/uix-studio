# UIX Studio — Claude Context

## What this project is
A static React/Vite/TypeScript/Tailwind web app that lets users design Resonite UIX panels visually and export them as `.resonitepackage` files (a zip containing `R-Main.record` + `Assets/<hashes>`) that can be dragged directly into Resonite. No backend, no accounts, hosted on GitHub Pages.

## Why .resonitepackage, not .brson
A single `.brson` cannot ship its own assets. `@packdb:///<hash>` URLs only resolve when the asset is listed in a `R-Main.record` `assetManifest` AND the asset bytes are present in `Assets/<hash>` alongside the BSON. `resdb:///` URLs get silently nulled during BSON import (Resonite security: refuses to fetch arbitrary cloud assets from imports). The `.resonitepackage` extension is literally just a renamed `.zip` with the saved-object layout.

**NOT UIXML** — targets real Resonite UIX (FrooxEngine slot/component hierarchy).

## Key files
- `src/version.ts` — bump `APP_VERSION` by +0.0.1 on every meaningful iteration
- `src/model/types.ts` — Slot/Component types
- `src/model/components.ts` — Zod schemas + defaults per component
- `src/model/template.ts` — starter template shown on first load
- `src/state/store.ts` — Zustand store with undo/redo
- `src/editor/` — UI panels (HierarchyTree, Viewport, Inspector, Toolbar, DragLayer)
- `src/io/exportBrson.ts` — builds the FrDT + Brotli + BSON blob (no longer downloaded directly)
- `src/io/exportBundle.ts` — **the real exporter**: wraps the BSON in a `.resonitepackage` zip with `R-Main.record` + bundled font binary
- `src/io/exportFrdt.ts` — JSON reference exporter (kept for debugging)
- `src/io/exportNative.ts` / `importNative.ts` — `.uixstudio.json` save/load
- `Images/fonts/<hash>` — bundled font binaries served from the public dir (vite `publicDir: "Images"`)

## Resonite .brson file format (reverse-engineered)

### File structure
```
[0-3]  Magic: "FrDT" (46 72 44 54)
[4-7]  4 null bytes (00 00 00 00)
[8]    Compression type: 03 = Brotli
[9+]   Brotli-compressed BSON document
```

### BSON document top-level keys
```json
{
  "VersionNumber": "2026.5.20.291",
  "FeatureFlags": { "ColorManagement": 0, "ResetGUID": 0, ... },  // all Int32(0)
  "Types": ["[FrooxEngine]FrooxEngine.Grabbable", ...],           // type registry array
  "TypeVersions": { "[FrooxEngine]FrooxEngine.Grabbable": 2, ... }, // Int32 versions
  "Object": { ...root slot... },
  "Assets": [ ...shared material assets... ]
}
```

### Slot structure
```json
{
  "ID": "00000000-0000-0000-0000-000000000000",
  "Components": { "ID": uuid, "Data": [ { "Type": Int32(typeIdx), "Data": {...} } ] },
  "Name":           { "ID": uuid, "Data": "slot name" },
  "Tag":            { "ID": uuid, "Data": null },
  "Active":         { "ID": uuid, "Data": true },
  "Persistent-ID":  uuid,
  "Position":       { "ID": uuid, "Data": [0, 0, 0] },
  "Rotation":       { "ID": uuid, "Data": [0, 0, 0, 1] },
  "Scale":          { "ID": uuid, "Data": [1, 1, 1] },
  "OrderOffset":    { "ID": uuid, "Data": Int32(0) },
  "ParentReference": null,
  "Children": [ ...child slots... ]
}
```

IDs use sequential hex counter: `00000000-0000-0000-0000-000000000000`, `00000001-...`, etc.

Component fields wrap values: `"FieldName": { "ID": uuid, "Data": value }`.

**BSON type rules (verified by inspecting real .brson bytes — Resonite is strict):**
- Int32 (0x10): UpdateOrder, GrabPriority, StartingOffset, StartingMaskDepth, CaretPosition, SelectionStart, StencilID, StencilWriteMask, StencilReadMask, PixelRange, GlyphEmSize, RenderQueue, StaticFont.Padding (singular)
- Int64 (0x12 / BSON `Long`): OrderOffset (every slot field)
- Double (0x01): PaddingTop/Right/Bottom/Left, Spacing, SpacingX/SpacingY, OffsetFactor, OffsetUnits, PixelScale, UnitScale, LineHeight, AutoSizeMin/Max, LayoutElement sizing, LODBias, anchors, offsets, color components, text Size
- **Critical:** wrong type on `OffsetFactor`/`OffsetUnits` in UI_TextUnlitMaterial silently breaks text rendering (material loads but glyphs are invisible). Same fields on UI_UnlitMaterial happen to tolerate Int32 because Images use a different code path.
- Colors: `[r, g, b, a, "sRGB"]` or `[r, g, b, a, "sRGBAlpha"]` — float arrays, NOT objects
- float2: `[x, y]` — plain array
- float3: `[x, y, z]` — plain array
- float4/quaternion: `[x, y, z, w]` — plain array

### Root wrapper object
Every export wraps the Canvas slot inside a root slot with Grabbable + ObjectRoot components. This makes the panel grabbable in Resonite.

```
Root slot  [Grabbable, ObjectRoot]  Scale: [1,1,1]  ParentReference: null
  └─ Canvas slot  [Canvas, RectTransform, ...]  Scale: [1,1,1]
       └─ child slots...
```

### Canvas component — critical fields
```
UpdateOrder: Int32(100000)
Size:        [sizeX, sizeY]          // canvas pixel dimensions
UnitScale:   0.001                   // METERS per pixel — 800px * 0.001 = 0.8m panel
PixelScale:  1.0
_rootRect:   "uuid-of-RT-component"  // reference to RectTransform on same slot
StartingOffset: Int32(-32000)
StartingMaskDepth: Int32(0)
```

**UnitScale = 0.001 is the correct default for a standard-sized panel.**
Resonite ignores slot Scale on import; UnitScale controls the physical world size.

### RectTransform component
```
AnchorMin: [ax, ay]   // 0-1 normalized, Y-UP coordinate system
AnchorMax: [ax, ay]
OffsetMin: [ox, oy]   // pixel offsets from anchor edges, Y-UP
OffsetMax: [ox, oy]
Pivot:     [0.5, 0.5]
```

**Y-axis is UP in Resonite UIX** (opposite of CSS):
- `offsetMin.y` = distance from BOTTOM anchor
- `offsetMax.y` = distance from TOP anchor (negative = inset)

CSS-to-Resonite conversion (in `src/editor/render/rectTransform.ts`):
```
offsetMin.y = parentH - cssBottom - anchorMin.y * parentH
offsetMax.y = parentH - cssTop   - anchorMax.y * parentH   (wait: = -(parentH - cssTop - anchorMax.y*parentH) ... check source)
```

### Text component — critical fields
```
Content:        string
Size:           double (font size in pixels)
HorizontalAlign: "Left" | "Center" | "Right"
VerticalAlign:   "Top" | "Middle" | "Bottom"
Color:          [r, g, b, a, "sRGB"]
Materials:      [{ "ID": uuid, "Data": "text_material_asset_id" }]  // REQUIRED for text to render
Font:           null  // uses Resonite default font
```

`Materials` MUST reference a `UI_TextUnlitMaterial` asset or text is invisible.

### UI Material — Sidedness
Use `Sidedness: "Double"` (matches Resonite's own saves). "Front" makes the back invisible / transparent which users don't want.

### Canvas slot needs a BoxCollider with cross-referenced IDs
Every real Resonite Canvas slot has `[Canvas, RectTransform, BoxCollider, ...]`. The Canvas component holds three back-references INTO the BoxCollider:
- `Canvas.Collider.Data` = BoxCollider's component ID
- `Canvas._colliderOffset.Data` = BoxCollider.Offset's field ID
- `Canvas._colliderSize.Data` = BoxCollider.Size's field ID

This bidirectional wiring lets the canvas auto-resize the collider. Without a BoxCollider on the canvas, Resonite seems to fall into a degraded render path that causes massive Z-fighting on the UI surface. See `serializeSlot` for the build-order dance (RT first to pin its ID, then BoxCollider to capture Offset/Size IDs, then Canvas referencing all of them, then arrange components as `[Canvas, RectTransform, BoxCollider, ...]`).

BoxCollider has `UpdateOrder: 1000000` (note the value, not field count). Size defaults to `[canvasWidth, canvasHeight, 0]`.

### Legacy `-ID` fields on components — REQUIRED
Resonite preserves legacy "ID-only" markers from old type versions across new saves. Each is just a fresh UUID with no `Data`. **Missing them is the cause of the persistent Z-fighting** — without `Image.__legacyZWrite-ID` in particular, the renderer can't establish per-quad depth, so all UI surfaces collapse to the same Z. Required fields per type (positions matter — match field order from Fixed Export):

- **`UIX.Image`**: `__legacyZWrite-ID` (between `FillRect` and `Tint`)
- **`UIX.Text`**: `_legacyFontMaterial-ID`, `_legacyAlign-ID` (at the end)
- **`UIX.Button`**: `__legacy_NormalColor-ID`, `__legacy_HighlightColor-ID`, `__legacy_PressColor-ID`, `__legacy_DisabledColor-ID`, `__legacy_TintColorMode-ID`, `__legacy_ColorDrive-ID` (between `ColorDrivers` and `IsPressed`)
- **`Grabbable`**: `__legacyActiveUserRootOnly-ID` (at the end)

Both materials need `_shader-ID` (single underscore) right after `baseAssetComp` (UI_TextUnlitMaterial) or after `RenderQueue` (UI_UnlitMaterial).

### The actual Z-fighting fix: `Image.Material: null`
After many iterations, the root cause was **sharing one bundled `UI_UnlitMaterial` across every Image**. Resonite batched them into a single draw call at the same effective Z. The fix is to **not bundle a custom Image material at all** — set every `Image.Material` to `null` and Resonite resolves it to its built-in default UI material per-Image, giving each Image its own draw call with proper depth sorting. Matches Preset Template 2's pattern (only its Canvas's Image references a custom material; every child Image is null). See `compImage` and `buildSharedAssets` in [exportBrson.ts](src/io/exportBrson.ts).

### Rounded corners via SpriteProvider + 9-slice
`canvas.rounded` (boolean, default true) toggles rounded corners. When on:
- `Images/sprites/bc05f293...` (8KB PNG) is bundled in the .resonitepackage
- A `StaticTexture2D` asset is added pointing to `@packdb:///bc05f293...`
- A `SpriteProvider` component is injected on the Canvas slot with `Borders: [0.25,0.25,0.25,0.25]`, `Scale: 0.268`, `FixedSize: 8.82` — values copied verbatim from Preset Template 2
- Every `Image.Sprite` references the SpriteProvider's component ID and uses `NineSliceSizing: "TextureSize"` (9-slice corners stay original size, middle stretches)

Per-Image opt-out via `props.squareCorners: true` (e.g., the close button might want a square X).

### Hyperlinks: BoxCollider + Hyperlink component, not `<link>` tags
Resonite's `<link="...">` rich-text tag does NOT open URLs in UIX (it's inert). To make an element clickable-to-URL, add two sibling components on the same slot as the visual Image:
- **`BoxCollider`** sized to the Image's RectTransform rect
- **`Hyperlink`** (`[FrooxEngine]FrooxEngine.Hyperlink`) with `URL`, `OpenOnce` (bool), `Reason` (string shown to user as a confirmation)

Resonite raycasts against the collider; on click, the Hyperlink fires `Open()` and the user is prompted with the Reason then sent to the URL. See the `Back Logo` slot in [template.ts](src/model/template.ts).

**BoxCollider must have non-zero Z size** when it sits *outside* a UIX Canvas (e.g. the back-logo / credits banner). The canvas's own BoxCollider gets away with `Size.z = 0` because UIX click routing projects pointer rays onto the rect plane, but the physics raycast used for off-canvas colliders treats a Z=0 box as a degenerate plane and the pointer slips through entirely. `compBoxCollider(w, h, sizeZ)` takes an optional sizeZ — pass ~0.1–0.5 (in slot-local units) for off-canvas colliders.

**Hyperlink URLs require the `@` prefix to survive BSON import.** Resonite null-coerces Uri fields on import as a security measure — the same mechanism that nulls bare `resdb:///` asset URLs. The `@` prefix marks the URI as "preserve across import" and is the convention bundled assets use (`@packdb:///<hash>`). Discovered empirically by decoding a Resonite-saved Hyperlink the user manually re-exported: the working URL was stored as `"@https://uix.dalek.coffee/"`; the same string without the @ gets nulled on re-import. `compHyperlink` now prepends `@` to any non-empty URL automatically — never write a bare `https://...` URL into a Hyperlink. Reason (plain string, not URI) was always preserved; we no longer need the URL-baking-into-Reason fallback (but it's harmless).

**Popup buttons should NOT use Hyperlink-as-popup.** Earlier we tried to make help/info buttons fire Resonite's native confirmation dialog by emitting a Hyperlink with empty URL; clicking it does nothing because the Hyperlink's `Open()` does nothing when URL is null, and even with a URL the dialog frames itself as an outbound web link ("External Link — Warning: Outgoing hyperlink"), which is wrong UX for an info dialog. Real popups need a spawn-window approach: a pre-built modal sub-tree under the canvas with `Active=false` initially, toggled by `ButtonValueSet<bool>` components on the trigger button (sets `popup.Active=true`) and the dismiss button (sets `popup.Active=false`). The `Popup` component still exists as the user-facing marker; the exporter lowers it into the spawn-window subtree.

### Reference Field drop targets: RefEditor, not UIX.ReferenceReceiver
Despite its name, `[FrooxEngine]FrooxEngine.UIX.ReferenceReceiver` does not actually receive `IWorldElement` drops in current Resonite — the BSON loads fine, the Inspector shows the component, but drag-and-drop onto the slot silently does nothing. Verified against three example exports (`UIX Template/Reference Receiver Field`, `Text to String with Reference Field`, `Amaster's Debugger`); the second one is the canonical working pattern.

The real drop target wiring is `[FrooxEngine]FrooxEngine.RefEditor` paired with `[FrooxEngine]FrooxEngine.ReferenceField<[FrooxEngine]FrooxEngine.IWorldElement>` on the **same slot**. RefEditor exposes three back-references:
- `_targetRef` → the `ReferenceField.Reference` field UUID (the storage)
- `_textDrive` → a `Text.Content` field UUID (RefEditor drives the displayed name when a ref is dropped — no ProtoFlux needed)
- `_button`    → a `UIX.Button` component UUID (Resonite registers this Button as the actual drop sink)

Clearing the stored reference uses `[FrooxEngine]FrooxEngine.UIX.ButtonRelay` with `ButtonPressed.Target = RefEditor.ID, Method = "SetReference"` on the same slot as the drop Button — click-without-drag fires the relay → clears; drag-and-drop is caught by RefEditor first via `_button` (set wins). Opening an inspector for the referenced object uses a separate Button with `Pressed.Method = "OpenInspectorButton"` (e.g. a small "⤴" sub-button).

ID-allocation order matters: build the displayed `Text` first to capture its `Content.ID` for `_textDrive`, build the drop `Button` next to capture its `ID` for `_button`, then build `RefEditor` (which now has all three back-references) and `ReferenceField` (with a pre-allocated `Reference` field UUID). See the `hasReferenceField` branch in [exportBrson.ts](src/io/exportBrson.ts).

### Back-face occlusion via Sidedness="Back" backing material
Real templates (Preset Template, 4, 6) make their panels read as opaque from behind by nesting a "Backing" slot inside the Background with an Image referencing a custom material that has `Sidedness: "Back"` (cull front faces — invisible from front, opaque from rear) and `OffsetFactor: -1` (negative depth bias keeps it from Z-fighting with the Double-sided sibling at the same Z). We bundle exactly one such material as `_backMatId` and `compImage` opts in via `props.useBackMaterial: true`. The Position.z=1 hack on Background was reverted in favor of this proper pattern.

### Z-fighting — material field order + `_shader-ID` matter
Real Resonite saves use `Position=[0,0,0]` and `OrderOffset=0` everywhere. Z resolution comes from hierarchy + material configuration. Values verified against the Fixed Export (Resonite's own save of our panel) and most real Preset Templates:

- **`_shader-ID`** legacy field (a fresh UUID, no Data wrapper) MUST be present on both materials. Missing it is the most likely cause of mass Z-fighting.
- **Field order matters and DIFFERS between materials:**
  - **UI_UnlitMaterial:** baseAssetComp → Rect/RectClip/ColorMask/Stencil*/RenderQueue → `_shader-ID` → Texture/Tint → Overlay/OverlayTint → AlphaCutoff/AlphaClip → TextureMode/Mask* → BlendMode/Sidedness/ZWrite/ZTest → OffsetFactor/OffsetUnits
  - **UI_TextUnlitMaterial:** baseAssetComp → `_shader-ID` → FontAtlas/colors/Glyph* → BlendMode/Sidedness/Z*/Offset* → THEN RenderQueue/Overlay/Rect/RectClip/ColorMask/Stencil* at the end
- Canonical values: `Tint: sRGBAlpha [1,1,1,1]`, `AlphaCutoff: 0.5`, `OffsetFactor: 1, OffsetUnits: 100` for UI_UnlitMaterial. (Preset Template 2's `OffsetUnits: 1, AlphaCutoff: 0.01, Tint: sRGB` is an outlier — don't chase it.)

Tried-and-failed: explicit `Position.Z` stacking per sibling — looks layered from the side, still Z-fights from the front. Sidedness "Front" — kills the back rendering (user didn't want that).

### Image component — critical fields
```
Tint:           [r, g, b, a, "sRGB"]
Material:       "image_material_asset_id"  // reference to UI_UnlitMaterial
Sprite:         null
PreserveAspect: false
NineSliceSizing: "FixedSize"
InteractionTarget: true
FillRect:       { X:0, Y:0, Width:1, Height:1 }
```

### Button component — critical fields
```
BaseColor:    [r, g, b, a, "sRGB"]
ColorDrivers: []   // empty = static color
PressPoint:   [0.55, 0.55]
Pressed/Pressing/Released/HoverEnter/HoverStay/HoverLeave: { "Target": null }
```

### Layout components
VerticalLayout / HorizontalLayout:
```
PaddingTop/Right/Bottom/Left: Int32
Spacing: Int32
ForceExpandWidth/Height: bool
HorizontalAlign: "Left"|"Center"|"Right"
VerticalAlign: "Top"|"Middle"|"Bottom"
```

### Font assets (required for Text rendering)
Text components render NOTHING if `Font` is null. Need a FontChain asset referencing StaticFont
assets with `resdb:///` URLs (NOT `@packdb:///` — packdb is local-only and won't resolve from
an imported .brson). Extensions are required (`.ttf`/`.otf`).

StaticFont is the ONLY asset that lacks `HighPriorityIntegration`; including it makes Resonite
reject the asset and the FontChain ends up with broken references → invisible text.

Verified URLs (from the FontChain on Root in a live Resonite session — these are the canonical
fonts shipped with current Resonite versions):
```
resdb:///8c1dc004996029f804283dd398ca2a05d4d33ebcba5c0d25ea13fd2026572279.ttf   ← MainFont (Noto Sans)
resdb:///4cac521169034ddd416c6deffe2eb16234863761837df677a910697ec5babd25.ttf
resdb:///b4a1dfdbfa13b4755e5eac20cb25c1d17ed5a745ceb89639595e8cf45a2b1e07.ttf
resdb:///cd07743a4c93d8da929afdd28c1d368f11da478a1093146a13610081c2a58440.ttf
resdb:///bcda0bcc22bab28ea4fedae800bfbf9ec76d71cc3b9f851779a35b7e438a839d.otf
resdb:///9aee503e8c9126e238639973a7eb7830ae02b4aed2a8f453b0f86300c2b5a9af.ttf
```

LayoutElement (sizing hints for layout containers):
```
MinWidth/MinHeight: -1.0         // -1 = not set
PreferredWidth/Height: -1.0
FlexibleWidth/Height: -1.0
Priority: Int32(1)
```

### Assets array (shared materials)
Assets in the top-level `"Assets"` array use a slightly different base structure:
```json
{
  "Type": Int32(typeIdx),
  "Data": {
    "ID": uuid,
    "persistent": { "ID": uuid, "Data": bool },  // NOT "persistent-ID" like slot components
    "UpdateOrder": { "ID": uuid, "Data": Int32(0) },
    "Enabled": { "ID": uuid, "Data": true },
    "HighPriorityIntegration": { "ID": uuid, "Data": false },
    ...type-specific fields...
  }
}
```

Required assets:
- One `UI_UnlitMaterial` — referenced by Image.Material
- One `UI_TextUnlitMaterial` — referenced by Text.Materials[0]

### FrooxEngine type names
```
[FrooxEngine]FrooxEngine.Grabbable             version 2
[FrooxEngine]FrooxEngine.ObjectRoot
[FrooxEngine]FrooxEngine.UIX.Canvas            version 2
[FrooxEngine]FrooxEngine.UIX.RectTransform     version 1
[FrooxEngine]FrooxEngine.UIX.Image             version 1
[FrooxEngine]FrooxEngine.UIX.Text              version 1
[FrooxEngine]FrooxEngine.UIX.TextField         version 1
[FrooxEngine]FrooxEngine.UIX.Button
[FrooxEngine]FrooxEngine.UIX.VerticalLayout
[FrooxEngine]FrooxEngine.UIX.HorizontalLayout
[FrooxEngine]FrooxEngine.UIX.GridLayout
[FrooxEngine]FrooxEngine.UIX.LayoutElement
[FrooxEngine]FrooxEngine.UIX.Mask
[FrooxEngine]FrooxEngine.UIX.ButtonRelay
[FrooxEngine]FrooxEngine.RefEditor
[FrooxEngine]FrooxEngine.ReferenceField<[FrooxEngine]FrooxEngine.IWorldElement>
[FrooxEngine]FrooxEngine.UI_UnlitMaterial
[FrooxEngine]FrooxEngine.UI_TextUnlitMaterial
```

## Tech stack notes
- Windows path with spaces (`UIX Studio`) breaks native Vite file watcher → `usePolling: true` in `vite.config.ts`
- `brotli-wasm` must be in `optimizeDeps.exclude` to prevent Vite pre-bundling from breaking `import.meta.url` WASM path resolution
- React Fast Refresh requires component files to only export React components; utilities must be in separate files

## Author / branding
- Author: Dalek — credit with `Images/Dalek.png`
- Logo: `Images/templategrid_albedo.png` (shown in splash + toolbar)
- Splash auto-dismisses after 2.4s or on click
