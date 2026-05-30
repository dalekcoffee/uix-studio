import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useStore } from "../../state/store";
import {
  addImageFile,
  addImageFromUrl,
  deleteImage,
  getImageUrl,
  listImages,
  subscribeImageStore,
  type StoredImage,
} from "../../io/imageStore";
import { SYSTEM_ICON_FLAGS } from "../../model/systemIcons";
import { UI_ICONS } from "../../model/uiIcons";
import type { UixComponentType } from "../../model/types";

export function CustomImagePicker({
  slotId,
  currentHash,
  componentType = "Image",
  propKey = "customImageHash",
  label = "Custom Image",
  systemImageUrl,
  systemImageLabel = "system image",
  imageProps,
  onHashChange,
}: {
  slotId: string;
  currentHash: string;
  /** Which component on the slot owns this image hash (Image by default; Canvas for the back logo). */
  componentType?: string;
  /** Prop key holding the SHA-256 hash on the chosen component. */
  propKey?: string;
  /** Section heading shown in the inspector. */
  label?: string;
  /** Default placeholder image shown in the preview when no custom image is
   * set. Communicates what the exporter will use as the bundled default. */
  systemImageUrl?: string;
  /** Label shown over the placeholder preview so the user understands it's
   * the system-provided default, not their upload. */
  systemImageLabel?: string;
  /** The owning Image component's props — enables the System Images section
   * (only passed for Image components, not the Canvas back-logo picker). */
  imageProps?: Record<string, unknown>;
  /** When provided, upload / library-pick / clear call this with the new hash
   * INSTEAD of writing the slot prop directly. Used by the Background picker to
   * cascade one image onto both the Front Backing and Back Cover surfaces. */
  onHashChange?: (hash: string) => void;
}) {
  const setProp = useStore((s) => s.setProp);
  const setProps = useStore((s) => s.setProps);
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    if (!currentHash) {
      setPreviewUrl(null);
      return;
    }
    getImageUrl(currentHash).then((u) => {
      if (!cancelled) setPreviewUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [currentHash]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const stored = await addImageFile(file);
      if (onHashChange) {
        onHashChange(stored.hash);
      } else {
        setProp(slotId, componentType as UixComponentType, propKey, stored.hash);
        // PreserveAspect only applies to Image components. Skip for Canvas etc.
        if (componentType === "Image") setProp(slotId, componentType as UixComponentType, "preserveAspect", true);
      }
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function clearImage() {
    if (onHashChange) {
      onHashChange("");
      return;
    }
    setProp(slotId, componentType as UixComponentType, propKey, "");
  }

  function pick(hash: string) {
    if (onHashChange) {
      onHashChange(hash);
      setShowLibrary(false);
      return;
    }
    // Picking a custom upload clears any active system-icon flag so the two
    // selection mechanisms stay mutually exclusive (matches exporter precedence).
    const clearFlags: [string, unknown][] = SYSTEM_ICON_FLAGS.map((f) => [f, false]);
    setProps(slotId, componentType as UixComponentType, [
      [propKey, hash],
      ...(componentType === "Image" ? [["preserveAspect", true] as [string, unknown], ...clearFlags] : []),
    ]);
    setShowLibrary(false);
  }

  // Pick a bundled UI icon: lazily fetch it into the image store (idempotent),
  // then select it via the normal customImageHash path (which also clears any
  // legacy system-icon flags) so it bundles into the export like any image.
  async function pickUiIcon(iconUrl: string, iconName: string) {
    setBusy(true);
    try {
      const stored = await addImageFromUrl(iconUrl, iconName);
      pick(stored.hash);
    } catch (err) {
      alert(`Couldn't load icon: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const showSystemIcons = componentType === "Image" && !!imageProps;
  // A legacy preset may still drive an icon via a boolean flag; surface a clear
  // affordance for that case.
  const activeSystemFlag = showSystemIcons
    ? SYSTEM_ICON_FLAGS.find((f) => imageProps![f] === true) ?? null
    : null;

  const currentInfo = images.find((i) => i.hash === currentHash);

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {label}
        </span>
        {currentHash && (
          <button
            onClick={clearImage}
            className="text-[10px] text-slate-500 hover:text-rose-300"
            title="Remove custom image"
          >
            clear
          </button>
        )}
      </div>

      <div className="flex items-start gap-2">
        <div
          className={`relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 text-[10px] text-slate-600 ${
            // Checker fill when an image is loaded so transparent regions
            // read as transparent (not as a misleading dark "background
            // it'll sit on in Resonite"). Plain slate when empty so the
            // placeholder still feels solid.
            previewUrl || systemImageUrl ? "bg-checker" : "bg-slate-950"
          }`}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain"
            />
          )}
          {!previewUrl && systemImageUrl && (
            <>
              <img
                src={systemImageUrl}
                alt=""
                draggable={false}
                className="h-full w-full object-contain opacity-70"
              />
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 bg-slate-900/80 text-center text-[9px] uppercase tracking-wide text-slate-300"
                style={{ paddingTop: 1, paddingBottom: 1 }}
              >
                {systemImageLabel}
              </div>
            </>
          )}
          {!previewUrl && !systemImageUrl && "no image"}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded border border-sky-500 bg-sky-600 px-2 py-1 text-xs text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "Uploading…" : currentHash ? "Replace" : "Upload Image"}
          </button>
          <button
            onClick={() => setShowLibrary((v) => !v)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            {showLibrary ? "Hide Library" : `Library (${images.length})`}
          </button>
          {currentInfo && (
            <div className="truncate text-[10px] text-slate-500" title={currentInfo.name}>
              {currentInfo.name} · {currentInfo.width}×{currentInfo.height}
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {showLibrary && (
        <ImageLibrary
          images={images}
          currentHash={currentHash}
          onPick={pick}
          onDelete={async (h) => {
            if (!confirm("Delete this image from the library? Any slot using it will lose its reference.")) return;
            await deleteImage(h);
          }}
        />
      )}

      {showSystemIcons && (
        <div className="rounded border border-slate-700 bg-slate-950/40 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              System Images
            </span>
            {activeSystemFlag && (
              <button
                onClick={() => setProp(slotId, "Image", activeSystemFlag, false)}
                className="text-[10px] text-slate-500 hover:text-rose-300"
                title="Clear the selected system icon"
              >
                clear
              </button>
            )}
          </div>
          <div className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
            {UI_ICONS.map((icon) => (
              <button
                key={icon.url}
                disabled={busy}
                onClick={() => pickUiIcon(icon.url, icon.name)}
                title={icon.name}
                className="group relative flex flex-col items-center gap-1 rounded border border-slate-700 bg-slate-950 p-1.5 transition hover:border-slate-500 disabled:opacity-50"
              >
                <div className="flex h-10 w-full items-center justify-center overflow-hidden rounded bg-checker">
                  <img
                    src={icon.url}
                    alt={icon.name}
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] text-slate-300">
                  {icon.name}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] leading-snug text-slate-500">
            Bundled into the export when used. Set <span className="text-slate-300">Icon Tint</span> below to recolor.
          </div>
        </div>
      )}

      <div className="text-[10px] leading-snug text-slate-500">
        Stored in your browser. Bundled into the .resonitepackage on export — no
        external hosting needed.
      </div>
    </div>
  );
}

function ImageLibrary({
  images,
  currentHash,
  onPick,
  onDelete,
}: {
  images: StoredImage[];
  currentHash: string;
  onPick: (hash: string) => void;
  onDelete: (hash: string) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-700 p-2 text-center text-[10px] text-slate-500">
        Your image library is empty. Upload one above to get started.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-1">
      {images.map((img) => (
        <LibraryThumb
          key={img.hash}
          image={img}
          selected={img.hash === currentHash}
          onPick={() => onPick(img.hash)}
          onDelete={() => onDelete(img.hash)}
        />
      ))}
    </div>
  );
}

function LibraryThumb({
  image,
  selected,
  onPick,
  onDelete,
}: {
  image: StoredImage;
  selected: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getImageUrl(image.hash).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [image.hash]);
  return (
    <div
      className={`group relative aspect-square cursor-pointer rounded border ${
        selected ? "border-sky-500 ring-1 ring-sky-500/50" : "border-slate-700 hover:border-slate-500"
      }`}
      style={
        url
          ? {
              backgroundImage: `url(${url})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundColor: "#111",
            }
          : { backgroundColor: "#111" }
      }
      onClick={onPick}
      title={`${image.name} · ${image.width}×${image.height}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-0 top-0 hidden rounded-bl bg-rose-600 px-1 text-[10px] text-white group-hover:block"
        title="Delete from library"
      >
        ✕
      </button>
    </div>
  );
}
