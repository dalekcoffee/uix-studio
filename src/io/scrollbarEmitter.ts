// Emits a live, scroll-position-driven scrollbar (UIX.Slider<float> + a 55-node
// ProtoFlux graph + top/bottom drop-shadow fades) by cloning a subtree captured
// verbatim from a real Resonite save (UIX Template/UIX Scroll Bar). The capture
// lives in scrollbarTemplate.json with bson types preserved as tagged objects
// ({"__i32"}/{"__i64"}/{"__f64"}) and a local type registry.
//
// Why a captured subtree instead of hand-building: the working scrollbar is ~1,400
// internal IDs across 55 ProtoFlux nodes — far too much to author by hand and keep
// correct. Cloning + remapping is mechanical and self-testable (see scrollbarEmitter.test).
//
// The subtree hooks into the rest of the panel at exactly THREE external read points
// (everything else is self-contained), all GlobalReference targets in ProtoFlux:
//   - viewport RectTransformComputedProperties.LocalComputeRect  (IValue<Rect>)
//   - Content  RectTransformComputedProperties.LocalComputeRect  (IValue<Rect>)
//   - Content  ScrollRect.NormalizedPosition                     (IValue<float2>)
// The caller emits those components, captures the field IDs, and passes them in.
import { Int32, Long } from "bson";
import templateRaw from "./scrollbarTemplate.json";

// ── The captured template ──────────────────────────────────────────────────────
interface ScrollbarTemplate {
  Scrollbar: Record<string, unknown>;
  ProtoFlux: Record<string, unknown>;
  DropShadows: Record<string, unknown>;
  Types: string[];
  TypeVersions: Record<string, unknown>;
}
const TEMPLATE = templateRaw as unknown as ScrollbarTemplate;

// The three external GUIDs as they appear in the captured subtree. Resolved
// against the source save (UIX Scroll Bar/_decoded.json): see CLAUDE.md.
const EXT_VIEWPORT_RECT  = "000000d1-0000-0000-0000-000000000000"; // viewport RTCP.LocalComputeRect
const EXT_CONTENT_RECT   = "000000f7-0000-0000-0000-000000000000"; // Content  RTCP.LocalComputeRect
const EXT_CONTENT_SCROLL = "00000105-0000-0000-0000-000000000000"; // Content  ScrollRect.NormalizedPosition

const GUID_RE = /^[0-9a-f]{8}-0000-0000-0000-000000000000$/;
const isGuid = (s: unknown): s is string => typeof s === "string" && GUID_RE.test(s);

// Tagged-bson detector helpers — the capture stores Int32/Long/Double as
// single-key objects so plain JSON can round-trip without losing the type.
function bsonTag(o: unknown): "i32" | "i64" | "f64" | null {
  if (o == null || typeof o !== "object" || Array.isArray(o)) return null;
  const keys = Object.keys(o);
  if (keys.length !== 1) return null;
  if (keys[0] === "__i32") return "i32";
  if (keys[0] === "__i64") return "i64";
  if (keys[0] === "__f64") return "f64";
  return null;
}

export interface ScrollbarEmitterDeps {
  /** The export's shared sequential-ID allocator. */
  nextId: () => string;
  /** The export's type registrar — accepts a FULL type name and returns its Int32 index. */
  typeIndex: (fullTypeName: string) => Int32;
}

export interface ScrollbarExternalBindings {
  /** Field ID of the viewport (host) RectTransformComputedProperties.LocalComputeRect. */
  viewportRectFieldId: string;
  /** Field ID of the Content RectTransformComputedProperties.LocalComputeRect. */
  contentRectFieldId: string;
  /** Field ID of the Content ScrollRect.NormalizedPosition. */
  contentScrollFieldId: string;
  /** Slot the three emitted subtrees attach under (used to set their ParentReference). */
  hostSlotId: string;
}

export interface EmittedScrollbar {
  /** "Scrollbar" slot — the visible Slider<float> + handle. Caller pins it to the edge. */
  scrollbar: Record<string, unknown>;
  /** "ProtoFlux" wrapper slot — the 55-node graph that drives the handle. Logic only. */
  protoFlux: Record<string, unknown>;
  /** "Drop Shadows" slot — top/bottom gradient fades over the viewport. Self-contained. */
  dropShadows: Record<string, unknown>;
}

