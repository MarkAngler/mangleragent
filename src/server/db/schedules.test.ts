import { describe, it, expect, afterEach } from "vitest";
import { schedulesRepo } from "./schedules";

describe("schedulesRepo", () => {
  const created: string[] = [];
  const mk = (over: Partial<{ title: string; prompt: string; cron: string; enabled: boolean; nextRunAt: number | null }> = {}) => {
    const s = schedulesRepo.create({
      title: over.title ?? "test",
      prompt: over.prompt ?? "do the thing",
      cron: over.cron ?? "0 9 * * *",
      enabled: over.enabled ?? true,
      nextRunAt: over.nextRunAt ?? null,
    });
    created.push(s.id);
    return s;
  };

  afterEach(() => {
    for (const id of created.splice(0)) schedulesRepo.remove(id);
  });

  it("creates and reads back a schedule", () => {
    const s = mk({ title: "triage", prompt: "review board", cron: "0 9 * * 1-5", nextRunAt: 1_000 });
    expect(schedulesRepo.get(s.id)).toEqual(s);
    expect(s.enabled).toBe(true);
    expect(s.conversationId).toBeNull();
    expect(s.lastRunAt).toBeNull();
  });

  it("update applies only provided fields and nextRunAt only when the key is present", () => {
    const s = mk({ nextRunAt: 5_000 });
    const titleOnly = schedulesRepo.update(s.id, { title: "renamed" });
    expect(titleOnly?.title).toBe("renamed");
    expect(titleOnly?.nextRunAt).toBe(5_000); // untouched — key absent

    const rescheduled = schedulesRepo.update(s.id, { nextRunAt: null });
    expect(rescheduled?.nextRunAt).toBeNull();
  });

  it("markRan and setNextRun are system updates that do not bump updated_at", () => {
    const s = mk({ nextRunAt: 1_000 });
    schedulesRepo.markRan(s.id, 42);
    schedulesRepo.setNextRun(s.id, 99);
    const after = schedulesRepo.get(s.id);
    expect(after?.lastRunAt).toBe(42);
    expect(after?.nextRunAt).toBe(99);
    expect(after?.updatedAt).toBe(s.updatedAt);
  });

  it("listDue returns only enabled schedules whose next run is due", () => {
    const due = mk({ enabled: true, nextRunAt: 1_000 });
    const future = mk({ enabled: true, nextRunAt: 9_999_999 });
    const disabled = mk({ enabled: false, nextRunAt: 1_000 });
    const unscheduled = mk({ enabled: true, nextRunAt: null });

    const ids = schedulesRepo.listDue(5_000).map((s) => s.id);
    expect(ids).toContain(due.id);
    expect(ids).not.toContain(future.id);
    expect(ids).not.toContain(disabled.id);
    expect(ids).not.toContain(unscheduled.id);
  });

  it("remove deletes the row", () => {
    const s = mk();
    expect(schedulesRepo.remove(s.id)).toBe(true);
    expect(schedulesRepo.get(s.id)).toBeUndefined();
    expect(schedulesRepo.remove(s.id)).toBe(false);
  });
});
