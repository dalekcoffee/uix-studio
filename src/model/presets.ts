import type { Slot, UixComponent } from "./types";
import { createStarterTemplate } from "./template";
import { isStructuralName } from "./structural";
import { buildBackgroundTrio } from "./background";
import { v4 as uuid } from "uuid";

export interface PresetDescriptor {
  id: string;
  name: string;
  description: string;
  build: () => Slot;
  /**
   * Visual category used by the Preset menu to group entries.
   * "panel"   = full canvas / panel starting point
   * "form"    = login / sign-up / data-entry forms
   * "id-card" = VTuber / student / authenticity-style identification cards
   * "tool"    = focused utility surfaces (keypad, calculator, …)
   * "dialog"  = modal-style overlays
   * "marketing" = show-off / promotional pieces built with the editor itself
   * "blank"   = minimal canvas, build from scratch
   */
  category: "panel" | "form" | "id-card" | "tool" | "dialog" | "marketing" | "blank";
  /**
   * Free-form presets use absolute 2D positioning (centered cards, split
   * landscapes, ID-card grids, the keypad) that a VerticalLayout stack would
   * mangle. When true, loadPreset opens the preset in Free edit mode and sets
   * Canvas.stackLayout=false so it exports with absolute positions. Omitted/false
   * = a vertical-list panel that benefits from Snap + stack layout (in-game
   * reorderable). NOTE: this is layout-shape intent, NOT the `category` —
   * "form" splits both ways (login forms are free-form; checklist/rating are
   * stacks). See the stackLayout audit in exportBrson.ts / buildCanvasStack.
   */
  freeform?: boolean;
}

// ── helpers (mirror src/model/template.ts so presets stay tiny here) ──────────

function id() {
  return uuid();
}

function c(type: UixComponent["type"], props: Record<string, unknown>): UixComponent {
  return { type, props };
}

function slot(name: string, components: UixComponent[], children: Slot[] = []): Slot {
  return { id: id(), name, locked: false, structural: isStructuralName(name) || undefined, components, children };
}

function rgb(r: number, g: number, b: number, a = 1) {
  return { r, g, b, a };
}

function fillRT(): UixComponent {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 0 },
    anchorMax: { x: 1, y: 1 },
    offsetMin: { x: 0, y: 0 },
    offsetMax: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
  });
}

// CSS-style pixel rect within an 800x600 canvas, Y measured from the top in
// CSS terms. Matches the helper in template.ts so all presets read alike.
function rectRT(canvasW: number, canvasH: number, l: number, t: number, r: number, b: number) {
  return c("RectTransform", {
    anchorMin: { x: 0, y: 0 },
    anchorMax: { x: 1, y: 1 },
    offsetMin: { x: l, y: canvasH - b },
    offsetMax: { x: r - canvasW, y: -t },
    pivot: { x: 0.5, y: 0.5 },
  });
}

// ── Shared button builders ────────────────────────────────────────────────────
// Gray background + red-tinted X icon — matches the Experimental Panel's
// close button pattern. Pass a RectTransform component for positioning.
function makeCloseBtn(rt: UixComponent): Slot {
  const glyph = slot("Close Glyph", [
    fillRT(),
    c("Image", { tint: rgb(1, 1, 1), iconTint: rgb(0.9, 0.25, 0.25), preserveAspect: true, spriteUrl: "", useCloseIcon: true }),
  ]);
  const closeGray = rgb(0.25, 0.25, 0.25);
  return slot("Close", [
    rt,
    c("Image", { tint: closeGray, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: closeGray, highlightColor: rgb(0.35, 0.35, 0.35), pressColor: rgb(0.15, 0.15, 0.15), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("Close", { findObjectRoot: true }),
  ], [glyph]);
}

// Gray background + purple-tinted ? icon — matches the Experimental Panel's
// help/info button pattern. Pass a RectTransform component for positioning.
function makeHelpBtn(rt: UixComponent): Slot {
  const glyph = slot("Icon Glyph", [
    fillRT(),
    c("Image", { tint: rgb(1, 1, 1), iconTint: rgb(0.58, 0.44, 0.85), preserveAspect: true, spriteUrl: "", useHelpIcon: true }),
  ]);
  const helpGray = rgb(0.25, 0.25, 0.25);
  return slot("Icon", [
    rt,
    c("Image", { tint: helpGray, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: helpGray, highlightColor: rgb(0.35, 0.35, 0.35), pressColor: rgb(0.15, 0.15, 0.15), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
    c("Popup", { title: "About this panel", body: "Replace this with your panel's description. Edit the Popup component on the Icon slot to change the title and body.", dismissLabel: "Got it" }),
  ], [glyph]);
}

// Slim secondary "link" button — a short pill with a centered text label, used
// for inline form actions ("Forgot password?", "Sign Up") that used to be plain
// non-clickable tinted text. Named "Link Button" so the theme's Button B color
// drives the pill and "Label" so body text drives the caption — both re-skin on
// a theme switch instead of staying hardcoded brand-blue. `rt` positions it.
function makeLinkButton(
  label: string,
  rt: UixComponent,
  fill: { r: number; g: number; b: number; a: number },
  fillHi: { r: number; g: number; b: number; a: number },
  fillLo: { r: number; g: number; b: number; a: number },
  labelColor = rgb(1, 1, 1),
  labelSize = 13,
): Slot {
  const lbl = slot("Label", [
    fillRT(),
    c("Text", { content: label, size: labelSize, color: labelColor, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);
  return slot("Link Button", [
    rt,
    c("Image", { tint: fill, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: fill, highlightColor: fillHi, pressColor: fillLo, disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
  ], [lbl]);
}

// ── Presets ───────────────────────────────────────────────────────────────────

function buildBlank(): Slot {
  return slot("Canvas", [
    c("Canvas", {
      sizeX: 800,
      sizeY: 600,
      pixelScale: 0.0005,
      acceptPhysicalTouch: true,
      backgroundColor: rgb(0.051, 0.051, 0.051),
      rounded: true,
    }),
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 },
      offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // Same dark backdrop chrome as the flagship so a blank panel reads solid
    // front and back and supports a custom background image out of the box.
    // First (and only) child = renders behind everything the user adds.
  ], [buildBackgroundTrio()]);
}

function buildSimpleDialog(): Slot {
  // The canvas IS the dialog card — sized to the card, not a larger surface
  // with the card floating in the middle. A bigger canvas would leave a
  // transparent-but-interactive dead zone around the card (the canvas
  // BoxCollider), which reads as an invisible grabbable area in Resonite.
  const W = 440;
  const H = 240;

  // Header inside the dialog: Title text + red ✕ Close button.
  const titleText = slot("Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 },
      anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 52, y: -48 },
      offsetMax: { x: -52, y: -8 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", {
      content: "Heads up",
      size: 18,
      color: rgb(0.95, 0.95, 0.95),
      horizontalAlign: "Left",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);

  const closeBtn = makeCloseBtn(c("RectTransform", {
    anchorMin: { x: 1, y: 1 },
    anchorMax: { x: 1, y: 1 },
    offsetMin: { x: -44, y: -44 },
    offsetMax: { x: -8, y: -8 },
    pivot: { x: 0.5, y: 0.5 },
  }));

  const helpBtn = makeHelpBtn(c("RectTransform", {
    anchorMin: { x: 0, y: 1 },
    anchorMax: { x: 0, y: 1 },
    offsetMin: { x: 8, y: -44 },
    offsetMax: { x: 44, y: -8 },
    pivot: { x: 0.5, y: 0.5 },
  }));

  // Body text — fills most of the dialog area between header and footer.
  const body = slot("Body Text", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 16, y: 56 },
      offsetMax: { x: -16, y: -56 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", {
      content:
        "This is the message your users will read.\nEdit the Title, Body, and OK label in the Inspector.",
      size: 14,
      color: rgb(0.85, 0.85, 0.85),
      horizontalAlign: "Center",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);

  // Footer: a single "OK" / Dismiss button.
  const okLabel = slot("Label", [
    fillRT(),
    c("Text", {
      content: "OK",
      size: 16,
      color: rgb(1, 1, 1),
      horizontalAlign: "Center",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);
  const okBtn = slot(
    "Button A",
    [
      c("RectTransform", {
        anchorMin: { x: 0.5, y: 0 },
        anchorMax: { x: 0.5, y: 0 },
        offsetMin: { x: -60, y: 12 },
        offsetMax: { x: 60, y: 44 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.24, 0.49, 0.78), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", {
        normalColor: rgb(0.24, 0.49, 0.78),
        highlightColor: rgb(0.32, 0.6, 0.9),
        pressColor: rgb(0.16, 0.36, 0.6),
        disabledColor: rgb(0.5, 0.5, 0.5),
        hoverVibrate: false,
      }),
      // OK dismisses the dialog by destroying the outer grabbable root.
      c("Close", { findObjectRoot: true }),
    ],
    [okLabel],
  );

  // Full-canvas backdrop. Kept as a structural "Background" (not a content
  // wrapper around the widgets) so the dialog edits cleanly in Snap mode: the
  // Title / Body / OK / Help / Close sit at the TOP LEVEL as flowable rows, and
  // the backdrop is excluded from the flow (and stretches with the canvas).
  // Mirrors the installer / basic-text structure.
  const dialogBg = rgb(0.094, 0.094, 0.094);
  const background = buildBackgroundTrio(dialogBg);

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.051, 0.051, 0.051),
        rounded: true,
      }),
      fillRT(),
    ],
    [background, helpBtn, titleText, closeBtn, body, okBtn],
  );
}

function buildBasicTextPanel(): Slot {
  const W = 600;
  const H = 200;
  const panelBg = rgb(0.051, 0.051, 0.051);
  const background = buildBackgroundTrio(panelBg);
  const text = slot("Body Text", [
    rectRT(W, H, 24, 56, W - 24, H - 12),
    c("Text", {
      content: "Edit this text in the Inspector.",
      size: 20,
      color: rgb(0.95, 0.95, 0.95),
      horizontalAlign: "Center",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);
  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.051, 0.051, 0.051),
        rounded: true,
      }),
      fillRT(),
    ],
    [
      background,
      text,
      makeHelpBtn(rectRT(W, H, 8, 8, 48, 48)),
      makeCloseBtn(rectRT(W, H, W - 48, 8, W - 8, 48)),
    ],
  );
}

function buildInstallerPanel(): Slot {
  const W = 800;
  const H = 800;

  // Full-canvas background — named "Background" so the overlap rule ignores it.
  const installerBg = rgb(0.04, 0.06, 0.08);
  const background = buildBackgroundTrio(installerBg);

  // Top-left help icon.
  const icon = makeHelpBtn(rectRT(W, H, 24, 24, 84, 84));

  // Title pill, centered between the icon and the close button.
  // Caption on a child slot (one Graphic per slot) so the opaque pill doesn't
  // occlude the title text in-game. Chip Image → accent, child Label text → body.
  const title = slot("Title", [
    rectRT(W, H, 100, 24, W - 100, 84),
    c("Image", { tint: rgb(0.07, 0.09, 0.11), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ], [
    slot("Label", [
      fillRT(),
      c("Text", {
        content: "Installer Title",
        size: 24,
        color: rgb(0.95, 0.95, 0.95),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]),
  ]);

  // Close button — top-right.
  const close = makeCloseBtn(rectRT(W, H, W - 84, 24, W - 24, 84));

  // "Header" label pill — sits above the image area, narrower than the panel.
  const headerLabelW = 320;
  const headerLabelLeft = (W - headerLabelW) / 2;
  const headerLabel = slot("Header Label", [
    rectRT(W, H, headerLabelLeft, 130, headerLabelLeft + headerLabelW, 170),
    c("Image", { tint: rgb(0.07, 0.09, 0.11), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ], [
    // Label on a child slot (one Graphic per slot) so the pill doesn't occlude
    // the text in-game. Reads as a section pill: Image → control surface, text → body.
    slot("Label", [
      fillRT(),
      c("Text", {
        content: "Header",
        size: 18,
        color: rgb(0.95, 0.95, 0.95),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]),
  ]);

  // Single centered Image Placeholder — the primary drop target.
  const imgSize = 360;
  const imgLeft = (W - imgSize) / 2;
  const imgTop = 190;
  const imagePlaceholder = slot("Image", [
    rectRT(W, H, imgLeft, imgTop, imgLeft + imgSize, imgTop + imgSize),
    c("Image", { tint: rgb(1, 1, 1, 1), preserveAspect: true, spriteUrl: "", useImagePlaceholder: true }),
  ]);

  // "Miscellaneous Notes" label pill — sits below the image area.
  const notesW = 600;
  const notesLeft = (W - notesW) / 2;
  const notesTop = imgTop + imgSize + 30;
  const notesLabel = slot("Miscellaneous Notes", [
    rectRT(W, H, notesLeft, notesTop, notesLeft + notesW, notesTop + 44),
    c("Image", { tint: rgb(0.07, 0.09, 0.11), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ], [
    // Label on a child slot (one Graphic per slot) so the pill doesn't occlude
    // the text in-game.
    slot("Label", [
      fillRT(),
      c("Text", {
        content: "Miscellaneous Notes",
        size: 18,
        color: rgb(0.95, 0.95, 0.95),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]),
  ]);

  // Bottom action buttons.
  function actionButton(name: string, leftEdge: number, rightEdge: number, label: string) {
    const lbl = slot("Label", [
      fillRT(),
      c("Text", {
        content: label,
        size: 20,
        color: rgb(0.95, 0.95, 0.95),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]);
    return slot(
      name,
      [
        rectRT(W, H, leftEdge, H - 100, rightEdge, H - 30),
        c("Image", {
          tint: rgb(0.12, 0.16, 0.2),
          preserveAspect: false,
          spriteUrl: "",
          cornerRadius: 100,
        }),
        c("Button", {
          normalColor: rgb(0.12, 0.16, 0.2),
          highlightColor: rgb(0.2, 0.32, 0.48),
          pressColor: rgb(0.08, 0.12, 0.16),
          disabledColor: rgb(0.4, 0.4, 0.4),
          hoverVibrate: false,
        }),
      ],
      [lbl],
    );
  }
  const installBtn = actionButton("Install", 40, W / 2 - 16, "Install");
  const uninstallBtn = actionButton("Uninstall", W / 2 + 16, W - 40, "Uninstall");

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.051, 0.051, 0.051),
        rounded: true,
      }),
      fillRT(),
    ],
    [
      background,
      icon,
      title,
      close,
      headerLabel,
      imagePlaceholder,
      notesLabel,
      installBtn,
      uninstallBtn,
    ],
  );
}

function buildLabeledButtonPanel(): Slot {
  const W = 400;
  // Button sits below the top-corner help/close row on the snap 12px rhythm, and
  // H clears it with the standard 24px margin, so the first grab is a no-op.
  const H = 140;
  const panelBg = rgb(0.051, 0.051, 0.051);
  const background = buildBackgroundTrio(panelBg);
  const label = slot("Label", [
    fillRT(),
    c("Text", {
      content: "Click me",
      size: 18,
      color: rgb(1, 1, 1),
      horizontalAlign: "Center",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);
  const btn = slot(
    "Button A",
    [
      rectRT(W, H, 40, 56, W - 40, 116),
      c("Image", { tint: rgb(0.24, 0.49, 0.78), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", {
        normalColor: rgb(0.24, 0.49, 0.78),
        highlightColor: rgb(0.32, 0.6, 0.9),
        pressColor: rgb(0.16, 0.36, 0.6),
        disabledColor: rgb(0.5, 0.5, 0.5),
        hoverVibrate: false,
      }),
    ],
    [label],
  );
  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.051, 0.051, 0.051),
        rounded: true,
      }),
      fillRT(),
    ],
    [
      background,
      btn,
      makeHelpBtn(rectRT(W, H, 8, 8, 44, 44)),
      makeCloseBtn(rectRT(W, H, W - 44, 8, W - 8, 44)),
    ],
  );
}

// ── VTuber ID Cards ──────────────────────────────────────────────────────────
// Three identification-card style presets, all in the UIX Studio brand-blue
// palette. They share a common visual language (rounded card, large avatar
// image placeholder, labelled value rows) but differ in density and shape:
//   - Compact: portrait 600×400, six common fields on the right
//   - Detailed: landscape 1000×700, multi-section info packed inside
//   - Student: small horizontal 800×500, coloured header stripe + 3 fields
// Values are pure Text placeholders ("Hi I'm ..."), so the user just edits
// the strings in the Inspector to personalise the card. No interactive
// components — these are static layouts.

const ID_CARD_BRAND      = { r: 0.24, g: 0.49, b: 0.78, a: 1 };
const ID_CARD_BRAND_SOFT = { r: 0.30, g: 0.54, b: 0.82, a: 1 };
const ID_CARD_PANEL      = { r: 0.96, g: 0.97, b: 0.99, a: 1 };
const ID_CARD_AVATAR_BG  = { r: 0.86, g: 0.91, b: 0.98, a: 1 };
const ID_CARD_FIELD_BG   = { r: 1, g: 1, b: 1, a: 1 };
const ID_CARD_TEXT_DARK  = { r: 0.11, g: 0.13, b: 0.17, a: 1 };
const ID_CARD_TEXT_MUTED = { r: 0.45, g: 0.48, b: 0.54, a: 1 };

function buildVTuberIDCompact(): Slot {
  const W = 600;
  const H = 400;

  const background = buildBackgroundTrio(ID_CARD_BRAND);

  // Card body — rounded white panel inset from canvas edges.
  const cardInset = 20;
  const card = slot("Card", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: cardInset, y: cardInset }, offsetMax: { x: -cardInset, y: -cardInset },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_PANEL, preserveAspect: false, spriteUrl: "", cornerRadius: 10 }),
  ]);

  // Avatar — left third, large rounded square image placeholder.
  const avatar = slot("Avatar", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0, y: 1 },
      offsetMin: { x: 32, y: 32 }, offsetMax: { x: 192, y: -32 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_AVATAR_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ]);

  // Title strip — small brand-tinted rounded chip at top-right. The caption
  // MUST sit on a child slot, not co-located with the Image: Resonite UIX renders
  // one Graphic per slot, so an Image + Text on the same slot makes the opaque
  // pill quad occlude the glyphs (the title rendered blank in-game). The chip
  // Image rides the theme accent (Title slot + Image); the child Label text rides
  // body color.
  const title = slot("Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 212, y: -64 }, offsetMax: { x: -32, y: -32 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ], [
    slot("Label", [
      fillRT(),
      c("Text", {
        content: "VTuber ID Card",
        size: 18, color: rgb(1, 1, 1),
        horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
      }),
    ]),
  ]);

  // Helper — a single "Label: Value" row. y is the offset from the card's
  // TOP (so the rows stack downward naturally).
  function fieldRow(label: string, value: string, y: number): Slot {
    const labelSlot = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: 90, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: label, size: 13, color: ID_CARD_BRAND,
        horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false,
      }),
    ]);
    const valueSlot = slot("Value", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 96, y: 0 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: value, size: 13, color: ID_CARD_TEXT_DARK,
        horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false,
      }),
    ]);
    return slot(`Row ${label.trim()}`, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 212, y: -(y + 28) }, offsetMax: { x: -32, y: -y },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ], [labelSlot, valueSlot]);
  }

  const rows = [
    fieldRow("Name",     "Your name here",      88),
    fieldRow("Birthday", "MM / DD",            124),
    fieldRow("Gender",   "—",                   160),
    fieldRow("Language", "English",            196),
    fieldRow("Content",  "Streaming / vlogs",  232),
    fieldRow("Oshi mark","♡",                  268),
  ];

  void ID_CARD_BRAND_SOFT;
  void ID_CARD_TEXT_MUTED;
  void ID_CARD_FIELD_BG;
  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W, sizeY: H, pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: ID_CARD_BRAND, rounded: true,
      }),
      fillRT(),
    ],
    [background, card, avatar, title, ...rows],
  );
}

