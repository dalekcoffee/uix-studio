import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { addImageFile } from "../io/imageStore";
import { useCustomImageUrl } from "./useCustomImageUrl";
import { useDialog } from "./useDialog";

// Branding menu — owns the panel's back-side identity:
//   • Logo image (overrides the default UIX Studio logo on the rear of the panel)
//   • Click hyperlink URL (where the rear logo sends users when clicked)
//   • Confirmation reason (text shown in Resonite's confirm dialog)
// All three live on the theme object so they persist with the document and
// can be edited without leaving this menu.

export default function BrandingMenu({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const applyBranding = useStore((s) => s.applyBranding);

  // Resolve the custom logo hash to a blob URL for preview (re-resolves on
  // upload via the image-store subscription inside the hook).
  const dialog = useDialog();
  const imageUrl = useCustomImageUrl(theme.backLogoImageHash);
  // Transient "Saved!" state for the Apply button. Clicking apply flips this
  // to true; a setTimeout reverts after ~1.4s so the button visibly confirms
  // the action landed (otherwise nothing seems to happen and the user clicks
  // again, doubling commits to undo history).
  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
  }, []);


  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const stored = await addImageFile(file);
      setTheme({ backLogoImageHash: stored.hash });
    } catch (err) {
      await dialog.alert(`Failed to upload image: ${(err as Error).message}`);
    }
  }

  function clearLogoImage() {
    setTheme({ backLogoImageHash: "" });
  }

  return (
    <div
      className="w-[340px] max-h-[80vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">Branding</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200"
          title="Close"
        >
          ✕
        </button>
      </div>

      <Section title="Back Logo Image">
        <div className="flex items-start gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded border border-slate-700 bg-checker flex items-center justify-center">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Back logo"
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              // No custom image set — show the bundled UIX Studio logo that
              // will actually ship on the back of the panel. The PNG at
              // ./UIX%20Studio.png is byte-identical to the bundled back-logo
              // sprite (same SHA-256), so this preview matches reality.
              <img
                src="./UIX%20Studio.png"
                alt="UIX Studio (default back logo)"
                className="h-full w-full object-contain"
                draggable={false}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPickFile}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 transition hover:border-sky-500/60 hover:bg-slate-700"
            >
              Upload image…
            </button>
            {theme.backLogoImageHash && (
              <button
                onClick={clearLogoImage}
                className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-slate-400 transition hover:text-rose-300"
              >
                Reset to default
              </button>
            )}
            <p className="text-[10px] text-slate-500">
              Replaces the UIX Studio logo on the rear of the panel. PNG / JPG / WebP.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Click Hyperlink">
        <label className="block text-[10px] text-slate-400">URL</label>
        <input
          type="text"
          value={theme.backLogoUrl}
          onChange={(e) => setTheme({ backLogoUrl: e.target.value })}
          placeholder="https://…"
          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 placeholder-slate-500"
        />
        <label className="mt-1.5 block text-[10px] text-slate-400">Reason</label>
        <input
          type="text"
          value={theme.backLogoReason}
          onChange={(e) => setTheme({ backLogoReason: e.target.value })}
          placeholder="Confirmation dialog text…"
          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 placeholder-slate-500"
        />
        <p className="mt-1.5 text-[10px] text-slate-500">
          Shown in Resonite's confirmation dialog when a user clicks the rear logo.
        </p>
      </Section>

      <div className="mt-2 border-t border-slate-700 pt-2">
        <button
          onClick={() => {
            applyBranding();
            setJustSaved(true);
            if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
            savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 1400);
          }}
          className={`w-full rounded border px-3 py-1.5 text-xs font-semibold text-white ${
            justSaved
              ? "border-emerald-500 bg-emerald-600"
              : "border-sky-500 bg-sky-600 transition hover:bg-sky-500"
          }`}
          title="Push image, URL, and reason to the Canvas component"
        >
          {justSaved ? "✓ Saved!" : "Apply Branding"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 border-t border-slate-800 pt-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
