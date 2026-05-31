import Database from "better-sqlite3";
import { env } from "../env";
import { SCHEMA } from "./schema";

let database: Database.Database | null = null;

export function initDb(): Database.Database {
  if (database) return database;
  database = new Database(env.dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA);
  return database;
}

export function db(): Database.Database {
  if (!database) return initDb();
  return database;
}

export const now = (): number => Date.now();
