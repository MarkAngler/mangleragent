import { describe, it, expect } from "vitest";
import xtermHeadless from "@xterm/headless";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

// pty.ts mirrors the claude TUI into a headless emulator and, on reattach, sends
// serializer.serialize() instead of replaying raw cursor-relative frames. These tests pin
// the property that makes that correct: a redraw stream collapses to its final screen, and
// the snapshot round-trips cleanly into a fresh terminal — no stacked/overprinted frames.

const drain = (term: HeadlessTerminal): Promise<void> => new Promise((resolve) => term.write("", resolve));

const lineText = (term: HeadlessTerminal, row: number): string =>
  term.buffer.active.getLine(row)?.translateToString(true) ?? "";

describe("pty emulator snapshot", () => {
  it("collapses cursor-relative redraw frames to the final screen", async () => {
    const term = new xtermHeadless.Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    const serializer = new SerializeAddon();
    term.loadAddon(serializer);

    // A header line, then a spinner line redrawn in place (carriage return + erase-line) —
    // the shape the claude TUI streams thousands of times per run.
    term.write("line1\r\n");
    term.write("spinner A");
    term.write("\r\x1b[Kspinner B");
    term.write("\r\x1b[Kspinner C");
    await drain(term);

    const snapshot = serializer.serialize();
    expect(snapshot).toContain("spinner C");
    expect(snapshot).not.toContain("spinner A");
    expect(snapshot).not.toContain("spinner B");
  });

  it("round-trips the snapshot into a fresh same-size terminal", async () => {
    const cols = 80;
    const rows = 24;
    const source = new xtermHeadless.Terminal({ cols, rows, allowProposedApi: true });
    const serializer = new SerializeAddon();
    source.loadAddon(serializer);

    source.write("line1\r\n");
    source.write("spinner A\r\x1b[Kspinner B\r\x1b[Kspinner C");
    await drain(source);

    const restored = new xtermHeadless.Terminal({ cols, rows, allowProposedApi: true });
    restored.write(serializer.serialize());
    await drain(restored);

    expect(lineText(restored, 0)).toBe("line1");
    expect(lineText(restored, 1)).toBe("spinner C");
  });
});
