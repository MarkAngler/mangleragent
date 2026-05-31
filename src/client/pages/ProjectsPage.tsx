import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import type { Project } from "../../shared/types";
import { Button, Card, EmptyState, Modal, Mono, PageHeader } from "../components/ui";
import { FolderPicker } from "../components/FolderPicker";

export function ProjectsPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => get<Project[]>("/projects"),
  });

  const create = useMutation({
    mutationFn: (path: string) => post<Project>("/projects", { path }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      setAddOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => del(`/projects/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <>
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
          {projects.map((project) => (
            <Card key={project.id} className="group p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/projects/${project.id}`} className="min-w-0">
                  <h3 className="truncate text-base font-semibold tracking-tight text-ink hover:text-accent">
                    {project.name}
                  </h3>
                  <p className="mt-1 truncate font-mono text-[12px] text-muted">{project.path}</p>
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${project.name}"? This deletes its board and tickets (the folder is untouched).`))
                      remove.mutate(project.id);
                  }}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Mono className="hover:text-bad">remove</Mono>
                </button>
              </div>
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
              onClick={() => create.mutate(selectedPath)}
            >
              {create.isPending ? "Adding…" : "Add this folder"}
            </Button>
          </>
        }
      >
        <FolderPicker onSelect={setSelectedPath} />
      </Modal>
    </>
  );
}
