import { describe, it, expect } from "vitest";
import { parseRepoUrl } from "./client";
import { defNameFromPath } from "./sync";

describe("parseRepoUrl", () => {
  it("parses bare owner/repo", () => {
    expect(parseRepoUrl("anthropics/skills")).toEqual({ owner: "anthropics", repo: "skills" });
  });

  it("parses a full https URL", () => {
    expect(parseRepoUrl("https://github.com/anthropics/skills")).toEqual({ owner: "anthropics", repo: "skills" });
  });

  it("strips a .git suffix", () => {
    expect(parseRepoUrl("https://github.com/anthropics/skills.git")).toEqual({ owner: "anthropics", repo: "skills" });
  });

  it("extracts the branch from a /tree/ URL, including branches with slashes", () => {
    expect(parseRepoUrl("https://github.com/anthropics/skills/tree/feature/x")).toEqual({
      owner: "anthropics",
      repo: "skills",
      branch: "feature/x",
    });
  });

  it("tolerates a trailing slash", () => {
    expect(parseRepoUrl("https://github.com/anthropics/skills/")).toEqual({ owner: "anthropics", repo: "skills" });
  });

  it("returns undefined for unparseable input", () => {
    expect(parseRepoUrl("not a repo")).toBeUndefined();
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeUndefined();
  });
});

describe("defNameFromPath", () => {
  it("uses the basename and strips the .md extension", () => {
    expect(defNameFromPath("rules/code-style.md")).toBe("code-style");
  });

  it("sanitizes characters outside the definition-name charset", () => {
    expect(defNameFromPath("skills/pdf tools")).toBe("pdf-tools");
  });
});
