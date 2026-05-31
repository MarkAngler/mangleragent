import { z } from "zod";

/**
 * Messages the server pushes to clients over the multiplexed `/ws` socket.
 * Grows per feature phase; PTY byte streams use the separate `/ws/term` socket.
 */
export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), serverTime: z.string() }),
  z.object({ type: z.literal("board.updated"), projectId: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;

/** Messages clients send to the server over `/ws`. */
export const ClientMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;
