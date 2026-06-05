import { Router } from "express";
import { notesRepo } from "../db/notes";
import { broadcast } from "../realtime/hub";
import { CreateNoteInput, UpdateNoteInput } from "../../shared/types";

export const notesRouter = Router();

notesRouter.get("/notes", (_req, res) => {
  res.json(notesRepo.list());
});

notesRouter.post("/notes", (req, res) => {
  const parsed = CreateNoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const note = notesRepo.create(parsed.data);
  broadcast({ type: "notes.updated" });
  res.status(201).json(note);
});

notesRouter.patch("/notes/:id", (req, res) => {
  const parsed = UpdateNoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const note = notesRepo.update(req.params.id, parsed.data);
  if (!note) {
    res.status(404).json({ error: "note not found" });
    return;
  }
  broadcast({ type: "notes.updated" });
  res.json(note);
});

notesRouter.delete("/notes/:id", (req, res) => {
  const removed = notesRepo.remove(req.params.id);
  if (removed) broadcast({ type: "notes.updated" });
  res.status(removed ? 204 : 404).end();
});
