import { Router } from "express";
import { notesRepo } from "../db/notes";
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
  res.status(201).json(notesRepo.create(parsed.data));
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
  res.json(note);
});

notesRouter.delete("/notes/:id", (req, res) => {
  res.status(notesRepo.remove(req.params.id) ? 204 : 404).end();
});
