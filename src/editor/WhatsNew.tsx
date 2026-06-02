import { useEffect, useState, type ReactNode } from "react";
import { APP_VERSION } from "../version";
import { useT } from "../locale/useT";

// "What's new" panel — fetches patch notes straight from the project's GitHub
// Releases (the canonical changelog) and renders each release's markdown body.
// Opened by clicking the version in the toolbar. No backend: the static app
// hits the public GitHub API directly (CORS-enabled; unauthenticated, so it's
// subject to GitHub's 60-req/hr-per-IP limit — handled with a graceful error).

const REPO = "dalekcoffee/uix-studio";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

// Module-level cache so reopening the panel is instant and doesn't re-spend the
// rate limit. Persists for the page session.
let cachedReleases: Release[] | null = null;

const linkCls = "text-sky-300 underline-offset-2 hover:underline";

export default function WhatsNew({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [releases, setReleases] = useState<Release[] | null>(cachedReleases);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(cachedReleases === null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (cachedReleases !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) {
          throw new Error(
            res.status === 403 ? t.whatsNew.rateLimit : t.whatsNew.returned(res.status),
          );
        }
        const data: Release[] = await res.json();
        const visible = data.filter((r) => !r.draft);
        if (!cancelled) {
          cachedReleases = visible;
          setReleases(visible);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message || t.whatsNew.cantReach);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.whatsNew.title}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {t.whatsNew.title}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-100">
              {t.whatsNew.patchNotes}
            </div>
            <a
              href={RELEASES_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[11px] ${linkCls}`}
            >
              {t.whatsNew.viewAll}
            </a>
          </div>
          <button
            onClick={onClose}
            aria-label={t.whatsNew.close}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              {t.whatsNew.loading}
            </div>
          )}

          {error && (
            <div className="rounded border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-xs leading-relaxed text-amber-200/90">
              <div className="font-semibold text-amber-200">{t.whatsNew.cantLoad}</div>
              <p className="mt-1">{error}</p>
              <a
                href={RELEASES_PAGE}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-2 inline-block ${linkCls}`}
              >
                {t.whatsNew.readOnGitHub}
              </a>
            </div>
          )}

          {!loading && !error && releases && releases.length === 0 && (
            <div className="py-6 text-xs text-slate-400">
              {t.whatsNew.noReleases}{" "}
              <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer" className={linkCls}>
                {t.whatsNew.checkGitHub}
              </a>
            </div>
          )}

          {!loading && !error && releases && releases.length > 0 && (
            <ul className="space-y-5">
              {releases.map((r) => (
                <ReleaseEntry key={r.tag_name + r.published_at} release={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ReleaseEntry({ release }: { release: Release }) {
  const t = useT();
  // The toolbar shows "vX.Y.Z"; releases are tagged the same — flag the one the
  // user is running.
  const isCurrent = release.tag_name.replace(/^v/, "") === APP_VERSION;
  const date = release.published_at
    ? new Date(release.published_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={release.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-slate-100 hover:text-sky-300"
        >
          {release.name || release.tag_name}
        </a>
        {isCurrent && (
          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300">
            {t.whatsNew.youreHere}
          </span>
        )}
        {release.prerelease && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
            {t.whatsNew.preRelease}
          </span>
        )}
        {date && <span className="text-[10px] text-slate-500">{date}</span>}
      </div>
      <div className="mt-1.5">
        <Markdown text={release.body ?? ""} />
      </div>
    </li>
  );
}

// ── Minimal, dependency-free, XSS-safe markdown renderer ─────────────────────
// Handles the patterns GitHub release notes actually use: #/##/### headings,
// - / * bullet lists, **bold**, `code`, and [text](url) links. Everything is
// built as React nodes (never dangerouslySetInnerHTML), so untrusted body text
// can't inject markup.

function Markdown({ text }: { text: string }): ReactNode {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-1 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-slate-300">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p-${key++}`} className="my-1 text-xs leading-relaxed text-slate-300">
          {inline(para.join(" "))}
        </p>,
      );
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushPara();
      blocks.push(
        <div key={`h-${key++}`} className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-200">
          {inline(heading[2])}
        </div>,
      );
    } else if (bullet) {
      flushPara();
      list.push(
        <li key={`li-${key++}`}>{inline(bullet[1])}</li>,
      );
    } else if (line.trim() === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return <>{blocks}</>;
}

// Inline tokens: [text](url) | **bold** | `code`. Plain text otherwise.
const INLINE = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)/;
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1]) {
      out.push(
        <a key={`a-${k}`} href={m[3]} target="_blank" rel="noopener noreferrer" className={linkCls}>
          {m[2]}
        </a>,
      );
    } else if (m[4]) {
      out.push(
        <strong key={`b-${k}`} className="font-semibold text-slate-100">
          {m[5]}
        </strong>,
      );
    } else if (m[6]) {
      out.push(
        <code key={`c-${k}`} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-sky-200">
          {m[7]}
        </code>,
      );
    }
    rest = rest.slice(m.index + m[0].length);
    k++;
  }
  return out;
}
