import { describe, it, expect } from "vitest";
import { ptyArgs } from "./pty";

describe("ptyArgs", () => {
  it("returns no args when there is no session id (fresh interactive session)", () => {
    expect(ptyArgs()).toEqual([]);
    expect(ptyArgs({})).toEqual([]);
    expect(ptyArgs({ resume: true })).toEqual([]);
  });

  it("pins a new session id at spawn", () => {
    expect(ptyArgs({ sessionId: "abc" })).toEqual(["--session-id", "abc"]);
    expect(ptyArgs({ sessionId: "abc", resume: false })).toEqual(["--session-id", "abc"]);
  });

  it("resumes an existing session id", () => {
    expect(ptyArgs({ sessionId: "abc", resume: true })).toEqual(["--resume", "abc"]);
  });
});
