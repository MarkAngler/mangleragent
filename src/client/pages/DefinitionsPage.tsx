import { PageHeader, EmptyState } from "../components/ui";

export function DefinitionsPage() {
  return (
    <>
      <PageHeader eyebrow="Customize" title="Definitions" description="Custom agents, skills, and rules — identical syntax to Claude Code markdown." />
      <EmptyState title="Definitions arrive in Phase 8" />
    </>
  );
}