function buildVTuberIDDetailed(): Slot {
  const W = 1000;
  const H = 700;

  const background = buildBackgroundTrio(ID_CARD_BRAND);

  const card = slot("Card", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 24, y: 24 }, offsetMax: { x: -24, y: -24 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_PANEL, preserveAspect: false, spriteUrl: "", cornerRadius: 10 }),
  ]);

  // Big avatar in the top-left corner of the card.
  const avatar = slot("Avatar", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0, y: 1 },
      offsetMin: { x: 48, y: -344 }, offsetMax: { x: 296, y: -56 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_AVATAR_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ]);

  // Title pill across the top-right area. Caption on a child slot (one Graphic
  // per slot — see compact card): the chip Image rides the theme accent, the
  // child Label text rides body color, and both actually render in-game.
  const title = slot("Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 320, y: -120 }, offsetMax: { x: -48, y: -56 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ], [
    slot("Label", [
      fillRT(),
      c("Text", {
        content: "VTUBER ID CARD",
        size: 28, color: rgb(1, 1, 1),
        horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
      }),
    ]),
  ]);

  // One labelled section: a small brand-blue heading + a block of body text
  // below it. `(left, right, top, bot)` is the section's rect in canvas
  // pixels (top-anchored Y-down convention via rectRT).
  function section(name: string, heading: string, body: string,
                   left: number, top: number, right: number, bot: number): Slot {
    const headingSlot = slot("Heading", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: -28 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: heading, size: 16, color: ID_CARD_BRAND,
        horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false,
      }),
    ]);
    const bodySlot = slot("Body", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: -32 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: body, size: 13, color: ID_CARD_TEXT_DARK,
        horizontalAlign: "Left", verticalAlign: "Top", autoSize: false,
      }),
    ]);
    return slot(name, [
      rectRT(W, H, left, top, right, bot),
    ], [headingSlot, bodySlot]);
  }

  const aboutMe = section(
    "About Me", "ABOUT ME",
    "Hi I'm ...\nYou can call me ...\nMy birthday is ...",
    344, 152, 656, 296,
  );
  const myStream = section(
    "I Stream", "I STREAM",
    "• Art\n• Games\n• Just chatting\n• Other ...",
    48, 376, 296, 552,
  );
  const language = section(
    "Language", "LANGUAGE",
    "English / ...",
    48, 568, 296, 660,
  );
  const myMotto = section(
    "My Motto", "MY FAVORITE MOTTO",
    "Stay curious, stream often.",
    344, 472, 656, 588,
  );
  const mySocialMedia = section(
    "Social Media", "MY SOCIAL MEDIA",
    "Twitch — @handle\nInstagram — @handle\nTiktok — @handle\nTwitter — @handle",
    344, 312, 656, 460,
  );
  const myFavorites = section(
    "Favorites", "MY FAVORITES",
    "Food — ...\nDrink — ...\nColor — ...\nAnimal — ...\nSeason — ...\nGame — ...",
    672, 312, 952, 568,
  );
  const myDislikes = section(
    "Dislikes", "I DISLIKE",
    "...\n...\n...",
    672, 152, 952, 296,
  );

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W, sizeY: H, pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: ID_CARD_BRAND, rounded: true,
      }),
      fillRT(),
    ],
    [background, card, avatar, title, aboutMe, mySocialMedia, myMotto, myStream, language, myDislikes, myFavorites],
  );
}

