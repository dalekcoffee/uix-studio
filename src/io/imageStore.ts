// IndexedDB-backed store of user-uploaded image bytes. Keyed by the SHA-256
// of the file bytes — same hash we use to address the asset inside the
// .resonitepackage zip (Assets/<hash>) and inside Resonite (@packdb:///<hash>).
//
// Why IndexedDB and not LocalStorage: image bytes are binary and large.
// LocalStorage only holds ~5 MB of strings; IndexedDB easily holds hundreds
// of MB of Uint8Array directly.

const DB_NAME = "uixstudio";
const DB_VERSION = 1;
const STORE = "images";

export interface StoredImage {
  hash: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  addedAt: number;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "hash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });
}

// Notify listeners (Inspector library, etc.) whenever the store changes.
const _listeners = new Set<() => void>();
export function subscribeImageStore(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function notify() {
  for (const fn of _listeners) fn();
}

/**
 * Add a user-selected file to the store. Returns the stored record.
 * If a file with the same hash already exists, returns the existing one.
 */
export async function addImageFile(file: File): Promise<StoredImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const existing = await getImage(hash);
  if (existing) return existing;

  let width = 0;
  let height = 0;
  try {
    const dims = await getDimensions(file);
    width = dims.width;
    height = dims.height;
  } catch {
    // Not strictly required — Resonite re-derives dimensions on import.
  }

  const stored: StoredImage = {
    hash,
    name: file.name,
    mime: file.type || "image/png",
    bytes,
    width,
    height,
    addedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
  return stored;
}

/**
 * Add a bundled app icon (served from publicDir) to the store by fetching its
 * URL. Same storage/hashing as an upload, so it bundles into the export through
 * the normal customImageHash path. Idempotent by content hash.
 */
export async function addImageFromUrl(url: string, name: string): Promise<StoredImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const existing = await getImage(hash);
  if (existing) return existing;

  let width = 0;
  let height = 0;
  try {
    const dims = await getDimensions(blob);
    width = dims.width;
    height = dims.height;
  } catch {
    /* dimensions are best-effort; Resonite re-derives them on import */
  }

  const stored: StoredImage = {
    hash,
    name,
    mime: blob.type || "image/png",
    bytes,
    width,
    height,
    addedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
  return stored;
}

export async function getImage(hash: string): Promise<StoredImage | null> {
  if (!hash) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(hash);
    req.onsuccess = () => resolve((req.result as StoredImage | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listImages(): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(hash: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
}

// In-memory cache of blob URLs keyed by hash. We never revoke these because
// React renderers re-resolve the URL synchronously per render; a stable URL
// avoids flicker. Refresh happens implicitly when the page reloads.
const _urlCache = new Map<string, string>();

export async function getImageUrl(hash: string): Promise<string | null> {
  if (!hash) return null;
  const cached = _urlCache.get(hash);
  if (cached) return cached;
  const stored = await getImage(hash);
  if (!stored) return null;
  const blob = new Blob([stored.bytes as BlobPart], { type: stored.mime });
  const url = URL.createObjectURL(blob);
  _urlCache.set(hash, url);
  return url;
}
