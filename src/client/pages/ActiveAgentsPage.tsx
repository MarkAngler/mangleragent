import { PageHeader, EmptyState } from "../components/ui";

export function ActiveAgentsPage() {
  return (
    <>
      <PageHeader eyebrow="Orchestration" title="Active Agents" description="Every interactive terminal session and orchestrated agent run, live." />
      <EmptyState title="The agents view arrives in Phase 7" />
    </>
  );
}
