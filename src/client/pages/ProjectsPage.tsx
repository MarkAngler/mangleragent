import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../lib/api";
import type { AgentRun, Project } from "../../shared/types";
import { Button, Card, Drawer, EmptyState, Modal, Mono, PageHeader, Textarea } from "../components/ui";
import { FolderPicker } from "../components/FolderPicker";

export function ProjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [descDraft, setDescDraft] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => get<Project[]>("/projects"),
  });

  const sortedProjects = [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const create = useMutation({
    mutationFn: (input: { path: string; description: string }) => post<Project>("/projects", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      setAddOpen(false);
      setDescription("");
    },
  });

  const update = useMutation({
    mutationFn: (input: { id: string; description: string }) =>
      patch<Project>(`/projects/${input.id}`, { description: input.description }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => del(`/projects/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const openVscode = useMutation({
    mutationFn: (id: string) => post(`/projects/${id}/open`),
    onError: (err) => alert((err as Error).message),
  });

  const openTerminal = useMutation({
    mutationFn: (id: string) => post<AgentRun>("/runs/pty", { projectId: id, ticketId: null }),
    onSuccess: (run) => navigate(`/agents?run=${run.id}`),
    onError: (err) => alert((err as Error).message),
  });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Point Mangled Agents at a local folder to give it a kanban board and an agent workspace."
        actions={
          <Button variant="solid" onClick={() => setAddOpen(true)}>
            + Add project
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Add a folder to create your first kanban board and agent workspace." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sortedProjects.map((project) => (
            <Card key={project.id} className="group p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/projects/${project.id}`} className="min-w-0">
                  <h3 className="truncate text-base font-semibold tracking-tight text-ink hover:text-accent">
                    {project.name}
                  </h3>
                  <p className="mt-1 truncate font-mono text-[12px] text-muted">{project.path}</p>
                </Link>
                <div className="flex shrink-0 items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openTerminal.mutate(project.id)} disabled={openTerminal.isPending}>
                    <Mono className="hover:text-accent">terminal</Mono>
                  </button>
                  <button onClick={() => openVscode.mutate(project.id)} disabled={openVscode.isPending}>
                    <Mono className="hover:text-accent">vscode</Mono>
                  </button>
                  <button
                    onClick={() => {
                      setEditing(project);
                      setDescDraft(project.description);
                    }}
                  >
                    <Mono className="hover:text-accent">edit</Mono>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove "${project.name}"? This deletes its board and tickets (the folder is untouched).`))
                        remove.mutate(project.id);
                    }}
                  >
                    <Mono className="hover:text-bad">remove</Mono>
                  </button>
                </div>
              </div>
              {project.description && (
                <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">{project.description}</p>
              )}
              <div className="mt-4 flex items-center gap-4">
                <Mono>{project.columns.length} columns</Mono>
                <Link to={`/projects/${project.id}`}>
                  <Mono className="hover:text-accent">open board →</Mono>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a project folder"
        footer={
          <>
            {create.isError && <span className="mr-auto self-center text-sm text-bad">{(create.error as Error).message}</span>}
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="solid"
              disabled={!selectedPath || create.isPending}
              onClick={() => create.mutate({ path: selectedPath, description })}
            >
              {create.isPending ? "Adding…" : "Add this folder"}
            </Button>
          </>
        }
      >
        <FolderPicker onSelect={setSelectedPath} />
        <div className="mt-4">
          <Mono>description (optional)</Mono>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What is this project? Gives Mangler context when it organizes your work."
            className="mt-2 resize-y text-[13px] leading-relaxed"
          />
        </div>
      </Modal>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={<Mono>edit · {editing?.name}</Mono>}
        footer={
          <div className="flex justify-end gap-2">
            {update.isError && <span className="mr-auto self-center text-sm text-bad">{(update.error as Error).message}</span>}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="solid"
              disabled={update.isPending || descDraft === editing?.description}
              onClick={() => editing && update.mutate({ id: editing.id, description: descDraft })}
            >
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <Mono>description</Mono>
        <Textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          rows={12}
          placeholder="What is this project? Stack, purpose, conventions — anything that helps Mangler."
          className="mt-2 resize-y text-[13px] leading-relaxed"
        />
        <p className="mt-2 text-[12px] text-muted">Mangler sees this when it lists your projects.</p>
      </Drawer>
    </div>
  );
}
