import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { del, get, patch, post } from "../lib/api";
import type { Agent, AgentApproval, AgentType, McpServer, Project } from "../../shared/types";
import { Button, Card, Drawer, EmptyState, Input, Modal, Mono, PageHeader, StatusDot, Textarea } from "../components/ui";
import { usePageTitle } from "../components/PageTitleProvider";

interface AgentDraft {
  type: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  mcpServerIds: string[];
  approval: AgentApproval;
}

const EMPTY_DRAFT: AgentDraft = { type: "task", name: "", description: "", systemPrompt: "", model: "", mcpServerIds: [], approval: "none" };

const TYPE_HELP: Record<AgentType, string> = {
  task: "Non-coding — works through its tools (MCP) and reading; cannot edit files.",
  coding: "Edits files like a delegated coding agent, with this agent's prompt and tools.",
};

const APPROVAL_HELP: Record<AgentApproval, string> = {
  none: "Runs every tool call freely (best for read-only review agents).",
  agent: "Mangler reviews each external (MCP) tool call before it runs.",
  human: "You approve each external (MCP) tool call before it runs.",
};

function draftToInput(d: AgentDraft) {
  return {
    type: d.type,
    name: d.name.trim(),
    description: d.description.trim(),
    systemPrompt: d.systemPrompt,
    model: d.model.trim() || null,
    mcpServerIds: d.mcpServerIds,
    approval: d.approval,
  };
}

