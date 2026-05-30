import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useDismissable } from "./useDismissable";
import {
  addImageFile,
  deleteImage,
  listImages,
  subscribeImageStore,
  type StoredImage,
} from "../io/imageStore";
import { useCustomImageUrl } from "./useCustomImageUrl";
import { collectCustomImageHashes } from "../io/exportBrson";
import { SYSTEM_ICONS } from "../model/systemIcons";

type Tab = "system" | "manage" | "cleanup";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LibraryMenu() {
  const root = useStore((s) => s.root);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("manage");
  const [images, setImages] = useState<StoredImage[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      listImages().then((all) => {
        if (!cancelled) setImages(all.sort((a, b) => b.addedAt - a.addedAt));
      });
    }
    refresh();
    const unsub = subscribeImageStore(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, ref);

  const referenced = useMemo(() => new Set(collectCustomImageHashes(root)), [root]);
  const unreferenced = useMemo(
    () => images.filter((img) => !referenced.has(img.hash)),
    [images, referenced],
  );
  const unrefBytes = unreferenced.reduce((sum, i) => sum + i.bytes.length, 0);
  const totalBytes = images.reduce((sum, i) => sum + i.bytes.length, 0);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await addImageFile(file);
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(hash: string) {
    if (!confirm("Delete this image from the library? Any slot using it will lose its reference.")) return;
    await deleteImage(hash);
  }

  async function deleteUnreferenced() {
    if (unreferenced.length === 0) return;
    const msg =
      `Delete ${unreferenced.length} unreferenced image${unreferenced.length === 1 ? "" : "s"} (${formatBytes(unrefBytes)})?\n\n` +
      `These aren't used by anything in the current document.`;
    if (!confirm(msg)) return;
    for (const img of unreferenced) await deleteImage(img.hash);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Manage uploaded images"
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 transition hover:border-sky-500 hover:text-sky-200"
      >
        🖼 Library ({images.length})
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-80 rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Image Library
            </div>
            <div className="mt-0.5 text-slate-300">
              {images.length} image{images.length === 1 ? "" : "s"}
              <span className="text-slate-600"> · </span>
              <span className="text-slate-400">{formatBytes(totalBytes)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 border-b border-slate-800 px-2 py-2">
            {tab !== "system" ? (
              <button
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded border border-sky-500 bg-sky-600 px-2 py-1 text-xs text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                {busy ? "Uploading…" : "+ Upload"}
              </button>
            ) : (
              // Preserve the row's width so tab buttons don't reflow when the
              // upload button is hidden on the System tab.
              <div className="flex-1" />
            )}
            <TabBtn active={tab === "system"} onClick={() => setTab("system")}>
              System Images
            </TabBtn>
            <TabBtn active={tab === "manage"} onClick={() => setTab("manage")}>
              Manage
            </TabBtn>
            <TabBtn active={tab === "cleanup"} onClick={() => setTab("cleanup")}>
              Cleanup
            </TabBtn>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onUpload}
            />
          </div>

          {tab === "system" && <SystemTab />}
          {tab === "manage" && (
            <ManageTab
              images={images}
              referenced={referenced}
              onDelete={deleteOne}
            />
          )}
          {tab === "cleanup" && (
            <CleanupTab
              unreferenced={unreferenced}
              unrefBytes={unrefBytes}
              totalImages={images.length}
              onClean={deleteUnreferenced}
            />
          )}

          <div className="border-t border-slate-800 px-3 py-2 text-[10px] leading-snug text-slate-500">
            Stored in your browser (IndexedDB). Survives reloads — wiped if you
            clear site data.
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-1 text-xs transition ${
        active
          ? "border-sky-500 bg-sky-500/15 text-sky-200"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

// Read-only thumbnails for the bundled system icons. These ship with every
// export so they can't be deleted from the user's "library" in any meaningful
// sense — listing them here just helps users discover what's available.
function SystemTab() {
  return (
    <div className="max-h-[50vh] overflow-y-auto p-2">
      <div className="mb-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5 text-[10px] leading-snug text-slate-400">
        Bundled with every export — cannot be deleted. To use one, select a slot's Image
        in the Inspector, toggle the matching <span className="text-slate-200">Use … Icon</span> flag,
        and optionally set <span className="text-slate-200">Icon Tint</span> to recolor it.
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {SYSTEM_ICONS.map((icon) => (
          <div
            key={icon.flag}
            className="group relative flex flex-col items-center gap-1 rounded border border-slate-700 bg-slate-950 p-1.5"
            title={`${icon.description}\n\nFlag: ${icon.flag}`}
          >
            <div className="h-12 w-full overflow-hidden rounded bg-checker flex items-center justify-center">
              <img
                src={icon.url}
                alt={icon.name}
                draggable={false}
                className="h-full w-full object-contain"
              />
            </div>
            <span className="truncate w-full text-center text-[10px] text-slate-300">
              {icon.name}
            </span>
            <span
              className="absolute right-0.5 top-0.5 rounded bg-slate-800 px-1 text-[8px] uppercase tracking-wider text-slate-500"
              title="System icon — cannot be deleted"
            >
              sys
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManageTab({
  images,
  referenced,
  onDelete,
}: {
  images: StoredImage[];
  referenced: Set<string>;
  onDelete: (hash: string) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-slate-500">
        No images uploaded yet. Click <span className="text-slate-300">+ Upload</span> to add one.
      </div>
    );
  }
  return (
    <div className="max-h-[50vh] overflow-y-auto p-2">
      <div className="grid grid-cols-4 gap-1">
        {images.map((img) => (
          <ManageThumb
            key={img.hash}
            image={img}
            used={referenced.has(img.hash)}
            onDelete={() => onDelete(img.hash)}
          />
        ))}
      </div>
    </div>
  );
}

function ManageThumb({
  image,
  used,
  onDelete,
}: {
  image: StoredImage;
  used: boolean;
  onDelete: () => void;
}) {
  const url = useCustomImageUrl(image.hash);
  return (
    <div className="group relative">
      <div
        title={`${image.name} · ${image.width}×${image.height} · ${formatBytes(image.bytes.length)}${used ? " · in use" : " · unused"}`}
        className={`relative h-16 w-full overflow-hidden rounded border ${
          // Checker bg behind loaded images so transparent regions don't
          // read as "the image will sit on dark slate in Resonite".
          url ? "bg-checker" : "bg-slate-950"
        } ${used ? "border-slate-700" : "border-amber-500/40"}`}
      >
        {url ? (
          <img
            src={url}
            alt={image.name}
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-600">
            …
          </div>
        )}
        {!used && (
          <span className="absolute left-0.5 top-0.5 rounded bg-amber-500/80 px-1 text-[9px] font-semibold text-slate-900">
            unused
          </span>
        )}
      </div>
      <button
        onClick={onDelete}
        title="Delete from library"
        className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded bg-rose-600/90 text-[10px] text-white group-hover:flex hover:bg-rose-500"
      >
        ✕
      </button>
    </div>
  );
}

function CleanupTab({
  unreferenced,
  unrefBytes,
  totalImages,
  onClean,
}: {
  unreferenced: StoredImage[];
  unrefBytes: number;
  totalImages: number;
  onClean: () => void;
}) {
  if (totalImages === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-slate-500">
        Library is empty — nothing to clean up.
      </div>
    );
  }
  if (unreferenced.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-slate-400">
        <div className="text-slate-300">All clear</div>
        <div className="mt-1 text-slate-500">
          Every uploaded image is referenced by something in the current document.
        </div>
      </div>
    );
  }
  return (
    <div className="px-3 py-3">
      <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-2">
        <div className="text-amber-200">
          {unreferenced.length} unreferenced image{unreferenced.length === 1 ? "" : "s"}
        </div>
        <div className="mt-0.5 text-[10px] text-amber-100/80">
          Not used by any slot in the current document. Removing them frees{" "}
          <span className="font-semibold">{formatBytes(unrefBytes)}</span>.
        </div>
      </div>
      <div className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-800 bg-slate-950/40">
        {unreferenced.map((img) => (
          <div
            key={img.hash}
            className="flex items-center justify-between gap-2 border-b border-slate-800 px-2 py-1 last:border-b-0"
          >
            <span className="truncate text-[10px] text-slate-300" title={img.name}>
              {img.name}
            </span>
            <span className="flex-shrink-0 text-[10px] text-slate-500">
              {formatBytes(img.bytes.length)}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onClean}
        className="mt-2 w-full rounded border border-rose-500 bg-rose-600 px-2 py-1 text-xs text-white transition hover:bg-rose-500"
      >
        Delete {unreferenced.length} unreferenced · free {formatBytes(unrefBytes)}
      </button>
    </div>
  );
}
