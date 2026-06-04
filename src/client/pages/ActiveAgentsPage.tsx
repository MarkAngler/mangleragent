import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import { useLocalStorage } from "../lib/useLocalStorage";
import type { AgentRun, Project } from "../../shared/types";
import { EmptyState, PageHeader } from "../components/ui";
import { RunListDetail } from "../components/RunListDetail";
import { RunColumns } from "../components/RunColumns";

type View = "list" | "columns";

export function ActiveAgentsPage() {
  const qc = useQueryClient();
  const [view, setView] = useLocalStorage<View>("agents.view", "list");

  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: () => get<AgentRun[]>("/runs") });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => get<Project[]>("/projects") });

  useWsMessage((m) => {
    if (m.type === "run.updated") void qc.invalidateQueries({ queryKey: ["runs"] });
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="Orchestration"
        title="Active Agents"
        description="Every interactive terminal session and orchestrated agent run, live."
        compact
        actions={
          <div className="flex items-center rounded-md border border-hairline-strong bg-surface p-0.5 text-[12px]">
            {(["list", "columns"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-2.5 py-1 font-medium capitalize transition-colors ${
                  view === v ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {runs.length === 0 ? (
        <EmptyState title="No agents yet" hint="Open a terminal from a project board, or delegate a ticket to Mangler." />
      ) : view === "columns" ? (
        <RunColumns runs={runs} projects={projects} />
      ) : (
        <RunListDetail runs={runs} projects={projects} />
      )}
    </div>
  );
}
