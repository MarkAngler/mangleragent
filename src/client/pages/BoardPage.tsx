import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import { appendPosition, insertPosition } from "../../shared/board";
import type { AgentRun, Column, Project, Ticket } from "../../shared/types";
import { Button, Drawer, Input, Mono, PageHeader, Textarea } from "../components/ui";

export function BoardPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ticketsKey = ["tickets", projectId];

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => get<Project>(`/projects/${projectId}`) });
  const { data: tickets = [] } = useQuery({ queryKey: ticketsKey, queryFn: () => get<Ticket[]>(`/tickets?projectId=${projectId}`) });

  useWsMessage((msg) => {
    if (msg.type === "board.updated" && msg.projectId === projectId) {
      void qc.invalidateQueries({ queryKey: ticketsKey });
    }
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ticketsKey });

  const create = useMutation({
    mutationFn: (vars: { title: string; columnId: string }) =>
      post<Ticket>("/tickets", { projectId, title: vars.title, columnId: vars.columnId }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Pick<Ticket, "title" | "body" | "labels">> }) =>
      patch<Ticket>(`/tickets/${vars.id}`, vars.patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/tickets/${id}`),
    onSuccess: invalidate,
  });
  const openTerminal = useMutation({
    mutationFn: (vars: { ticketId?: string }) => post<AgentRun>("/runs/pty", { projectId, ticketId: vars.ticketId ?? null }),
    onSuccess: (run) => navigate(`/agents?run=${run.id}`),
  });
  const openVscode = useMutation({
    mutationFn: () => post(`/projects/${projectId}/open`),
    onError: (err) => alert((err as Error).message),
  });
  const delegate = useMutation({
    mutationFn: (vars: { ticketId: string; approver: "human" | "agent" }) =>
      post<AgentRun>("/runs/orchestrated", { projectId, ticketId: vars.ticketId, approver: vars.approver }),
    onSuccess: (run) => navigate(`/agents?run=${run.id}`),
  });

  const move = useMutation({
    mutationFn: (vars: { id: string; columnId: string; position: number }) =>
      post<Ticket>(`/tickets/${vars.id}/move`, { columnId: vars.columnId, position: vars.position }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ticketsKey });
      const prev = qc.getQueryData<Ticket[]>(ticketsKey);
      qc.setQueryData<Ticket[]>(ticketsKey, (old = []) =>
        old.map((t) => (t.id === vars.id ? { ...t, columnId: vars.columnId, position: vars.position } : t)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ticketsKey, ctx.prev);
    },
    onSettled: invalidate,
  });

  const columnTickets = (columnId: string) =>
    tickets.filter((t) => t.columnId === columnId).sort((a, b) => a.position - b.position);

  function drop(columnId: string, beforeId: string | null) {
    if (!draggingId) return;
    const others = columnTickets(columnId).filter((t) => t.id !== draggingId);
    const index = beforeId ? Math.max(0, others.findIndex((t) => t.id === beforeId)) : others.length;
    move.mutate({ id: draggingId, columnId, position: insertPosition(others.map((t) => t.position), index) });
    setDraggingId(null);
  }

  function submitAdd(columnId: string) {
    const title = addTitle.trim();
    if (title) create.mutate({ title, columnId });
    setAddTitle("");
    setAddingColumn(null);
  }

  const openTicket = tickets.find((t) => t.id === openTicketId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow={project ? project.path.replace(/^.*\//, "…/") : "project"}
        title={project?.name ?? "Board"}
        actions={
          <div className="flex items-center gap-3">
            <Link to="/projects">
              <Mono className="hover:text-accent">← all projects</Mono>
            </Link>
            <Button onClick={() => openVscode.mutate()} disabled={openVscode.isPending}>Open in VS Code</Button>
            <Button onClick={() => openTerminal.mutate({})}>Open terminal</Button>
          </div>
        }
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {(project?.columns ?? []).map((column: Column) => {
          const items = columnTickets(column.id);
          return (
            <section
              key={column.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(column.id, null)}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-hairline bg-paper"
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium text-ink">{column.name}</span>
                <Mono>{items.length}</Mono>
              </div>

              <div className="flex min-h-2 flex-1 flex-col gap-2 px-2 pb-2">
                {items.map((ticket) => (
                  <article
                    key={ticket.id}
                    draggable
                    onDragStart={() => setDraggingId(ticket.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      drop(column.id, ticket.id);
                    }}
                    onClick={() => setOpenTicketId(ticket.id)}
                    className={`cursor-pointer rounded-md border border-hairline bg-surface p-3 shadow-sm transition-shadow hover:shadow-md ${
                      draggingId === ticket.id ? "opacity-40" : ""
                    }`}
                  >
                    <p className="text-sm leading-snug text-ink">{ticket.title}</p>
                    {ticket.labels.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ticket.labels.map((label) => (
                          <span key={label} className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}

                {addingColumn === column.id ? (
                  <Textarea
                    autoFocus
                    rows={2}
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    onBlur={() => submitAdd(column.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitAdd(column.id);
                      }
                      if (e.key === "Escape") {
                        setAddTitle("");
                        setAddingColumn(null);
                      }
                    }}
                    placeholder="Ticket title…"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setAddingColumn(column.id);
                      setAddTitle("");
                    }}
                    className="rounded-md px-2 py-1.5 text-left text-sm text-faint hover:bg-surface hover:text-muted"
                  >
                    + New
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Drawer open={Boolean(openTicket)} onClose={() => setOpenTicketId(null)} title={<Mono>ticket</Mono>}>
        {openTicket && project && (
          <TicketEditor
            key={openTicket.id}
            ticket={openTicket}
            columns={project.columns}
            onSave={(p) => update.mutate({ id: openTicket.id, patch: p })}
            onMoveColumn={(columnId) =>
              move.mutate({
                id: openTicket.id,
                columnId,
                position: appendPosition(columnTickets(columnId).filter((t) => t.id !== openTicket.id).map((t) => t.position)),
              })
            }
            onOpenTerminal={() => openTerminal.mutate({ ticketId: openTicket.id })}
            onDelegate={(approver) => delegate.mutate({ ticketId: openTicket.id, approver })}
            onDelete={() => {
              remove.mutate(openTicket.id);
              setOpenTicketId(null);
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function TicketEditor({
  ticket,
  columns,
  onSave,
  onMoveColumn,
  onOpenTerminal,
  onDelegate,
  onDelete,
}: {
  ticket: Ticket;
  columns: Column[];
  onSave: (patch: Partial<Pick<Ticket, "title" | "body" | "labels">>) => void;
  onMoveColumn: (columnId: string) => void;
  onOpenTerminal: () => void;
  onDelegate: (approver: "human" | "agent") => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [body, setBody] = useState(ticket.body);
  const [labels, setLabels] = useState(ticket.labels.join(", "));
  const [approver, setApprover] = useState<"agent" | "human">("agent");

  const commit = () =>
    onSave({
      title: title.trim() || ticket.title,
      body,
      labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
    });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Mono>title</Mono>
        <Input className="mt-1.5 text-base font-medium" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} />
      </div>

      <div>
        <Mono>column</Mono>
        <select
          value={ticket.columnId}
          onChange={(e) => onMoveColumn(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Mono>description</Mono>
        <Textarea className="mt-1.5" rows={8} value={body} onChange={(e) => setBody(e.target.value)} onBlur={commit} placeholder="Add detail…" />
      </div>

      <div>
        <Mono>labels (comma-separated)</Mono>
        <Input className="mt-1.5 font-mono text-[12px]" value={labels} onChange={(e) => setLabels(e.target.value)} onBlur={commit} placeholder="bug, urgent" />
      </div>

      <div className="border-t border-hairline pt-4">
        <Mono>agents</Mono>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={onOpenTerminal}>Open terminal</Button>
          <select
            value={approver}
            onChange={(e) => setApprover(e.target.value as "agent" | "human")}
            className="rounded-md border border-hairline-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="agent">Mangler approves</option>
            <option value="human">I approve</option>
          </select>
          <Button variant="solid" onClick={() => onDelegate(approver)}>
            Delegate
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Delegate runs an autonomous agent via the Claude Agent SDK (in-process, calling the Anthropic API — not the interactive Claude Code terminal). It plans first, then runs on its own once the plan is approved — by Mangler or by you, in Active Agents.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Mono>updated {new Date(ticket.updatedAt).toLocaleString()}</Mono>
        <button onClick={onDelete}>
          <Mono className="hover:text-bad">delete ticket</Mono>
        </button>
      </div>
    </div>
  );
}
