import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import open from "open";
import { env } from "./env";
import { initDb } from "./db";
import { createWsHub } from "./realtime/hub";
import { healthRouter } from "./api/health";
import { projectsRouter } from "./api/projects";
import { ticketsRouter } from "./api/tickets";
import { notesRouter } from "./api/notes";
import { tasksRouter } from "./api/tasks";
import { fsRouter } from "./api/fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "../client");

function main(): void {
  initDb();

  const app = express();
  app.use(express.json({ limit: "8mb" }));

  app.use("/api", healthRouter);
  app.use("/api", projectsRouter);
  app.use("/api", ticketsRouter);
  app.use("/api", notesRouter);
  app.use("/api", tasksRouter);
  app.use("/api", fsRouter);

  const indexHtml = path.join(clientDir, "index.html");
  const serveClient = !env.isDev && fs.existsSync(indexHtml);
  if (serveClient) {
    app.use(express.static(clientDir));
    app.use((_req, res) => res.sendFile(indexHtml));
  }

  const server = createServer(app);
  createWsHub(server);

  server.listen(env.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${env.port}`;
    console.log(`\n  Mangled Agents → ${url}\n`);
    const noOpen = process.env.MANGLED_NO_OPEN === "1";
    if (serveClient && !noOpen) void open(url);
  });
}

main();
