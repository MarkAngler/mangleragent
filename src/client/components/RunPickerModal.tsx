import { STATUS_TONE, isActiveRun } from "../lib/run";
import type { AgentRun } from "../../shared/types";
import { Modal, Mono, StatusDot } from "./ui";

export function RunPickerModal({
  open,
  runs,
  effectiveRunId,
  onPick,
  onReset,
  onClose,
}: {
  open: boolean;
  runs: AgentRun[];
  effectiveRunId: string;
  onPick: (runId: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a session"
      footer={
        <button onClick={onReset}>
          <Mono className="hover:text-accent">↺ reset to most recent</Mono>
        </button>
      }
    >
      <div className="flex flex-col gap-1.5">
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => onPick(run.id)}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
              effectiveRunId === run.id ? "border-accent bg-accent-soft" : "border-hairline bg-surface hover:border-hairline-strong"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{run.title}</span>
              <StatusDot tone={STATUS_TONE[run.status]} pulse={isActiveRun(run)} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Mono>{run.kind === "pty" ? (run.cli === "codex" ? "codex" : "claude code") : "agent"}</Mono>
              <Mono>· {run.status}</Mono>
              <Mono>· {new Date(run.createdAt).toLocaleString()}</Mono>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
