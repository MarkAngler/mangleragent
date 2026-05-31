import { PageHeader, EmptyState } from "../components/ui";

export function ManglerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Primary agent"
        title="Mangler"
        description="Your primary organizing agent. Chat to track tasks and notes, and to spawn and supervise Claude Code agents across projects."
      />
      <EmptyState title="Mangler chat arrives in a later phase" hint="The scaffold and live connection are up." />
    </>
  );
}
