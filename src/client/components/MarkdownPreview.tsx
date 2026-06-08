import { MarkdownMessage } from "./MarkdownMessage";

export function MarkdownPreview({ source }: { source: string }) {
  if (!source.trim()) {
    return <p className="text-sm text-faint">Nothing to preview yet.</p>;
  }
  return <MarkdownMessage text={source} />;
}
