// English dictionary — the SOURCE OF TRUTH for the UI translation layer.
//
// `Dictionary = typeof en` is the contract every other language file
// (ko/es/ja) must structurally satisfy. Add a key here first, then the
// compiler will flag the same key as missing in the other languages.
//
// Entries are plain strings, or functions when a string interpolates a value
// (e.g. a slot name or a count). Keep function parameter types annotated so the
// inferred Dictionary shape stays precise.
//
// Grouped by UI area. `content` holds the DESIGNED-PANEL text baked into the
// starter template (translated at generation time, not the editor chrome).

export const en = {
  // ── App shell / restore banner (App.tsx) ───────────────────────────────────
  app: {
    restoreTitle: "Restore your last session?",
    restoreBody: (when: string): string =>
      `We found unsaved work${when ? ` from ${when}` : ""} saved automatically in this browser.`,
    restore: "Restore",
    discard: "Discard",
    discardTip: "Discard the autosaved work and keep the current canvas",
    // Relative timestamps for the restore banner.
    momentsAgo: "moments ago",
    minutesAgo: (n: number): string => `${n} minute${n === 1 ? "" : "s"} ago`,
    hoursAgo: (n: number): string => `${n} hour${n === 1 ? "" : "s"} ago`,
  },

  // ── Toolbar (Toolbar.tsx) ───────────────────────────────────────────────────
  toolbar: {
    whatsNewTip: "What's new — view patch notes",
    saveProject: "💾 Save Project",
    saveProjectTip:
      "Save Project — downloads an editable .uixstudio.json you can reopen here later. This is NOT the Resonite file; use Export for that.",
    openProject: "Open Project…",
    openProjectTip: "Open a previously saved .uixstudio.json project to keep editing",
    exportResonite: "⬇ Export to Resonite",
    exportTip:
      "Export to Resonite — downloads a .resonitepackage; drag it straight into the game to import. (To keep editing later, use Save Project too.)",
    exporting: "Exporting…",
    exported: "Exported!",
    exportSaveHint: "Consider also saving the project for easier editing in the future",
    exportFailed: (msg: string): string => `Export failed: ${msg}`,
    openConfirm:
      "Open project? This replaces the current panel and discards unsaved changes.",
    importFailed: (msg: string): string => `Failed to import file: ${msg}`,
    undo: "↶ Undo",
    undoTip: "Undo (Ctrl+Z)",
    redo: "↷ Redo",
    redoTip: "Redo (Ctrl+Y)",
    newBtn: "New",
    newTip: "Start a new panel",
    newConfirm: "Discard the current panel and start fresh?",
    newConfirmLabel: "Discard",
    protofluxNote:
      "Note: this tool only builds the UIX, it does not provide protoflux backend logic",
    slopcodedBy: (author: string): string => `Slopcoded by ${author}`,
    visitWebsite: "Visit my website",
    buyCoffee: "Buy me a coffee",
  },

  // ── Help menu (HelpMenu.tsx) ────────────────────────────────────────────────
  help: {
    helpBtn: "? Help",
    helpTip: "About UIX Studio",
    about: "About",
    whatsNew: "What's new",
    slopcodedBy: "Slopcoded by",
    usingClaudeCode: "using Claude Code",
    disclaimer: "Disclaimer",
    disclaimerPre: "UIX Studio is offered ",
    disclaimerAsIs: "as-is",
    disclaimerPost: ", with no warranty or support. Use at your own risk.",
    sourcePre: "Source available on",
    github: "GitHub",
    logoCredits: "Logo Credits",
    createdBy: "created by",
    penToolIcons: "Pen tool icons",
    uiIcons: "Ui icons",
  },

  // ── Splash (Splash.tsx) ─────────────────────────────────────────────────────
  splash: {
    version: "Version",
    clickToContinue: "click anywhere to continue",
  },

  // ── Small-screen gate (ScreenSizeGate.tsx) ──────────────────────────────────
  screenGate: {
    title: "This screen is a little small",
    body: "UIX Studio is built for desktop. The hierarchy, canvas, and inspector panels need room to work, and designing relies on precise dragging — both of which feel cramped on a phone.",
    rotateHint:
      "Try rotating your device to landscape, or open UIX Studio on a tablet or computer for the best experience.",
    screenInfo: (w: number, h: number, minW: number, minH: number): string =>
      `Your screen: ${w} × ${h} · Recommended: ${minW} × ${minH} or larger`,
    continueAnyway: "Continue anyway",
  },

  // ── Snap/Free mode switch dialog (ModeSwitchDialog.tsx) ──────────────────────
  modeSwitch: {
    snap: "Snap",
    free: "Free",
    title: (mode: string): string => `Switch to ${mode} mode?`,
    snapDesc:
      "Snap arranges elements into stacked rows and reflows them. Manual positions you set in Free mode may shift. In return, the exported panel stays reorderable inside Resonite.",
    freeDesc:
      "Free lets you place every element at exact coordinates — great for precise designs. But the exported panel can no longer be rearranged in-game: reordering its slots in Resonite won't move anything.",
    switchTo: (mode: string): string => `Switch to ${mode}`,
    cancel: "Cancel",
    switchingTo: "Switching to",
    snapCardDesc: "Stacked rows · reorderable in Resonite",
    freeCardDesc: "Exact positions · fixed once exported",
  },

  // ── Add menu (AddMenu.tsx) ──────────────────────────────────────────────────
  addMenu: {
    addBtn: "+ Add ▾",
    addTip: (dest: string): string => `Add a new element to ${dest}`,
    addingTo: "Adding to",
    bottomOfPage: "bottom of the page",
    bottomOf: (name: string): string => `bottom of ${name}`,
    container: "container",
    system: "System",
    systemHint: "Plumbing — rarely needed manually",
    addType: (label: string): string => `Add ${label}`,
  },

  // ── Preset menu (PresetMenu.tsx) ────────────────────────────────────────────
  presetMenu: {
    presetsBtn: "Presets ▾",
    presetsTip: "Load a starting preset (replaces the current canvas)",
    loadPreset: "Load a Preset",
    loadPresetSub: "Replaces the current canvas. Save first if you want to keep your work.",
    replaceConfirm: (name: string): string =>
      `Replace the current canvas with the "${name}" preset? Any unsaved work will be lost.`,
    loadPresetLabel: "Load Preset",
    categories: {
      panel: "Panels",
      form: "Forms",
      "id-card": "ID Cards",
      tool: "Tools",
      dialog: "Dialogs",
      marketing: "Marketing",
      blank: "Start fresh",
    },
    footerPre: "The reference layouts in",
    footerPost:
      " (Preset Template 1–7, Rocker, Scroll area, …) are .resonitepackage exports. Porting them into the editor requires a BSON importer — flag this as a follow-up if you want them as one-click presets.",
  },

  // ── Alignment buttons (ContextMenu.tsx / Inspector) ─────────────────────────
  align: {
    captionLeft: "Left",
    captionCenter: "Center",
    captionRight: "Right",
    captionStretch: "Stretch",
    captionTop: "Top",
    captionMiddle: "Middle",
    captionBottom: "Bottom",
    titleLeft: "Align left",
    titleCenterH: "Center horizontally",
    titleRight: "Align right",
    titleStretchH: "Stretch horizontally",
    titleTop: "Align top",
    titleCenterV: "Center vertically",
    titleBottom: "Align bottom",
    titleStretchV: "Stretch vertically",
  },

  // ── Right-click context menu (ContextMenu.tsx) ──────────────────────────────
  contextMenu: {
    canvas: "Canvas",
    slot: "Slot",
    selectSlotHint: "Select a slot to add components or align it.",
    quickActions: "Quick Actions",
    rename: "✎ Rename",
    renameTip: "Rename (or double-click in the hierarchy)",
    duplicate: "⎘ Duplicate",
    duplicateTip: "Duplicate (Ctrl+D)",
    lock: "🔒 Lock",
    unlock: "🔓 Unlock",
    lockWord: "Lock",
    unlockWord: "Unlock",
    delete: "✕ Delete",
    deleteTip: "Delete (Del)",
    alignInParent: "Align in Parent",
    layoutManaged: "Layout-managed — disabled",
    horizontal: "Horizontal",
    vertical: "Vertical",
    newElementsAddTo: "New elements add to the",
    addGroup: (label: string): string => `Add ${label}`,
    addSystem: "Add System",
    rarelyNeeded: "rarely needed",
  },

  // ── Hierarchy panel (HierarchyTree.tsx) ─────────────────────────────────────
  hierarchy: {
    showPanel: "Show Hierarchy panel",
    title: "Hierarchy",
    expandAll: "Expand all",
    expandAllAria: "Expand all layers",
    collapseAll: "Collapse all",
    collapseAllAria: "Collapse all layers",
    hidePanel: "Hide panel",
    hidePanelAria: "Hide Hierarchy panel",
    expand: "Expand",
    collapse: "Collapse",
    lockLayer: "Lock layer",
    unlockLayer: "Unlock layer",
    addChild: "Add child slot",
    duplicateTip: "Duplicate (Ctrl+D)",
    deleteTip: "Delete",
  },

  // ── Sidebar menu buttons (SidebarMenus.tsx) ─────────────────────────────────
  sidebar: {
    background: "Background",
    backgroundTip: "Background — front/back panel color or image",
    branding: "Branding",
    brandingTip: "Branding — back logo image, hyperlink URL, confirmation reason",
    theme: "Theme",
    themeTip: "Theme — preset, colors, text, layout",
  },

  // ── Controls cheatsheet (ShortcutsMenu.tsx). The KEY chords stay literal. ────
  shortcuts: {
    controlsBtn: "⌨ Controls",
    controlsTip: "Mouse & keyboard controls",
    controlsAria: "Controls and keyboard shortcuts",
    controls: "Controls",
    mouseKeyboard: "Mouse & keyboard",
    navLabel: "Canvas navigation",
    navPanSpace: "Pan around the canvas",
    navPanMiddle: "Pan around the canvas",
    navZoom: "Zoom in / out",
    navScroll: "Pan vertically (Shift = horizontal)",
    navFit: "Recenter & fit the canvas",
    editLabel: "Selecting & editing",
    editSelect: "Select an element",
    editDeselect: "Deselect",
    editDrag: "Move it (Free) or reorder it (Snap)",
    editRename: "Rename a layer",
    editReparent: "Reparent / reorder layers",
    kbLabel: "Keyboard",
    kbUndo: "Undo",
    kbRedo: "Redo",
    kbDuplicate: "Duplicate selected element",
    kbDelete: "Delete selected element",
    kbToggleHierarchy: "Toggle the Hierarchy panel",
    kbToggleInspector: "Toggle the Inspector panel",
  },

  // ── Inspector chrome (Inspector.tsx — headers + empty state only) ───────────
  inspector: {
    showPanel: "Show Inspector panel",
    title: "Inspector",
    hidePanel: "Hide panel",
    hidePanelAria: "Hide Inspector panel",
    emptyState:
      "Click an element on the canvas, or pick one from the Hierarchy panel, to edit its properties.",
    emptyTip: "Tip: drag in the canvas to move · drag in Hierarchy to reorder",
    idLabel: "id:",
    // Tabs editor
    tabsHint: "Click a tab to open it on the canvas, then click the elements inside to edit them.",
    tabs: "Tabs",
    showTabOnCanvas: "Show this tab on the canvas",
    moveTabEarlier: "Move tab earlier",
    moveTabLater: "Move tab later",
    needOneTab: "A tabbed group needs at least one tab",
    deleteTab: "Delete this tab",
    addTab: "+ Add tab",
    tabBarPosition: "Tab Bar Position",
    posTop: "Top",
    posBottom: "Bottom",
    posLeft: "Left",
    posRight: "Right",
    tabBarOn: (pos: string): string => `Tab bar on the ${pos.toLowerCase()}`,
    tabSideNote: "Left/right stack the tabs vertically with horizontal labels.",
    appearance: "Appearance",
    appearanceSub: "orientation · sizes · colors",
    // Component list
    collapseEvery: "Collapse every component",
    expandEvery: "Expand every component",
    collapseAll: "Collapse all",
    expandAll: "Expand all",
    systemPlumbingTip: "Plumbing components that Resonite needs — rarely edited directly",
    systemComponents: "System Components",
    systemWarning: "⚠ These components make the panel work. Editing them by hand can break or change behavior in ways the web editor won't account for — adjust only if you know what you're doing.",
    expandComponent: "Expand component",
    collapseComponent: "Collapse component",
    fieldCount: (n: number): string => `${n} field${n === 1 ? "" : "s"}`,
    removeComponent: "Remove component",
    // Interactivity (GraphicControls)
    interactivity: "Interactivity",
    partOf: (name: string, reason: string): string => `Part of “${name}” — ${reason}`,
    selectHandlingSlot: (name: string): string => `Select the “${name}” slot that handles the click`,
    selectButton: "Select button",
    clickable: (reason: string): string => `Clickable — ${reason}`,
    staticImage: "Static image",
    makeStaticTip: "Make this a static image again (removes its click behavior)",
    makeClickableTip: "Add a transparent Button so this image is clickable. Its look is unchanged.",
    makeStatic: "Make static",
    makeClickable: "Make clickable",
    restorePlaceholderTip: "Bring back the hatched “drop image here” placeholder.",
    removePlaceholderTip: "Remove the placeholder, leaving a plain image. Stays removed even if you later make this static.",
    restorePlaceholder: "Restore Placeholder",
    removePlaceholder: "Remove Placeholder",
    // Input field type
    typeLabel: "Type",
    current: (label: string): string => `current: ${label}`,
    ftString: "String",
    ftFloat: "Float",
    ftInteger: "Integer",
    ftStringHint: "Free text",
    ftFloatHint: "Decimal number",
    ftIntegerHint: "Whole number",
    // Spacer
    spacer: "Spacer",
    height: "Height",
    spacerHint: "An empty, invisible row that reserves vertical space. Drag its row tab to reposition; it exports as nothing.",
    // Button label
    labelField: "Label",
    buttonTextPlaceholder: "Button text…",
    // Popup edit
    editPopupTip: "Open the dialog card in a floating editor to arrange and resize its contents",
    doneEditingDialog: "✓ Done editing dialog",
    editPopupDialog: "✎ Edit popup dialog…",
    // Radio / Dropdown option lists
    options: "Options",
    defaultMark: "● = default",
    shownByDefaultMark: "● = shown by default",
    makeInitiallySelected: "Make this the initially-selected option",
    showByDefault: "Show this option by default",
    setAsDefault: "Set as default",
    optionPlaceholder: (n: number): string => `Option ${n}`,
    removeOption: "Remove option",
    addOption: "+ Add option",
    labelPosition: "Label Position",
    radioPosLeft: "◧ Left",
    radioPosRight: "Right ◨",
    radioPosUp: "▲ Up",
    radioPosDown: "▼ Down",
    radioPosNone: "∅ None",
    layout: "Layout",
    row: "▭ Row",
    column: "☰ Column",
    dropdownHint: "The selected option is shown on the trigger; the full list opens as a popup in Resonite. Option colors are below.",
    // Button preset
    preset: "Preset",
    // Label position (composite)
    labelLeft: "◧ Left",
    labelTop: "▤ Top",
    labelLeftHint: "Label to the left of the control",
    labelTopHint: "Label above the control",
    // Align widget
    managedByLayout: "managed by layout",
  },

  // ── Language picker (LanguageMenu.tsx) ──────────────────────────────────────
  language: {
    tip: "Display language",
    caveat: "Translations by Claude — may be inaccurate.",
  },

  // ── Viewport control bar + status bar (Viewport.tsx) ────────────────────────
  // The ▤/✥ Snap/Free labels reuse modeSwitch.snap/free for consistency.
  viewport: {
    zoomOut: "Zoom out",
    resetView: "Reset view (fit)",
    zoomIn: "Zoom in",
    recenter: "⊙ Recenter",
    recenterTip: "Recenter canvas (F)",
    snapToGrid: "Snap to grid",
    grid: "Grid",
    gridSize: "Grid size (px)",
    modeToggleTip:
      "Snap: dragging a block reorders it and shifts the others out of the way. Free: drag to any position.",
    snapPoorFitTip:
      "This template's elements overlap or there's only one block to move, so Snap reordering won't help much (and may shift things around). Free mode lets you position each element precisely.",
    snapPoorFitBadge: "ℹ Tip: this template is easier to edit in Free mode",
    autoArrange: "⤓ Auto-arrange",
    autoArrangeTip:
      "Tidy the rows into a clean vertical stack — removes overlaps and evens out spacing",
    gap: "Gap",
    gapTip: "Vertical gap (px) kept between stacked rows when reflowing in Snap mode",
    scaleContents: "Scale contents",
    scaleContentsTip:
      "When resizing the Canvas (select it, then drag a handle): OFF = elements keep their size, the canvas just gains/loses empty space; ON = scale every child proportionally so the whole panel grows/shrinks uniformly.",
    overlay: "Overlay",
    overlayTip:
      "Show per-element outlines, layout labels, and the image-placeholder hatched fill (editor-only overlays)",
    nothingSelected: "nothing selected",
    canvasStatus: (w: number, h: number, pct: string): string => `Canvas ${w}×${h} @ ${pct}%`,
    zoomStatus: (z: string): string => `zoom ${z}×`,
    snapStatus: (px: number): string => `snap ${px}px`,
    snapOff: "snap off",
    selectedSlotTip: "Currently selected slot",
  },

  // ── Background menu (BackgroundMenu.tsx) ────────────────────────────────────
  bg: {
    title: "Background",
    close: "Close",
    noLayer: "This panel has no background layer. Add one to set a front/back color or image.",
    addBackground: "Add background",
    single: "Single",
    singleHint: "One background for the whole panel",
    perSide: "Per-side",
    perSideHint: "Different front and back",
    front: "Front",
    back: "Back",
    color: "Color",
    image: "Image",
    layout: "Layout",
    fit: "fit",
    stretch: "stretch",
    full: "full",
    fitHint: "Whole image visible, letterboxed (may leave bars on the sides).",
    stretchHint: "Stretched to fill exactly — can deform the image.",
    fullHint: "Covers the whole canvas, cropping overflow. No deformation.",
    framing: "Framing",
    reset: "reset",
    resetTip: "Re-center and reset zoom",
    dragReposition: "Drag to reposition the visible area",
    zoom: "Zoom",
    clear: "Clear",
    clearTip: "How see-through the front of the panel is. The back stays opaque so it still shows only the logo + credits.",
    frontTransparency: "Front transparency",
    replaceBothConfirm: "The front and back currently use different background images. Replace both with this image?",
    replaceBoth: "Replace Both",
  },

  // ── Branding menu (BrandingMenu.tsx) ────────────────────────────────────────
  branding: {
    title: "Branding",
    close: "Close",
    backLogoImage: "Back Logo Image",
    backLogoAlt: "Back logo",
    defaultLogoAlt: "UIX Studio (default back logo)",
    uploadImage: "Upload image…",
    resetDefault: "Reset to default",
    replacesLogo: "Replaces the UIX Studio logo on the rear of the panel. PNG / JPG / WebP.",
    clickHyperlink: "Click Hyperlink",
    url: "URL",
    urlPlaceholder: "https://…",
    reason: "Reason",
    reasonPlaceholder: "Confirmation dialog text…",
    reasonHint: "Shown in Resonite's confirmation dialog when a user clicks the rear logo.",
    applyTip: "Push image, URL, and reason to the Canvas component",
    saved: "✓ Saved!",
    apply: "Apply Branding",
    uploadFailed: (msg: string): string => `Failed to upload image: ${msg}`,
  },

  // ── Theme menu (ThemeMenu.tsx) ──────────────────────────────────────────────
  theme: {
    title: "Theme",
    close: "Close",
    presets: { dark: "Dark", light: "Light", sakura: "Sakura", tech: "Tech", coffee: "Coffee", frosted: "Frosted" },
    custom: "Custom",
    customTip: "Set automatically when you manually edit any theme value",
    presetSection: "Preset",
    presetHint: "Picking a preset replaces all theme values and applies them to the panel.",
    colors: "Colors",
    background: "Background",
    backgroundHint: "Panel fill · header · body surface",
    accent: "Accent",
    accentHint: "Slider fill · progress · toggle · radio dot · spinner",
    controls: "Controls",
    controlsHint: "Slider track · text field · checkbox · pill · dropdown · radio bg",
    container: "Container",
    containerHint: "Tab pages + active tab · scroll-area background (frame/inactive auto-derived)",
    buttonA: "Button A",
    buttonAHint: "Primary action — hover/press shades auto-derived",
    buttonB: "Button B",
    buttonBHint: "Secondary action",
    text: "Text",
    header: "Header",
    body: "Body",
    size: "Size",
    sizeTip: (label: string, px: number): string => `${label} = ${px}px`,
    applyAll: "Apply All to Panel",
    applyAllTip: "Re-push every theme value onto the panel — useful after loading a saved file or manually editing a slot",
    applyAllHint: "Colors update the panel live as you edit. Use this to resync after loading a file or manually editing slots. Corner radius is excluded — apply it separately below.",
    layout: "Layout",
    radius: "Radius",
    apply: "Apply",
    applyTip: "Apply this value to every matching slot",
    radiusApplyTip: "Push this radius to every colored-shape Image",
    radiusHintPre: "Manual only — does ",
    radiusHintNot: "not",
    radiusHintMid: " auto-apply. Click Apply to bulk-set ",
    radiusHintPost: " on every colored-shape Image (0 = square, 100 = pill). Skips photo/icon Images and overrides per-element radii.",
  },

  // ── Image library (LibraryMenu.tsx) ─────────────────────────────────────────
  library: {
    manageTip: "Manage uploaded images",
    libraryBtn: (n: number): string => `🖼 Library (${n})`,
    imageLibrary: "Image Library",
    imageCount: (n: number): string => `${n} image${n === 1 ? "" : "s"}`,
    uploading: "Uploading…",
    upload: "+ Upload",
    tabSystem: "System Images",
    tabManage: "Manage",
    tabCleanup: "Cleanup",
    footer: "Stored in your browser (IndexedDB). Survives reloads — wiped if you clear site data.",
    systemHintPre: "Bundled with every export — cannot be deleted. To use one, select a slot's Image in the Inspector, toggle the matching ",
    systemHintFlag: "Use … Icon",
    systemHintMid: " flag, and optionally set ",
    systemHintTint: "Icon Tint",
    systemHintPost: " to recolor it.",
    systemBadge: "sys",
    systemBadgeTip: "System icon — cannot be deleted",
    noImagesPre: "No images uploaded yet. Click ",
    noImagesPost: " to add one.",
    inUse: "in use",
    notInUse: "unused",
    thumbTip: (name: string, w: number, h: number, bytes: string, suffix: string): string =>
      `${name} · ${w}×${h} · ${bytes} · ${suffix}`,
    unused: "unused",
    deleteFromLibrary: "Delete from library",
    cleanupEmpty: "Library is empty — nothing to clean up.",
    allClear: "All clear",
    allClearSub: "Every uploaded image is referenced by something in the current document.",
    unrefCount: (n: number): string => `${n} unreferenced image${n === 1 ? "" : "s"}`,
    unrefSubPre: "Not used by any slot in the current document. Removing them frees ",
    unrefSubPost: ".",
    deleteUnrefBtn: (n: number, bytes: string): string => `Delete ${n} unreferenced · free ${bytes}`,
    deleteOneConfirm: "Delete this image from the library? Any slot using it will lose its reference.",
    deleteLabel: "Delete",
    deleteAllConfirm: (n: number, bytes: string): string =>
      `Delete ${n} unreferenced image${n === 1 ? "" : "s"} (${bytes})?\n\nThese aren't used by anything in the current document.`,
    deleteAllLabel: "Delete All",
    uploadFailed: (msg: string): string => `Upload failed: ${msg}`,
  },

  // ── Warnings menu + document warning messages (WarningsMenu / warnings.ts) ──
  warnings: {
    issues: "Issues",
    warningCount: (n: number): string => `${n} warning${n === 1 ? "" : "s"}`,
    noteCount: (n: number): string => `${n} note${n === 1 ? "" : "s"}`,
    summary: (w: number, i: number): string =>
      `${w} warning${w === 1 ? "" : "s"}, ${i} note${i === 1 ? "" : "s"} — click to review`,
    exportNote: "Export still works — these are heads-ups, not blockers.",
    selectSlot: "Select this slot in the hierarchy",
    imageMissing: (hash: string): string =>
      `Custom image (${hash}…) is referenced but no longer in your library — slot will render as a blank tinted rect. Re-upload, pick a different image, or clear the reference.`,
    imageEmpty: "Image has no sprite, icon, or rounded shape — it will render as a solid tinted rectangle and may cover siblings beneath it.",
    textEmpty: "Text component has no content — nothing will render.",
    hyperlinkEmpty: "Hyperlink has no URL — clicking will show the confirmation but not open anything.",
    popupNoTrigger: "Popup needs a Button or BoxCollider on the same slot to be clickable. Add one via + Add.",
    offCanvas: (sides: string, px: number): string =>
      `Extends past the canvas ${sides} edge by ${px}px — will be clipped or invisible in Resonite.`,
    siblingsOverlap: (name: string): string =>
      `Overlaps "${name}" — one may visually cover the other. Move, resize, or change anchors to fix.`,
    sideLeft: "left",
    sideTop: "top",
    sideRight: "right",
    sideBottom: "bottom",
  },

  // ── What's New / patch notes (WhatsNew.tsx) ─────────────────────────────────
  whatsNew: {
    title: "What's new",
    patchNotes: "UIX Studio — Patch Notes",
    viewAll: "View all releases on GitHub ↗",
    close: "Close",
    loading: "Loading patch notes from GitHub…",
    rateLimit: "GitHub rate limit reached — try again in a little while.",
    returned: (status: number): string => `GitHub returned ${status}.`,
    cantReach: "Couldn't reach GitHub.",
    cantLoad: "Couldn't load patch notes",
    readOnGitHub: "Read them on GitHub instead ↗",
    noReleases: "No releases published yet.",
    checkGitHub: "Check GitHub ↗",
    youreHere: "You're here",
    preRelease: "pre-release",
  },

  // ── Image-placeholder editor overlay (render/renderSlot.tsx) ────────────────
  placeholder: {
    title: "Image Placeholder",
    sub: "Upload an image in the Inspector",
  },

  // ── Drag overlay (DragLayer.tsx) ────────────────────────────────────────────
  dragLayer: {
    pickElements: (n: number): string => `${n} elements here — pick one to edit`,
    notEnoughWidth: "⚠ Not enough width to fit side-by-side.",
    widenPanel: "⤢ Widen panel to fit",
    dismiss: "Dismiss",
    canvasSize: (w: number, h: number): string => `Canvas ${w}×${h}`,
    dragToResize: "drag handles to resize",
    inContainer: "In a container — drag the purple grip to reorder",
    thenInlineResize: "; drag handles to resize",
    thenInspectorResize: "; resize via Inspector",
  },

  // ── Shared dialogs ──────────────────────────────────────────────────────────
  dialogs: {
    deleteSlot: {
      message: (name: string): string => `Delete "${name}" and its children?`,
      messageSlot: (name: string): string => `Delete slot "${name}" and its children?`,
      confirmLabel: "Delete",
      unnamed: "this element",
    },
  },

  // ── DESIGNED PANEL CONTENT — baked into the starter template (template.ts) ──
  // These are the strings of the panel the user is designing, localized at
  // generation time. Slot NAMES are NOT here (they stay English identifiers).
  content: {
    iconPopupTitle: "About this panel",
    iconPopupBody:
      "Replace this with your panel's description. Edit the Popup component on the Icon slot to change the title and body.",
    iconPopupDismiss: "Got it",
    exampleTitle: "Example title",
    bodyText:
      "This is a multi-line text block. It wraps across lines so you can see how a paragraph of body copy flows inside the panel. Replace it with your own text.",
    enableFeature: "Enable feature",
    online: "Online",
    volume: "Volume",
    textLabel: "Text",
    floatLabel: "Float",
    integerLabel: "Integer",
    editMe: "Edit me",
    tabInputs: "Inputs",
    tabDisplay: "Display",
    tabOptions: "Options",
    brightness: "Brightness",
    contrast: "Contrast",
    saturation: "Saturation",
    gamma: "Gamma",
    upload: "Upload",
    download: "Download",
    battery: "Battery",
    theme: "Theme",
    themeOptions: "Dark\nLight\nAuto",
    notifications: "Notifications",
    autoSave: "Auto-save",
    mode: "Mode",
    auto: "Auto",
    on: "On",
    off: "Off",
    quality: "Quality",
    qualityOptions: "Low\nMedium\nHigh",
    resolution: "Resolution",
    format: "Format",
    progress: "Progress",
    reference: "Reference",
    colorPicker: "Color Picker",
    scrollArea: "Scroll Area",
    buttonA: "Button A",
    buttonB: "Button B",
  },
};

export type Dictionary = typeof en;
