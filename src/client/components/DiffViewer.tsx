import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { AgentRun, FileDiff, RunDiff } from "../../shared/types";
import { Button, EmptyState, Mono } from "./ui";

const STATUS_GLYPH: Record<FileDiff["status"], string> = { added: "A", modified: "M", deleted: "D", renamed: "R" };
const STATUS_CLASS: Record<FileDiff["status"], string> = {
  added: "text-good",
  modified: "text-warn",
  deleted: "text-bad",
  renamed: "text-accent",
};

export function DiffViewer({ run }: { run: AgentRun }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["run-diff", run.id],
    queryFn: () => get<RunDiff>(`/runs/${run.id}/diff`),
  });

  useWsMessage((m) => {
    if (!("runId" in m) || m.runId !== run.id) return;
    if (m.type === "run.event" || m.type === "run.updated") void qc.invalidateQueries({ queryKey: ["run-diff", run.id] });
  });

  const files = data?.files ?? [];
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Mono>changes</Mono>
          {data?.available && files.length > 0 && (
            <span className="font-mono text-[12px] text-muted">
              {files.length} {files.length === 1 ? "file" : "files"}
              <span className="ml-2 text-good">+{additions}</span>
              <span className="ml-1.5 text-bad">-{deletions}</span>
            </span>
          )}
        </div>
        <Button onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-5 py-4 text-[12px] text-faint">Loading diff…</p>
        ) : !data?.available ? (
          <div className="p-5">
            <EmptyState title="No changes to show" hint="This project isn't a git repository, or its folder is unavailable." />
          </div>
        ) : files.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No file changes yet" hint="This run hasn't modified any files in the project working tree." />
          </div>
        ) : (
          <div className="divide-y divide-hairline">
            {files.map((f) => (
              <FileSection key={`${f.oldPath ?? ""}:${f.path}`} file={f} />
            ))}
            {data.truncated && <p className="px-5 py-3 text-[12px] text-warn">Diff truncated — too large to display in full.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function FileSection({ file }: { file: FileDiff }) {
  const body = patchBody(file.patch);
  const [open, setOpen] = useState(body.length <= 400);

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-2 text-left hover:bg-paper">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`font-mono text-[12px] font-semibold ${STATUS_CLASS[file.status]}`}>{STATUS_GLYPH[file.status]}</span>
          <span className="truncate font-mono text-[12px] text-ink">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</span>
        </div>
        <span className="shrink-0 font-mono text-[11px]">
          {file.binary ? (
            <span className="text-faint">binary</span>
          ) : (
            <>
              <span className="text-good">+{file.additions}</span>
              <span className="ml-1.5 text-bad">-{file.deletions}</span>
            </>
          )}
        </span>
      </button>
      {open &&
        (file.binary ? (
          <p className="px-5 pb-3 font-mono text-[12px] text-faint">Binary file changed.</p>
        ) : (
          <div className="overflow-x-auto pb-2 font-mono text-[12px] leading-snug">
            {body.map((line, i) => (
              <div key={i} className={`whitespace-pre px-5 ${lineClass(line)}`}>
                {line || " "}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// The hunk content of a file patch — everything from the first @@ header onward,
// dropping the file-level headers (already shown) and the trailing blank line.
function patchBody(patch: string): string[] {
  if (!patch) return [];
  const lines = patch.split("\n");
  const start = lines.findIndex((l) => l.startsWith("@@"));
  if (start < 0) return [];
  const body = lines.slice(start);
  if (body[body.length - 1] === "") body.pop();
  return body;
}

function lineClass(line: string): string {
  if (line.startsWith("@@")) return "bg-paper text-muted";
  if (line.startsWith("+")) return "bg-good/10 text-good";
  if (line.startsWith("-")) return "bg-bad/10 text-bad";
  if (line.startsWith("\\")) return "text-faint";
  return "text-ink";
}
