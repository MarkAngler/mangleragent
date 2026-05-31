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

export const Note = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Note = z.infer<typeof Note>;

export const CreateNoteInput = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().min(1),
  body: z.string().optional(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;

export const UpdateNoteInput = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;

export const Task = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  done: z.boolean(),
  due: z.number().nullable(),
  createdAt: z.number(),
});
export type Task = z.infer<typeof Task>;

export const CreateTaskInput = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().min(1),
  due: z.number().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
  due: z.number().nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

export const AgentRunKind = z.enum(["pty", "orchestrated"]);
export type AgentRunKind = z.infer<typeof AgentRunKind>;

export const AgentRunStatus = z.enum(["planning", "awaiting_approval", "running", "done", "failed", "stopped"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const Approver = z.enum(["human", "agent"]);
export type Approver = z.infer<typeof Approver>;

export const AgentRun = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  ticketId: z.string().nullable(),
  kind: AgentRunKind,
  title: z.string(),
  status: AgentRunStatus,
  approver: Approver,
  permissionMode: z.string(),
  model: z.string().nullable(),
  sdkSessionId: z.string().nullable(),
  cwd: z.string(),
  agentDef: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: z.number(),
  endedAt: z.number().nullable(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const CreatePtyRunInput = z.object({
  projectId: z.string(),
  ticketId: z.string().nullable().optional(),
});
export type CreatePtyRunInput = z.infer<typeof CreatePtyRunInput>;

export const Conversation = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
});
export type Conversation = z.infer<typeof Conversation>;

export const ChatMessage = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.unknown(),
  createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

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
