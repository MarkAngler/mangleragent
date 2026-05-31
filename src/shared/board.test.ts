import { describe, it, expect } from "vitest";
import { appendPosition, insertPosition } from "./board";

describe("appendPosition", () => {
  it("starts at 1 for an empty column", () => {
    expect(appendPosition([])).toBe(1);
  });
  it("appends after the max", () => {
    expect(appendPosition([1, 4, 2])).toBe(5);
  });
});

describe("insertPosition", () => {
  it("returns 1 for an empty target", () => {
    expect(insertPosition([], 0)).toBe(1);
  });
  it("inserts before the first card", () => {
    expect(insertPosition([10, 20], 0)).toBe(9);
  });
  it("inserts at the end", () => {
    expect(insertPosition([10, 20], 2)).toBe(21);
  });
  it("inserts between two cards using the midpoint", () => {
    expect(insertPosition([10, 20], 1)).toBe(15);
  });
});
