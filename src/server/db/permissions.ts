import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { PermissionRequest } from "../../shared/types";

interface PermissionRow {
  id: string;
  run_id: string;
  tool_name: string;
  input_json: string;
  kind: "tool" | "plan";
  status: "pending" | "approved" | "denied";
  approver: "human" | "agent";
  decided_by: string | null;
  reason: string | null;
  created_at: number;
  decided_at: number | null;
}

function toRequest(r: PermissionRow): PermissionRequest {
  return {
    id: r.id,
    runId: r.run_id,
    toolName: r.tool_name,
    input: JSON.parse(r.input_json) as unknown,
    kind: r.kind,
    status: r.status,
    approver: r.approver,
    decidedBy: r.decided_by,
    reason: r.reason,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

export const permissionsRepo = {
  create(input: {
    runId: string;
    toolName: string;
    input: unknown;
    kind: "tool" | "plan";
    approver: "human" | "agent";
  }): PermissionRequest {
    const req: PermissionRequest = {
      id: randomUUID(),
      runId: input.runId,
      toolName: input.toolName,
      input: input.input,
      kind: input.kind,
      status: "pending",
      approver: input.approver,
      decidedBy: null,
      reason: null,
      createdAt: now(),
      decidedAt: null,
    };
    db()
      .prepare(
        "INSERT INTO permission_requests (id, run_id, tool_name, input_json, kind, status, approver, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(req.id, req.runId, req.toolName, JSON.stringify(req.input), req.kind, req.status, req.approver, req.createdAt);
    return req;
  },

  get(id: string): PermissionRequest | undefined {
    const r = db().prepare("SELECT * FROM permission_requests WHERE id = ?").get(id) as PermissionRow | undefined;
    return r ? toRequest(r) : undefined;
  },

  listByRun(runId: string): PermissionRequest[] {
    return (
      db().prepare("SELECT * FROM permission_requests WHERE run_id = ? ORDER BY created_at").all(runId) as PermissionRow[]
    ).map(toRequest);
  },

  resolve(id: string, status: "approved" | "denied", decidedBy: string, reason?: string): void {
    db()
      .prepare("UPDATE permission_requests SET status = ?, decided_by = ?, reason = ?, decided_at = ? WHERE id = ?")
      .run(status, decidedBy, reason ?? null, now(), id);
  },
};
