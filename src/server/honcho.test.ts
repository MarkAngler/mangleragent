import { describe, it, expect, beforeAll, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-honcho-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb, db } = await import("./db/index");
const { configRepo } = await import("./db/config");
const { honchoWorkspace } = await import("./honcho");

describe("honchoWorkspace", () => {
  beforeAll(() => {
    initDb();
  });

  afterEach(() => {
    db().prepare("DELETE FROM config WHERE key = ?").run("honcho_workspace");
    delete process.env.MANGLED_HONCHO_WORKSPACE;
  });

  it("prefers the configured workspace over the env var and default", () => {
    process.env.MANGLED_HONCHO_WORKSPACE = "from-env";
    configRepo.set("honcho_workspace", "from-config");
    expect(honchoWorkspace()).toBe("from-config");
  });

  it("falls back to the env var when no workspace is configured", () => {
    process.env.MANGLED_HONCHO_WORKSPACE = "from-env";
    expect(honchoWorkspace()).toBe("from-env");
  });

  it("falls back to the product default when neither config nor env is set", () => {
    expect(honchoWorkspace()).toBe("mangled-agents");
  });
});
