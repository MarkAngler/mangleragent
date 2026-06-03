import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { del, post } from "../lib/api";
import { STATUS_TONE, isActiveRun } from "../lib/run";
import type { AgentRun, Project } from "../../shared/types";
import { Button, Mono, StatusDot } from "./ui";
import { DiffViewer } from "./DiffViewer";
import { RunBody } from "./RunBody";

type DetailTab = "activity" | "changes";

export function RunListDetail({ runs, projects }: { runs: AgentRun[]; projects: Project[] }) {
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

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-rows-1 lg:grid-cols-[300px_1fr]">
      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => setParams({ run: run.id })}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selectedId === run.id ? "border-accent bg-accent-soft" : "border-hairline bg-surface hover:border-hairline-strong"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{projectName(run.projectId)}</span>
              <StatusDot tone={STATUS_TONE[run.status]} pulse={isActiveRun(run)} />
            </div>
            <div className="mt-0.5 truncate text-[12px] text-muted">{run.title}</div>
            <div className="mt-1 flex items-center gap-2">
              <Mono>{run.kind === "pty" ? "terminal" : "agent"}</Mono>
              <Mono>· {run.status}</Mono>
            </div>
          </button>
        ))}
      </div>

      <div className="min-w-0">
        {!selected ? (
          <div className="grid h-full min-h-0 place-items-center rounded-lg border border-dashed border-hairline-strong text-sm text-faint">
            Select an agent to view it.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot tone={STATUS_TONE[selected.status]} pulse={isActiveRun(selected)} />
                <span className="text-sm font-semibold text-ink">
                  {projectName(selected.projectId)} - {selected.title}
                </span>
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
                {isActiveRun(selected) && <Button onClick={() => stop.mutate(selected.id)}>Stop</Button>}
                <button onClick={() => remove.mutate(selected.id)}>
                  <Mono className="hover:text-bad">remove</Mono>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <div className={tab === "changes" ? "hidden" : "h-full"}>
                <RunBody key={selected.id} run={selected} />
              </div>
              {tab === "changes" && <DiffViewer key={selected.id} run={selected} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
