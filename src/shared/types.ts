import { z } from "zod";

export const Column = z.object({ id: z.string(), name: z.string() });
export type Column = z.infer<typeof Column>;

export const DEFAULT_COLUMNS: Column[] = [
  { id: "backlog", name: "Backlog" },
  { id: "todo", name: "Todo" },
  { id: "in_progress", name: "In Progress" },
  { id: "review", name: "Review" },
  { id: "done", name: "Done" },
];

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  columns: z.array(Column),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
});
export type Project = z.infer<typeof Project>;

export const CreateProjectInput = z.object({
  path: z.string().min(1),
  name: z.string().min(1).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const Ticket = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  body: z.string(),
  columnId: z.string(),
  position: z.number(),
  labels: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Ticket = z.infer<typeof Ticket>;

export const CreateTicketInput = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  columnId: z.string().optional(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

export const UpdateTicketInput = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketInput>;

export const MoveTicketInput = z.object({
  columnId: z.string().min(1),
  position: z.number(),
});
export type MoveTicketInput = z.infer<typeof MoveTicketInput>;

export const DirEntry = z.object({
  name: z.string(),
  path: z.string(),
  hasGit: z.boolean(),
});
export type DirEntry = z.infer<typeof DirEntry>;

export const BrowseResult = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  entries: z.array(DirEntry),
});
export type BrowseResult = z.infer<typeof BrowseResult>;
