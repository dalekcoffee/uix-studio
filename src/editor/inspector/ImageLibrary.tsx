import { useEffect, useState } from "react";
import { getImageUrl, type StoredImage } from "../../io/imageStore";

// The uploaded-image library grid, shared by every surface that picks an image:
// the Inspector's ImagePicker and the Branding menu's back-logo slot. Extracted
// so a second picker doesn't mean a second copy of the thumbnail behaviour (and
// so each stays a component-only module for Fast Refresh).

export function ImageLibrary({
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
