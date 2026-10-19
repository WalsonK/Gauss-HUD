import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { z } from 'zod';

export type Db = DatabaseSync;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  -- Only hashes are stored: a database leak gives neither a session nor a pairing code.
  CREATE TABLE IF NOT EXISTS sessions (
    hash         TEXT PRIMARY KEY,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at   INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS pairing_codes (
    hash       TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS journal (
    id      INTEGER PRIMARY KEY,
    at      INTEGER NOT NULL,
    day     TEXT NOT NULL,
    command TEXT NOT NULL,
    value   REAL,
    outcome TEXT NOT NULL,
    dry_run INTEGER NOT NULL,
    ip      TEXT
  ) STRICT;
  CREATE INDEX IF NOT EXISTS journal_day ON journal (day);

  -- Billable vehicle API calls per local day and kind (data, commands, wakes).
  CREATE TABLE IF NOT EXISTS usage (
    day   TEXT NOT NULL,
    kind  TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (day, kind)
  ) STRICT;
`;

/** Opens (and creates if needed) the database. `:memory:` for tests. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Small typed key-value store for single values (PIN, cached status, vehicle API tokens). */
export class KeyValue {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  /** The stored value, or undefined when absent or no longer matching `schema`. */
  get<S extends z.ZodType>(key: string, schema: S): z.infer<S> | undefined {
    const row = this.#db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    const parsed = schema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : undefined;
  }

  set(key: string, value: unknown): void {
    this.#db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  delete(key: string): void {
    this.#db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  }
}
