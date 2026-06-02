import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { buildColumns, pinKey } from "../lib/agentColumns";
import { STATUS_TONE, isActiveRun } from "../lib/run";
import { useLocalStorage } from "../lib/useLocalStorage";
import type { AgentRun, Project } from "../../shared/types";
import { Button, Mono, StatusDot } from "./ui";
import { RunBody } from "./RunBody";
import { RunPickerModal } from "./RunPickerModal";

export function RunColumns({ runs, projects }: { runs: AgentRun[]; projects: Project[] }) {
  const qc = useQueryClient();
  const [pinned, setPinned] = useLocalStorage<Record<string, string>>("agents.pinned", {});
  const [pickerKey, setPickerKey] = useState<string | null>(null);

  const stop = useMutation({
    mutationFn: (id: string) => post(`/runs/${id}/stop`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["runs"] }),
  });

  const columns = buildColumns(runs, pinned);
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "No project";

  const pin = (key: string, runId: string) => setPinned({ ...pinned, [key]: runId });
  const resetPin = (key: string) => {
    const next = { ...pinned };
    delete next[key];
    setPinned(next);
  };

  const picker = columns.find((c) => pinKey(c.projectId) === pickerKey) ?? null;

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const key = pinKey(column.projectId);
          const run = column.runs.find((r) => r.id === column.effectiveRunId) ?? column.runs[0];
          return (
            <section key={key} className="flex min-h-0 min-w-[24rem] flex-1 flex-col rounded-lg border border-hairline bg-paper">
              <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{projectName(column.projectId)}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StatusDot tone={STATUS_TONE[run.status]} pulse={isActiveRun(run)} />
                    <span className="truncate text-[12px] text-muted">{run.title}</span>
                    <Mono>· {run.kind === "pty" ? "terminal" : "agent"}</Mono>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isActiveRun(run) && <Button onClick={() => stop.mutate(run.id)}>Stop</Button>}
                  <button onClick={() => setPickerKey(key)}>
                    <Mono className="hover:text-accent">change{column.runs.length > 1 ? ` (${column.runs.length})` : ""}</Mono>
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-2">
                <RunBody key={run.id} run={run} />
              </div>
            </section>
          );
        })}
      </div>

      <RunPickerModal
        open={picker !== null}
        runs={picker?.runs ?? []}
        effectiveRunId={picker?.effectiveRunId ?? ""}
        onPick={(runId) => {
          if (pickerKey) pin(pickerKey, runId);
          setPickerKey(null);
        }}
        onReset={() => {
          if (pickerKey) resetPin(pickerKey);
          setPickerKey(null);
        }}
        onClose={() => setPickerKey(null)}
      />
    </>
  );
}
