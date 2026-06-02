import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import BrandingMenu from "./BrandingMenu";
import ThemeMenu from "./ThemeMenu";
import BackgroundMenu from "./BackgroundMenu";
import { useT } from "../locale/useT";

// Sticky footer at the bottom of the Hierarchy sidebar. Hosts two stacked
// buttons — Branding (top) and Theme (bottom) — each opening a popover
// to the right of the sidebar so the tree stays visible. Click-outside
// dismissal is owned here (not the menus) so clicking the sibling button
// can swap menus instead of racing with a self-close.

type OpenMenu = null | "branding" | "theme" | "background";

export default function SidebarMenus() {
  const [open, setOpen] = useState<OpenMenu>(null);
  const theme = useStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(null);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative border-t border-slate-800 bg-slate-900 p-2"
    >
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => setOpen((o) => (o === "background" ? null : "background"))}
          className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition ${
            open === "background"
              ? "border-sky-500 bg-sky-500/15 text-sky-100"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
          }`}
          title={t.sidebar.backgroundTip}
        >
          <span>🌄</span>
          <span>{t.sidebar.background}</span>
        </button>
        <button
          onClick={() => setOpen((o) => (o === "branding" ? null : "branding"))}
          className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition ${
            open === "branding"
              ? "border-sky-500 bg-sky-500/15 text-sky-100"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
          }`}
          title={t.sidebar.brandingTip}
        >
          <span>🏷️</span>
          <span>{t.sidebar.branding}</span>
        </button>
        <button
          onClick={() => setOpen((o) => (o === "theme" ? null : "theme"))}
          className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition ${
            open === "theme"
              ? "border-sky-500 bg-sky-500/15 text-sky-100"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
          }`}
          title={t.sidebar.themeTip}
        >
          <span>🎨</span>
          <span className="flex-1 text-left">{t.sidebar.theme}</span>
          <span className="text-[10px] text-slate-400 capitalize">{theme.preset}</span>
        </button>
      </div>

      {open === "background" && (
        <div className="absolute bottom-2 left-full z-50 ml-2">
          <BackgroundMenu onClose={() => setOpen(null)} />
        </div>
      )}
      {open === "branding" && (
        <div className="absolute bottom-2 left-full z-50 ml-2">
          <BrandingMenu onClose={() => setOpen(null)} />
        </div>
      )}
      {open === "theme" && (
        <div className="absolute bottom-2 left-full z-50 ml-2">
          <ThemeMenu onClose={() => setOpen(null)} />
        </div>
      )}
    </div>
  );
}
