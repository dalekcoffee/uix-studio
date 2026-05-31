import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface ConfirmOpts {
  title?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface AlertOpts {
  title?: string;
}

interface DialogCtx {
  confirm: (message: string, opts?: ConfirmOpts) => Promise<boolean>;
  alert: (message: string, opts?: AlertOpts) => Promise<void>;
}

type Pending =
  | { type: "confirm"; message: string; title?: string; confirmLabel?: string; destructive?: boolean; resolve: (v: boolean) => void }
  | { type: "alert";   message: string; title?: string; resolve: (v: boolean) => void };

const Ctx = createContext<DialogCtx | null>(null);

export function useDialog(): DialogCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialog used outside DialogProvider");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (message: string, opts?: ConfirmOpts): Promise<boolean> =>
      new Promise((resolve) =>
        setPending({
          type: "confirm",
          message,
          title: opts?.title,
          confirmLabel: opts?.confirmLabel,
          destructive: opts?.destructive,
          resolve,
        }),
      ),
    [],
  );

  const alert = useCallback(
    (message: string, opts?: AlertOpts): Promise<void> =>
      new Promise<void>((resolve) =>
        setPending({ type: "alert", message, title: opts?.title, resolve: () => resolve() }),
      ),
    [],
  );

  function settle(v: boolean) {
    if (!pending) return;
    pending.resolve(v);
    setPending(null);
  }

  return (
    <Ctx.Provider value={{ confirm, alert }}>
      {children}
      {pending && <DialogOverlay pending={pending} onSettle={settle} />}
    </Ctx.Provider>
  );
}

function DialogOverlay({ pending, onSettle }: { pending: Pending; onSettle: (v: boolean) => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSettle(false);
      else if (e.key === "Enter") onSettle(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSettle]);

  const isConfirm = pending.type === "confirm";
  const destructive = isConfirm && (pending as { destructive?: boolean }).destructive;
  const confirmLabel =
    isConfirm ? ((pending as { confirmLabel?: string }).confirmLabel ?? "Confirm") : "OK";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      onClick={() => onSettle(false)}
    >
      <div
        className="w-[400px] max-w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {pending.title && (
          <div className="mb-1 text-sm font-semibold text-slate-100">{pending.title}</div>
        )}
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{pending.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          {isConfirm && (
            <button
              onClick={() => onSettle(false)}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700"
            >
              Cancel
            </button>
          )}
          <button
            autoFocus
            onClick={() => onSettle(true)}
            className={`rounded border px-3 py-1.5 text-xs font-semibold text-white transition ${
              destructive
                ? "border-rose-500 bg-rose-600 hover:bg-rose-500"
                : "border-sky-500 bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
