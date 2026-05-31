import { PageHeader, EmptyState } from "../components/ui";

export function BoardPage() {
  return (
    <>
      <PageHeader eyebrow="Project" title="Board" description="Kanban board for this project." />
      <EmptyState title="The board arrives in Phase 2" />
    </>
  );
}
