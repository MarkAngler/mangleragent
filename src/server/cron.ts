import { CronExpressionParser } from "cron-parser";

// Pure cron helpers, kept free of app imports so both the scheduler and Mangler's
// tools can use them without an import cycle. Standard 5-field cron, server local timezone.

export function nextRun(cron: string, after: Date = new Date()): number {
  return CronExpressionParser.parse(cron, { currentDate: after }).next().toDate().getTime();
}

export function isValidCron(cron: string): boolean {
  // cron-parser treats blank input as "* * * * *" (every minute); reject it explicitly.
  if (!cron.trim()) return false;
  try {
    CronExpressionParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}
