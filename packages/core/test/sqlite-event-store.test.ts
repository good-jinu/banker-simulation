import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EconomicEngine } from "../src/domain/engine.ts";
import { ConcurrencyError } from "../src/domain/errors.ts";
import { SequentialIdGenerator } from "../src/domain/ids.ts";
import { SequenceRandom } from "../src/domain/random.ts";
import { SqliteEventStore } from "../src/infrastructure/sqlite-event-store.ts";

test("SQLite persists an append-only world that can be rebuilt by replay", () => {
  const directory = mkdtempSync(join(tmpdir(), "economic-engine-"));
  const filename = join(directory, "world.sqlite");

  try {
    const firstStore = new SqliteEventStore(filename);
    const first = new EconomicEngine(
      firstStore,
      new SequentialIdGenerator(),
      new SequenceRandom([0.1]),
    );
    first.registerEntity("player", "Player", "human");
    first.defineAsset({ id: "coin", name: "Coin", kind: "currency", divisible: true });
    first.issue("player", "coin", 25);
    firstStore.close();

    const secondStore = new SqliteEventStore(filename);
    const second = new EconomicEngine(
      secondStore,
      new SequentialIdGenerator(100),
      new SequenceRandom([0.1]),
    );
    assert.equal(second.balance("player", "coin"), 25);
    assert.deepEqual(
      second.events().map((event) => event.sequence),
      [1, 2, 3],
    );
    secondStore.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("SQLite rejects a stale writer instead of silently losing events", () => {
  const directory = mkdtempSync(join(tmpdir(), "economic-engine-"));
  const filename = join(directory, "world.sqlite");
  const store = new SqliteEventStore(filename);

  try {
    store.append([{ id: "one", type: "TimeAdvanced", at: 1, data: { to: 1 } }], 0);
    assert.throws(
      () =>
        store.append([{ id: "two", type: "TimeAdvanced", at: 2, data: { to: 2 } }], 0),
      ConcurrencyError,
    );
    assert.equal(store.load().length, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

