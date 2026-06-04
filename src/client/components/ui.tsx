import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`micro ${className}`}>{children}</span>;
}

type Tone = "idle" | "good" | "warn" | "bad" | "accent";
const toneColor: Record<Tone, string> = {
  idle: "bg-faint",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  accent: "bg-accent",
};

export function StatusDot({ tone = "idle", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${toneColor[tone]}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${toneColor[tone]}`} />
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-hairline bg-surface ${className}`}>{children}</div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  actions,
  description,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  description?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <header className="mb-4 flex items-center justify-between gap-4 border-b border-hairline pb-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="hidden truncate text-[12px] text-muted md:block">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
    );
  }
  return (
    <header className="mb-5 flex items-end justify-between gap-6 border-b border-hairline pb-4">
      <div>
        <Mono>{eyebrow}</Mono>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline-strong py-20 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent ${className}`}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent ${className}`}
    />
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink/10" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-2xl shadow-ink/10">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div className="min-w-0 text-sm font-semibold tracking-tight text-ink">{title}</div>
          <button onClick={onClose} className="micro shrink-0 hover:text-ink">
            close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-hairline px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink/15 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-ink/10">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          <button onClick={onClose} className="micro hover:text-ink">
            esc
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-hairline px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  type = "button",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "solid";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "solid"
      ? "bg-accent text-white hover:bg-accent/90"
      : "border border-hairline-strong bg-surface text-ink hover:bg-paper";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}
