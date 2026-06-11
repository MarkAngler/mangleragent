import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import type { GithubSelection, GithubSource, GithubTreeEntry, Project } from "../../shared/types";
import { Button, Card, EmptyState, Input, Modal, Mono, PageHeader, StatusDot } from "../components/ui";
import { usePageTitle } from "../components/PageTitleProvider";
import { useToast } from "../components/Toast";
import { useWsMessage } from "../lib/ws";

export function GithubSyncPage() {
  usePageTitle("GitHub sync");
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState<"add" | GithubSource | null>(null);

  const { data: sources = [] } = useQuery({ queryKey: ["github-sources"], queryFn: () => get<GithubSource[]>("/github/sources") });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => get<Project[]>("/projects") });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => get<{ githubTokenConfigured: boolean }>("/settings") });

  useWsMessage((msg) => {
    if (msg.type === "github.sources.updated") void qc.invalidateQueries({ queryKey: ["github-sources"] });
    if (msg.type === "defs.updated") void qc.invalidateQueries({ queryKey: ["defs"] });
  });

  const scopeLabel = (scope: string) => (scope === "global" ? "Global" : (projects.find((p) => p.id === scope)?.name ?? scope));

  const syncAll = useMutation({
    mutationFn: () => post("/github/sync"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["github-sources"] }),
    onError: (err) => toast({ tone: "bad", title: "Sync failed", body: (err as Error).message }),
  });
  const syncOne = useMutation({
    mutationFn: (id: string) => post<{ outcome: { status: string; error?: string } }>(`/github/sources/${id}/sync`, { force: true }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["github-sources"] });
      if (result.outcome.status === "error") toast({ tone: "bad", title: "Sync failed", body: result.outcome.error });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/github/sources/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["github-sources"] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Customize"
        title="GitHub sync"
        description="Pull rules and skills from GitHub repositories into your definition scopes. Sources re-sync on every server start; use Sync now to pull immediately."
        actions={
          <>
            <Button disabled={sources.length === 0 || syncAll.isPending} onClick={() => syncAll.mutate()}>
              {syncAll.isPending ? "Syncing…" : "Sync all"}
            </Button>
            <Button variant="solid" onClick={() => setModal("add")}>
              + Add repository
            </Button>
          </>
        }
      />

      {!settings?.githubTokenConfigured && (
        <p className="mb-4 text-[12px] text-muted">
          Public repositories work out of the box. For private repositories or higher rate limits, add a GitHub token in{" "}
          <Link to="/settings" className="text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      )}

      {sources.length === 0 ? (
        <EmptyState title="No repositories yet" hint="Add a repository, browse its tree, and pick the rule files and skill folders to keep in sync." />
      ) : (
        <div className="flex flex-col gap-3">
          {sources.map((source) => (
            <Card key={source.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-ink">
                      {source.owner}/{source.repo}
                    </span>
                    <Mono>@ {source.branch}</Mono>
                  </div>
                  {source.label && <p className="mt-0.5 text-[12px] text-muted">{source.label}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {source.selections.map((sel) => (
                      <span key={`${sel.kind}:${sel.path}`} className="rounded-md border border-hairline bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
                        {sel.kind}: {sel.path} → {sel.targets.map(scopeLabel).join(", ")}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[12px]">
                    <StatusDot tone={source.lastError ? "bad" : source.lastSyncedAt ? "good" : "idle"} />
                    {source.lastError ? (
                      <span className="text-bad">{source.lastError}</span>
                    ) : source.lastSyncedAt ? (
                      <span className="text-muted">
                        synced {new Date(source.lastSyncedAt).toLocaleString()} · <span className="font-mono">{source.lastSyncedSha?.slice(0, 7)}</span>
                      </span>
                    ) : (
                      <span className="text-faint">never synced</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button disabled={syncOne.isPending} onClick={() => syncOne.mutate(source.id)}>
                    {syncOne.isPending && syncOne.variables === source.id ? "Syncing…" : "Sync now"}
                  </Button>
                  <button onClick={() => setModal(source)}>
                    <Mono className="hover:text-accent">edit</Mono>
                  </button>
                  <button onClick={() => window.confirm(`Remove ${source.owner}/${source.repo}? Synced definitions stay on disk.`) && remove.mutate(source.id)}>
                    <Mono className="hover:text-bad">delete</Mono>
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal && (
        <SourceModal
          source={modal === "add" ? null : modal}
          projects={projects}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void qc.invalidateQueries({ queryKey: ["github-sources"] });
          }}
        />
      )}
    </>
  );
}

function SourceModal({
  source,
  projects,
  onClose,
  onSaved,
}: {
  source: GithubSource | null;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState(source ? `${source.owner}/${source.repo}` : "");
  const [repo, setRepo] = useState<{ owner: string; repo: string } | null>(source ? { owner: source.owner, repo: source.repo } : null);
  const [branch, setBranch] = useState(source?.branch ?? "");
  const [label, setLabel] = useState(source?.label ?? "");
  const [picks, setPicks] = useState<Array<Pick<GithubSelection, "kind" | "path">>>(
    source?.selections.map(({ kind, path }) => ({ kind, path })) ?? [],
  );
  const [targets, setTargets] = useState<string[]>(source?.selections[0]?.targets ?? []);

  const resolve = useMutation({
    mutationFn: () => post<{ owner: string; repo: string; branch: string }>("/github/resolve", { url }),
    onSuccess: (result) => {
      setRepo({ owner: result.owner, repo: result.repo });
      setBranch(result.branch);
    },
    onError: (err) => toast({ tone: "bad", title: "Repository not found", body: (err as Error).message }),
  });

  const save = useMutation({
    mutationFn: () => {
      const selections = picks.map((pick) => ({ ...pick, targets }));
      return source
        ? patch(`/github/sources/${source.id}`, { branch, label, selections })
        : post("/github/sources", { url, branch, label, selections });
    },
    onSuccess: onSaved,
    onError: (err) => toast({ tone: "bad", title: "Save failed", body: (err as Error).message }),
  });

  const togglePick = (pick: Pick<GithubSelection, "kind" | "path">) =>
    setPicks((prev) => (prev.some((p) => p.path === pick.path) ? prev.filter((p) => p.path !== pick.path) : [...prev, pick]));

  return (
    <Modal
      open
      onClose={onClose}
      title={source ? `Edit ${source.owner}/${source.repo}` : "Add repository"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="solid" disabled={!repo || !branch || picks.length === 0 || targets.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!source && (
          <div>
            <Mono>repository</Mono>
            <div className="mt-2 flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
                className="font-mono text-[13px]"
              />
              <Button disabled={!url.trim() || resolve.isPending} onClick={() => resolve.mutate()}>
                {resolve.isPending ? "Loading…" : "Load"}
              </Button>
            </div>
          </div>
        )}

        {repo && (
          <>
            <div className="flex gap-3">
              <div className="flex-1">
                <Mono>branch</Mono>
                <Input value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-2 font-mono text-[13px]" />
              </div>
              <div className="flex-1">
                <Mono>label</Mono>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" className="mt-2" />
              </div>
            </div>

            <div>
              <Mono>pick rules &amp; skills</Mono>
              <p className="mt-1 text-[12px] text-muted">Check a markdown file to sync it as a rule, or a folder to sync it as a skill.</p>
              {branch && <RepoBrowser owner={repo.owner} repo={repo.repo} ref_={branch} picks={picks} onToggle={togglePick} />}
              {picks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {picks.map((pick) => (
                    <span key={pick.path} className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
                      {pick.kind}: {pick.path}
                      <button onClick={() => togglePick(pick)} className="text-faint hover:text-bad">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Mono>sync to</Mono>
              <div className="mt-2 flex flex-col gap-1">
                {[{ value: "global", label: "Global" }, ...projects.map((p) => ({ value: p.id, label: p.name }))].map((t) => (
                  <label key={t.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-paper">
                    <input
                      type="checkbox"
                      checked={targets.includes(t.value)}
                      onChange={(e) => setTargets((prev) => (e.target.checked ? [...prev, t.value] : prev.filter((v) => v !== t.value)))}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function RepoBrowser({
  owner,
  repo,
  ref_,
  picks,
  onToggle,
}: {
  owner: string;
  repo: string;
  ref_: string;
  picks: Array<Pick<GithubSelection, "kind" | "path">>;
  onToggle: (pick: Pick<GithubSelection, "kind" | "path">) => void;
}) {
  const [dir, setDir] = useState("");
  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ["github-browse", owner, repo, dir, ref_],
    queryFn: () => get<GithubTreeEntry[]>(`/github/browse?owner=${owner}&repo=${repo}&path=${encodeURIComponent(dir)}&ref=${encodeURIComponent(ref_)}`),
  });

  const crumbs = dir ? dir.split("/") : [];
  const picked = (path: string) => picks.some((p) => p.path === path);

  return (
    <div className="mt-2 rounded-md border border-hairline">
      <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-paper px-3 py-1.5 font-mono text-[12px]">
        <button onClick={() => setDir("")} className="text-accent hover:underline">
          {repo}
        </button>
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-faint">/</span>
            <button onClick={() => setDir(crumbs.slice(0, i + 1).join("/"))} className="text-accent hover:underline">
              {crumb}
            </button>
          </span>
        ))}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {isLoading && <p className="px-3 py-2 text-[12px] text-faint">Loading…</p>}
        {error && <p className="px-3 py-2 text-[12px] text-bad">{(error as Error).message}</p>}
        {entries.map((entry) => (
          <div key={entry.path} className="flex items-center justify-between border-b border-hairline px-3 py-1.5 text-sm last:border-b-0 hover:bg-paper">
            {entry.type === "dir" ? (
              <button onClick={() => setDir(entry.path)} className="min-w-0 truncate text-left font-medium text-ink hover:text-accent">
                {entry.name}/
              </button>
            ) : (
              <span className="min-w-0 truncate font-mono text-[13px] text-ink">{entry.name}</span>
            )}
            {entry.type === "dir" ? (
              <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                <input type="checkbox" checked={picked(entry.path)} onChange={() => onToggle({ kind: "skill", path: entry.path })} />
                skill
              </label>
            ) : (
              entry.name.toLowerCase().endsWith(".md") && (
                <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                  <input type="checkbox" checked={picked(entry.path)} onChange={() => onToggle({ kind: "rule", path: entry.path })} />
                  rule
                </label>
              )
            )}
          </div>
        ))}
        {!isLoading && !error && entries.length === 0 && <p className="px-3 py-2 text-[12px] text-faint">Empty directory.</p>}
      </div>
    </div>
  );
}
