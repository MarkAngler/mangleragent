import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./defs";

describe("parseFrontmatter", () => {
  it("extracts top-level keys and strips surrounding quotes", () => {
    const md = `---\nname: reviewer\ndescription: "Reviews code for bugs"\n---\n\nBody here.`;
    expect(parseFrontmatter(md)).toEqual({ name: "reviewer", description: "Reviews code for bugs" });
  });

  it("returns an empty object when there is no frontmatter", () => {
    expect(parseFrontmatter("# Just a heading\n\ntext")).toEqual({});
  });
});
