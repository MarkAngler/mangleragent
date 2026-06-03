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
  description: z.string(),
  columns: z.array(Column),
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
});
export type Project = z.infer<typeof Project>;

export const CreateProjectInput = z.object({
  path: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  description: z.string(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

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

// `cron` is validated for syntax server-side (cron-parser is a node dep and must not leak
// into the client bundle), so here it is only a non-empty string.
export const Schedule = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  cron: z.string(),
  conversationId: z.string().nullable(),
  enabled: z.boolean(),
  lastRunAt: z.number().nullable(),
  nextRunAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Schedule = z.infer<typeof Schedule>;

export const CreateScheduleInput = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  cron: z.string().min(1),
  enabled: z.boolean().optional(),
});
export type CreateScheduleInput = z.infer<typeof CreateScheduleInput>;

export const UpdateScheduleInput = z.object({
  title: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  cron: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInput>;

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

export const CreateOrchestratedRunInput = z.object({
  projectId: z.string(),
  ticketId: z.string().nullable().optional(),
  prompt: z.string().optional(),
  approver: Approver.optional(),
  model: z.string().optional(),
});
export type CreateOrchestratedRunInput = z.infer<typeof CreateOrchestratedRunInput>;

export const AgentEvent = z.object({
  id: z.number(),
  runId: z.string(),
  seq: z.number(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.number(),
});
export type AgentEvent = z.infer<typeof AgentEvent>;

export const DiffFileStatus = z.enum(["added", "modified", "deleted", "renamed"]);
export type DiffFileStatus = z.infer<typeof DiffFileStatus>;

export const FileDiff = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  status: DiffFileStatus,
  additions: z.number(),
  deletions: z.number(),
  binary: z.boolean(),
  patch: z.string(),
});
export type FileDiff = z.infer<typeof FileDiff>;

export const RunDiff = z.object({
  available: z.boolean(),
  truncated: z.boolean(),
  files: z.array(FileDiff),
});
export type RunDiff = z.infer<typeof RunDiff>;

export const GitBranches = z.object({
  available: z.boolean(),
  current: z.string().nullable(), // null = detached HEAD / no commits
  branches: z.array(z.string()),
});
export type GitBranches = z.infer<typeof GitBranches>;

export const SwitchBranchInput = z.object({
  branch: z.string().min(1).max(255).refine((b) => !b.startsWith("-"), "invalid branch name"),
  create: z.boolean().optional(),
});
export type SwitchBranchInput = z.infer<typeof SwitchBranchInput>;

export const PermissionRequest = z.object({
  id: z.string(),
  runId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  kind: z.enum(["tool", "plan"]),
  status: z.enum(["pending", "approved", "denied"]),
  approver: Approver,
  decidedBy: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.number(),
  decidedAt: z.number().nullable(),
});
export type PermissionRequest = z.infer<typeof PermissionRequest>;

export const DecideInput = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});
export type DecideInput = z.infer<typeof DecideInput>;

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

export const DefKind = z.enum(["agent", "skill", "rule"]);
export type DefKind = z.infer<typeof DefKind>;

export const DefEntry = z.object({
  kind: DefKind,
  name: z.string(),
  description: z.string(),
  path: z.string(),
});
export type DefEntry = z.infer<typeof DefEntry>;

export const DefFile = z.object({
  kind: DefKind,
  name: z.string(),
  path: z.string(),
  content: z.string(),
});
export type DefFile = z.infer<typeof DefFile>;

const defName = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "name may contain only letters, numbers, dashes and underscores");

export const CreateDefInput = z.object({ scope: z.string().min(1), kind: DefKind, name: defName });
export type CreateDefInput = z.infer<typeof CreateDefInput>;

export const SaveDefInput = z.object({ scope: z.string().min(1), kind: DefKind, name: defName, content: z.string() });
export type SaveDefInput = z.infer<typeof SaveDefInput>;

export const CopyDefInput = z.object({
  scope: z.string().min(1),
  kind: DefKind,
  name: defName,
  targets: z.array(z.string().min(1)).min(1),
  overwrite: z.boolean().optional(),
});
export type CopyDefInput = z.infer<typeof CopyDefInput>;

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
