import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Card, StatusDot } from "./ui";

type ToastTone = "good" | "warn" | "bad";
type Toast = { id: number; tone: ToastTone; title: string; body?: string };
type ToastInput = Omit<Toast, "id">;

const DISMISS_MS = 5000;

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // Errors stay until dismissed so the full message can be read and copied; others auto-dismiss.
  const scheduleDismiss = useCallback(
    (toast: Toast) => {
      if (toast.tone === "bad") return;
      timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), DISMISS_MS));
    },
    [dismiss],
  );

  const push = useCallback(
    (input: ToastInput) => {
      const toast: Toast = { ...input, id: nextId.current++ };
      setToasts((current) => [...current, toast]);
      scheduleDismiss(toast);
    },
    [scheduleDismiss],
  );

  // Clicking anywhere outside the stack dismisses all toasts.
  useEffect(() => {
    if (toasts.length === 0) return;
    const onMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
      setToasts([]);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [toasts.length]);

  // Pause auto-dismiss while hovering so results can be selected and copied.
  const pause = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);
  const resume = useCallback(() => {
    toasts.forEach((toast) => {
      if (!timers.current.has(toast.id)) scheduleDismiss(toast);
    });
  }, [toasts, scheduleDismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        ref={containerRef}
        onMouseEnter={pause}
        onMouseLeave={resume}
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <Card key={toast.id} className="flex w-72 items-start gap-3 px-4 py-3 shadow-lg shadow-ink/10">
            <span className="mt-1.5 shrink-0">
              <StatusDot tone={toast.tone} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{toast.title}</p>
              {toast.body && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{toast.body}</p>
              )}
            </div>
            <button type="button" onClick={() => dismiss(toast.id)} className="micro shrink-0 hover:text-ink">
              close
            </button>
          </Card>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
