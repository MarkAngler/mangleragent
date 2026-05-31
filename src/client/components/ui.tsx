import type { ReactNode } from "react";

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
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  description?: string;
}) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6 border-b border-hairline pb-6">
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
