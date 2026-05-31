import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "../lib/api";
import type { BrowseResult } from "../../shared/types";
import { Input, Mono } from "./ui";

export function FolderPicker({ onSelect }: { onSelect: (path: string) => void }) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data, isError, error } = useQuery({
    queryKey: ["browse", cwd],
    queryFn: () => get<BrowseResult>(`/fs/browse${cwd ? `?path=${encodeURIComponent(cwd)}` : ""}`),
  });

  // Report the resolved current directory upward. onSelect is a parent setter,
  // not local state, so this does not cascade renders within this component.
  useEffect(() => {
    if (data) onSelect(data.path);
  }, [data, onSelect]);

  return (
    <div>
      <div className="mb-2 truncate font-mono text-[12px] text-muted" title={data?.path}>
        {data?.path ?? "…"}
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) setCwd(draft.trim());
          }}
          spellCheck={false}
          className="font-mono text-[12px]"
          placeholder="jump to /path…"
        />
        <button
          onClick={() => data?.parent && setCwd(data.parent)}
          disabled={!data?.parent}
          className="shrink-0 rounded-md border border-hairline-strong px-3 text-sm text-ink hover:bg-paper disabled:opacity-40"
          title="Up one level"
        >
          ↑
        </button>
      </div>

      {isError && <p className="mt-3 text-sm text-bad">{(error as Error).message}</p>}

      <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-hairline">
        {data && data.entries.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-faint">No subfolders here.</p>
        )}
        {data?.entries.map((entry) => (
          <button
            key={entry.path}
            onClick={() => setCwd(entry.path)}
            className="flex w-full items-center justify-between gap-3 border-b border-hairline px-3 py-2 text-left text-sm text-ink last:border-b-0 hover:bg-paper"
          >
            <span className="flex items-center gap-2 truncate">
              <span className="text-faint">▸</span>
              <span className="truncate">{entry.name}</span>
            </span>
            {entry.hasGit && <Mono>git</Mono>}
          </button>
        ))}
      </div>
    </div>
  );
}
