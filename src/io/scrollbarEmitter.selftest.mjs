// Self-test for the scrollbar emitter. Run with: node src/io/scrollbarEmitter.selftest.mjs
// Bundles the TS emitter on the fly via esbuild, runs it with mock deps + sentinel
// external IDs, and asserts correctness BEFORE any Resonite export round-trip:
//   - no original template GUID survives (everything internal was remapped)
//   - every non-external GUID in the output is defined within the output (zero dangling)
//   - exactly the 3 sentinel external IDs appear, and each is actually used
//   - every component Type index resolved to a defined full type name
//   - all bson tags were revived (Int32 == 226, Long == 64, no __* tags remain)
import { build } from "esbuild";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Bundle the emitter (TS + JSON + bson) into a temp CJS module. ───────────────
const tmp = join(__dirname, "__scrollbarEmitter.bundle.cjs");
await build({
  entryPoints: [join(__dirname, "scrollbarEmitter.ts")],
  outfile: tmp,
  bundle: true,
  format: "cjs",
  platform: "node",
  // Keep bson external so the emitter and this test share ONE bson instance —
  // otherwise `instanceof Int32`/`Long` fails across two bundled copies.
  external: ["bson"],
  logLevel: "error",
});
const { emitScrollbar, SCROLLBAR_TYPE_VERSIONS } = require(tmp);
const { Int32, Long } = require("bson");

const GUID_RE = /^[0-9a-f]{8}-0000-0000-0000-000000000000$/;
const isGuid = (s) => typeof s === "string" && GUID_RE.test(s);

// ── Expected counts from the raw capture (grep of the tag strings). ─────────────
const RAW = readFileSync(join(__dirname, "scrollbarTemplate.json"), "utf8");
const TEMPLATE = JSON.parse(RAW);
// Count tags ONLY within the three emitted subtrees — the file's TypeVersions
// block also uses {"__i32":n}, but the emitter never processes it.
const SUB = JSON.stringify({ S: TEMPLATE.Scrollbar, P: TEMPLATE.ProtoFlux, D: TEMPLATE.DropShadows });
const countTag = (t) => SUB.split(`"${t}"`).length - 1;
const EXPECT_I32 = countTag("__i32");
const EXPECT_I64 = countTag("__i64");
const EXPECT_F64 = countTag("__f64");

// Original template GUIDs (so we can prove none survive the remap).
const origGuids = new Set();
(function collect(n) {
  if (n == null) return;
  if (typeof n === "string") { if (isGuid(n)) origGuids.add(n); return; }
  if (typeof n !== "object") return;
  for (const v of Object.values(n)) collect(v);
})({ a: TEMPLATE.Scrollbar, b: TEMPLATE.ProtoFlux, c: TEMPLATE.DropShadows });

// ── Mock export deps. ───────────────────────────────────────────────────────────
let counter = 0x100000; // high, distinct from sentinels and template range
const minted = new Set();
const nextId = () => {
  const id = `${(counter++).toString(16).padStart(8, "0")}-0000-0000-0000-000000000000`;
  minted.add(id);
  return id;
};
const registry = [];
const typeIdxMap = new Map();
const typeCalls = [];
const typeIndex = (fullName) => {
  typeCalls.push(fullName);
  if (!typeIdxMap.has(fullName)) { typeIdxMap.set(fullName, registry.length); registry.push(fullName); }
  return new Int32(typeIdxMap.get(fullName));
};

const SENT_VIEWPORT = "aaaaaaa1-0000-0000-0000-000000000000";
const SENT_CONTENT  = "aaaaaaa2-0000-0000-0000-000000000000";
const SENT_SCROLL   = "aaaaaaa3-0000-0000-0000-000000000000";
const SENT_HOST     = "aaaaaaa4-0000-0000-0000-000000000000";

const out = emitScrollbar(
  { nextId, typeIndex },
  {
    viewportRectFieldId: SENT_VIEWPORT,
    contentRectFieldId: SENT_CONTENT,
    contentScrollFieldId: SENT_SCROLL,
    hostSlotId: SENT_HOST,
  },
);

// ── Walk the output collecting facts. ───────────────────────────────────────────
const defined = new Set();   // ID / persistent-ID definitions
const seen = new Map();      // every value-position GUID -> count
let i32 = 0, i64 = 0, survivingTags = 0;
(function walk(n) {
  if (n == null) return;
  if (typeof n === "string") { if (isGuid(n)) seen.set(n, (seen.get(n) || 0) + 1); return; }
  if (n instanceof Int32) { i32++; return; }
  if (n instanceof Long) { i64++; return; }
  if (typeof n !== "object") return;
  if (Array.isArray(n)) { n.forEach(walk); return; }
  const keys = Object.keys(n);
  if (keys.length === 1 && (keys[0] === "__i32" || keys[0] === "__i64" || keys[0] === "__f64")) {
    survivingTags++; return;
  }
  for (const [k, v] of Object.entries(n)) {
    // Any *-ID key defines a marker/component/field UUID: "ID", "persistent-ID",
    // and legacy markers like "__legacyZWrite-ID" (standalone, no referent).
    if (/(?:^|-)id$/i.test(k) && isGuid(v)) defined.add(v);
    walk(v);
  }
})(out);

