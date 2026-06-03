import { z } from "zod";
import { AgentEvent, PermissionRequest } from "./types";

/**
 * Messages the server pushes to clients over the multiplexed `/ws` socket.
 * PTY byte streams use the separate `/ws/term` socket, not this envelope.
 */
export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), serverTime: z.string() }),
  z.object({ type: z.literal("board.updated"), projectId: z.string() }),
  z.object({ type: z.literal("run.updated"), runId: z.string() }),
  z.object({ type: z.literal("run.event"), runId: z.string(), event: AgentEvent }),
  z.object({ type: z.literal("permission.request"), runId: z.string(), request: PermissionRequest }),
  z.object({ type: z.literal("permission.resolved"), runId: z.string(), requestId: z.string() }),
  z.object({ type: z.literal("schedule.updated"), scheduleId: z.string() }),

  // Mangler streaming chat
  z.object({ type: z.literal("mangler.delta"), conversationId: z.string(), text: z.string() }),
  z.object({
    type: z.literal("mangler.tool"),
    conversationId: z.string(),
    tool: z.string(),
    phase: z.enum(["start", "done"]),
    summary: z.string().optional(),
  }),
  z.object({ type: z.literal("mangler.done"), conversationId: z.string() }),
  z.object({ type: z.literal("mangler.error"), conversationId: z.string(), error: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;

export const ClientMsg = z.discriminatedUnion("type", [z.object({ type: z.literal("ping") })]);
export type ClientMsg = z.infer<typeof ClientMsg>;
