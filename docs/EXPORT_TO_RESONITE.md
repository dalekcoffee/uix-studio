# Exporting a UIX Studio panel to Resonite

UIX Studio is a static web app. It cannot write native Resonite object files
(`.brson` / `.resonitepackage`) directly from the browser — FrooxEngine's
serialization format is not publicly documented in enough detail. Instead,
UIX Studio exports an intermediate JSON file and you run a small open-source
conversion tool locally one time to produce the `.brson` that Resonite loads.

## The workflow

```
UIX Studio (web)  ──►  panel.frdt  ──►  DataTreeConverter  ──►  panel.brson  ──►  drag into Resonite
        (1)               (2)                  (3)                  (4)                  (5)
```

1. Design your panel in UIX Studio.
2. **Toolbar → Export (.frdt → Resonite)**. Downloads `panel.frdt`.
3. Download the open-source converter:
   <https://github.com/Lexevolution/Resonite-DataTree-Converter>
   (clone and `dotnet build`, or grab a release binary if one is published).
4. Run the converter to produce a `.brson`:
   ```
   DataTreeConverter.exe panel.frdt panel.brson
   ```
5. In Resonite, open the **File Browser** and drag `panel.brson` into your
   session. The panel spawns as a regular object and can be saved to your
   inventory.

## Re-editing later

Save your work using **Toolbar → Save (.uixstudio.json)** before closing the
tab. UIX Studio is a static site with no user accounts; there is no
server-side history. Use **Toolbar → Open…** to load a `.uixstudio.json` back
into the editor.

## Known limitations in v0.0.1

- The exact JSON schema accepted by Resonite-DataTree-Converter is being
  reverse-engineered. The `.frdt` produced by today's build is a stub layout
  — the converter will reject it. The toolbar action is wired so the data
  flow exists; the serializer will be tightened in subsequent versions.
- Image sprites must be referenced by URL or `resdb://` link — UIX Studio
  cannot upload assets to Resonite Cloud.
- Button event hooks (`Pressed`, `Released`, etc.) are not exported. Hook
  buttons up in-world after spawning.
- Slider, TextField, ScrollRect, NestedCanvas, ColorDrivers, and Checkbox
  are out of scope for v1.

## Why not a "paste JSON in-world" companion?

ProtoFlux has no JSON-parse node. A robust in-world importer would either
need a ResoniteModLoader (RML) mod (extra install per user) or a hand-built
ProtoFlux JSON state machine (impractical). This may ship later as a v2
stretch goal — for v1 the converter bridge is the only honest path.