function buildStudentIDCard(): Slot {
  const W = 800;
  const H = 500;

  const background = buildBackgroundTrio(ID_CARD_PANEL);

  // Brand stripe across the top — colored header with logo + title.
  // Brand-coloured header bar. Structural backdrop: the logo / title / subtitle
  // sit ON it as siblings, so it's an intentional solid fill (not an "empty"
  // image) and shouldn't read as overlapping the content layered over it.
  const headerStripe = slot("Header Stripe", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: -88 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_BRAND, preserveAspect: false, spriteUrl: "" }),
  ]);
  headerStripe.structural = true;
  const headerLogo = slot("Logo Mark", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0, y: 1 },
      offsetMin: { x: 36, y: -68 }, offsetMax: { x: 84, y: -20 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", {
      tint: rgb(1, 1, 1), preserveAspect: true, spriteUrl: "",
      useLogoSprite: true,
    }),
  ]);
  const headerTitle = slot("Header Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 104, y: -68 }, offsetMax: { x: -228, y: -20 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", {
      content: "Organization Name",
      size: 18, color: rgb(1, 1, 1),
      horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false,
    }),
  ]);
  const headerSubtitle = slot("Header Subtitle", [
    c("RectTransform", {
      anchorMin: { x: 1, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: -224, y: -68 }, offsetMax: { x: -36, y: -20 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: ID_CARD_BRAND_SOFT, preserveAspect: false, spriteUrl: "" }),
  ], [
    // Caption on a child slot (one Graphic per slot) so the chip doesn't occlude
    // the text in-game. Chip Image → accent, child Label text → body.
    slot("Label", [
      fillRT(),
      c("Text", {
        content: "STUDENT IDENTIFICATION CARD",
        size: 11, color: rgb(1, 1, 1),
        horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
      }),
    ]),
  ]);

  // Avatar on the right side.
  const avatar = slot("Avatar", [
    rectRT(W, H, W - 244, 132, W - 36, 380),
    c("Image", { tint: ID_CARD_AVATAR_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ]);

  // Field labels on the left side. Each row: small uppercase label above a
  // larger value line.
  function fieldStack(name: string, label: string, value: string, y: number): Slot {
    const labelSlot = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: -22 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: label, size: 12, color: ID_CARD_TEXT_MUTED,
        horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false,
      }),
    ]);
    const valueSlot = slot("Value", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: -26 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: value, size: 22, color: ID_CARD_TEXT_DARK,
        horizontalAlign: "Left", verticalAlign: "Top", autoSize: false,
      }),
    ]);
    return slot(name, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0, y: 1 },
        offsetMin: { x: 36, y: -(y + 56) }, offsetMax: { x: 480, y: -y },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ], [labelSlot, valueSlot]);
  }

  const departmentField = fieldStack("Department", "Department", "Department Name", 132);
  const nameField       = fieldStack("Name",       "Name",       "Your Name Here",            212);
  const bornField       = fieldStack("Born",       "Born",       "Month Day",                 292);
  const gradeField      = fieldStack("Grade",      "Grade",      "1st",                       372);

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W, sizeY: H, pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: ID_CARD_PANEL, rounded: true,
      }),
      fillRT(),
    ],
    [
      background, headerStripe, headerLogo, headerTitle, headerSubtitle,
      avatar,
      departmentField, nameField, bornField, gradeField,
    ],
  );
}

// iOS-17-style numeric keypad: top display showing typed digits, 3×4 button
// grid (1-9, blank, 0, ⌫), plus Enter and Clear action buttons below.
// Each digit button writes its character into the display's Text.Content
// field via the KeypadKey marker (the exporter injects a
// ButtonValueSet<string>). Backspace and Clear write "" — single-press
// "type" behaviour with real append needs ProtoFlux in Resonite (V1
// limitation, documented in the preset description).
function buildKeypadPanel(): Slot {
  // Canvas shortened (was 800) and buttons taller (was 60) so the grid
  // fills the column without that bottom dead-space, while still keeping
  // a non-square aspect that reads as a phone-style keypad.
  const W = 600;
  const H = 720;

  // Display: dark rounded rect across the top, showing the currently-typed
  // value. The KeypadDisplay marker tells the exporter "this is the field
  // the keypad buttons write into". Centered horizontally — the on-screen
  // digit reads cleanly regardless of length.
  const displayLabel = slot("Label", [
    fillRT(),
    c("Text", {
      content: "0",
      size: 48,
      color: rgb(0.95, 0.95, 0.97),
      horizontalAlign: "Center",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);
  const display = slot("Display", [
    rectRT(W, H, 40, 40, W - 40, 140),
    c("Image", { tint: rgb(0.07, 0.07, 0.08), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("KeypadDisplay", {}),
  ], [displayLabel]);

  // Grid geometry — 3 columns × 4 rows, sized to span the canvas with the
  // same 40 px side margin as the display.
  const gridLeft = 40;
  const gridTop = 170;
  const cols = 3;
  const gap = 10;
  const btnW = (W - 2 * gridLeft - (cols - 1) * gap) / cols;
  const btnH = 85;

  function btnRect(col: number, row: number): UixComponent {
    const left = gridLeft + col * (btnW + gap);
    const top = gridTop + row * (btnH + gap);
    return rectRT(W, H, left, top, left + btnW, top + btnH);
  }

  // Build one digit button: rounded white-on-dark tile with the large
  // numeral on top and small uppercase letters beneath. Used for 1-9 and 0.
  function digitButton(digit: string, letters: string, col: number, row: number): Slot {
    const digitSlot = slot("Digit", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 8 }, offsetMax: { x: 0, y: -4 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: digit,
        size: 28,
        color: rgb(0.95, 0.95, 0.97),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]);
    const lettersSlot = slot("Letters", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 0 },
        offsetMin: { x: 0, y: 8 }, offsetMax: { x: 0, y: 22 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: letters,
        size: 10,
        color: rgb(0.75, 0.75, 0.80),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]);
    return slot(
      `Key ${digit}`,
      [
        btnRect(col, row),
        c("Image", { tint: rgb(0.20, 0.20, 0.22), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
        c("Button", {
          normalColor:    rgb(0.20, 0.20, 0.22),
          highlightColor: rgb(0.28, 0.28, 0.31),
          pressColor:     rgb(0.14, 0.14, 0.16),
          disabledColor:  rgb(0.30, 0.30, 0.30),
          hoverVibrate: false,
        }),
        c("KeypadKey", { value: digit }),
      ],
      letters
        ? [digitSlot, lettersSlot]
        : [digitSlot],
    );
  }

  // Backspace button — same shape, but its Image is the bundled backspace
  // icon (no number / letters) and KeypadKey writes "" so the display is
  // cleared on press.
  function backspaceButton(col: number, row: number): Slot {
    const iconSlot = slot("Icon", [
      c("RectTransform", {
        anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
        offsetMin: { x: -16, y: -12 }, offsetMax: { x: 16, y: 12 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", {
        tint: rgb(0.95, 0.95, 0.97),
        preserveAspect: true,
        spriteUrl: "",
        useBackspaceIcon: true,
      }),
    ]);
    return slot(
      "Key Backspace",
      [
        btnRect(col, row),
        c("Image", { tint: rgb(0.20, 0.20, 0.22), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
        c("Button", {
          normalColor:    rgb(0.20, 0.20, 0.22),
          highlightColor: rgb(0.28, 0.28, 0.31),
          pressColor:     rgb(0.14, 0.14, 0.16),
          disabledColor:  rgb(0.30, 0.30, 0.30),
          hoverVibrate: false,
        }),
        c("KeypadKey", { value: "" }),
      ],
      [iconSlot],
    );
  }

  // Bottom action buttons (Enter / Clear). Enter has no KeypadKey marker —
  // it's a placeholder the user can wire to whatever submission action they
  // want in Resonite. Clear has a KeypadKey with value="" to blank the
  // display.
  function actionButton(name: string, label: string, col: number, isClear: boolean): Slot {
    const labelSlot = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", {
        content: label,
        size: 20,
        color: rgb(1, 1, 1),
        horizontalAlign: "Center",
        verticalAlign: "Middle",
        autoSize: false,
      }),
    ]);
    const accent = isClear
      ? { r: 0.62, g: 0.20, b: 0.20, a: 1 }   // Clear: red-ish
      : { r: 0.20, g: 0.45, b: 0.78, a: 1 };  // Enter: blue
    const accentHi = isClear
      ? { r: 0.78, g: 0.30, b: 0.30, a: 1 }
      : { r: 0.30, g: 0.58, b: 0.92, a: 1 };
    const accentLo = isClear
      ? { r: 0.42, g: 0.12, b: 0.12, a: 1 }
      : { r: 0.14, g: 0.32, b: 0.58, a: 1 };
    const actionLeft  = gridLeft + col * ((W - 2 * gridLeft - gap) / 2 + gap);
    const actionRight = actionLeft + (W - 2 * gridLeft - gap) / 2;
    // Sit the action row 40 px below the grid's bottom edge so it reads
    // as a separate "submit" zone, with ~50 px of clearance to the canvas
    // bottom matching the side margins.
    const actionTop = H - 130;
    const actionBot = H - 50;
    const components: UixComponent[] = [
      rectRT(W, H, actionLeft, actionTop, actionRight, actionBot),
      c("Image", { tint: accent, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", {
        normalColor: accent,
        highlightColor: accentHi,
        pressColor: accentLo,
        disabledColor: rgb(0.30, 0.30, 0.30),
        hoverVibrate: false,
      }),
    ];
    // Clear writes empty string into the display; Enter is wired by the
    // user in Resonite (no marker emitted).
    if (isClear) components.push(c("KeypadKey", { value: "" }));
    return slot(name, components, [labelSlot]);
  }

  // Full-canvas background — dark plate matching the iOS keypad look.
  const keypadBg = rgb(0.04, 0.04, 0.05);
  const background = buildBackgroundTrio(keypadBg);

  // Grid contents — 3 cols × 4 rows. Row 4: period, 0, ⌫. Period uses the
  // same digit-button shape with `value="."` so pressing it writes a dot
  // to the display.
  const keys: Slot[] = [
    digitButton("1", "",     0, 0),
    digitButton("2", "ABC",  1, 0),
    digitButton("3", "DEF",  2, 0),
    digitButton("4", "GHI",  0, 1),
    digitButton("5", "JKL",  1, 1),
    digitButton("6", "MNO",  2, 1),
    digitButton("7", "PQRS", 0, 2),
    digitButton("8", "TUV",  1, 2),
    digitButton("9", "WXYZ", 2, 2),
    digitButton(".", "",     0, 3),
    digitButton("0", "+",    1, 3),
    backspaceButton(2, 3),
  ];

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.04, 0.04, 0.05),
        rounded: true,
      }),
      fillRT(),
    ],
    [
      background,
      makeHelpBtn(rectRT(W, H, 8, 8, 48, 48)),
      makeCloseBtn(rectRT(W, H, W - 48, 8, W - 8, 48)),
      display,
      ...keys,
      actionButton("Enter", "Enter", 0, false),
      actionButton("Clear", "Clear", 1, true),
    ],
  );
}

