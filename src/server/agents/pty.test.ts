import { describe, it, expect } from "vitest";
import { ptyArgs } from "./pty";

describe("ptyArgs", () => {
  it("returns no args when there is no session id (fresh interactive session)", () => {
    expect(ptyArgs("claude")).toEqual([]);
    expect(ptyArgs("claude", {})).toEqual([]);
    expect(ptyArgs("claude", { resume: true })).toEqual([]);
  });

  it("pins a new session id at spawn", () => {
    expect(ptyArgs("claude", { sessionId: "abc" })).toEqual(["--session-id", "abc"]);
    expect(ptyArgs("claude", { sessionId: "abc", resume: false })).toEqual(["--session-id", "abc"]);
  });

  it("resumes an existing session id", () => {
    expect(ptyArgs("claude", { sessionId: "abc", resume: true })).toEqual(["--resume", "abc"]);
  });

  it("never passes session flags to codex, which manages its own sessions", () => {
    expect(ptyArgs("codex")).toEqual([]);
    expect(ptyArgs("codex", { sessionId: "abc" })).toEqual([]);
    expect(ptyArgs("codex", { sessionId: "abc", resume: true })).toEqual([]);
  });
});
