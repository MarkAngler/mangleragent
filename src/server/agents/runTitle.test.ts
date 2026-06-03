import { describe, expect, it } from "vitest";
import { truncateForTitle } from "./runTitle";

describe("truncateForTitle", () => {
  it("trims surrounding whitespace and leaves short text intact", () => {
    expect(truncateForTitle("  Fix login redirect  ")).toBe("Fix login redirect");
  });

  it("truncates text longer than max and appends an ellipsis", () => {
    const text = "Investigate why the login page 500s and fix the broken session handling";
    expect(truncateForTitle(text, 20)).toBe("Investigate why the…");
  });

  it("does not truncate text exactly at the max length", () => {
    const text = "x".repeat(20);
    expect(truncateForTitle(text, 20)).toBe(text);
  });
});
