import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { del, get, patch, post } from "../lib/api";
import { useToast } from "../components/Toast";
import type { RegisteredAgent } from "../../shared/types";
import { Button, Card, Drawer, EmptyState, Input, Modal, Mono, PageHeader, StatusDot, Textarea } from "../components/ui";

interface AgentInput {
  name: string;
  endpoint: string;
  description: string;
}

export function ExternalAgentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({ queryKey: ["external-agents"], queryFn: () => get<RegisteredAgent[]>("/external-agents") });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => get<{ databricksConfigured: boolean }>("/settings") });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["external-agents"] });

  const createAgent = useMutation({
    mutationFn: (input: AgentInput) => post<RegisteredAgent>("/external-agents", input),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
    },
  });
  const updateAgent = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<AgentInput> }) => patch<RegisteredAgent>(`/external-agents/${vars.id}`, vars.patch),
    onSuccess: invalidate,
  });
  const deleteAgent = useMutation({ mutationFn: (id: string) => del(`/external-agents/${id}`), onSuccess: invalidate });
  const testAgent = useMutation({
    mutationFn: (id: string) => post<{ ok: boolean; reply: string }>(`/external-agents/${id}/test`),
    onSuccess: (data) => toast({ tone: "good", title: "Agent responded", body: data.reply || "(empty reply)" }),
    onError: (err) => toast({ tone: "bad", title: "Test failed", body: (err as Error).message }),
  });

  const openAgent = agents.find((a) => a.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Orchestration"
        title="External Agents"
        description="Register agents that run outside this app and talk to them directly or via Mangler. Phase 1 supports Databricks Model Serving endpoints, queried with the configured Databricks credentials."
        actions={
          <Button variant="solid" onClick={() => setAddOpen(true)}>
            + Register agent
          </Button>
        }
      />

      {!settings?.databricksConfigured && (
        <p className="mb-4 flex items-center gap-2 text-[12px] text-warn">
          <StatusDot tone="warn" /> Set DATABRICKS_HOST and DATABRICKS_TOKEN to call registered agents.
        </p>
      )}

      {agents.length === 0 ? (
        <EmptyState title="No external agents yet" hint="Register a Databricks Model Serving endpoint to chat with it or let Mangler consult it." />
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map((a) => (
            <Card key={a.id} className="p-4 hover:border-hairline-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenId(a.id)}>
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{a.name}</h3>
                    <Mono className="text-faint">{a.provider}</Mono>
                  </div>
                  <Mono className="mt-1 block">endpoint {a.endpoint}</Mono>
                  {a.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{a.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="solid" onClick={() => navigate(`/external-agents/${a.id}`)}>
                    Chat
                  </Button>
                  <Button disabled={testAgent.isPending} onClick={() => testAgent.mutate(a.id)}>
                    Test
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddAgentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={(input) => createAgent.mutate(input)}
        error={createAgent.isError ? (createAgent.error as Error).message : null}
        pending={createAgent.isPending}
      />

      <Drawer open={Boolean(openAgent)} onClose={() => setOpenId(null)} title={<Mono>external agent</Mono>}>
        {openAgent && (
          <AgentEditor
            key={openAgent.id}
            agent={openAgent}
            onSave={(p) => updateAgent.mutate({ id: openAgent.id, patch: p })}
            onDelete={() => {
              deleteAgent.mutate(openAgent.id);
              setOpenId(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function AddAgentModal({
  open,
  onClose,
  onCreate,
  error,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: AgentInput) => void;
  error: string | null;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [description, setDescription] = useState("");
  const valid = name.trim() && endpoint.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register external agent"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="solid"
            disabled={!valid || pending}
            onClick={() => onCreate({ name: name.trim(), endpoint: endpoint.trim(), description: description.trim() })}
          >
            Register
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Mono>name</Mono>
          <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support triage agent" />
        </div>
        <div>
          <Mono>serving endpoint</Mono>
          <Input className="mt-1.5 font-mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="my-agent-endpoint" />
          <p className="mt-1.5 text-xs text-faint">The Databricks Model Serving endpoint name (used as the model).</p>
        </div>
        <div>
          <Mono>description</Mono>
          <Textarea
            className="mt-1.5"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent is for — also shown to Mangler so it knows when to consult it."
          />
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

function AgentEditor({
  agent,
  onSave,
  onDelete,
}: {
  agent: RegisteredAgent;
  onSave: (patch: Partial<AgentInput>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(agent.name);
  const [endpoint, setEndpoint] = useState(agent.endpoint);
  const [description, setDescription] = useState(agent.description);
  const commit = () =>
    onSave({ name: name.trim() || agent.name, endpoint: endpoint.trim() || agent.endpoint, description: description.trim() });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Mono>name</Mono>
        <Input className="mt-1.5 text-base font-medium" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
      </div>
      <div>
        <Mono>serving endpoint</Mono>
        <Input className="mt-1.5 font-mono" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} onBlur={commit} />
      </div>
      <div>
        <Mono>description</Mono>
        <Textarea className="mt-1.5" rows={8} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={commit} />
      </div>
      <div className="flex items-center justify-end pt-2">
        <button onClick={onDelete}>
          <Mono className="hover:text-bad">delete agent</Mono>
        </button>
      </div>
    </div>
  );
}
