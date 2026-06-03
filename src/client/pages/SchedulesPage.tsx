import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { Schedule } from "../../shared/types";
import { Button, Card, Drawer, EmptyState, Input, Modal, Mono, PageHeader, Textarea } from "../components/ui";

const CRON_HINT = "5-field cron · e.g. 0 9 * * 1-5 (9am weekdays), */30 * * * * (every 30 min)";

function nextRunLabel(s: Schedule): string {
  if (!s.enabled) return "paused";
  return s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—";
}

export function SchedulesPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: schedules = [] } = useQuery({ queryKey: ["schedules"], queryFn: () => get<Schedule[]>("/schedules") });
  useWsMessage((msg) => {
    if (msg.type === "schedule.updated") void qc.invalidateQueries({ queryKey: ["schedules"] });
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["schedules"] });

  const createSchedule = useMutation({
    mutationFn: (input: { title: string; prompt: string; cron: string }) => post<Schedule>("/schedules", input),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
    },
  });
  const updateSchedule = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Pick<Schedule, "title" | "prompt" | "cron" | "enabled">> }) =>
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
  onClose,
  onCreate,
  error,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; prompt: string; cron: string }) => void;
  error: string | null;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const valid = title.trim() && prompt.trim() && cron.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New schedule"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="solid" disabled={!valid || pending} onClick={() => onCreate({ title: title.trim(), prompt: prompt.trim(), cron: cron.trim() })}>
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
        <div>
          <Mono>prompt</Mono>
          <Textarea className="mt-1.5" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Review the board and delegate any ready tickets…" />
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
  onSave,
  onDelete,
}: {
  schedule: Schedule;
  onSave: (patch: { title?: string; prompt?: string; cron?: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(schedule.title);
  const [prompt, setPrompt] = useState(schedule.prompt);
  const [cron, setCron] = useState(schedule.cron);
  const commit = () => onSave({ title: title.trim() || schedule.title, prompt: prompt.trim() || schedule.prompt, cron: cron.trim() || schedule.cron });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Mono>title</Mono>
        <Input className="mt-1.5 text-base font-medium" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} />
      </div>
      <div>
        <Mono>prompt</Mono>
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
