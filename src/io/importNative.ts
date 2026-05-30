import type { UixDocument, Slot } from "../model/types";
import { normalizeTheme } from "../model/theme";
import { migrateLegacyImageProps } from "../model/components";

export async function importNativeFile(file: File): Promise<UixDocument> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("File is not valid JSON.");
  }
  return parseDocument(parsed);
}

export function parseDocument(value: unknown): UixDocument {
  if (typeof value !== "object" || value === null) {
    throw new Error("Document must be an object.");
  }
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) {
    throw new Error(
      `Unsupported schemaVersion ${String(v.schemaVersion)} (expected 1).`,
    );
  }
  if (!v.root || typeof v.root !== "object") {
    throw new Error("Document is missing 'root' slot.");
  }
  return {
    schemaVersion: 1,
    appVersion: typeof v.appVersion === "string" ? v.appVersion : "unknown",
    root: validateSlot(v.root),
    theme: normalizeTheme(v.theme),
  };
}

function validateSlot(value: unknown): Slot {
  if (typeof value !== "object" || value === null) {
    throw new Error("Slot must be an object.");
  }
  const s = value as Record<string, unknown>;
  if (typeof s.id !== "string") throw new Error("Slot missing 'id'.");
  if (typeof s.name !== "string") throw new Error("Slot missing 'name'.");
  if (!Array.isArray(s.components)) throw new Error("Slot.components must be array.");
  if (!Array.isArray(s.children)) throw new Error("Slot.children must be array.");
  return {
    id: s.id,
    name: s.name,
    components: s.components.map((c) => {
      if (typeof c !== "object" || c === null) throw new Error("Bad component.");
      const cc = c as Record<string, unknown>;
      if (typeof cc.type !== "string") throw new Error("Component missing 'type'.");
      const props = (cc.props as Record<string, unknown>) ?? {};
      if (cc.type === "Image") migrateLegacyImageProps(props);
      return {
        type: cc.type as Slot["components"][number]["type"],
        props,
      };
    }),
    children: s.children.map(validateSlot),
  };
}
