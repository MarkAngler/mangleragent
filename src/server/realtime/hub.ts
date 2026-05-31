import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import type { ServerMsg } from "../../shared/ws";

const clients = new Set<WebSocket>();
let eventsWss: WebSocketServer | null = null;

/** Per-path upgrade handlers registered by feature modules (e.g. PTY terminals). */
const upgradeHandlers: Array<(req: import("node:http").IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => boolean> = [];

export function registerUpgradeHandler(handler: (typeof upgradeHandlers)[number]): void {
  upgradeHandlers.push(handler);
}

export function createWsHub(server: Server): void {
  eventsWss = new WebSocketServer({ noServer: true });

  eventsWss.on("connection", (ws) => {
    clients.add(ws);
    sendTo(ws, { type: "hello", serverTime: new Date().toISOString() });
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/ws") {
      eventsWss!.handleUpgrade(req, socket, head, (ws) => eventsWss!.emit("connection", ws, req));
      return;
    }
    for (const handler of upgradeHandlers) {
      if (handler(req, socket, head)) return;
    }
    socket.destroy();
  });
}

function sendTo(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export function broadcast(msg: ServerMsg): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
