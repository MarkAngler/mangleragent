import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
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

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }]);
      // Errors stay until clicked so the full message can be read; others auto-dismiss.
      if (input.tone !== "bad") setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <Card
            key={toast.id}
            className="flex w-72 cursor-pointer items-start gap-3 px-4 py-3 shadow-lg shadow-ink/10"
          >
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="flex w-full items-start gap-3 text-left"
            >
              <span className="mt-1.5">
                <StatusDot tone={toast.tone} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{toast.title}</span>
                {toast.body && <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-muted">{toast.body}</span>}
              </span>
            </button>
          </Card>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