// Basic centered-card login form. Mirrors the "green" reference layout
// (title bar + two icon-prefixed fields + forgot link + login button +
// footer) but uses the UIX Studio brand blue rgb(0.24, 0.49, 0.78) for
// the title, button, and link accents. Card body stays light so the
// blue accents read cleanly against the dark canvas background.
function buildBasicLoginPanel(): Slot {
  const W = 800;
  const H = 600;
  const BRAND = { r: 0.24, g: 0.49, b: 0.78, a: 1 };
  const BRAND_HI = { r: 0.30, g: 0.58, b: 0.92, a: 1 };
  const BRAND_LO = { r: 0.16, g: 0.34, b: 0.58, a: 1 };
  const CARD_BG = { r: 0.97, g: 0.97, b: 0.98, a: 1 };
  const FIELD_BG = { r: 1, g: 1, b: 1, a: 1 };
  const FIELD_BORDER = { r: 0.84, g: 0.85, b: 0.88, a: 1 };
  const PLACEHOLDER = { r: 0.65, g: 0.66, b: 0.70, a: 1 };
  const TEXT_DARK = { r: 0.10, g: 0.11, b: 0.13, a: 1 };
  const FOOTER_DARK = { r: 0.20, g: 0.22, b: 0.25, a: 1 };

  // Solid-blue full-canvas background — gives the card something to float on.
  const background = buildBackgroundTrio(BRAND);

  // Card geometry.
  const cardW = 480;
  const cardH = 480;
  const titleH = 110;
  const pad = 32; // inner padding inside the card body

  // Title bar — accent-coloured top of the card. The Image rides the theme
  // accent (slot named "Title Bar"); the caption sits on a child "Title" slot
  // (one Graphic per slot) so header-text theming colours it independently.
  const titleText = slot("Title", [
    fillRT(),
    c("Text", {
      content: "Login Form",
      size: 28,
      color: rgb(1, 1, 1),
      horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
    }),
  ]);
  const titleBar = slot("Title Bar", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: -titleH }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "" }),
  ], [titleText]);

  // Build one labelled icon-prefixed field row (icon box on left, TextField
  // filling the rest). `rowTopFromCardTop` is the row's distance from the
  // card body's top (the start of the white area, NOT the card itself).
  function fieldRow(
    name: string,
    placeholder: string,
    iconGlyph: string,
    rowTopFromCardTop: number,
  ): Slot {
    const rowH = 48;
    const iconW = 48;
    const fieldGap = 8;
    // Accent-coloured chip prefixing the input. Named "Field Icon" so it rides
    // the theme accent; the glyph sits on a child slot (kept white) so it reads
    // on the accent across themes.
    const iconGlyphSlot = slot("Glyph", [
      fillRT(),
      // White glyph on the accent chip — themeLock keeps it legible (white) as
      // the chip re-skins to the theme accent.
      c("Text", {
        content: iconGlyph,
        size: 20,
        color: rgb(1, 1, 1),
        horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
        themeLock: true,
      }),
    ]);
    const iconBox = slot("Field Icon", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: iconW, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "" }),
    ], [iconGlyphSlot]);
    // White input field with dark text — themeLock keeps it white/readable on
    // any theme (the login-card white surfaces are the documented exception).
    const input = slot("Input", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: iconW + fieldGap, y: 0 }, offsetMax: { x: 0, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: FIELD_BG, preserveAspect: false, spriteUrl: "", themeLock: true }),
      c("TextField", {
        placeholder,
        textContent: "",
        fontSize: 16,
        textColor: TEXT_DARK,
        placeholderColor: PLACEHOLDER,
        backgroundTint: FIELD_BG,
        themeLock: true,
      }),
    ]);
    return slot(name, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: pad, y: -(rowTopFromCardTop + rowH) }, offsetMax: { x: -pad, y: -rowTopFromCardTop },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ], [iconBox, input]);
  }

  // Each row's Y position is measured FROM THE TOP of the card body (i.e.
  // ignoring the title bar's height). Below: 24 px gap → email row,
  // 8 px gap → password row, 16 px gap → forgot link, etc. We anchor the
  // rows to the card's bottom of title bar (i.e. its top minus titleH).
  // For simplicity, position each child relative to the body slot's rect.
  const emailRow = fieldRow("Email Row", "Email or Phone", "@", 24);
  const passwordRow = fieldRow("Password Row", "Password", "*", 88);

  // "Forgot password?" — now a slim clickable pill (was non-clickable blue
  // text) anchored to the left below the password row.
  const forgotLink = makeLinkButton(
    "Forgot password?",
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0, y: 1 },
      offsetMin: { x: pad, y: -(152 + 28) }, offsetMax: { x: pad + 170, y: -152 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    BRAND, BRAND_HI, BRAND_LO,
  );

  // Login button — wide, blue, rounded.
  const loginLabel = slot("Label", [
    fillRT(),
    c("Text", { content: "Login", size: 20, color: rgb(1, 1, 1), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);
  const loginButton = slot("Login Button", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: pad, y: -(206 + 56) }, offsetMax: { x: -pad, y: -206 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: BRAND, highlightColor: BRAND_HI, pressColor: BRAND_LO, disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
  ], [loginLabel]);

  // "Not a member? Signup now" footer — split across two Text slots so
  // "Signup now" can be the brand color while the rest stays dark.
  const footerLeft = slot("Footer Text", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0.5, y: 1 },
      offsetMin: { x: pad, y: -(294 + 22) }, offsetMax: { x: 12, y: -294 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", {
      content: "Not a member?",
      size: 14,
      color: FOOTER_DARK,
      horizontalAlign: "Right", verticalAlign: "Middle", autoSize: false,
      // On the white card — themeLock keeps it dark/readable on any theme.
      themeLock: true,
    }),
  ]);
  // "Signup now" — slim clickable pill on the right half of the footer row.
  const footerRight = makeLinkButton(
    "Sign Up",
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 1 }, anchorMax: { x: 0.5, y: 1 },
      offsetMin: { x: 14, y: -(292 + 26) }, offsetMax: { x: 114, y: -292 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    BRAND, BRAND_HI, BRAND_LO,
  );

  // Card body (the white area below the title bar). All field/link/button
  // rows above are positioned relative to the body's top edge.
  const cardBody = slot("Body", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: -titleH },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // White card body — themeLock keeps it white on any theme (login-card
    // exception); the dark on-card text is likewise locked above.
    c("Image", { tint: CARD_BG, preserveAspect: false, spriteUrl: "", themeLock: true }),
  ], [emailRow, passwordRow, forgotLink, loginButton, footerLeft, footerRight]);

  // Card wrapper — holds the title bar + body, both as direct children so
  // the title bar's hard top edge sits flush against the card's rounded
  // top corner (rounded affordance comes from the canvas-rounded sprite).
  const card = slot("Card", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
      offsetMin: { x: -cardW / 2, y: -cardH / 2 },
      offsetMax: { x:  cardW / 2, y:  cardH / 2 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // White card surface stays white on any theme — themeLock (the brand title
    // bar, login button, field-icon chips, and link buttons still re-skin).
    c("Image", { tint: CARD_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 10, themeLock: true }),
  ], [titleBar, cardBody]);

  void FIELD_BORDER; // border color reserved for future styling
  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: BRAND,
        rounded: true,
      }),
      fillRT(),
    ],
    [
      background, card,
      makeHelpBtn(rectRT(W, H, 12, 12, 52, 52)),
      makeCloseBtn(rectRT(W, H, W - 52, 12, W - 12, 52)),
    ],
  );
}

// Stylized two-panel login form: left panel = a full image placeholder the
// user swaps in their own art, right panel = the actual form (logo, header,
// subtitle, email/password TextFields, Remember Me checkbox + Recovery
// Password link, big Login button, Sign Up footer). No "Sign in with
// Google" button — explicitly excluded per the brief.
function buildStylizedLoginPanel(): Slot {
  const W = 1000;
  const H = 700;
  const BRAND = { r: 0.24, g: 0.49, b: 0.78, a: 1 };
  const BRAND_HI = { r: 0.30, g: 0.58, b: 0.92, a: 1 };
  const BRAND_LO = { r: 0.16, g: 0.34, b: 0.58, a: 1 };
  const CARD_BG = { r: 0.98, g: 0.98, b: 0.99, a: 1 };
  const FIELD_BG = { r: 0.96, g: 0.97, b: 0.98, a: 1 };
  const PLACEHOLDER = { r: 0.62, g: 0.65, b: 0.70, a: 1 };
  const TEXT_DARK = { r: 0.12, g: 0.13, b: 0.16, a: 1 };
  const SUBTITLE = { r: 0.50, g: 0.52, b: 0.56, a: 1 };

  // Full-canvas off-white outer background, so the inner card reads as a
  // raised surface on a soft page.
  const stylBg = { r: 0.93, g: 0.94, b: 0.96, a: 1 };
  const background = buildBackgroundTrio(stylBg);

  // Inner card spans most of the canvas with a small inset margin. Rounded.
  const cardInset = 40;
  const card = slot("Card", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: cardInset, y: cardInset }, offsetMax: { x: -cardInset, y: -cardInset },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: CARD_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 10 }),
  ]);

  // ── Left half: image placeholder ─────────────────────────────────────────
  // Spans the card's left half. User uploads their own art via the
  // Inspector's Custom Image option on this slot.
  const leftPanel = slot("Image Panel", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0.5, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // Square corners (cornerRadius 0): this is a full-bleed art panel meant to
    // hold an uploaded image, so a pill/rounded shape would crop it oddly. Marked
    // as an image placeholder so it shows the "drop image here" treatment until
    // the user supplies art (instead of reading as an empty brand-coloured rect).
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 0, useImagePlaceholder: true }),
  ]);

  // ── Right half: the form ─────────────────────────────────────────────────
  // Right-half rect. Everything else nests under here so layouts are local.
  // Form column padding so children read cleanly inside the right half.
  const formPad = 60;

  // Logo — small accent-coloured circle at the top, centered. The Image rides
  // the theme accent (slot named "Logo"); the letter sits on a child slot (kept
  // white) so it reads on the accent across themes.
  const logoGlyph = slot("Glyph", [
    fillRT(),
    // White letter on the accent logo badge — themeLock keeps it legible as the
    // badge re-skins to the theme accent.
    c("Text", { content: "U", size: 28, color: rgb(1, 1, 1), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false, themeLock: true }),
  ]);
  const logo = slot("Logo", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 1 }, anchorMax: { x: 0.5, y: 1 },
      offsetMin: { x: -28, y: -88 }, offsetMax: { x: 28, y: -32 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ], [logoGlyph]);

  const headerSlot = slot("Header", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: formPad, y: -148 }, offsetMax: { x: -formPad, y: -104 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // Header + subtitle sit on the white form card — themeLock keeps them
    // dark/readable on any theme (login-card exception).
    c("Text", { content: "Hello Again!", size: 32, color: TEXT_DARK, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false, themeLock: true }),
  ]);

  const subtitle = slot("Subtitle", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: formPad, y: -190 }, offsetMax: { x: -formPad, y: -154 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", {
      content: "Welcome back — sign in to your account",
      size: 14,
      color: SUBTITLE,
      horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
      themeLock: true,
    }),
  ]);

  function field(name: string, placeholder: string, yTopFromCardTop: number): Slot {
    return slot(name, [
      c("RectTransform", {
        anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: formPad, y: -(yTopFromCardTop + 48) },
        offsetMax: { x: -formPad, y: -yTopFromCardTop },
        pivot: { x: 0.5, y: 0.5 },
      }),
      // White input on the white card — themeLock keeps it white with dark text.
      c("Image", { tint: FIELD_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100, themeLock: true }),
      c("TextField", {
        placeholder,
        textContent: "",
        fontSize: 16,
        textColor: TEXT_DARK,
        placeholderColor: PLACEHOLDER,
        backgroundTint: FIELD_BG,
        themeLock: true,
      }),
    ]);
  }
  const emailField = field("Email Field", "Email", 220);
  const passwordField = field("Password Field", "Password", 284);

  // Remember-me checkbox cluster on the left, Recovery Password link on
  // the right, both inline on the same Y row.
  const rememberCheckIcon = slot("Check Icon", [
    fillRT(),
    c("Image", { tint: rgb(1, 1, 1), preserveAspect: true, spriteUrl: "", useCheckIcon: true }),
    c("Button", { normalColor: rgb(1, 1, 1), highlightColor: rgb(1, 1, 1), pressColor: rgb(0.8, 0.8, 0.8), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
    c("Checkbox", { initialState: false }),
  ]);
  const rememberBox = slot("Box", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
      offsetMin: { x: 0, y: -10 }, offsetMax: { x: 20, y: 10 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "" }),
  ], [rememberCheckIcon]);
  const rememberLabel = slot("Label", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 28, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // On the white card — themeLock keeps it dark/readable on any theme.
    c("Text", { content: "Remember me", size: 14, color: TEXT_DARK, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false, themeLock: true }),
  ]);
  const rememberRow = slot("Remember Me", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 0.5, y: 1 },
      offsetMin: { x: formPad, y: -(348 + 22) }, offsetMax: { x: 0, y: -348 },
      pivot: { x: 0.5, y: 0.5 },
    }),
  ], [rememberBox, rememberLabel]);

  // "Recovery Password" — slim clickable pill (was non-clickable blue text),
  // right-aligned opposite the Remember-me row.
  const recoveryLink = makeLinkButton(
    "Recovery Password",
    c("RectTransform", {
      anchorMin: { x: 1, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: -formPad - 168, y: -(346 + 26) }, offsetMax: { x: -formPad, y: -346 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    BRAND, BRAND_HI, BRAND_LO,
  );

  // Big Login button.
  const loginLabel = slot("Label", [
    fillRT(),
    c("Text", { content: "Login", size: 18, color: rgb(1, 1, 1), horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);
  const loginButton = slot("Login Button", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: formPad, y: -(400 + 52) }, offsetMax: { x: -formPad, y: -400 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    c("Button", { normalColor: BRAND, highlightColor: BRAND_HI, pressColor: BRAND_LO, disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
  ], [loginLabel]);

  // "Don't have an account yet? Sign Up" footer pair.
  const footerLeft = slot("Footer Text", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0.5, y: 0 },
      offsetMin: { x: formPad, y: 40 }, offsetMax: { x: 0, y: 62 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    // On the white card — themeLock keeps it dark/readable on any theme.
    c("Text", { content: "Don't have an account yet?", size: 14, color: TEXT_DARK, horizontalAlign: "Right", verticalAlign: "Middle", autoSize: false, themeLock: true }),
  ]);
  // "Sign Up" — slim clickable pill on the right of the footer row.
  const footerRight = makeLinkButton(
    "Sign Up",
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0 }, anchorMax: { x: 0.5, y: 0 },
      offsetMin: { x: 8, y: 38 }, offsetMax: { x: 108, y: 64 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    BRAND, BRAND_HI, BRAND_LO,
  );

  // The white right half. `matchPanelCorners` rounds its outer (right) corners
  // to the panel's own radius so the front-right matches the rounded left, and
  // — because it no longer pokes past the rounded Back Cover — the back-right
  // rounds too. matchPanelCorners rounds all four corners though, so a square
  // white "Seam Filler" plugs the two LEFT (centre-seam) corners back to a
  // straight edge against the brown image panel. Same colour → invisible join.
  const seamFiller = slot("Seam Filler", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 44, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: CARD_BG, preserveAspect: false, spriteUrl: "" }),
  ]);
  seamFiller.structural = true; // panel chrome — exempt from overlap / empty-image warnings
  const rightPanel = slot("Form Panel", [
    c("RectTransform", {
      anchorMin: { x: 0.5, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 0, y: 0 }, offsetMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Image", { tint: CARD_BG, preserveAspect: false, spriteUrl: "", matchPanelCorners: true }),
  ], [seamFiller, logo, headerSlot, subtitle, emailField, passwordField, rememberRow, recoveryLink, loginButton, footerLeft, footerRight]);

  void card; // card slot replaced by left + right halves below; kept declaration for clarity
  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: { r: 0.93, g: 0.94, b: 0.96, a: 1 },
        rounded: true,
      }),
      fillRT(),
    ],
    [
      background, leftPanel, rightPanel,
      makeHelpBtn(rectRT(W, H, 12, 12, 52, 52)),
      makeCloseBtn(rectRT(W, H, W - 52, 12, W - 12, 52)),
    ],
  );
}

