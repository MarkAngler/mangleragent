import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import { useWsStatus } from "../lib/ws";
import { useLocalStorage } from "../lib/useLocalStorage";
import { useAttention } from "./AttentionProvider";
import { StatusDot } from "./ui";

type Health = { ok: boolean; anthropic: boolean; honcho: boolean };

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Mangler", end: true },
  { to: "/projects", label: "Projects" },
  { to: "/agents", label: "Active Agents" },
  { to: "/notes", label: "Notes & Tasks" },
  { to: "/schedules", label: "Schedules" },
  { to: "/definitions", label: "Definitions" },
  { to: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const connected = useWsStatus();
  const { needsInputCount } = useAttention();
  const [collapsed, setCollapsed] = useLocalStorage<boolean>("nav.collapsed", false);
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => get<Health>("/health"),
    refetchInterval: 15_000,
  });

  if (collapsed) {
    return (
      <div className="flex h-full">
        <aside className="flex w-12 shrink-0 flex-col items-center border-r border-hairline bg-paper py-4">
          <button
            onClick={() => setCollapsed(false)}
            title="Expand menu"
            className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[13px] font-bold text-paper"
          >
            M
          </button>
          {needsInputCount > 0 && (
            <span className="mt-3 inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">
              {needsInputCount}
            </span>
          )}
        </aside>
        <main className="flex-1 overflow-y-auto">
          <div className="flex h-full flex-col px-8 py-6">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-paper">
        <div className="flex items-center gap-2 px-5 pb-6 pt-7">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[13px] font-bold text-paper">
            M
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Mangled Agents</div>
            <div className="micro">Agent Orchestration</div>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse menu"
            className="shrink-0 text-lg leading-none text-faint transition-colors hover:text-ink"
          >
            «
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface hover:text-ink",
                ].join(" ")
              }
            >
              {item.label}
              {item.to === "/agents" && needsInputCount > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">
                  {needsInputCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-hairline px-5 py-4">
          <div className="flex items-center gap-2">
            <StatusDot tone={connected ? "good" : "bad"} pulse={connected} />
            <span className="micro">{connected ? "online" : "offline"}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="micro" title="Claude API key detected">
              api {health?.anthropic ? "✓" : "—"}
            </span>
            <span className="micro" title="Honcho key detected">
              honcho {health?.honcho ? "✓" : "—"}
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="flex h-full flex-col px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
