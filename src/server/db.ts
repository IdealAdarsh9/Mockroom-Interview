import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

type DB = Database.Database;
const g = globalThis as unknown as { __db?: DB; __dbPath?: string };

export const nowIso = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export function migrate(db: DB) {
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const dir = path.resolve(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(db.prepare("SELECT name FROM _migrations").all().map((r) => (r as { name: string }).name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, nowIso());
    })();
  }
}

export function getDb(): DB {
  const p = env.databasePath;
  if (g.__db && g.__dbPath === p) return g.__db;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  g.__db = db;
  g.__dbPath = p;
  return db;
}

export function closeDb() {
  g.__db?.close();
  g.__db = undefined;
}

export const q = {
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return getDb().prepare(sql).get(...params) as T | undefined;
  },
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return getDb().prepare(sql).all(...params) as T[];
  },
  run(sql: string, ...params: unknown[]) {
    return getDb().prepare(sql).run(...params);
  },
};

export function tx<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

export const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};
