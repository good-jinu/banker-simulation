import { ConcurrencyError } from "../domain/errors.ts";
import type { DomainEvent, EventStore, StoredEvent } from "../domain/types.ts";

export class MemoryEventStore implements EventStore {
  private readonly events: StoredEvent[] = [];

  load(): StoredEvent[] {
    return structuredClone(this.events);
  }

  append(events: DomainEvent[], expectedVersion: number): void {
    if (expectedVersion !== this.events.length) {
      throw new ConcurrencyError(expectedVersion, this.events.length);
    }

    for (const event of events) {
      this.events.push({ ...structuredClone(event), sequence: this.events.length + 1 });
    }
  }
}

