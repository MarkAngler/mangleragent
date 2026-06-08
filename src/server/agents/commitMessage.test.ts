import { describe, it, expect } from "vitest";
import type { FileDiff, RunDiff } from "../../shared/types";
import { cleanMessage, diffToPrompt, generateCommitMessage } from "./commitMessage";

const file = (over: Partial<FileDiff> = {}): FileDiff => ({
  path: "src/foo.ts",
  oldPath: null,
  status: "modified",
  additions: 3,
  deletions: 1,
  binary: false,
  patch: "@@ -1 +1 @@\n-old\n+new",
  ...over,
});

const diff = (files: FileDiff[]): RunDiff => ({ available: true, truncated: false, files });

describe("cleanMessage", () => {
  it("strips surrounding code fences and trims", () => {
    expect(cleanMessage("```\nfeat: add thing\n```")).toBe("feat: add thing");
  });

  it("strips a language-tagged fence", () => {
    expect(cleanMessage("```text\nfix: bug\n```")).toBe("fix: bug");
  });

  it("strips wrapping quotes", () => {
    expect(cleanMessage('"chore: tidy"')).toBe("chore: tidy");
  });
});

describe("diffToPrompt", () => {
  it("includes a per-file summary line and the patch text", () => {
    const out = diffToPrompt(diff([file()]));
    expect(out).toContain("- src/foo.ts (modified, +3 -1)");
    expect(out).toContain("@@ -1 +1 @@");
  });

  it("omits patch bodies for binary files but still lists them", () => {
    const out = diffToPrompt(diff([file({ path: "logo.png", binary: true, patch: "BINARYDATA" })]));
    expect(out).toContain("- logo.png (modified, +3 -1)");
    expect(out).not.toContain("BINARYDATA");
  });

  it("truncates oversized input to the byte bound", () => {
    const huge = file({ patch: "x".repeat(20000) });
    expect(diffToPrompt(diff([huge])).length).toBeLessThanOrEqual(12000);
  });
});

describe("generateCommitMessage", () => {
  it("returns an empty string for an unavailable diff (no LLM call)", async () => {
    await expect(generateCommitMessage({ available: false, truncated: false, files: [] })).resolves.toBe("");
  });

  it("returns an empty string when there are no changed files (no LLM call)", async () => {
    await expect(generateCommitMessage(diff([]))).resolves.toBe("");
  });
});
