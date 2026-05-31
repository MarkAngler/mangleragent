import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { AgentEvent, AgentRun, PermissionRequest } from "../../shared/types";
import { Button, Mono, StatusDot } from "./ui";

interface Block {
  type: string;
  text?: string;
  name?: string;
}

export function OrchestratedRunView({ run }: { run: AgentRun }) {
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: events = [] } = useQuery({ queryKey: ["run-events", run.id], queryFn: () => get<AgentEvent[]>(`/runs/${run.id}/events`) });
  const { data: permissions = [] } = useQuery({ queryKey: ["run-perms", run.id], queryFn: () => get<PermissionRequest[]>(`/runs/${run.id}/permissions`) });

  useWsMessage((m) => {
    if (!("runId" in m) || m.runId !== run.id) return;
    if (m.type === "run.event") void qc.invalidateQueries({ queryKey: ["run-events", run.id] });
    if (m.type === "permission.request" || m.type === "permission.resolved") void qc.invalidateQueries({ queryKey: ["run-perms", run.id] });
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, permissions]);

  const decide = useMutation({
    mutationFn: (vars: { id: string; approved: boolean; reason?: string }) =>
      post(`/permissions/${vars.id}/decide`, { approved: vars.approved, reason: vars.reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["run-perms", run.id] }),
  });

  const pendingPlan = permissions.find((p) => p.status === "pending");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-surface">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {events.map((event) => (
          <EventView key={event.id} event={event} />
        ))}

        {permissions.map((p) => (
          <PlanCard key={p.id} request={p} onDecide={(approved, reason) => decide.mutate({ id: p.id, approved, reason })} />
        ))}

        {run.status === "awaiting_approval" && run.approver === "agent" && !pendingPlan && (
          <p className="my-3 text-sm text-warn">Awaiting Mangler's review…</p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EventView({ event }: { event: AgentEvent }) {
  const payload = event.payload as { blocks?: Block[]; results?: Array<{ content: string }>; text?: string };

  if (event.type === "assistant" && payload.blocks) {
    const text = payload.blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    const tools = payload.blocks.filter((b) => b.type === "tool_use");
    return (
      <div className="mb-4">
        <Mono>agent</Mono>
        {tools.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tools.map((b, i) => (
              <span key={i} className="rounded-full border border-hairline-strong bg-paper px-2.5 py-0.5 font-mono text-[11px] text-muted">
                ⚒ {b.name}
              </span>
            ))}
          </div>
        )}
        {text && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{text}</p>}
      </div>
    );
  }

  if (event.type === "tool_result" && payload.results) {
    return (
      <div className="mb-4">
        {payload.results.map((r, i) => (
          <pre key={i} className="overflow-x-auto whitespace-pre-wrap rounded bg-paper px-2 py-1 font-mono text-[11px] leading-snug text-faint">
            ↳ {r.content}
          </pre>
        ))}
      </div>
    );
  }

  if (event.type === "result") {
    return (
      <div className="mb-4 rounded-md border border-hairline bg-paper px-3 py-2">
        <Mono>result</Mono>
        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{payload.text}</p>
      </div>
    );
  }

  if (event.type === "system" || event.type === "error") {
    return <p className={`mb-2 text-[12px] ${event.type === "error" ? "text-bad" : "text-faint"}`}>{payload.text}</p>;
  }

  return null;
}

function PlanCard({ request, onDecide }: { request: PermissionRequest; onDecide: (approved: boolean, reason?: string) => void }) {
  const plan = (request.input as { plan?: string })?.plan ?? "";
  const decided = request.status !== "pending";

  return (
    <div className="my-4 rounded-lg border border-warn/40 bg-warn/5">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2">
          <StatusDot tone={request.status === "approved" ? "good" : request.status === "denied" ? "bad" : "warn"} pulse={!decided} />
          <span className="text-sm font-semibold text-ink">Plan {decided ? request.status : "needs approval"}</span>
        </div>
        <Mono>approver: {request.approver}</Mono>
      </div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-ink">{plan}</pre>
      {decided ? (
        request.reason && <p className="border-t border-hairline px-4 py-2 text-[12px] text-muted">{request.decidedBy}: {request.reason}</p>
      ) : request.approver === "human" ? (
        <div className="flex gap-2 border-t border-hairline px-4 py-3">
          <Button variant="solid" onClick={() => onDecide(true)}>
            Approve & run
          </Button>
          <Button onClick={() => onDecide(false, "Please revise the plan.")}>Request changes</Button>
        </div>
      ) : (
        <p className="border-t border-hairline px-4 py-2 text-[12px] text-warn">Awaiting Mangler's review…</p>
      )}
    </div>
  );
}
