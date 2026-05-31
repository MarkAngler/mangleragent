import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post, put } from "../lib/api";
import type { DefEntry, DefFile, DefKind, Project } from "../../shared/types";
import { Button, EmptyState, Mono, PageHeader, Textarea } from "../components/ui";

const KINDS: Array<{ id: DefKind; label: string }> = [
  { id: "agent", label: "Agents" },
  { id: "skill", label: "Skills" },
  { id: "rule", label: "Rules" },
];

export function DefinitionsPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState("global");
  const [kind, setKind] = useState<DefKind>("agent");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => get<Project[]>("/projects") });
  const listKey = ["defs", scope, kind];
  const { data: entries = [] } = useQuery({ queryKey: listKey, queryFn: () => get<DefEntry[]>(`/defs?scope=${scope}&kind=${kind}`) });
  const { data: file } = useQuery({
    queryKey: ["def-file", scope, kind, selected],
    queryFn: () => get<DefFile>(`/defs/file?scope=${scope}&kind=${kind}&name=${encodeURIComponent(selected ?? "")}`),
    enabled: Boolean(selected),
  });

  const create = useMutation({
    mutationFn: (name: string) => post<DefFile>("/defs", { scope, kind, name }),
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: listKey });
      setSelected(f.name);
    },
  });
  const save = useMutation({
    mutationFn: (vars: { name: string; content: string }) => put<DefFile>("/defs/file", { scope, kind, name: vars.name, content: vars.content }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: listKey }),
  });
  const remove = useMutation({
    mutationFn: (name: string) => del(`/defs/file?scope=${scope}&kind=${kind}&name=${encodeURIComponent(name)}`),
    onSuccess: () => {
      setSelected(null);
      void qc.invalidateQueries({ queryKey: listKey });
    },
  });

  function newDef() {
    const name = window.prompt(`New ${kind} name (letters, numbers, - and _):`)?.trim();
    if (name) create.mutate(name);
  }

  return (
    <>
      <PageHeader
        eyebrow="Customize"
        title="Definitions"
        description="Custom agents, skills, and rules — identical syntax to Claude Code markdown. Delegated agents load these from the project's .claude folder."
        actions={
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setSelected(null);
            }}
            className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="global">Global</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-hairline">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => {
              setKind(k.id);
              setSelected(null);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              kind === k.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-1.5">
          <Button onClick={newDef} className="mb-1 justify-center">
            + New {kind}
          </Button>
          {entries.map((entry) => (
            <button
              key={entry.name}
              onClick={() => setSelected(entry.name)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                selected === entry.name ? "border-accent bg-accent-soft" : "border-hairline bg-surface hover:border-hairline-strong"
              }`}
            >
              <div className="truncate text-sm font-medium text-ink">{entry.name}</div>
              {entry.description && <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{entry.description}</div>}
            </button>
          ))}
          {entries.length === 0 && <p className="px-1 py-3 text-sm text-faint">No {kind}s here yet.</p>}
        </div>

        <div className="min-w-0">
          {!selected || !file ? (
            <EmptyState title="Select or create a definition" hint="Edit the raw markdown — frontmatter and body, exactly as Claude Code reads it." />
          ) : (
            <DefEditor
              key={`${scope}:${kind}:${file.name}`}
              file={file}
              onSave={(content) => save.mutate({ name: file.name, content })}
              onDelete={() => remove.mutate(file.name)}
              saving={save.isPending}
            />
          )}
        </div>
      </div>
    </>
  );
}

function DefEditor({
  file,
  onSave,
  onDelete,
  saving,
}: {
  file: DefFile;
  onSave: (content: string) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [content, setContent] = useState(file.content);
  const dirty = content !== file.content;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{file.name}</div>
          <div className="truncate font-mono text-[11px] text-faint">{file.path}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onDelete}>
            <Mono className="hover:text-bad">delete</Mono>
          </button>
          <Button variant="solid" disabled={!dirty || saving} onClick={() => onSave(content)}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>
      <Textarea
        className="min-h-[60vh] font-mono text-[12.5px] leading-relaxed"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
