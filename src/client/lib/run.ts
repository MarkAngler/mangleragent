import type { AgentRun, AgentRunStatus } from "../../shared/types";

export const STATUS_TONE: Record<AgentRunStatus, "idle" | "good" | "warn" | "bad" | "accent"> = {
  planning: "accent",
  awaiting_approval: "warn",
  running: "accent",
  done: "good",
  failed: "bad",
  stopped: "idle",
};

const TERMINAL_STATUSES: AgentRunStatus[] = ["done", "failed", "stopped"];

export const isActiveRun = (run: AgentRun) => !TERMINAL_STATUSES.includes(run.status);