/** Type versions the scrollbar subtree needs that the main exporter may not already register. */
export const SCROLLBAR_TYPE_VERSIONS: Record<string, number> = Object.fromEntries(
  Object.entries(TEMPLATE.TypeVersions).map(([k, v]) => [k, (v as { __i32: number }).__i32]),
);

// Collect every counter-pattern GUID that appears anywhere in the given subtrees,
// regardless of whether it's a definition or a reference.
function collectGuids(node: unknown, out: Set<string>): void {
  if (node == null) return;
  if (typeof node === "string") { if (isGuid(node)) out.add(node); return; }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) { for (const v of node) collectGuids(v, out); return; }
  for (const v of Object.values(node)) collectGuids(v, out);
}

// Deep transform: remap GUIDs via `map`, revive bson tags, and remap component
// Type indices (`{Type:{__i32:localIdx}, Data:{ID:...}}`) into the export registry.
function transform(
  node: unknown,
  map: Map<string, string>,
  localTypes: string[],
  typeIndex: (n: string) => Int32,
): unknown {
  if (typeof node === "string") return map.get(node) ?? node;
  if (node == null || typeof node !== "object") return node;

  const tag = bsonTag(node);
  if (tag) {
    const v = (node as Record<string, number>)[`__${tag}`];
    if (tag === "i32") return new Int32(v);
    if (tag === "i64") return Long.fromNumber(v);
    return v; // f64 → plain JS number serializes as BSON double
  }

  if (Array.isArray(node)) {
    return node.map((v) => transform(v, map, localTypes, typeIndex));
  }

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  // Component signature: { Type:{__i32:idx}, Data:{ID, ...} }. Remap the local
  // type index into the export's registry by full type name BEFORE the generic
  // i32 revival would turn it into a meaningless Int32 of the local index.
  const isComponent =
    bsonTag(obj.Type) === "i32" &&
    obj.Data != null && typeof obj.Data === "object" && !Array.isArray(obj.Data) &&
    "ID" in (obj.Data as Record<string, unknown>);
  for (const [k, v] of Object.entries(obj)) {
    if (isComponent && k === "Type") {
      const localIdx = (v as { __i32: number }).__i32;
      const fullName = localTypes[localIdx];
      out.Type = typeIndex(fullName);
    } else {
      out[k] = transform(v, map, localTypes, typeIndex);
    }
  }
  return out;
}

/**
 * Clone the captured scrollbar subtree, remap all internal IDs to fresh sequential
 * ones from the export's allocator, revive bson types, remap type indices into the
 * export's registry, and bind the three external read points to caller-supplied IDs.
 */
export function emitScrollbar(
  deps: ScrollbarEmitterDeps,
  bindings: ScrollbarExternalBindings,
): EmittedScrollbar {
  const subtrees = {
    scrollbar: TEMPLATE.Scrollbar,
    protoFlux: TEMPLATE.ProtoFlux,
    dropShadows: TEMPLATE.DropShadows,
  };

  // Build the GUID remap. Externals point at the provided binding field IDs;
  // every other counter-pattern GUID (internal defs, refs, ParentReferences,
  // legacy markers) gets a fresh unique ID. Consistent old→new means internal
  // wiring is preserved automatically.
  const externals = new Map<string, string>([
    [EXT_VIEWPORT_RECT, bindings.viewportRectFieldId],
    [EXT_CONTENT_RECT, bindings.contentRectFieldId],
    [EXT_CONTENT_SCROLL, bindings.contentScrollFieldId],
  ]);
  const allGuids = new Set<string>();
  collectGuids(subtrees, allGuids);
  const map = new Map<string, string>();
  for (const g of allGuids) {
    map.set(g, externals.get(g) ?? deps.nextId());
  }

  const localTypes = TEMPLATE.Types;
  const out = transform(subtrees, map, localTypes, deps.typeIndex) as {
    scrollbar: Record<string, unknown>;
    protoFlux: Record<string, unknown>;
    dropShadows: Record<string, unknown>;
  };

  // Resonite rebuilds parenting from nesting, but set a sane ParentReference on
  // each spliced root so the import has a correct parent hint.
  out.scrollbar.ParentReference = bindings.hostSlotId;
  out.protoFlux.ParentReference = bindings.hostSlotId;
  out.dropShadows.ParentReference = bindings.hostSlotId;

  return out;
}
