import { Router } from "express";
import { listDefs, readDef, createDef, saveDef, copyDef, removeDef } from "../defs";
import { CopyDefInput, CreateDefInput, DefKind, SaveDefInput } from "../../shared/types";

export const defsRouter = Router();

defsRouter.get("/defs", (req, res) => {
  const kind = DefKind.safeParse(req.query.kind);
  if (!kind.success) {
    res.status(400).json({ error: "invalid kind" });
    return;
  }
  try {
    res.json(listDefs(String(req.query.scope ?? "global"), kind.data));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

defsRouter.get("/defs/file", (req, res) => {
  const kind = DefKind.safeParse(req.query.kind);
  const name = String(req.query.name ?? "");
  if (!kind.success || !name) {
    res.status(400).json({ error: "kind and name required" });
    return;
  }
  try {
    const file = readDef(String(req.query.scope ?? "global"), kind.data, name);
    if (!file) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(file);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

defsRouter.post("/defs", (req, res) => {
  const parsed = CreateDefInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  try {
    res.status(201).json(createDef(parsed.data.scope, parsed.data.kind, parsed.data.name));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

defsRouter.put("/defs/file", (req, res) => {
  const parsed = SaveDefInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  try {
    res.json(saveDef(parsed.data.scope, parsed.data.kind, parsed.data.name, parsed.data.content));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

defsRouter.post("/defs/copy", (req, res) => {
  const parsed = CopyDefInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const { scope, kind, name, targets, overwrite } = parsed.data;
  const results = targets.map((target) => {
    try {
      return { target, status: copyDef(scope, target, kind, name, overwrite ?? false) };
    } catch (err) {
      return { target, status: "error" as const, error: (err as Error).message };
    }
  });
  res.json({ results });
});

defsRouter.delete("/defs/file", (req, res) => {
  const kind = DefKind.safeParse(req.query.kind);
  const name = String(req.query.name ?? "");
  if (!kind.success || !name) {
    res.status(400).json({ error: "kind and name required" });
    return;
  }
  try {
    res.status(removeDef(String(req.query.scope ?? "global"), kind.data, name) ? 204 : 404).end();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
