import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function Terminal({ runId }: { runId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      theme: {
        background: "#16161a",
        foreground: "#e6e6e1",
        cursor: "#e6e6e1",
        selectionBackground: "#3a3a52",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/term?runId=${runId}`);

    const sendResize = () => {
      if (!el.clientWidth || !el.clientHeight) return; // hidden (e.g. Changes tab) / zero-size
      fit.fit();
      if (ws.readyState === ws.OPEN) ws.send("\x00" + JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      term.write(data);
    };
    ws.onopen = () => sendResize();

    const onData = term.onData((d) => {
      if (ws.readyState === ws.OPEN) ws.send(d);
    });
    const observer = new ResizeObserver(() => sendResize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      onData.dispose();
      ws.close();
      term.dispose();
    };
  }, [runId]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded-lg bg-[#16161a] p-2" />;
}
