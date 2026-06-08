import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { Agent, Schedule } from "../../shared/types";
import { Button, Card, Drawer, EmptyState, Input, Modal, Mono, PageHeader, Textarea } from "../components/ui";
import { usePageTitle } from "../components/PageTitleProvider";

const CRON_HINT = "5-field cron · e.g. 0 9 * * 1-5 (9am weekdays), */30 * * * * (every 30 min)";

const SELECT_CLASS = "mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

function nextRunLabel(s: Schedule): string {
  if (!s.enabled) return "paused";
  return s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—";
}

// A schedule either runs a specific agent (agentId set) or runs its prompt through Mangler.
function TargetSelect({ agents, value, onChange }: { agents: Agent[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Mono>target</Mono>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
        <option value="">Mangler (full toolset)</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SchedulesPage() {
  usePageTitle("Schedules");
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: schedules = [] } = useQuery({ queryKey: ["schedules"], queryFn: () => get<Schedule[]>("/schedules") });
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: () => get<Agent[]>("/agents") });
  useWsMessage((msg) => {
    if (msg.type === "schedule.updated") void qc.invalidateQueries({ queryKey: ["schedules"] });
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["schedules"] });
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name;

  const createSchedule = useMutation({
    mutationFn: (input: { title: string; prompt: string; cron: string; agentId: string | null }) => post<Schedule>("/schedules", input),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
    },
  });
  const updateSchedule = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Pick<Schedule, "title" | "prompt" | "cron" | "enabled" | "agentId">> }) =>
      patch<Schedule>(`/schedules/${vars.id}`, vars.patch),
    onSuccess: invalidate,
  });
  const deleteSchedule = useMutation({ mutationFn: (id: string) => del(`/schedules/${id}`), onSuccess: invalidate });
  const runNow = useMutation({ mutationFn: (id: string) => post(`/schedules/${id}/run`), onSuccess: invalidate });

  const openSchedule = schedules.find((s) => s.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Automate"
        title="Schedules"
        description="Recurring tasks that run Mangler on a cron schedule. Each occurrence runs your prompt with Mangler's full toolset, so it can review the board, delegate tickets, and more."
        actions={
          <Button variant="solid" onClick={() => setAddOpen(true)}>
            + New schedule
          </Button>
        }
      />

      {schedules.length === 0 ? (
        <EmptyState title="No schedules yet" hint="Create one here, or ask Mangler in chat (e.g. “every weekday at 9am, review my board and delegate ready tickets”)." />
      ) : (
        <div className="flex flex-col gap-2">
          {schedules.map((s) => (
            <Card key={s.id} className="p-4 hover:border-hairline-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenId(s.id)}>
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{s.title}</h3>
                    {!s.enabled && <Mono className="text-faint">paused</Mono>}
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{s.prompt}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Mono>→ {s.agentId ? (agentName(s.agentId) ?? "deleted agent") : "Mangler"}</Mono>
                    <Mono>cron {s.cron}</Mono>
                    <Mono>next {nextRunLabel(s)}</Mono>
                    {s.lastRunAt && <Mono>last {new Date(s.lastRunAt).toLocaleString()}</Mono>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button onClick={() => runNow.mutate(s.id)}>Run now</Button>
                  <Button onClick={() => updateSchedule.mutate({ id: s.id, patch: { enabled: !s.enabled } })}>
                    {s.enabled ? "Pause" : "Resume"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddScheduleModal
        open={addOpen}
        agents={agents}
        onClose={() => setAddOpen(false)}
        onCreate={(input) => createSchedule.mutate(input)}
        error={createSchedule.isError ? (createSchedule.error as Error).message : null}
        pending={createSchedule.isPending}
      />

      <Drawer open={Boolean(openSchedule)} onClose={() => setOpenId(null)} title={<Mono>schedule</Mono>}>
        {openSchedule && (
          <ScheduleEditor
            key={openSchedule.id}
            schedule={openSchedule}
            agents={agents}
            onSave={(p) => updateSchedule.mutate({ id: openSchedule.id, patch: p })}
            onDelete={() => {
              deleteSchedule.mutate(openSchedule.id);
              setOpenId(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function AddScheduleModal({
  open,
  agents,
  onClose,
  onCreate,
  error,
  pending,
}: {
  open: boolean;
  agents: Agent[];
  onClose: () => void;
  onCreate: (input: { title: string; prompt: string; cron: string; agentId: string | null }) => void;
  error: string | null;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [agentId, setAgentId] = useState("");
  const valid = title.trim() && prompt.trim() && cron.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New schedule"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="solid"
            disabled={!valid || pending}
            onClick={() => onCreate({ title: title.trim(), prompt: prompt.trim(), cron: cron.trim(), agentId: agentId || null })}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Mono>title</Mono>
          <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekday triage" />
        </div>
        <TargetSelect agents={agents} value={agentId} onChange={setAgentId} />
        <div>
          <Mono>{agentId ? "task" : "prompt"}</Mono>
          <Textarea
            className="mt-1.5"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={agentId ? "What should the agent do each run?" : "Review the board and delegate any ready tickets…"}
          />
        </div>
        <div>
          <Mono>cron</Mono>
          <Input className="mt-1.5 font-mono" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1-5" />
          <p className="mt-1.5 text-xs text-faint">{CRON_HINT}</p>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </Modal>
  );
}

function ScheduleEditor({
  schedule,
  agents,
  onSave,
  onDelete,
}: {
  schedule: Schedule;
  agents: Agent[];
  onSave: (patch: { title?: string; prompt?: string; cron?: string; agentId?: string | null }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(schedule.title);
  const [prompt, setPrompt] = useState(schedule.prompt);
  const [cron, setCron] = useState(schedule.cron);
  const [agentId, setAgentId] = useState(schedule.agentId ?? "");
  const commit = () =>
    onSave({
      title: title.trim() || schedule.title,
      prompt: prompt.trim() || schedule.prompt,
      cron: cron.trim() || schedule.cron,
      agentId: agentId || null,
    });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Mono>title</Mono>
        <Input className="mt-1.5 text-base font-medium" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} />
      </div>
      <TargetSelect
        agents={agents}
        value={agentId}
        onChange={(v) => {
          setAgentId(v);
          onSave({ agentId: v || null });
        }}
      />
      <div>
        <Mono>{agentId ? "task" : "prompt"}</Mono>
        <Textarea className="mt-1.5" rows={10} value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={commit} />
      </div>
      <div>
        <Mono>cron</Mono>
        <Input className="mt-1.5 font-mono" value={cron} onChange={(e) => setCron(e.target.value)} onBlur={commit} />
        <p className="mt-1.5 text-xs text-faint">{CRON_HINT}</p>
      </div>
      <div className="flex flex-col gap-1">
        <Mono>next run · {nextRunLabel(schedule)}</Mono>
        {schedule.lastRunAt && <Mono>last run · {new Date(schedule.lastRunAt).toLocaleString()}</Mono>}
      </div>
      <div className="flex items-center justify-end pt-2">
        <button onClick={onDelete}>
          <Mono className="hover:text-bad">delete schedule</Mono>
        </button>
      </div>
    </div>
  );
}
