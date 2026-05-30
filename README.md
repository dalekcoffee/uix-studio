# UIX Studio

A graphical web editor for Resonite UIX panels. Design panels visually, save
your work as `.uixstudio.json`, and export a `.resonitepackage` file that you
drag directly into Resonite — no external converter or backend required.

A `.resonitepackage` is a renamed zip containing an `R-Main.record` plus the
bundled `Assets/` (fonts, sprites) the panel needs, so the exported object
renders as real Resonite UIX (a FrooxEngine slot/component hierarchy).

Author: **Dalek**.

## Status

`v0.1.0` — initial release. See [`docs/EXPORT_TO_RESONITE.md`](docs/EXPORT_TO_RESONITE.md)
for the export workflow and current limitations.

## Develop

```
npm install
npm run dev
```

## Build (for GitHub Pages)

```
npm run build
```

Output lands in `dist/`. The included
[`deploy.yml`](.github/workflows/deploy.yml) workflow publishes `dist/` to
GitHub Pages on every push to `main`.

## Not UIXML

This project targets the real Resonite UIX (slot + component hierarchy used
by FrooxEngine). It is intentionally NOT a UIXML editor — UIXML is a
separate XML translation layer that's out of scope here.
