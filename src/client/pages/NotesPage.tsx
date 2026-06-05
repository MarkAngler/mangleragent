import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import { useWsMessage } from "../lib/ws";
import type { Note, Project, Task } from "../../shared/types";
import { Button, Card, Input, Mono, PageHeader, Textarea } from "../components/ui";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { usePageTitle } from "../components/PageTitleProvider";

export function NotesPage() {
  usePageTitle("Notes & Tasks");
  const qc = useQueryClient();
  const [scope, setScope] = useState("");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => get<Project[]>("/projects") });
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => get<Note[]>("/notes") });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => get<Task[]>("/tasks") });
  useWsMessage((msg) => {
    if (msg.type === "notes.updated") void qc.invalidateQueries({ queryKey: ["notes"] });
    if (msg.type === "tasks.updated") void qc.invalidateQueries({ queryKey: ["tasks"] });
  });

  const scopeProjectId = scope && scope !== "global" ? scope : null;
  const inScope = (pid: string | null) => scope === "" || (scope === "global" ? pid === null : pid === scope);
  const scopeLabel = (pid: string | null) => (pid === null ? "global" : projects.find((p) => p.id === pid)?.name ?? "unknown");

  const invalidate = (key: string) => () => void qc.invalidateQueries({ queryKey: [key] });

  const createNote = useMutation({
    mutationFn: () => post<Note>("/notes", { title: "Untitled note", projectId: scopeProjectId }),
    onSuccess: (note) => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      setOpenNoteId(note.id);
    },
  });
  const updateNote = useMutation({
    mutationFn: (vars: { id: string; patch: { title?: string; body?: string } }) => patch<Note>(`/notes/${vars.id}`, vars.patch),
    onSuccess: invalidate("notes"),
  });
  const deleteNote = useMutation({ mutationFn: (id: string) => del(`/notes/${id}`), onSuccess: invalidate("notes") });

  const createTask = useMutation({
    mutationFn: (title: string) => post<Task>("/tasks", { title, projectId: scopeProjectId }),
    onSuccess: invalidate("tasks"),
  });
  const updateTask = useMutation({
    mutationFn: (vars: { id: string; patch: { done?: boolean; title?: string } }) => patch<Task>(`/tasks/${vars.id}`, vars.patch),
    onSuccess: invalidate("tasks"),
  });
  const deleteTask = useMutation({ mutationFn: (id: string) => del(`/tasks/${id}`), onSuccess: invalidate("tasks") });

  const visibleNotes = notes.filter((n) => inScope(n.projectId));
  const visibleTasks = tasks.filter((t) => inScope(t.projectId));
  const openNote = notes.find((n) => n.id === openNoteId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Organize"
        title="Notes & Tasks"
        description="Lightweight notes and tasks, global or scoped to a project. Mangler can read and write these too."
        actions={
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">All scopes</option>
            <option value="global">Global only</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />

      {openNote ? (
        <NoteEditor
          key={openNote.id}
          note={openNote}
          scopeLabel={scopeLabel(openNote.projectId)}
          onBack={() => setOpenNoteId(null)}
          onSave={(p) => updateNote.mutate({ id: openNote.id, patch: p })}
          onDelete={() => {
            deleteNote.mutate(openNote.id);
            setOpenNoteId(null);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <Mono>notes · {visibleNotes.length}</Mono>
              <Button onClick={() => createNote.mutate()}>+ New note</Button>
            </div>
            {visibleNotes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hairline-strong py-10 text-center text-sm text-faint">No notes in scope.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleNotes.map((note) => (
                  <Card key={note.id} className="cursor-pointer p-4 hover:border-hairline-strong" >
                    <div onClick={() => setOpenNoteId(note.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="truncate text-sm font-semibold text-ink">{note.title}</h3>
                        <Mono>{scopeLabel(note.projectId)}</Mono>
                      </div>
                      {note.body && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{note.body}</p>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <Mono>tasks · {visibleTasks.filter((t) => !t.done).length} open</Mono>
            </div>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && taskTitle.trim()) {
                  createTask.mutate(taskTitle.trim());
                  setTaskTitle("");
                }
              }}
              placeholder="Add a task and press Enter…"
            />
            <div className="mt-3 flex flex-col">
              {visibleTasks.map((task) => (
                <div key={task.id} className="group flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => updateTask.mutate({ id: task.id, patch: { done: !task.done } })}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <span className={`flex-1 text-sm ${task.done ? "text-faint line-through" : "text-ink"}`}>{task.title}</span>
                  <Mono>{scopeLabel(task.projectId)}</Mono>
                  <button onClick={() => deleteTask.mutate(task.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Mono className="hover:text-bad">del</Mono>
                  </button>
                </div>
              ))}
              {visibleTasks.length === 0 && <p className="py-6 text-center text-sm text-faint">No tasks in scope.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function NoteEditor({
  note,
  scopeLabel,
  onSave,
  onDelete,
  onBack,
}: {
  note: Note;
  scopeLabel: string;
  onSave: (patch: { title?: string; body?: string }) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const commit = () => onSave({ title: title.trim() || note.title, body });

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="micro hover:text-ink">
          ← notes
        </button>
        <div className="flex items-center gap-4">
          <Mono>note · {scopeLabel}</Mono>
          <button onClick={onDelete}>
            <Mono className="hover:text-bad">delete</Mono>
          </button>
        </div>
      </div>

      <Input className="text-base font-medium" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} />

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Textarea
          className="h-full min-h-[40vh] resize-none font-mono text-[12.5px] leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={commit}
          placeholder="Write Markdown…"
          spellCheck={false}
        />
        <div className="overflow-y-auto rounded-md border border-hairline-strong bg-surface px-4 py-3">
          <MarkdownPreview source={body} />
        </div>
      </div>

      <div className="mt-3">
        <Mono>updated {new Date(note.updatedAt).toLocaleString()}</Mono>
      </div>
    </div>
  );
}
