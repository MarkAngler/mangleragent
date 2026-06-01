import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { AgentRun, AgentRunStatus, Project } from "../../shared/types";
import { Button, EmptyState, Mono, PageHeader, StatusDot } from "../components/ui";
import { Terminal } from "../components/Terminal";
import { OrchestratedRunView } from "../components/OrchestratedRunView";
import { DiffViewer } from "../components/DiffViewer";

type DetailTab = "activity" | "changes";

const STATUS_TONE: Record<AgentRunStatus, "idle" | "good" | "warn" | "bad" | "accent"> = {
  planning: "accent",
  awaiting_approval: "warn",
  running: "accent",
  done: "good",
  failed: "bad",
  stopped: "idle",
};

const TERMINAL_STATUSES: AgentRunStatus[] = ["done", "failed", "stopped"];

export function ActiveAgentsPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("run");
  const [tab, setTab] = useState<DetailTab>("activity");
  const [tabRunId, setTabRunId] = useState(selectedId);
  // Reset to the Activity tab whenever the selected run changes (render-time state adjustment).
  if (selectedId !== tabRunId) {
    setTabRunId(selectedId);
    setTab("activity");
  }

  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: () => get<AgentRun[]>("/runs") });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => get<Project[]>("/projects") });

  useWsMessage((m) => {
    if (m.type === "run.updated") void qc.invalidateQueries({ queryKey: ["runs"] });
  });

  const stop = useMutation({
    mutationFn: (id: string) => post(`/runs/${id}/stop`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["runs"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/runs/${id}`),
    onSuccess: () => {
      setParams({});
      void qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const selected = runs.find((r) => r.id === selectedId) ?? null;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "—";
  const isActive = (r: AgentRun) => !TERMINAL_STATUSES.includes(r.status);

  return (
    <>
      <PageHeader eyebrow="Orchestration" title="Active Agents" description="Every interactive terminal session and orchestrated agent run, live." />

      {runs.length === 0 ? (
        <EmptyState title="No agents yet" hint="Open a terminal from a project board, or delegate a ticket to Mangler." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-1.5">
            {runs.map((run) => (
              <button
                key={run.id}
                onClick={() => setParams({ run: run.id })}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedId === run.id ? "border-accent bg-accent-soft" : "border-hairline bg-surface hover:border-hairline-strong"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{run.title}</span>
                  <StatusDot tone={STATUS_TONE[run.status]} pulse={isActive(run)} />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Mono>{run.kind === "pty" ? "terminal" : "agent"}</Mono>
                  <Mono>· {run.status}</Mono>
                  <Mono>· {projectName(run.projectId)}</Mono>
                </div>
              </button>
            ))}
          </div>

          <div className="min-w-0">
            {!selected ? (
              <div className="grid h-[60vh] place-items-center rounded-lg border border-dashed border-hairline-strong text-sm text-faint">
                Select an agent to view it.
              </div>
            ) : (
              <div className="flex h-[72vh] flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={STATUS_TONE[selected.status]} pulse={isActive(selected)} />
                    <span className="text-sm font-semibold text-ink">{selected.title}</span>
                    <Mono>{selected.status}</Mono>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-md border border-hairline-strong bg-surface p-0.5 text-[12px]">
                      {(["activity", "changes"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          className={`rounded px-2.5 py-1 font-medium capitalize transition-colors ${
                            tab === t ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    {isActive(selected) && (
                      <Button onClick={() => stop.mutate(selected.id)}>Stop</Button>
                    )}
                    <button onClick={() => remove.mutate(selected.id)}>
                      <Mono className="hover:text-bad">remove</Mono>
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <div className={tab === "changes" ? "hidden" : "h-full"}>
                    {selected.kind === "pty" ? (
                      <Terminal key={selected.id} runId={selected.id} />
                    ) : (
                      <OrchestratedRunView key={selected.id} run={selected} />
                    )}
                  </div>
                  {tab === "changes" && <DiffViewer key={selected.id} run={selected} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