export function AgentBuilderPage() {
  usePageTitle("Agents");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: () => get<Agent[]>("/agents") });
  const { data: servers = [] } = useQuery({ queryKey: ["mcp-servers"], queryFn: () => get<McpServer[]>("/mcp-servers") });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => get<{ anthropicConfigured: boolean }>("/settings") });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["agents"] });

  const createAgent = useMutation({
    mutationFn: (d: AgentDraft) => post<Agent>("/agents", draftToInput(d)),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
    },
  });
  const updateAgent = useMutation({
    mutationFn: (vars: { id: string; draft: AgentDraft }) => patch<Agent>(`/agents/${vars.id}`, draftToInput(vars.draft)),
    onSuccess: invalidate,
  });
  const deleteAgent = useMutation({ mutationFn: (id: string) => del(`/agents/${id}`), onSuccess: invalidate });

  const openAgent = agents.find((a) => a.id === openId) ?? null;
  const runAgent = agents.find((a) => a.id === runId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Build"
        title="Agents"
        description="Build specialized agents that run in this app. A non-coding 'task' agent works through its selected MCP servers (e.g. a ServiceNow reviewer); Mangler delegates to the right one, and you can run or chat with it directly."
        actions={
          <Button variant="solid" onClick={() => setAddOpen(true)}>
            + Build agent
          </Button>
        }
      />

      {settings && !settings.anthropicConfigured && (
        <p className="mb-4 flex items-center gap-2 text-[12px] text-warn">
          <StatusDot tone="warn" /> Set CLAUDE_API_KEY to run these agents.
        </p>
      )}

      {agents.length === 0 ? (
        <EmptyState title="No agents yet" hint="Build a task agent, give it a system prompt and one or more MCP servers, then run it, chat with it, or let Mangler delegate to it." />
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map((a) => (
            <Card key={a.id} className="p-4 hover:border-hairline-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenId(a.id)}>
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{a.name}</h3>
                    <Mono className="text-faint">{a.type}</Mono>
                    <Mono className="text-faint">{a.mcpServerIds.length} mcp</Mono>
                  </div>
                  {a.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{a.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="solid" onClick={() => setRunId(a.id)}>
                    Run
                  </Button>
                  <Button onClick={() => navigate(`/agent-builder/${a.id}`)}>Chat</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Build agent"
        footer={null}
      >
        <AgentForm
          initial={EMPTY_DRAFT}
          servers={servers}
          submitLabel="Build"
          pending={createAgent.isPending}
          error={createAgent.isError ? (createAgent.error as Error).message : null}
          onSubmit={(d) => createAgent.mutate(d)}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>

      <Drawer open={Boolean(openAgent)} onClose={() => setOpenId(null)} title={<Mono>agent</Mono>}>
        {openAgent && (
          <AgentForm
            key={openAgent.id}
            initial={{
              type: openAgent.type,
              name: openAgent.name,
              description: openAgent.description,
              systemPrompt: openAgent.systemPrompt,
              model: openAgent.model ?? "",
              mcpServerIds: openAgent.mcpServerIds,
              approval: openAgent.approval,
            }}
            servers={servers}
            submitLabel="Save"
            pending={updateAgent.isPending}
            error={updateAgent.isError ? (updateAgent.error as Error).message : null}
            onSubmit={(d) => updateAgent.mutate({ id: openAgent.id, draft: d })}
            onDelete={() => {
              deleteAgent.mutate(openAgent.id);
              setOpenId(null);
            }}
          />
        )}
      </Drawer>

      <RunAgentModal agent={runAgent} onClose={() => setRunId(null)} onRan={() => navigate("/agents")} />
    </div>
  );
}

function AgentForm({
  initial,
  servers,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: AgentDraft;
  servers: McpServer[];
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: AgentDraft) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<AgentDraft>(initial);
  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleServer = (id: string) =>
    set("mcpServerIds", draft.mcpServerIds.includes(id) ? draft.mcpServerIds.filter((s) => s !== id) : [...draft.mcpServerIds, id]);
  const selectClass = "mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Mono>type</Mono>
        <select value={draft.type} onChange={(e) => set("type", e.target.value as AgentType)} className={selectClass}>
          <option value="task">Task (non-coding)</option>
          <option value="coding">Coding</option>
        </select>
        <p className="mt-1.5 text-xs text-faint">{TYPE_HELP[draft.type]}</p>
      </div>
      <div>
        <Mono>name</Mono>
        <Input className="mt-1.5" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="ServiceNow ticket reviewer" />
      </div>
      <div>
        <Mono>description</Mono>
        <Textarea
          className="mt-1.5"
          rows={3}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What this agent does and when to use it — also shown to Mangler so it knows when to delegate."
        />
      </div>
      <div>
        <Mono>system prompt</Mono>
        <Textarea
          className="mt-1.5 font-mono text-[12.5px]"
          rows={8}
          value={draft.systemPrompt}
          onChange={(e) => set("systemPrompt", e.target.value)}
          placeholder="You are a ServiceNow ticket reviewer. Each run, review open tickets and summarize what needs attention…"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Mono>model</Mono>
          <Input className="mt-1.5 font-mono" value={draft.model} onChange={(e) => set("model", e.target.value)} placeholder="(default)" />
        </div>
        <div>
          <Mono>approval</Mono>
          <select value={draft.approval} onChange={(e) => set("approval", e.target.value as AgentApproval)} className={selectClass}>
            <option value="none">None</option>
            <option value="agent">Mangler reviews</option>
            <option value="human">I approve</option>
          </select>
        </div>
      </div>
      <p className="-mt-1 text-xs text-faint">{APPROVAL_HELP[draft.approval]}</p>
      <div>
        <Mono>mcp servers</Mono>
        {servers.length === 0 ? (
          <p className="mt-1.5 text-xs text-faint">No MCP servers configured. Add one on the MCP Servers page to give this agent tools.</p>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1">
            {servers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-paper">
                <input type="checkbox" checked={draft.mcpServerIds.includes(s.id)} onChange={() => toggleServer(s.id)} />
                {s.name}
                {!s.enabled && <Mono className="text-faint">disabled</Mono>}
              </label>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex items-center justify-between pt-1">
        {onDelete ? (
          <button onClick={onDelete}>
            <Mono className="hover:text-bad">delete agent</Mono>
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          <Button variant="solid" disabled={!draft.name.trim() || pending} onClick={() => onSubmit(draft)}>
            {pending ? "…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RunAgentModal({ agent, onClose, onRan }: { agent: Agent | null; onClose: () => void; onRan: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState("");
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => get<Project[]>("/projects") });
  const run = useMutation({
    mutationFn: () => post(`/agents/${agent?.id}/run`, { prompt: prompt.trim(), projectId: projectId || null }),
    onSuccess: () => {
      setPrompt("");
      setProjectId("");
      onClose();
      onRan();
    },
  });

  return (
    <Modal
      open={Boolean(agent)}
      onClose={onClose}
      title={`Run ${agent?.name ?? "agent"}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="solid" disabled={!prompt.trim() || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Starting…" : "Run"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Mono>task</Mono>
          <Textarea className="mt-1.5" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should the agent do on this run?" />
        </div>
        <div>
          <Mono>project (optional)</Mono>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-faint">Only set this if the work concerns a project's folder.</p>
        </div>
        {run.isError && <p className="text-sm text-bad">{(run.error as Error).message}</p>}
      </div>
    </Modal>
  );
}
