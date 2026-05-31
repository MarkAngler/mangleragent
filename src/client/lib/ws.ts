import { useEffect, useState } from "react";
import { ServerMsg } from "../../shared/ws";

type MessageListener = (msg: ServerMsg) => void;
type StatusListener = (connected: boolean) => void;

class WsClient {
  private socket: WebSocket | null = null;
  private messageListeners = new Set<MessageListener>();
  private statusListeners = new Set<StatusListener>();
  connected = false;

  connect(): void {
    if (this.socket) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => this.setConnected(true);
    socket.onmessage = (event) => {
      const parsed = ServerMsg.safeParse(JSON.parse(event.data));
      if (parsed.success) for (const listener of this.messageListeners) listener(parsed.data);
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      this.setConnected(false);
      this.socket = null;
      setTimeout(() => this.connect(), 1200);
    };
  }

  private setConnected(value: boolean): void {
    this.connected = value;
    for (const listener of this.statusListeners) listener(value);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
}

export const wsClient = new WsClient();

export function useWsStatus(): boolean {
  const [connected, setConnected] = useState(wsClient.connected);
  useEffect(() => {
    wsClient.connect();
    return wsClient.onStatus(setConnected);
  }, []);
  return connected;
}

export function useWsMessage(listener: MessageListener): void {
  useEffect(() => {
    wsClient.connect();
    return wsClient.onMessage(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
