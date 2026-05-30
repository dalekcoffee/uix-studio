import { useEffect, useState } from "react";
import { APP_AUTHOR, APP_VERSION, APP_CHANNEL } from "../version";

interface Props {
  onDismiss: () => void;
}

export default function Splash({ onDismiss }: Props) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setFading(true), 1800);
    const t2 = window.setTimeout(() => onDismiss(), 2400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [onDismiss]);

  return (
    <div
      onClick={onDismiss}
      className={`flex h-full w-full cursor-pointer flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src="./UIX%20Studio.png"
        alt="UIX Studio"
        className="h-40 w-40"
        draggable={false}
      />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-100">
        UIX Studio
      </h1>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
        Version {APP_VERSION}
        {APP_CHANNEL && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            {APP_CHANNEL}
          </span>
        )}
      </p>
      <a
        href="https://dalek.coffee"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-10 flex items-center gap-2 text-xs text-slate-500 transition hover:text-sky-300"
      >
        <img
          src="./Dalek.png"
          alt={APP_AUTHOR}
          className="h-6 w-6 rounded-full ring-1 ring-slate-700"
          draggable={false}
        />
        <span className="text-white">Slopcoded by {APP_AUTHOR}</span>
      </a>
      <p className="mt-6 text-[10px] uppercase tracking-widest text-slate-600">
        click anywhere to continue
      </p>
    </div>
  );
}
