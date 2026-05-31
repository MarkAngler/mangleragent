import { Router } from "express";
import { z } from "zod";
import { conversationsRepo, messagesRepo } from "../db/chat";
import { runMangler } from "../agents/mangler";

export const manglerRouter = Router();

manglerRouter.get("/conversations", (_req, res) => {
  res.json(conversationsRepo.list());
});

manglerRouter.post("/conversations", (_req, res) => {
  res.status(201).json(conversationsRepo.create());
});

manglerRouter.get("/conversations/:id/messages", (req, res) => {
  if (!conversationsRepo.get(req.params.id)) {
    res.status(404).json({ error: "conversation not found" });
    return;
  }
  res.json(messagesRepo.list(req.params.id));
});

const SendInput = z.object({ text: z.string().min(1) });

manglerRouter.post("/conversations/:id/messages", (req, res) => {
  const parsed = SendInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const conversation = conversationsRepo.get(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: "conversation not found" });
    return;
  }

  if (conversationsRepo.messageCount(conversation.id) === 0) {
    const title = parsed.data.text.slice(0, 48) + (parsed.data.text.length > 48 ? "…" : "");
    conversationsRepo.rename(conversation.id, title);
  }

  messagesRepo.add(conversation.id, "user", parsed.data.text);
  void runMangler(conversation.id);
  res.status(202).json({ ok: true });
});

manglerRouter.delete("/conversations/:id", (req, res) => {
  res.status(conversationsRepo.remove(req.params.id) ? 204 : 404).end();
});
