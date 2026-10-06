"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: number;
  title: string;
  kind: "info" | "success" | "error";
}
interface ToastApi {
  info: (t: string) => void;
  success: (t: string) => void;
  error: (t: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((title: string, kind: ToastItem["kind"]) => {
    const id = ++seq;
    setItems((p) => [...p.slice(-3), { id, title, kind }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 5000);
  }, []);
  const api = React.useMemo<ToastApi>(
    () => ({
      info: (t) => push(t, "info"),
      success: (t) => push(t, "success"),
      error: (t) => push(t, "error"),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[1200] flex w-[min(92vw,380px)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-lg border bg-ops-850 px-4 py-3 text-sm font-medium shadow-lg",
              t.kind === "error" && "border-emergency/60 text-emergency-bright",
              t.kind === "success" && "border-ok/60 text-ok",
              t.kind === "info" && "border-ops-600 text-slate-100",
            )}
          >
            {t.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
