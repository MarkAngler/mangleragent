import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { projectsRepo } from "../db/projects";
import { ticketsRepo } from "../db/tickets";
import { notesRepo } from "../db/notes";
import { tasksRepo } from "../db/tasks";
import { appendPosition } from "../../shared/board";
import { broadcast } from "../realtime/hub";
import { runsRepo } from "../db/runs";
import { schedulesRepo } from "../db/schedules";
import { readDef, MANGLER_SCOPE } from "../defs";
import { startOrchestratedRun } from "./orchestrator";
import { isValidCron, nextRun } from "../cron";
import { Approver } from "../../shared/types";

interface ErasedTool {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (input: unknown) => unknown;
}

// Bind validation to each tool so the registry can stay homogeneous while each
// handler still sees a fully-typed, validated input.
function tool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  handler: (input: z.infer<S>) => unknown;
}): ErasedTool {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema,
    run: (input) => {
      const parsed = def.schema.safeParse(input ?? {});
      if (!parsed.success) return { error: `invalid arguments: ${parsed.error.issues[0]?.message ?? "bad input"}` };
      try {
        return def.handler(parsed.data);
      } catch (err) {
        return { error: (err as Error).message };
      }
    },
  };
}

const defs: ErasedTool[] = [
  tool({
    name: "list_projects",
    description:
      "List all projects (id, name, path, description, kanban columns). Call this first to resolve a project before acting on its tickets. The description is user-provided context about what the project is.",
    schema: z.object({}),
    handler: () =>
      projectsRepo.list().map((p) => ({ id: p.id, name: p.name, path: p.path, description: p.description, columns: p.columns })),
  }),
  tool({
    name: "list_tickets",
    description: "List the kanban tickets for a project.",
    schema: z.object({ projectId: z.string() }),
    handler: ({ projectId }) => ticketsRepo.listByProject(projectId),
  }),
  tool({
    name: "create_ticket",
    description: "Create a kanban ticket in a project. columnId defaults to the project's first column.",
    schema: z.object({
      projectId: z.string(),
      title: z.string(),
      body: z.string().optional(),
      columnId: z.string().optional(),
    }),
    handler: ({ projectId, title, body, columnId }) => {
      const project = projectsRepo.get(projectId);
      if (!project) return { error: "project not found" };
      const col = columnId ?? project.columns[0]?.id;
      if (!col || !project.columns.some((c) => c.id === col)) return { error: "invalid columnId" };
      const ticket = ticketsRepo.create({ projectId, title, body, columnId: col });
      broadcast({ type: "board.updated", projectId });
      return ticket;
    },
  }),
  tool({
    name: "move_ticket",
    description: "Move a ticket to a different column (appends to the end of that column).",
    schema: z.object({ ticketId: z.string(), columnId: z.string() }),
    handler: ({ ticketId, columnId }) => {
      const ticket = ticketsRepo.get(ticketId);
      if (!ticket) return { error: "ticket not found" };
      const positions = ticketsRepo
        .listByProject(ticket.projectId)
        .filter((t) => t.columnId === columnId && t.id !== ticketId)
        .map((t) => t.position);
      const moved = ticketsRepo.move(ticketId, columnId, appendPosition(positions));
      broadcast({ type: "board.updated", projectId: ticket.projectId });
      return moved;
    },
  }),
  tool({
    name: "update_ticket",
    description: "Update a ticket's title, body, or labels.",
    schema: z.object({
      ticketId: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      labels: z.array(z.string()).optional(),
    }),
    handler: ({ ticketId, ...patch }) => {
      const updated = ticketsRepo.update(ticketId, patch);
      if (!updated) return { error: "ticket not found" };
      broadcast({ type: "board.updated", projectId: updated.projectId });
      return updated;
    },
  }),
  tool({
    name: "list_notes",
    description: "List all notes (global and project-scoped).",
    schema: z.object({}),
    handler: () => notesRepo.list(),
  }),
  tool({
    name: "create_note",
    description: "Create a note. Omit projectId for a global note.",
    schema: z.object({ title: z.string(), body: z.string().optional(), projectId: z.string().nullable().optional() }),
    handler: (input) => notesRepo.create(input),
  }),
  tool({
    name: "list_tasks",
    description: "List all tasks (global and project-scoped).",
    schema: z.object({}),
    handler: () => tasksRepo.list(),
  }),
  tool({
    name: "create_task",
    description: "Create a task. Omit projectId for a global task.",
    schema: z.object({ title: z.string(), projectId: z.string().nullable().optional() }),
    handler: (input) => tasksRepo.create(input),
  }),
  tool({
    name: "delegate_ticket",
    description:
      "Spawn a Claude Code agent to work a ticket in its project folder. The agent first proposes a plan; with approver 'agent' you (Mangler) review and approve it, then it executes autonomously. Use approver 'human' to route plan approval to the user instead.",
    schema: z.object({
      ticketId: z.string(),
      approver: Approver.optional(),
      instructions: z.string().optional(),
    }),
    handler: ({ ticketId, approver, instructions }) => {
      const ticket = ticketsRepo.get(ticketId);
      if (!ticket) return { error: "ticket not found" };
      const project = projectsRepo.get(ticket.projectId);
      if (!project) return { error: "project not found" };
      const run = runsRepo.create({
        projectId: project.id,
        ticketId: ticket.id,
        kind: "orchestrated",
        title: `Agent · ${ticket.title}`,
        status: "planning",
        approver: approver ?? "agent",
        permissionMode: "plan",
        cwd: project.path,
      });
      const prompt =
        instructions ?? `Work on this ticket and implement it.\n\nTitle: ${ticket.title}\n\n${ticket.body || "(no description)"}`;
      void startOrchestratedRun(run, prompt);
      broadcast({ type: "run.updated", runId: run.id });
      return { runId: run.id, status: "started", approver: run.approver };
    },
  }),
  tool({
    name: "create_schedule",
    description:
      "Schedule a recurring task. At each occurrence you (Mangler) are run with the given prompt in a dedicated conversation, with all your tools available — so the prompt can ask you to review the board, delegate tickets, etc. cron is a standard 5-field expression (e.g. '0 9 * * 1-5' = 9am on weekdays, '*/30 * * * *' = every 30 minutes).",
    schema: z.object({
      title: z.string(),
      prompt: z.string(),
      cron: z.string(),
      enabled: z.boolean().optional(),
    }),
    handler: ({ title, prompt, cron, enabled }) => {
      if (!isValidCron(cron)) return { error: "invalid cron expression" };
      const en = enabled ?? true;
      const schedule = schedulesRepo.create({ title, prompt, cron, enabled: en, nextRunAt: en ? nextRun(cron) : null });
      broadcast({ type: "schedule.updated", scheduleId: schedule.id });
      return schedule;
    },
  }),
  tool({
    name: "list_schedules",
    description: "List all scheduled tasks with their cron expression, enabled state, and next run time.",
    schema: z.object({}),
    handler: () => schedulesRepo.list(),
  }),
  tool({
    name: "cancel_schedule",
    description: "Delete a scheduled task by id.",
    schema: z.object({ scheduleId: z.string() }),
    handler: ({ scheduleId }) => {
      if (!schedulesRepo.remove(scheduleId)) return { error: "schedule not found" };
      broadcast({ type: "schedule.updated", scheduleId });
      return { ok: true };
    },
  }),
  tool({
    name: "load_skill",
    description: "Load the full instructions for one of the skills listed in your system prompt. Call this before using a skill.",
    schema: z.object({ name: z.string() }),
    handler: ({ name }) => {
      const file = readDef(MANGLER_SCOPE, "skill", name);
      return file ? { name, content: file.content } : { error: "no such skill" };
    },
  }),
];

export const anthropicTools: Anthropic.Tool[] = defs.map((d) => ({
  name: d.name,
  description: d.description,
  input_schema: z.toJSONSchema(d.schema) as Anthropic.Tool.InputSchema,
}));

const byName = new Map(defs.map((d) => [d.name, d]));

export function runTool(name: string, input: unknown): unknown {
  const def = byName.get(name);
  if (!def) return { error: `unknown tool: ${name}` };
  return def.run(input);
}