function buildProfileCard(): Slot {
  const W = 800;
  const H = 600;
  const bannerH = 360;
  const profileBg = rgb(0.06, 0.06, 0.08);
  const profileBackground = buildBackgroundTrio(profileBg);

  // Banner — top portion. Image placeholder; user swaps in their own banner
  // via the Inspector's Custom Image picker. Marked structural: it's a backdrop
  // region the avatar/name sit ON, so it shouldn't count as "overlapping" them
  // and should stretch with the canvas on resize.
  const banner = slot("Banner", [
    rectRT(W, H, 0, 0, W, bannerH),
    c("Image", {
      tint: rgb(0.15, 0.16, 0.20),
      preserveAspect: false,
      spriteUrl: "",
      cornerRadius: 10,
    }),
  ]);
  banner.structural = true;

  // Body — dark band below the banner that hosts the avatar / name / socials.
  // Structural for the same reason as Banner (backdrop region, not content).
  const body = slot("Body", [
    rectRT(W, H, 0, bannerH, W, H),
    c("Image", {
      tint: rgb(0.09, 0.10, 0.12),
      preserveAspect: false,
      spriteUrl: "",
      cornerRadius: 10,
    }),
  ]);
  body.structural = true;

  // Round avatar — cornerRadius 100 on a square rect = circle in editor
  // preview and in Resonite. Sits straddling the banner / body seam, like
  // the reference card.
  const avatarSize = 132;
  const avatarLeft = 32;
  const avatarTop = bannerH - avatarSize / 2; // overlap by half-height
  const avatar = slot("Avatar", [
    rectRT(W, H, avatarLeft, avatarTop, avatarLeft + avatarSize, avatarTop + avatarSize),
    c("Image", {
      tint: rgb(0.3, 0.32, 0.36),
      preserveAspect: true,
      spriteUrl: "",
      cornerRadius: 100,
    }),
  ]);

  // Name block sits to the right of the avatar, in the body band.
  const nameLeft = avatarLeft + avatarSize + 18;
  const displayName = slot("Display Name", [
    rectRT(W, H, nameLeft, bannerH + 18, 500, bannerH + 70),
    c("Text", {
      content: "Display Name",
      size: 30,
      color: rgb(0.96, 0.96, 0.97),
      horizontalAlign: "Left",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);
  const username = slot("Username", [
    rectRT(W, H, nameLeft, bannerH + 72, 500, bannerH + 108),
    c("Text", {
      content: "@username",
      size: 18,
      color: rgb(0.6, 0.72, 0.82),
      horizontalAlign: "Left",
      verticalAlign: "Middle",
      autoSize: false,
    }),
  ]);

  // Status text field — editable, sits above the socials row on the right.
  const status = slot("Status", [
    rectRT(W, H, 504, bannerH + 20, W - 24, bannerH + 60),
    c("TextField", {
      placeholder: "What's on your mind?",
      textContent: "",
      fontSize: 14,
      textColor: rgb(0.92, 0.92, 0.92),
      placeholderColor: rgb(0.5, 0.55, 0.6),
      backgroundTint: rgb(0.13, 0.14, 0.16),
    }),
  ]);

  // Socials row — four round buttons. Distinct tints so the user can tell
  // them apart at a glance; relabel/recolor as needed in the Inspector.
  function socialBtn(name: string, color: { r: number; g: number; b: number; a: number }) {
    return slot(name, [
      fillRT(),
      c("Image", {
        tint: color,
        preserveAspect: false,
        spriteUrl: "",
        cornerRadius: 100,
      }),
      c("Button", {
        normalColor: color,
        highlightColor: rgb(
          Math.min(1, color.r + 0.1),
          Math.min(1, color.g + 0.1),
          Math.min(1, color.b + 0.1),
        ),
        pressColor: rgb(color.r * 0.7, color.g * 0.7, color.b * 0.7),
        disabledColor: rgb(0.3, 0.3, 0.3),
        hoverVibrate: false,
      }),
      c("LayoutElement", {
        minWidth: 40,
        minHeight: 40,
        preferredWidth: 40,
        preferredHeight: 40,
        flexibleWidth: -1,
        flexibleHeight: -1,
        orderOffset: 0,
      }),
    ]);
  }
  const socials = slot(
    "Socials",
    [
      rectRT(W, H, 504, bannerH + 72, W - 24, bannerH + 116),
      c("HorizontalLayout", {
        spacing: 10,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        horizontalAlign: "Right",
        verticalAlign: "Middle",
        forceExpandWidth: false,
        forceExpandHeight: false,
      }),
    ],
    [
      socialBtn("Social 1", rgb(0.4, 0.5, 0.85)),
      socialBtn("Social 2", rgb(0.85, 0.35, 0.5)),
      socialBtn("Social 3", rgb(0.4, 0.75, 0.55)),
      socialBtn("Social 4", rgb(0.95, 0.7, 0.3)),
    ],
  );

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W,
        sizeY: H,
        pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.06, 0.06, 0.08),
        rounded: true,
      }),
      fillRT(),
    ],
    // Order matters for stacking: background first for back cover, then banner +
    // body, then avatar on top so it straddles the seam, then text/socials.
    [
      profileBackground, banner, body, avatar, displayName, username, status, socials,
    ],
  );
}

