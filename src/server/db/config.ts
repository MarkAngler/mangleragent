import { db } from "./index";

export const configRepo = {
  get(key: string): string | undefined {
    const row = db().prepare("SELECT value FROM config WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  },

  set(key: string, value: string): void {
    db().prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  },

  getBool(key: string, fallback: boolean): boolean {
    const value = this.get(key);
    return value === undefined ? fallback : value === "true";
  },
};
