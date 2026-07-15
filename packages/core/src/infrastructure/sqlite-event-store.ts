import { DatabaseSync } from "node:sqlite";
import { ConcurrencyError } from "../domain/errors.ts";
import type { DomainEvent, EventStore, EventType, StoredEvent } from "../domain/types.ts";

interface EventRow {
  sequence: number;
  id: string;
  type: EventType;
  at: number;
  data: string;
}

export class SqliteEventStore implements EventStore {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        at INTEGER NOT NULL,
        data TEXT NOT NULL
      ) STRICT
    `);
  }

  load(): StoredEvent[] {
    const rows = this.database
      .prepare("SELECT sequence, id, type, at, data FROM events ORDER BY sequence")
      .all() as unknown as EventRow[];

    return rows.map((row) => ({
      sequence: row.sequence,
      id: row.id,
      type: row.type,
      at: row.at,
      data: JSON.parse(row.data) as unknown,
    }));
  }

  append(events: DomainEvent[], expectedVersion: number): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT COALESCE(MAX(sequence), 0) AS version FROM events")
        .get() as unknown as { version: number };

      if (row.version !== expectedVersion) {
        throw new ConcurrencyError(expectedVersion, row.version);
      }

      const insert = this.database.prepare(
        "INSERT INTO events (id, type, at, data) VALUES (?, ?, ?, ?)",
      );
      for (const event of events) {
        insert.run(event.id, event.type, event.at, JSON.stringify(event.data));
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