// ── Checklist Form ───────────────────────────────────────────────────────────
// Two-section checklist: 5 static checkboxes on top, 10 scrollable checkboxes
// below (content > viewport so scrolling is required), and a free-text Notes
// field at the bottom. Good starting point for task lists, evaluation sheets,
// and sign-off forms.
function buildChecklistForm(): Slot {
  const W = 800;
  // Rows are laid out on a uniform 12px gap rhythm (matching snap.rowGap) so the
  // first grab / auto-arrange is a no-op instead of drifting the stack down.
  // H is sized so the bottom element clears with the standard 24px margin.
  const H = 928;

  const BG      = rgb(0.051, 0.051, 0.051);
  const HDR_BG  = rgb(0.078, 0.078, 0.082);
  const PILL_BG = rgb(0.11,  0.13,  0.17);
  const CHK_BG  = rgb(0.13,  0.15,  0.15);
  const TEXT    = rgb(0.90,  0.90,  0.90);
  const MUTED   = rgb(0.72,  0.74,  0.78);

  const background = buildBackgroundTrio(BG);

  const closeBtn = makeCloseBtn(c("RectTransform", {
    anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
    offsetMin: { x: -44, y: -20 }, offsetMax: { x: -8, y: 20 },
    pivot: { x: 0.5, y: 0.5 },
  }));
  const helpBtn = makeHelpBtn(c("RectTransform", {
    anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
    offsetMin: { x: 8, y: -20 }, offsetMax: { x: 44, y: 20 },
    pivot: { x: 0.5, y: 0.5 },
  }));
  const titleText = slot("Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 52, y: 0 }, offsetMax: { x: -52, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Checklist Form", size: 18, color: TEXT, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const header = slot("Header", [
    rectRT(W, H, 0, 0, W, 56),
    c("Image", { tint: HDR_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 30 }),
  ], [helpBtn, titleText, closeBtn]);

  function sectionPill(name: string, label: string, top: number): Slot {
    // Text must live on a CHILD slot, not on the pill slot itself: Resonite UIX
    // renders one Graphic per slot, so an Image + Text on the same slot makes the
    // opaque pill quad occlude the glyphs (label renders blank). The child "Label"
    // name also keeps it on the theme engine's body-text recolor path.
    return slot(name, [
      rectRT(W, H, 16, top, W - 16, top + 28),
      c("Image", { tint: PILL_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    ], [
      slot("Label", [
        fillRT(),
        c("Text", { content: label, size: 12, color: MUTED, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);
  }

  function checkRow(label: string, top: number, initialState: boolean): Slot {
    const checkIcon = slot("Check Icon", [
      fillRT(),
      c("Image", { tint: TEXT, preserveAspect: true, spriteUrl: "", useCheckIcon: true }),
      c("Button", { normalColor: TEXT, highlightColor: TEXT, pressColor: rgb(0.8, 0.8, 0.8), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
      c("Checkbox", { initialState }),
    ]);
    const box = slot("Box", [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: -28, y: -14 }, offsetMax: { x: 0, y: 14 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: CHK_BG, preserveAspect: false, spriteUrl: "" }),
    ], [checkIcon]);
    const lbl = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: -40, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: label, size: 14, color: TEXT, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    return slot(label, [rectRT(W, H, 16, top, W - 16, top + 36)], [box, lbl]);
  }

  function scrollCheckRow(label: string, initialState: boolean, orderIdx: number): Slot {
    const checkIcon = slot("Check Icon", [
      fillRT(),
      c("Image", { tint: TEXT, preserveAspect: true, spriteUrl: "", useCheckIcon: true }),
      c("Button", { normalColor: TEXT, highlightColor: TEXT, pressColor: rgb(0.8, 0.8, 0.8), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
      c("Checkbox", { initialState }),
    ]);
    const box = slot("Box", [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
        offsetMin: { x: -28, y: -14 }, offsetMax: { x: 0, y: 14 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: CHK_BG, preserveAspect: false, spriteUrl: "" }),
    ], [checkIcon]);
    const lbl = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: -40, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: label, size: 14, color: TEXT, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    return slot(label, [
      fillRT(),
      c("LayoutElement", {
        minWidth: -1, preferredWidth: -1, flexibleWidth: -1,
        minHeight: 36, preferredHeight: 36, flexibleHeight: -1,
        orderOffset: orderIdx,
      }),
    ], [box, lbl]);
  }

  const staticPill = sectionPill("Static Items Label",     "Static Items",     68);
  const c1 = checkRow("Review project scope",              108, true);
  const c2 = checkRow("Confirm stakeholder sign-off",      156, false);
  const c3 = checkRow("Validate deliverables",             204, false);
  const c4 = checkRow("Update documentation",              252, false);
  const c5 = checkRow("Archive completed files",           300, false);

  // 10 items in 296px viewport (content ~430px) — scrolling is required.
  const scrollPill = sectionPill("Scrollable Items Label", "Scrollable Items", 348);
  const scrollViewport = slot("Scroll Viewport", [
    fillRT(),
    c("ScrollArea", {
      direction: "Vertical",
      backgroundTint: rgb(0.10, 0.11, 0.14, 1),
      spacing: 6, padding: 8,
      showScrollbar: true,
      scrollbarTrackTint: rgb(0.15, 0.17, 0.21, 1),
      scrollbarThumbTint: rgb(0.55, 0.60, 0.68, 1),
    }),
  ], [
    scrollCheckRow("Run automated tests",            false,  0),
    scrollCheckRow("Peer code review completed",     false,  1),
    scrollCheckRow("Security scan passed",           false,  2),
    scrollCheckRow("Performance benchmarks met",     false,  3),
    scrollCheckRow("Accessibility audit done",       false,  4),
    scrollCheckRow("Localisation strings updated",   false,  5),
    scrollCheckRow("Release notes written",          false,  6),
    scrollCheckRow("Changelog version bumped",       false,  7),
    scrollCheckRow("Deploy to staging verified",     false,  8),
    scrollCheckRow("Notify team on completion",      false,  9),
  ]);
  const scrollSection = slot("Scrollable Items", [
    rectRT(W, H, 16, 388, W - 16, 684),
  ], [scrollViewport]);

  const notesPill  = sectionPill("Notes Label", "Notes", 696);
  const notesField = slot("Notes Input", [
    rectRT(W, H, 16, 736, W - 16, 904),
    c("Image", { tint: rgb(0.10, 0.11, 0.13), preserveAspect: false, spriteUrl: "", cornerRadius: 30 }),
    c("TextField", {
      placeholder: "Add notes here…",
      textContent: "",
      fontSize: 14,
      textColor: TEXT,
      placeholderColor: rgb(0.45, 0.45, 0.50),
      backgroundTint: rgb(0.10, 0.11, 0.13),
    }),
  ]);

  return slot("Canvas", [
    c("Canvas", { sizeX: W, sizeY: H, pixelScale: 0.0005, acceptPhysicalTouch: true, backgroundColor: BG, rounded: true }),
    fillRT(),
  ], [
    background, header,
    staticPill, c1, c2, c3, c4, c5,
    scrollPill, scrollSection,
    notesPill, notesField,
  ]);
}

// ── Rating Form ───────────────────────────────────────────────────────────────
// Two-section rating sheet: 5 static rating rows and 8 scrollable ones. Each
// row has NA / 1-5 radio buttons in a labeled column grid. Score readout slots
// sit below each section (static score, scrollable score, total) as Text
// placeholders — wire them to ProtoFlux in Resonite for live calculation.
function buildRatingForm(): Slot {
  const W = 800;
  // Uniform 12px gap rhythm (matching snap.rowGap) so the first grab /
  // auto-arrange doesn't drift the stack down; H sized to clear the bottom
  // score row with the standard 24px margin.
  const H = 864;

  const BG      = rgb(0.051, 0.051, 0.051);
  const HDR_BG  = rgb(0.078, 0.078, 0.082);
  const PILL_BG = rgb(0.11,  0.13,  0.17);
  const SCR_BG  = rgb(0.08,  0.10,  0.14);
  const TEXT    = rgb(0.90,  0.90,  0.90);
  const MUTED   = rgb(0.72,  0.74,  0.78);
  const ACCENT  = rgb(0.55,  0.72,  0.90);

  const background = buildBackgroundTrio(BG);

  const closeBtn = makeCloseBtn(c("RectTransform", {
    anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
    offsetMin: { x: -44, y: -20 }, offsetMax: { x: -8, y: 20 },
    pivot: { x: 0.5, y: 0.5 },
  }));
  const helpBtn = makeHelpBtn(c("RectTransform", {
    anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 },
    offsetMin: { x: 8, y: -20 }, offsetMax: { x: 44, y: 20 },
    pivot: { x: 0.5, y: 0.5 },
  }));
  const titleText = slot("Title", [
    c("RectTransform", {
      anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
      offsetMin: { x: 52, y: 0 }, offsetMax: { x: -52, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    }),
    c("Text", { content: "Rating Form", size: 18, color: TEXT, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const header = slot("Header", [
    rectRT(W, H, 0, 0, W, 56),
    c("Image", { tint: HDR_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 30 }),
  ], [helpBtn, titleText, closeBtn]);

  function sectionPill(name: string, label: string, top: number): Slot {
    // Text on a CHILD slot (see Checklist Form note): one Graphic per slot in
    // Resonite UIX, so a same-slot Image would occlude the label.
    return slot(name, [
      rectRT(W, H, 16, top, W - 16, top + 28),
      c("Image", { tint: PILL_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    ], [
      slot("Label", [
        fillRT(),
        c("Text", { content: label, size: 12, color: MUTED, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);
  }

  function scoreRow(label: string, top: number): Slot {
    return slot(label, [
      rectRT(W, H, 16, top, W - 16, top + 28),
      c("Image", { tint: SCR_BG, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
    ], [
      slot("Label", [
        fillRT(),
        c("Text", { content: label, size: 13, color: ACCENT, horizontalAlign: "Right", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);
  }

  // Column headers aligned over each radio column (option slots are 30px wide,
  // 4px gaps; positions from right edge: "5"→0, "4"→34, "3"→68, "2"→102,
  // "1"→136, "NA"→170).
  function colHeaderRow(top: number): Slot {
    function colLbl(text: string, rightPx: number): Slot {
      return slot(text, [
        c("RectTransform", {
          anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
          offsetMin: { x: -(rightPx + 30), y: 0 }, offsetMax: { x: -rightPx, y: 0 },
          pivot: { x: 0.5, y: 0.5 },
        }),
        c("Text", { content: text, size: 10, color: MUTED, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]);
    }
    return slot("Scale Labels", [
      rectRT(W, H, 16, top, W - 16, top + 20),
    ], [
      colLbl("NA", 170), colLbl("1", 136), colLbl("2", 102),
      colLbl("3",   68), colLbl("4",  34), colLbl("5",   0),
    ]);
  }

  // Single 24×24 radio dot inside a 30px-wide option wrapper.
  function ratingOption(label: string, index: number, groupId: string, rightPx: number, isFirst: boolean): Slot {
    const dot = slot("Dot", [
      c("RectTransform", {
        anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
        offsetMin: { x: -12, y: -12 }, offsetMax: { x: 12, y: 12 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.18, 0.18, 0.18), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: rgb(0.18, 0.18, 0.18), highlightColor: rgb(0.30, 0.30, 0.30), pressColor: rgb(0.10, 0.10, 0.10), disabledColor: rgb(0.25, 0.25, 0.25), hoverVibrate: false }),
      c("Radio", { groupId, index, initiallySelected: isFirst, selectedColor: rgb(0.95, 0.95, 0.95) }),
    ]);
    return slot(`Radio ${label}`, [
      c("RectTransform", {
        anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: -(rightPx + 30), y: 0 }, offsetMax: { x: -rightPx, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
    ], [dot]);
  }

  function ratingOptions(groupId: string): Slot[] {
    return [
      ratingOption("NA", 0, groupId, 170, true),
      ratingOption("1",  1, groupId, 136, false),
      ratingOption("2",  2, groupId, 102, false),
      ratingOption("3",  3, groupId,  68, false),
      ratingOption("4",  4, groupId,  34, false),
      ratingOption("5",  5, groupId,   0, false),
    ];
  }

  function ratingRow(question: string, groupId: string, top: number): Slot {
    const lbl = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: -208, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: question, size: 13, color: TEXT, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    return slot(question, [
      rectRT(W, H, 16, top, W - 16, top + 40),
      c("RadioGroup", { groupId, initialIndex: 0 }),
    ], [lbl, ...ratingOptions(groupId)]);
  }

  function scrollRatingRow(question: string, groupId: string, orderIdx: number): Slot {
    const lbl = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 0, y: 0 }, offsetMax: { x: -208, y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: question, size: 13, color: TEXT, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    return slot(question, [
      fillRT(),
      c("LayoutElement", {
        minWidth: -1, preferredWidth: -1, flexibleWidth: -1,
        minHeight: 40, preferredHeight: 40, flexibleHeight: -1,
        orderOffset: orderIdx,
      }),
      c("RadioGroup", { groupId, initialIndex: 0 }),
    ], [lbl, ...ratingOptions(groupId)]);
  }

  const staticPill = sectionPill("Static Questions Label",     "Static Questions",     68);
  const colHdr     = colHeaderRow(108);
  const rq1 = ratingRow("Overall quality",          "rq-s1", 140);
  const rq2 = ratingRow("Ease of use",               "rq-s2", 192);
  const rq3 = ratingRow("Documentation clarity",     "rq-s3", 244);
  const rq4 = ratingRow("Performance",               "rq-s4", 296);
  const rq5 = ratingRow("Overall satisfaction",      "rq-s5", 348);
  const staticScore = scoreRow("Static Score: — / 25", 400);

  // 8 rows in 280px viewport (content ~378px) — scrolling is required.
  const scrollPill = sectionPill("Scrollable Questions Label", "Scrollable Questions", 440);
  const scrollViewport = slot("Scroll Viewport", [
    fillRT(),
    c("ScrollArea", {
      direction: "Vertical",
      backgroundTint: rgb(0.10, 0.11, 0.14, 1),
      spacing: 6, padding: 8,
      showScrollbar: true,
      scrollbarTrackTint: rgb(0.15, 0.17, 0.21, 1),
      scrollbarThumbTint: rgb(0.55, 0.60, 0.68, 1),
    }),
  ], [
    scrollRatingRow("Feature completeness",    "rq-r1", 0),
    scrollRatingRow("Stability / reliability", "rq-r2", 1),
    scrollRatingRow("Response time",           "rq-r3", 2),
    scrollRatingRow("Error handling",          "rq-r4", 3),
    scrollRatingRow("Visual design",           "rq-r5", 4),
    scrollRatingRow("Customisability",         "rq-r6", 5),
    scrollRatingRow("Support experience",      "rq-r7", 6),
    scrollRatingRow("Value for effort",        "rq-r8", 7),
  ]);
  const scrollSection = slot("Scrollable Questions", [
    rectRT(W, H, 16, 480, W - 16, 760),
  ], [scrollViewport]);

  const scrollScore = scoreRow("Scrollable Score: — / 40", 772);
  const totalScore  = scoreRow("Total Score: — / 65",      812);

  return slot("Canvas", [
    c("Canvas", { sizeX: W, sizeY: H, pixelScale: 0.0005, acceptPhysicalTouch: true, backgroundColor: BG, rounded: true }),
    fillRT(),
  ], [
    background, header,
    staticPill, colHdr, rq1, rq2, rq3, rq4, rq5, staticScore,
    scrollPill, scrollSection,
    scrollScore, totalScore,
  ]);
}

// ── Registry ──────────────────────────────────────────────────────────────────

// ── Marketing: "UIX Studio Showcase" ─────────────────────────────────────────
// A science-fair-poster style advertisement for UIX Studio, built with the
// editor itself. Tri-fold layout: a header banner naming UIX Studio + a short
// description, then three columns — the logo lockup ("UIX Studio") dead-center
// with NOTHING above or below it, flanked by two feature "boards" listing
// supported elements with a live example of each beneath the name. Freeform
// (absolute) so the poster grid survives export. Examples are REAL controls so
// the piece doubles as a working demo when shown off in-game.
function buildShowcasePanel(): Slot {
  const W = 1100;
  const H = 770;

  const BRAND    = rgb(0.24, 0.49, 0.78);
  const BRAND_HI = rgb(0.32, 0.60, 0.90);
  const BRAND_LO = rgb(0.16, 0.36, 0.60);
  const WHITE    = rgb(0.95, 0.95, 0.96);
  const MUTED    = rgb(0.62, 0.66, 0.72);
  const DARK_CTRL = rgb(0.12, 0.13, 0.15);

  const rt = (l: number, t: number, r: number, b: number) => rectRT(W, H, l, t, r, b);

  const background = buildBackgroundTrio(rgb(0.05, 0.055, 0.065));

  // ── Header banner ───────────────────────────────────────────────────────────
  // Inset from the side edges so the centered title's rect doesn't span under
  // the top-right Close button (keeps it centered; clears the corner-overlap note).
  const headerTitle = slot("Header", [
    rt(72, 28, W - 72, 84),
    c("Text", { content: "UIX Studio", size: 42, color: WHITE, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);
  // Brand underline accent beneath the title. Named "Accent Bar" so the theme's
  // accent color drives it (instead of staying hardcoded brand-blue).
  const underline = slot("Accent Bar", [
    rt((W - 220) / 2, 90, (W + 220) / 2, 94),
    c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
  ]);
  underline.structural = true;
  const description = slot("Description", [
    rt(150, 102, W - 150, 150),
    c("Text", {
      content:
        "Design real Resonite panels right in your browser, then drop them straight into the game. Here's a taste of what you can build:",
      size: 15, color: MUTED, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false,
    }),
  ]);

  const closeBtn = makeCloseBtn(rt(W - 58, 22, W - 22, 58));

  // ── Center column: logo + "UIX Studio" wordmark (nothing above/below) ─────────
  // themeLock pins the white tint so the brand mark stays crisp — without it the
  // "Logo"-named accent pass would multiply the sprite by the theme accent and
  // recolor the logo's light pixels.
  const logo = slot("Logo", [
    rt(455, 330, 645, 520),
    c("Image", { tint: rgb(1, 1, 1), preserveAspect: true, spriteUrl: "", useLogoSprite: true, themeLock: true }),
  ]);
  const wordmark = slot("Wordmark", [
    rt(380, 528, 720, 582),
    c("Text", { content: "UIX Studio", size: 32, color: BRAND, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
  ]);

  // ── Example control builders (real, positioned by a RectTransform) ────────────
  function exButton(rtc: UixComponent): Slot {
    return slot("Button A", [
      rtc,
      c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: BRAND, highlightColor: BRAND_HI, pressColor: BRAND_LO, disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
    ], [
      slot("Label", [
        fillRT(),
        c("Text", { content: "Press me", size: 14, color: WHITE, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);
  }
  function exSlider(rtc: UixComponent): Slot {
    return slot("Slider", [
      rtc,
      c("Image", { tint: DARK_CTRL, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Slider", { value: 0.6, min: 0, max: 1, direction: "Horizontal", integers: false, power: 1, fillColor: BRAND, clamp: true, requireInitialPress: true }),
    ]);
  }
  function exTextField(rtc: UixComponent): Slot {
    return slot("Text Field", [
      rtc,
      c("Image", { tint: DARK_CTRL, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("TextField", {
        placeholder: "", textContent: "Hello!", textAlign: "Center", fontSize: 16,
        textColor: WHITE, placeholderColor: rgb(0.45, 0.45, 0.45), backgroundTint: DARK_CTRL,
      }),
    ]);
  }
  function exToggle(rtc: UixComponent): Slot {
    const knob = slot("Knob", [
      c("RectTransform", {
        anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
        offsetMin: { x: 1, y: -13 }, offsetMax: { x: 27, y: 13 }, pivot: { x: 0.5, y: 0.5 },
      }),
      c("Image", { tint: rgb(0.95, 0.95, 0.95), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Knob", {
        offOffsetMin: { x: -27, y: -13 }, offOffsetMax: { x: -1, y: 13 },
        onOffsetMin: { x: 1, y: -13 }, onOffsetMax: { x: 27, y: 13 },
      }),
    ]);
    return slot("Toggle", [
      rtc,
      c("Image", { tint: DARK_CTRL, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: rgb(0.9, 0.9, 0.9), highlightColor: rgb(0.9, 0.9, 0.9), pressColor: rgb(0.9, 0.9, 0.9), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
      c("Toggle", { initialState: true, offColor: DARK_CTRL, onColor: BRAND }),
    ], [knob]);
  }
  function exCheckbox(rtc: UixComponent): Slot {
    const checkIcon = slot("Check Icon", [
      fillRT(),
      c("Image", { tint: rgb(0.9, 0.9, 0.9), preserveAspect: true, spriteUrl: "", useCheckIcon: true }),
      c("Button", { normalColor: rgb(0.9, 0.9, 0.9), highlightColor: rgb(0.9, 0.9, 0.9), pressColor: rgb(0.9, 0.9, 0.9), disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
      c("Checkbox", { initialState: true }),
    ]);
    return slot("Box", [
      rtc,
      c("Image", { tint: DARK_CTRL, preserveAspect: false, spriteUrl: "", cornerRadius: 8 }),
    ], [checkIcon]);
  }
  function exColor(rtc: UixComponent): Slot {
    return slot("Color Picker", [
      rtc,
      c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: BRAND, highlightColor: BRAND, pressColor: BRAND, disabledColor: BRAND, hoverVibrate: false }),
      c("ColorPicker", { initialColor: BRAND, alpha: true, hdr: false }),
    ]);
  }
  function exDropdown(rtc: UixComponent): Slot {
    return slot("Dropdown", [
      rtc,
      c("Image", { tint: rgb(0.14, 0.16, 0.20), preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: rgb(0.14, 0.16, 0.20), highlightColor: rgb(0.22, 0.26, 0.32), pressColor: rgb(0.10, 0.12, 0.16), disabledColor: rgb(0.3, 0.3, 0.3), hoverVibrate: false }),
      c("Dropdown", { options: "Low\nMedium\nHigh", initialIndex: 1, optionFillColor: rgb(0.14, 0.16, 0.20), optionLabelColor: WHITE }),
    ]);
  }
  function exProgress(rtc: UixComponent): Slot {
    return slot("Progress Bar", [
      rtc,
      c("Image", { tint: DARK_CTRL, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("ProgressBar", { value: 0.45, min: 0, max: 1, direction: "Horizontal", fillColor: BRAND }),
    ]);
  }
  function exSpinner(rtc: UixComponent): Slot {
    // A single square slot carrying the spinner flag — the exporter's hasSpinner
    // branch swaps the Image for an animated OutlinedArc and appends a bool value.
    return slot("Loading Spinner", [
      rtc,
      c("Image", { tint: rgb(0.27, 0.57, 0.84), preserveAspect: true, spriteUrl: "", useSpinnerIcon: true }),
    ]);
  }
  function exPopup(rtc: UixComponent): Slot {
    // A button carrying a Popup marker — the exporter lowers it into a spawn-
    // window modal (a hidden full-canvas dialog toggled Active on click). Mirrors
    // the makeHelpBtn pattern: Image+Button+Popup on the slot, caption in a child.
    return slot("Open Dialog", [
      rtc,
      c("Image", { tint: BRAND, preserveAspect: false, spriteUrl: "", cornerRadius: 100 }),
      c("Button", { normalColor: BRAND, highlightColor: BRAND_HI, pressColor: BRAND_LO, disabledColor: rgb(0.5, 0.5, 0.5), hoverVibrate: false }),
      c("Popup", {
        title: "It's a pop-up!",
        body: "Any button can spawn a dialog window like this one — great for confirmations, info, or warnings. Edit the Popup component on this button to change what it says.",
        dismissLabel: "Neat!",
      }),
    ], [
      slot("Label", [
        fillRT(),
        c("Text", { content: "Open ▸", size: 14, color: WHITE, horizontalAlign: "Center", verticalAlign: "Middle", autoSize: false }),
      ]),
    ]);
  }

  // ── Right-side scroll list ────────────────────────────────────────────────────
  // A right-anchored, vertically-centered control rect for one scroll row.
  function rightRT(w: number, h: number): UixComponent {
    return c("RectTransform", {
      anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 },
      offsetMin: { x: -(w + 14), y: -h / 2 }, offsetMax: { x: -14, y: h / 2 },
      pivot: { x: 0.5, y: 0.5 },
    });
  }
  // One scroll row: a rounded card with the element name on the left and a live
  // control on the right. LayoutElement makes the ScrollArea's VerticalLayout
  // stack + order it; `ctlW` reserves room so the label never overlaps the control.
  const ROW_H = 52;
  function scrollRow(name: string, label: string, ctlW: number, control: Slot, idx: number): Slot {
    const lbl = slot("Label", [
      c("RectTransform", {
        anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 },
        offsetMin: { x: 14, y: 0 }, offsetMax: { x: -(ctlW + 24), y: 0 },
        pivot: { x: 0.5, y: 0.5 },
      }),
      c("Text", { content: label, size: 15, color: WHITE, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);
    return slot(name, [
      fillRT(),
      c("LayoutElement", {
        minWidth: -1, preferredWidth: -1, flexibleWidth: -1,
        minHeight: ROW_H, preferredHeight: ROW_H, flexibleHeight: -1,
        orderOffset: idx,
      }),
      c("Image", { tint: rgb(0.12, 0.135, 0.16), preserveAspect: false, spriteUrl: "", cornerRadius: 10 }),
    ], [lbl, control]);
  }

  // ── Feature board scaffold ────────────────────────────────────────────────────
  // A board is a rounded backdrop panel with a small uppercase kicker and three
  // feature blocks (name + one-line blurb + a live example beneath).
  interface Feature {
    name: string;
    blurb: string;
    example: (colLeft: number, zoneTop: number) => Slot[];
  }

  function board(name: string, kicker: string, colL: number, colR: number, features: Feature[]): Slot[] {
    const boardBg = slot(name, [
      rt(colL - 24, 168, colR + 24, 740),
      c("Image", { tint: rgb(0.085, 0.092, 0.108), preserveAspect: false, spriteUrl: "", cornerRadius: 14 }),
    ]);
    boardBg.structural = true;

    const kickerSlot = slot(`${name} Kicker`, [
      rt(colL, 184, colR, 206),
      c("Text", { content: kicker, size: 12, color: BRAND, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
    ]);

    const blocks: Slot[] = [];
    features.forEach((f, i) => {
      const blockTop = 222 + i * 168;
      blocks.push(slot(`${f.name} Name`, [
        rt(colL, blockTop, colR, blockTop + 28),
        c("Text", { content: f.name, size: 19, color: WHITE, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
      ]));
      blocks.push(slot(`${f.name} Blurb`, [
        rt(colL, blockTop + 30, colR, blockTop + 52),
        c("Text", { content: f.blurb, size: 12, color: MUTED, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
      ]));
      blocks.push(...f.example(colL, blockTop + 60));
    });

    return [boardBg, kickerSlot, ...blocks];
  }

  // Left board "INTERACT": Buttons, Sliders, Text Fields.
  const leftL = 64;
  const leftR = 336;
  const leftBoard = board("Left Board", "INTERACT", leftL, leftR, [
    {
      name: "Buttons", blurb: "Trigger anything with a tap.",
      example: (l, z) => [exButton(rt(l, z + 2, l + 150, z + 42))],
    },
    {
      name: "Sliders", blurb: "Dial in a value smoothly.",
      example: (l, z) => [exSlider(rt(l, z + 14, l + 200, z + 30))],
    },
    {
      name: "Text Fields", blurb: "Let people type in-world.",
      example: (l, z) => [exTextField(rt(l, z + 6, l + 210, z + 38))],
    },
  ]);

  // Right board "MORE CONTROLS" — a real ScrollArea so the list itself shows off
  // scrolling. Holds more elements than fit (Toggle, Checkbox, Color Picker,
  // Dropdown, Slider, Progress Bar, Text Field, Spinner, Popup) so a scrollbar is
  // always needed. Each row is a labeled card with a working control on the right.
  const rightL = 764;
  const rightR = 1036;
  const rightBoardBg = slot("Right Board", [
    rt(rightL - 24, 168, rightR + 24, 740),
    c("Image", { tint: rgb(0.085, 0.092, 0.108), preserveAspect: false, spriteUrl: "", cornerRadius: 14 }),
  ]);
  rightBoardBg.structural = true;
  const rightKicker = slot("Right Board Kicker", [
    rt(rightL, 184, rightR, 206),
    c("Text", { content: "MORE CONTROLS", size: 12, color: BRAND, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);
  const scrollHint = slot("Scroll Hint", [
    rt(rightL, 207, rightR, 226),
    c("Text", { content: "Scroll for more  ↓", size: 11, color: MUTED, horizontalAlign: "Left", verticalAlign: "Middle", autoSize: false }),
  ]);

  // Row table: name, control width (to reserve label room), height, builder.
  const scrollRows: Slot[] = [
    { n: "Toggle",       w: 60,  h: 32, b: exToggle },
    { n: "Checkbox",     w: 30,  h: 30, b: exCheckbox },
    { n: "Color Picker", w: 90,  h: 28, b: exColor },
    { n: "Dropdown",     w: 150, h: 32, b: exDropdown },
    { n: "Slider",       w: 150, h: 14, b: exSlider },
    { n: "Progress Bar", w: 150, h: 12, b: exProgress },
    { n: "Text Field",   w: 170, h: 32, b: exTextField },
    { n: "Spinner",      w: 30,  h: 30, b: exSpinner },
    { n: "Popup Dialog", w: 110, h: 34, b: exPopup },
  ].map((f, i) => scrollRow(`${f.n} Row`, f.n, f.w, f.b(rightRT(f.w, f.h)), i));

  const scrollViewport = slot("Scroll Viewport", [
    fillRT(),
    c("ScrollArea", {
      direction: "Vertical",
      backgroundTint: rgb(0.07, 0.08, 0.10, 1),
      spacing: 10, padding: 12,
      showScrollbar: true,
      scrollbarTrackTint: rgb(0.15, 0.17, 0.21, 1),
      scrollbarThumbTint: rgb(0.55, 0.60, 0.68, 1),
    }),
  ], scrollRows);
  // Viewport rect inside the board, below the kicker/hint. Content (~9×62px) is
  // taller than this ~485px window, so the scrollbar is always live.
  const scrollSection = slot("Scrollable Controls", [
    rt(rightL - 8, 234, rightR + 8, 720),
  ], [scrollViewport]);

  return slot(
    "Canvas",
    [
      c("Canvas", {
        sizeX: W, sizeY: H, pixelScale: 0.0005,
        acceptPhysicalTouch: true,
        backgroundColor: rgb(0.05, 0.055, 0.065), rounded: true,
      }),
      fillRT(),
    ],
    [
      background,
      ...leftBoard,
      rightBoardBg,
      rightKicker,
      scrollHint,
      scrollSection,
      logo,
      wordmark,
      headerTitle,
      underline,
      description,
      closeBtn,
    ],
  );
}

export const BUILTIN_PRESETS: readonly PresetDescriptor[] = [
  {
    id: "experimental",
    name: "Experimental Panel",
    description:
      "Full sample panel — every interactive control on one canvas: header (icon + title + spinner + close), checkbox, toggle, slider, three text fields, radio group, progress bar, dropdown, color picker, reference receiver field, scroll area, and two action buttons. The default starting point and first target for new features.",
    category: "panel",
    build: createStarterTemplate,
  },
  {
    id: "simple-dialog",
    name: "Simple Dialog Popup",
    description:
      "Modal-style dialog: dim backdrop, centered card, title, body text, OK button, and red ✕ close in the corner.",
    category: "dialog",
    freeform: true,
    build: buildSimpleDialog,
  },
  {
    id: "basic-text",
    name: "Basic Text",
    description: "A single centered Text slot on an 800×200 canvas. Useful starting point for signs.",
    category: "panel",
    build: buildBasicTextPanel,
  },
  {
    id: "labeled-button",
    name: "Labeled Button",
    description: "A standalone labeled button on a small canvas — minimal interactive control.",
    category: "panel",
    build: buildLabeledButtonPanel,
  },
  {
    id: "installer",
    name: "Installer",
    description:
      "Square installer dialog: title + close button, a Header pill, single Image Placeholder, Miscellaneous Notes pill, and Install / Uninstall actions.",
    category: "dialog",
    freeform: true,
    build: buildInstallerPanel,
  },
  {
    id: "login-basic",
    name: "Login Form (Basic)",
    description:
      "Centered card with a brand-blue title bar, two icon-prefixed text fields (Email / Password), a Forgot password link, a full-width Login button, and a Signup footer. Use as a drop-in sign-in panel.",
    category: "form",
    freeform: true,
    build: buildBasicLoginPanel,
  },
  {
    id: "login-stylized",
    name: "Login Form (Stylized)",
    description:
      "Split landscape layout: the left half is a full image placeholder (drop in your own art) and the right half holds the form — logo, Hello Again header, email + password fields, Remember Me checkbox, Recovery Password link, Login button, and Sign Up footer.",
    category: "form",
    freeform: true,
    build: buildStylizedLoginPanel,
  },
  {
    id: "checklist-form",
    name: "Checklist Form",
    description:
      "Two-section checklist: 5 static checkboxes at the top, 10 scrollable checkboxes below (more content than the viewport so scrolling is always needed), and a free-text Notes field at the bottom. Ready to use as a task list, evaluation sheet, or sign-off form.",
    category: "form",
    build: buildChecklistForm,
  },
  {
    id: "rating-form",
    name: "Rating Form",
    description:
      "Two-section rating sheet: 5 static rows and 8 scrollable rows, each with NA / 1-5 radio buttons arranged in a labeled column grid. Score readout Text slots sit below each section (Static Score, Scrollable Score, Total Score) as placeholders — wire them to ProtoFlux in Resonite for live calculation.",
    category: "form",
    build: buildRatingForm,
  },
  {
    id: "id-vtuber-compact",
    name: "VTuber ID Card (Compact)",
    description:
      "Portrait card with a large avatar placeholder on the left and a stacked field list on the right (Name, Birthday, Gender, Language, Content, Oshi mark). Brand-blue accents on labels and title chip.",
    category: "id-card",
    freeform: true,
    build: buildVTuberIDCompact,
  },
  {
    id: "id-vtuber-detailed",
    name: "VTuber ID Card (Detailed)",
    description:
      "Landscape card packed with sections — About Me, I Stream, Language, My Favorite Motto, My Social Media, My Favorites, I Dislike — plus a large avatar tile and a VTUBER ID CARD header. Mirrors the densely-labelled VTuber profile layout people share online.",
    category: "id-card",
    freeform: true,
    build: buildVTuberIDDetailed,
  },
  {
    id: "id-student",
    name: "Student ID Card",
    description:
      "Small horizontal ID card with a brand-blue header stripe (logo + institute name + identification subtitle), a portrait avatar tile on the right, and Department / Name / Born / Grade fields on the left. ILUNA-style.",
    category: "id-card",
    freeform: true,
    build: buildStudentIDCard,
  },
  {
    id: "keypad",
    name: "Numeric Keypad",
    description:
      "iOS-17-style numeric keypad: large display at top showing typed digits, 3×4 button grid (1-9, decimal point, 0, backspace) with letters beneath each number, plus Enter and Clear action buttons. Each digit button writes its character to the display via KeypadKey markers. V1 note: each press overwrites the display (true append behaviour needs a ProtoFlux node in Resonite).",
    category: "tool",
    freeform: true,
    build: buildKeypadPanel,
  },
  {
    id: "profile-card",
    name: "Profile Card",
    description:
      "Banner on top, round avatar straddling the seam, display name + username to the right, editable status field, and a row of social buttons.",
    category: "id-card",
    freeform: true,
    build: buildProfileCard,
  },
  {
    id: "showcase",
    name: "UIX Studio Showcase",
    description:
      "A science-fair-poster advertisement for UIX Studio, built with the editor itself: a header banner + short description and the logo lockup dead-center. The left board lists input controls (Buttons, Sliders, Text Fields) with a live example of each; the right board is a real scrollable list of more controls (Toggle, Checkbox, Color Picker, Dropdown, Slider, Progress Bar, Text Field, Spinner, and a Popup-dialog button) so it shows off scrolling, the loading spinner, and pop-out dialogs too. A ready-to-show-off promo piece.",
    category: "marketing",
    freeform: true,
    build: buildShowcasePanel,
  },
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Just an empty 800×600 canvas. Build everything from scratch.",
    category: "blank",
    build: buildBlank,
  },
];

export function findPreset(id: string): PresetDescriptor | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}
