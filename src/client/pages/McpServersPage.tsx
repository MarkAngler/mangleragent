import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import { useToast } from "../components/Toast";
import type { McpServer, McpTransport } from "../../shared/types";
import { Button, Card, Drawer, EmptyState, Input, Modal, Mono, PageHeader, StatusDot, Textarea } from "../components/ui";
import { usePageTitle } from "../components/PageTitleProvider";

const TRANSPORTS: Record<McpTransport, { label: string; help: string }> = {
  stdio: { label: "Local (stdio)", help: "Spawns a local command and speaks MCP over its stdin/stdout." },
  http: { label: "Remote (HTTP)", help: "Connects to a Streamable HTTP MCP endpoint." },
  sse: { label: "Remote (SSE)", help: "Connects to a Server-Sent Events MCP endpoint." },
};

interface FormState {
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { name: "", transport: "stdio", command: "", args: "", env: "", url: "", headers: "", enabled: true };

function fromServer(s: McpServer): FormState {
  return {
    name: s.name,
    transport: s.transport,
    command: s.command,
    args: s.args.join("\n"),
    env: kvToText(s.env),
    url: s.url,
    headers: kvToText(s.headers),
    enabled: s.enabled,
  };
}

function lines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function parseKv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0) out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function kvToText(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function toPayload(f: FormState) {
  const base = { name: f.name.trim(), transport: f.transport, enabled: f.enabled };
  return f.transport === "stdio"
    ? { ...base, command: f.command.trim(), args: lines(f.args), env: parseKv(f.env) }
    : { ...base, url: f.url.trim(), headers: parseKv(f.headers) };
}

function isValid(f: FormState): boolean {
  if (!f.name.trim()) return false;
  return f.transport === "stdio" ? Boolean(f.command.trim()) : Boolean(f.url.trim());
}

function targetOf(s: McpServer): string {
  return s.transport === "stdio" ? [s.command, ...s.args].join(" ") : s.url;
}

export function McpServersPage() {
  usePageTitle("MCP Servers");
  const qc = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: servers = [] } = useQuery({ queryKey: ["mcp-servers"], queryFn: () => get<McpServer[]>("/mcp-servers") });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["mcp-servers"] });

  const createServer = useMutation({
    mutationFn: (form: FormState) => post<McpServer>("/mcp-servers", toPayload(form)),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
    },
  });
  const updateServer = useMutation({
    mutationFn: (vars: { id: string; form: FormState }) => patch<McpServer>(`/mcp-servers/${vars.id}`, toPayload(vars.form)),
    onSuccess: invalidate,
  });
  const deleteServer = useMutation({ mutationFn: (id: string) => del(`/mcp-servers/${id}`), onSuccess: invalidate });
  const testServer = useMutation({
    mutationFn: (id: string) => post<{ ok: boolean; toolCount: number; toolNames: string[] }>(`/mcp-servers/${id}/test`),
    onSuccess: (data) =>
      toast({
        tone: "good",
        title: `Connected — ${data.toolCount} tool${data.toolCount === 1 ? "" : "s"}`,
        body: data.toolNames.join(", ") || "(no tools exposed)",
      }),
    onError: (err) => toast({ tone: "bad", title: "Connection failed", body: (err as Error).message }),
  });

  const openServer = servers.find((s) => s.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Orchestration"
        title="MCP Servers"
        description="Register external Model Context Protocol servers. Their tools are merged into Mangler's toolset, so Mangler can call them mid-conversation. Supports local (stdio) commands and remote HTTP/SSE endpoints."
        actions={
          <Button variant="solid" onClick={() => setAddOpen(true)}>
            + Register server
          </Button>
        }
      />

      {servers.length === 0 ? (
        <EmptyState title="No MCP servers yet" hint="Register a local stdio command or a remote HTTP/SSE endpoint to give Mangler its tools." />
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((s) => (
            <Card key={s.id} className="p-4 hover:border-hairline-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenId(s.id)}>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={s.enabled ? "good" : "idle"} />
                    <h3 className="truncate text-sm font-semibold text-ink">{s.name}</h3>
                    <Mono className="text-faint">{TRANSPORTS[s.transport].label}</Mono>
                    {!s.enabled && <Mono className="text-faint">disabled</Mono>}
                  </div>
                  <Mono className="mt-1 block truncate font-mono">{targetOf(s)}</Mono>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button disabled={testServer.isPending} onClick={() => testServer.mutate(s.id)}>
                    Test
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddServerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={(form) => createServer.mutate(form)}
        error={createServer.isError ? (createServer.error as Error).message : null}
        pending={createServer.isPending}
      />

      <Drawer open={Boolean(openServer)} onClose={() => setOpenId(null)} title={<Mono>mcp server</Mono>}>
        {openServer && (
          <ServerEditor
            key={openServer.id}
            server={openServer}
            onSave={(form) => updateServer.mutate({ id: openServer.id, form })}
            saving={updateServer.isPending}
            onDelete={() => {
              deleteServer.mutate(openServer.id);
              setOpenId(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function ServerFields({ form, set }: { form: FormState; set: (patch: Partial<FormState>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Mono>name</Mono>
        <Input className="mt-1.5" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="filesystem" />
      </div>
      <div>
        <Mono>transport</Mono>
        <select
          value={form.transport}
          onChange={(e) => set({ transport: e.target.value as McpTransport })}
          className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {(Object.keys(TRANSPORTS) as McpTransport[]).map((t) => (
            <option key={t} value={t}>
              {TRANSPORTS[t].label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-faint">{TRANSPORTS[form.transport].help}</p>
      </div>

      {form.transport === "stdio" ? (
        <>
          <div>
            <Mono>command</Mono>
            <Input className="mt-1.5 font-mono" value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder="npx" />
          </div>
          <div>
            <Mono>args (one per line)</Mono>
            <Textarea
              className="mt-1.5 font-mono"
              rows={3}
              value={form.args}
              onChange={(e) => set({ args: e.target.value })}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
            />
          </div>
          <div>
            <Mono>env (KEY=value per line)</Mono>
            <Textarea
              className="mt-1.5 font-mono"
              rows={2}
              value={form.env}
              onChange={(e) => set({ env: e.target.value })}
              placeholder="API_TOKEN=secret"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <Mono>url</Mono>
            <Input
              className="mt-1.5 font-mono"
              value={form.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://example.com/mcp"
            />
          </div>
          <div>
            <Mono>headers (KEY=value per line)</Mono>
            <Textarea
              className="mt-1.5 font-mono"
              rows={2}
              value={form.headers}
              onChange={(e) => set({ headers: e.target.value })}
              placeholder="Authorization=Bearer xxxxx"
            />
          </div>
        </>
      )}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Enabled (offer this server's tools to Mangler)
      </label>
    </div>
  );
}

function AddServerModal({
  open,
  onClose,
  onCreate,
  error,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (form: FormState) => void;
  error: string | null;
  pending: boolean;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register MCP server"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="solid" disabled={!isValid(form) || pending} onClick={() => onCreate(form)}>
            Register
          </Button>
        </>
      }
    >
      <ServerFields form={form} set={set} />
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
    </Modal>
  );
}

function ServerEditor({
  server,
  onSave,
  saving,
  onDelete,
}: {
  server: McpServer;
  onSave: (form: FormState) => void;
  saving: boolean;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => fromServer(server));
  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-col gap-5">
      <ServerFields form={form} set={set} />
      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <button onClick={onDelete}>
          <Mono className="hover:text-bad">delete server</Mono>
        </button>
        <Button variant="solid" disabled={!isValid(form) || saving} onClick={() => onSave(form)}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
