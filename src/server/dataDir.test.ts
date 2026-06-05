import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveDataDir } from "./env";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mangled-resolve-"));
}

describe("resolveDataDir", () => {
  it("returns the anchor when there is no pointer file", () => {
    const anchor = tmpDir();
    expect(resolveDataDir(anchor)).toBe(anchor);
  });

  it("returns the pointed directory when the pointer targets an existing dir", () => {
    const anchor = tmpDir();
    const moved = tmpDir();
    fs.writeFileSync(path.join(anchor, "data-location"), moved);
    expect(resolveDataDir(anchor)).toBe(moved);
  });

  it("falls back to the anchor when the pointer targets a missing dir", () => {
    const anchor = tmpDir();
    fs.writeFileSync(path.join(anchor, "data-location"), path.join(anchor, "gone"));
    expect(resolveDataDir(anchor)).toBe(anchor);
  });
});
