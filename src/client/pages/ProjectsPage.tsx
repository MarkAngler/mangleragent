import { PageHeader, EmptyState } from "../components/ui";

export function ProjectsPage() {
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Projects" description="Point Mangled Agents at a local folder to give it a kanban board and an agent workspace." />
      <EmptyState title="Project management arrives in Phase 1" />
    </>
  );
}
