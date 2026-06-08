import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import open from "open";
import { env } from "./env";
import { initDb } from "./db";
import { runsRepo } from "./db/runs";
import { createWsHub } from "./realtime/hub";
import { healthRouter } from "./api/health";
import { projectsRouter } from "./api/projects";
import { ticketsRouter } from "./api/tickets";
import { notesRouter } from "./api/notes";
import { tasksRouter } from "./api/tasks";
import { manglerRouter } from "./api/mangler";
import { runsRouter } from "./api/runs";
import { agentsRouter } from "./api/agents";
import { externalAgentsRouter } from "./api/externalAgents";
import { mcpServersRouter } from "./api/mcpServers";
import { defsRouter } from "./api/defs";
import { settingsRouter } from "./api/settings";
import { fsRouter } from "./api/fs";
import { schedulesRouter } from "./api/schedules";
import { installPtyTerminals } from "./agents/pty";
import { startScheduler } from "./scheduler";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "../client");

function main(): void {
  initDb();
  runsRepo.markRunningPtyStopped();

  const app = express();
  app.use(express.json({ limit: "8mb" }));

  app.use("/api", healthRouter);
  app.use("/api", projectsRouter);
  app.use("/api", ticketsRouter);
  app.use("/api", notesRouter);
  app.use("/api", tasksRouter);
  app.use("/api", manglerRouter);
  app.use("/api", runsRouter);
  app.use("/api", agentsRouter);
  app.use("/api", externalAgentsRouter);
  app.use("/api", mcpServersRouter);
  app.use("/api", defsRouter);
  app.use("/api", settingsRouter);
  app.use("/api", fsRouter);
  app.use("/api", schedulesRouter);

  const indexHtml = path.join(clientDir, "index.html");
  const serveClient = !env.isDev && fs.existsSync(indexHtml);
  if (serveClient) {
    app.use(express.static(clientDir));
    app.use((_req, res) => res.sendFile(indexHtml));
  }

  const server = createServer(app);
  createWsHub(server);
  installPtyTerminals();
  startScheduler();

  server.listen(env.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${env.port}`;
    console.log(`\n  Mangled Agents → ${url}\n`);
    const noOpen = process.env.MANGLED_NO_OPEN === "1";
    if (serveClient && !noOpen) void open(url);
  });
}

main();
