import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "../lib/api";
import { Button, Card, Input, Mono, PageHeader, StatusDot, Textarea } from "../components/ui";

type Provider = "anthropic" | "databricks";

interface Settings {
  anthropicConfigured: boolean;
  honchoConfigured: boolean;
  honchoEnabled: boolean;
  honchoWorkspace: string;
  provider: Provider;
  databricksConfigured: boolean;
  databricksHost: string;
  databricksProfile: string;
  model: string;
  systemPrompt: string;
  defaultSystemPrompt: string;
}

type Patchable = Partial<Pick<Settings, "honchoEnabled" | "honchoWorkspace" | "provider" | "databricksHost" | "databricksProfile" | "model" | "systemPrompt">>;

export function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get<Settings>("/settings") });

  const update = useMutation({
    mutationFn: (patchBody: Patchable) => patch("/settings", patchBody),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  const provider = data?.provider ?? "anthropic";

  const [model, setModel] = useState<string | null>(null);
  const modelValue = model ?? data?.model ?? "";

  const [host, setHost] = useState<string | null>(null);
  const hostValue = host ?? data?.databricksHost ?? "";

  const [profile, setProfile] = useState<string | null>(null);
  const profileValue = profile ?? data?.databricksProfile ?? "";

  const [workspace, setWorkspace] = useState<string | null>(null);
  const workspaceValue = workspace ?? data?.honchoWorkspace ?? "";

  const [prompt, setPrompt] = useState<string | null>(null);
  const promptValue = prompt ?? data?.systemPrompt ?? "";

  return (
    <>
      <PageHeader eyebrow="Configure" title="Settings" description="API keys, the Mangler model and system prompt, and the optional honcho.dev memory integration." />

      <div className="flex max-w-xl flex-col gap-4">
        <Card className="p-5">
          <Mono>credentials</Mono>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Claude API key" ok={data?.anthropicConfigured} hint="from CLAUDE_API_KEY / ANTHROPIC_API_KEY" />
            <Row label="Databricks" ok={data?.databricksConfigured} hint="from DATABRICKS_HOST / databricks CLI" />
            <Row label="Honcho API key" ok={data?.honchoConfigured} hint="from HONCHO_DEV_API_KEY" />
          </div>
        </Card>

        <Card className="p-5">
          <Mono>mangler model</Mono>
          <div className="mt-3 flex flex-col gap-2">
            <select
              value={provider}
              onChange={(e) => update.mutate({ provider: e.target.value as Provider })}
              disabled={update.isPending}
              className="w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            >
              <option value="anthropic">Anthropic API</option>
              <option value="databricks">Databricks</option>
            </select>
            <div className="flex gap-2">
              <Input value={modelValue} onChange={(e) => setModel(e.target.value)} className="font-mono text-[13px]" />
              <Button
                variant="solid"
                disabled={!model || model === data?.model || update.isPending}
                onClick={() => model && update.mutate({ model })}
              >
                Save
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            {provider === "databricks"
              ? "Databricks serving endpoint, e.g. databricks-claude-opus-4-8"
              : "e.g. claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001"}
          </p>
        </Card>

        <Card className="p-5">
          <Mono>databricks</Mono>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Route Mangler through a Databricks foundation-model serving endpoint. Auth uses the Databricks CLI&mdash;run{" "}
            <code className="font-mono">databricks auth login</code> first.
          </p>
          {!data?.databricksConfigured && (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-warn">
              <StatusDot tone="warn" /> Set a workspace host below to enable this.
            </p>
          )}
          <div className="mt-4">
            <Mono>workspace host</Mono>
            <div className="mt-2 flex gap-2">
              <Input
                value={hostValue}
                onChange={(e) => setHost(e.target.value)}
                placeholder="adb-….azuredatabricks.net"
                className="font-mono text-[13px]"
              />
              <Button
                variant="solid"
                disabled={!host || host === data?.databricksHost || update.isPending}
                onClick={() => host && update.mutate({ databricksHost: host })}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Mono>cli profile</Mono>
            <div className="mt-2 flex gap-2">
              <Input value={profileValue} onChange={(e) => setProfile(e.target.value)} className="font-mono text-[13px]" />
              <Button
                variant="solid"
                disabled={!profile || profile === data?.databricksProfile || update.isPending}
                onClick={() => profile && update.mutate({ databricksProfile: profile })}
              >
                Save
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-muted">~/.databrickscfg profile, defaults to DEFAULT</p>
          </div>
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
          <p className="mt-2 text-[12px] text-muted">Defines Mangler's persona and operating rules. Reset restores the built-in default.</p>
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
