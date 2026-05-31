import { PageHeader, EmptyState } from "../components/ui";

export function NotesPage() {
  return (
    <>
      <PageHeader eyebrow="Organize" title="Notes & Tasks" description="Lightweight notes and tasks, global or scoped to a project." />
      <EmptyState title="Notes & tasks arrive in Phase 3" />
    </>
  );
}
