import { describe, it, expect } from "vitest";
import { nextRun, isValidCron } from "./cron";

describe("nextRun", () => {
  it("returns the same day's occurrence when the time is still ahead", () => {
    const after = new Date("2026-06-03T08:00:00");
    expect(nextRun("0 9 * * *", after)).toBe(new Date("2026-06-03T09:00:00").getTime());
  });

  it("rolls to the next day once the time has passed", () => {
    const after = new Date("2026-06-03T09:30:00");
    expect(nextRun("0 9 * * *", after)).toBe(new Date("2026-06-04T09:00:00").getTime());
  });

  it("honors day-of-week ranges (weekdays only)", () => {
    // 2026-06-06 is a Saturday; the next weekday 9am is Monday the 8th.
    const after = new Date("2026-06-06T10:00:00");
    expect(nextRun("0 9 * * 1-5", after)).toBe(new Date("2026-06-08T09:00:00").getTime());
  });

  it("supports step expressions", () => {
    const after = new Date("2026-06-03T08:05:00");
    expect(nextRun("*/30 * * * *", after)).toBe(new Date("2026-06-03T08:30:00").getTime());
  });
});

describe("isValidCron", () => {
  it("accepts valid expressions", () => {
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("*/15 * * * *")).toBe(true);
  });

  it("rejects malformed expressions", () => {
    expect(isValidCron("not a cron")).toBe(false);
    expect(isValidCron("99 99 * * *")).toBe(false);
    expect(isValidCron("")).toBe(false);
  });
});
