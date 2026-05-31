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
