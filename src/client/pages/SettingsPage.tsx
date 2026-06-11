import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "../lib/api";
import { Button, Card, Input, Mono, PageHeader, StatusDot, Textarea } from "../components/ui";
import { usePageTitle } from "../components/PageTitleProvider";
import { FolderPicker } from "../components/FolderPicker";
import { useToast } from "../components/Toast";

interface Settings {
  anthropicConfigured: boolean;
  databricksConfigured: boolean;
  provider: "anthropic" | "databricks";
  honchoConfigured: boolean;
  honchoEnabled: boolean;
  honchoWorkspace: string;
  model: string;
  systemPrompt: string;
  defaultSystemPrompt: string;
  cliAutorun: boolean;
  cliWorkdir: string;
  githubTokenConfigured: boolean;
  dataDir: string;
}

export function SettingsPage() {
  usePageTitle("Settings");
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get<Settings>("/settings") });

  const update = useMutation({
    mutationFn: (patchBody: Partial<Pick<Settings, "provider" | "honchoEnabled" | "honchoWorkspace" | "model" | "systemPrompt" | "cliAutorun" | "cliWorkdir">> & { githubToken?: string }) => patch("/settings", patchBody),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  const [model, setModel] = useState<string | null>(null);
  const modelValue = model ?? data?.model ?? "";

  const [workspace, setWorkspace] = useState<string | null>(null);
  const workspaceValue = workspace ?? data?.honchoWorkspace ?? "";

  const [prompt, setPrompt] = useState<string | null>(null);
  const promptValue = prompt ?? data?.systemPrompt ?? "";

  const [cliWorkdir, setCliWorkdir] = useState<string | null>(null);
  const cliWorkdirValue = cliWorkdir ?? data?.cliWorkdir ?? "";

  const [githubToken, setGithubToken] = useState("");

  const toast = useToast();
  const [target, setTarget] = useState<string | null>(null);
  const moveData = useMutation({
    mutationFn: (targetDir: string) => post<{ dataDir: string }>("/settings/data-dir/move", { targetDir }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
      toast({ tone: "good", title: "Data directory moved", body: result?.dataDir });
    },
    onError: (err) => toast({ tone: "bad", title: "Move failed", body: (err as Error).message }),
  });

  return (
    <>
      <PageHeader eyebrow="Configure" title="Settings" description="API keys, the Mangler model and system prompt, and the optional honcho.dev memory integration." />

      <div className="flex max-w-xl flex-col gap-4">
        <Card className="p-5">
          <Mono>credentials</Mono>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Claude API key" ok={data?.anthropicConfigured} hint="from CLAUDE_API_KEY / ANTHROPIC_API_KEY" />
            <Row label="Databricks token" ok={data?.databricksConfigured} hint="from DATABRICKS_HOST / DATABRICKS_TOKEN" />
            <Row label="Honcho API key" ok={data?.honchoConfigured} hint="from HONCHO_DEV_API_KEY" />
            <Row label="GitHub token" ok={data?.githubTokenConfigured} hint="from the github token card below" />
          </div>
        </Card>

        <Card className="p-5">
          <Mono>mangler provider</Mono>
          <select
            value={data?.provider ?? "anthropic"}
            onChange={(e) => update.mutate({ provider: e.target.value as Settings["provider"] })}
            className="mt-3 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="anthropic">Anthropic API</option>
            <option value="databricks">Databricks AI Gateway</option>
          </select>
          {data?.provider === "databricks" && !data?.databricksConfigured && (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-warn">
              <StatusDot tone="warn" /> Set DATABRICKS_HOST and DATABRICKS_TOKEN to enable this.
            </p>
          )}
          <p className="mt-2 text-[12px] text-muted">Route Mangler through the direct Anthropic API or your Databricks AI Gateway.</p>
        </Card>

        <Card className="p-5">
          <Mono>mangler model</Mono>
          <div className="mt-3 flex gap-2">
            <Input value={modelValue} onChange={(e) => setModel(e.target.value)} className="font-mono text-[13px]" />
            <Button
              variant="solid"
              disabled={!model || model === data?.model || update.isPending}
              onClick={() => model && update.mutate({ model })}
            >
              Save
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            {data?.provider === "databricks"
              ? "e.g. databricks-claude-opus-4-8, databricks-claude-sonnet-4-6"
              : "e.g. claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001"}
          </p>
        </Card>

        <Card className="p-5">
          <Mono>mangler system prompt</Mono>
          <Textarea
            value={promptValue}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            className="mt-3 resize-y font-mono text-[13px] leading-relaxed"
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="solid"
              disabled={prompt === null || prompt === data?.systemPrompt || update.isPending}
              onClick={() => update.mutate({ systemPrompt: promptValue })}
            >
              Save
            </Button>
            <Button
              disabled={data?.systemPrompt === data?.defaultSystemPrompt || update.isPending}
              onClick={() => {
                update.mutate({ systemPrompt: "" });
                setPrompt(null);
              }}
            >
              Reset to default
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Defines Mangler's persona and operating rules. Reset restores the built-in default. Add reusable rules and skills under Definitions → Mangler.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <Mono>honcho.dev memory</Mono>
              <p className="mt-2 max-w-sm text-sm text-muted">
                When enabled, Mangler stores your conversations in honcho and recalls a synthesized profile to personalize its help.
              </p>
            </div>
            <button
              disabled={!data?.honchoConfigured}
              onClick={() => update.mutate({ honchoEnabled: !data?.honchoEnabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                data?.honchoEnabled ? "bg-accent" : "bg-hairline-strong"
              }`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${data?.honchoEnabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {!data?.honchoConfigured && (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-warn">
              <StatusDot tone="warn" /> Set HONCHO_DEV_API_KEY to enable this.
            </p>
          )}
          <div className="mt-4">
            <Mono>workspace</Mono>
            <div className="mt-2 flex gap-2">
              <Input value={workspaceValue} onChange={(e) => setWorkspace(e.target.value)} className="font-mono text-[13px]" />
              <Button
                variant="solid"
                disabled={!workspace || workspace === data?.honchoWorkspace || update.isPending}
                onClick={() => workspace && update.mutate({ honchoWorkspace: workspace })}
              >
                Save
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-muted">defaults to mangled-agents</p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <Mono>mangler cli</Mono>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Run commands without approval. When off, Mangler asks you to approve each command before it runs.
              </p>
            </div>
            <button
              onClick={() => update.mutate({ cliAutorun: !data?.cliAutorun })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                data?.cliAutorun ? "bg-accent" : "bg-hairline-strong"
              }`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${data?.cliAutorun ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <div className="mt-4">
            <Mono>default working directory</Mono>
            <div className="mt-2 flex gap-2">
              <Input value={cliWorkdirValue} onChange={(e) => setCliWorkdir(e.target.value)} className="font-mono text-[13px]" placeholder="/path/to/dir" />
              <Button
                variant="solid"
                disabled={cliWorkdir === null || cliWorkdir === data?.cliWorkdir || update.isPending}
                onClick={() => update.mutate({ cliWorkdir: cliWorkdirValue })}
              >
                Save
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-muted">Where commands run when Mangler doesn't pass a project. Leave blank to require a project per command.</p>
          </div>
        </Card>

        <Card className="p-5">
          <Mono>github token</Mono>
          <div className="mt-3 flex gap-2">
            <Input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder={data?.githubTokenConfigured ? "configured — enter a new token to replace" : "ghp_… (optional, for private repos)"}
              className="font-mono text-[13px]"
            />
            <Button
              variant="solid"
              disabled={!githubToken || update.isPending}
              onClick={() => {
                update.mutate({ githubToken });
                setGithubToken("");
              }}
            >
              Save
            </Button>
            <Button disabled={!data?.githubTokenConfigured || update.isPending} onClick={() => update.mutate({ githubToken: "" })}>
              Clear
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Personal access token used by GitHub sync (Definitions → GitHub sync) for private repositories and higher rate limits.
          </p>
        </Card>

        <Card className="p-5">
          <Mono>data directory</Mono>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Moves the whole data directory (database, run history, and global definitions) into a <span className="font-mono">mangled-agents</span> folder at the chosen location. Stop active agents first.
          </p>
          <p className="mt-3 truncate font-mono text-[12px] text-faint" title={data?.dataDir}>
            current: {data?.dataDir ?? "…"}
          </p>
          <div className="mt-3">
            <FolderPicker onSelect={setTarget} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="solid" disabled={!target || moveData.isPending} onClick={() => target && moveData.mutate(target)}>
              {moveData.isPending ? "Moving…" : "Move data here"}
            </Button>
            {target && <span className="truncate font-mono text-[12px] text-muted">→ {target}/mangled-agents</span>}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, ok, hint }: { label: string; ok?: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-faint">{hint}</span>
        <StatusDot tone={ok ? "good" : "idle"} />
      </div>
    </div>
  );
}