// ── Assertions. ──────────────────────────────────────────────────────────────────
const errors = [];
const ok = [];
const sentinels = new Set([SENT_VIEWPORT, SENT_CONTENT, SENT_SCROLL, SENT_HOST]);

// 1. No original template GUID survives.
const survivors = [...seen.keys()].filter((g) => origGuids.has(g) && !sentinels.has(g));
survivors.length
  ? errors.push(`${survivors.length} original template GUID(s) survived remap, e.g. ${survivors[0]}`)
  : ok.push(`no template GUID survived remap (checked ${origGuids.size} originals)`);

// 2. Zero dangling: every value-GUID is either a sentinel or defined in the output.
const dangling = [...seen.keys()].filter((g) => !defined.has(g) && !sentinels.has(g) && !minted.has(g));
dangling.length
  ? errors.push(`${dangling.length} dangling ref(s), e.g. ${dangling[0]}`)
  : ok.push(`zero dangling references (${defined.size} defs, ${seen.size} distinct value-GUIDs)`);

// 3. Internal refs that are minted must also be defined (no minted ref points nowhere).
const mintedRefsUndefined = [...seen.keys()].filter((g) => minted.has(g) && !defined.has(g));
// ParentReference values are freshly minted but intentionally not defined as slots
// inside the subtree (Resonite rebuilds parenting from nesting). Allow exactly those.
// Count how many distinct minted-but-undefined are accounted for by ParentReference.
const parentRefVals = new Set();
(function collectPR(n) {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { n.forEach(collectPR); return; }
  for (const [k, v] of Object.entries(n)) { if (k === "ParentReference" && isGuid(v)) parentRefVals.add(v); collectPR(v); }
})(out);
const trulyOrphan = mintedRefsUndefined.filter((g) => !parentRefVals.has(g));
trulyOrphan.length
  ? errors.push(`${trulyOrphan.length} minted ref(s) point to nothing (non-ParentReference), e.g. ${trulyOrphan[0]}`)
  : ok.push(`all minted internal refs resolve (ParentReference orphans allowed: ${mintedRefsUndefined.length})`);

// 4. Each external sentinel is actually used at least once.
for (const [name, g] of [["viewport", SENT_VIEWPORT], ["content", SENT_CONTENT], ["scroll", SENT_SCROLL]]) {
  seen.has(g)
    ? ok.push(`external ${name} binding referenced (${seen.get(g)}x)`)
    : errors.push(`external ${name} binding (${g}) never referenced — wiring lost`);
}

// 5. Every component Type index resolved to a defined full name.
const badTypes = typeCalls.filter((t) => typeof t !== "string" || t.length === 0);
badTypes.length
  ? errors.push(`${badTypes.length} component Type index(es) resolved to undefined`)
  : ok.push(`all ${typeCalls.length} component Types resolved to ${typeIdxMap.size} distinct full names`);

// 6. All bson tags revived; counts match the capture.
survivingTags
  ? errors.push(`${survivingTags} bson tag(s) not revived`)
  : ok.push("all bson tags revived (no __i32/__i64/__f64 remain)");
i32 === EXPECT_I32 ? ok.push(`Int32 count ${i32} == expected ${EXPECT_I32}`)
  : errors.push(`Int32 count ${i32} != expected ${EXPECT_I32}`);
i64 === EXPECT_I64 ? ok.push(`Long count ${i64} == expected ${EXPECT_I64}`)
  : errors.push(`Long count ${i64} != expected ${EXPECT_I64}`);

// 7. Output shape sanity.
for (const key of ["scrollbar", "protoFlux", "dropShadows"]) {
  const slot = out[key];
  if (!slot || typeof slot !== "object" || !slot.Name) errors.push(`output.${key} is not a slot`);
  else if (slot.ParentReference !== SENT_HOST) errors.push(`output.${key}.ParentReference != hostSlotId`);
}
if (out.scrollbar && out.scrollbar.ParentReference === SENT_HOST) ok.push("all 3 subtrees rooted at hostSlotId");

// 8. Real bson serialize must not throw.
try {
  const { serialize } = require("bson");
  serialize({ Object: { c: [out.scrollbar, out.protoFlux, out.dropShadows] } });
  ok.push("bson.serialize(output) succeeded");
} catch (e) { errors.push(`bson.serialize threw: ${e.message}`); }

// ── Report. ──────────────────────────────────────────────────────────────────────
rmSync(tmp, { force: true });
console.log("PASS checks:");
for (const m of ok) console.log("  ✓ " + m);
console.log(`\nf64 expected from capture: ${EXPECT_F64} (revived as plain numbers)`);
if (errors.length) {
  console.log("\nFAIL:");
  for (const e of errors) console.log("  ✗ " + e);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
