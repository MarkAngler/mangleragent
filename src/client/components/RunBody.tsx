import type { AgentRun } from "../../shared/types";
import { Terminal } from "./Terminal";
import { OrchestratedRunView } from "./OrchestratedRunView";

export function RunBody({ run }: { run: AgentRun }) {
  return run.kind === "pty" ? <Terminal runId={run.id} /> : <OrchestratedRunView run={run} />;
}
