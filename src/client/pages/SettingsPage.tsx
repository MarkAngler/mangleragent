import { PageHeader, EmptyState } from "../components/ui";

export function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Configure" title="Settings" description="API keys, default model, approval posture, and the honcho.dev memory integration." />
      <EmptyState title="Settings arrive alongside later phases" />
    </>
  );
}
