import { SequentialIdGenerator } from "./domain/ids.ts";
import { SequenceRandom } from "./domain/random.ts";
import { worldReport } from "./reporting.ts";
import { createDefaultScenario } from "./scenario.ts";

const { engine } = createDefaultScenario({
  ids: new SequentialIdGenerator(),
  random: new SequenceRandom([0.2]),
});

console.log("=== AFTER AGENTS NEGOTIATE ===");
console.log(worldReport(engine.inspect()));

engine.advanceTo(6);

console.log("\n=== AFTER THE FIRST HARVEST ===");
console.log(worldReport(engine.inspect()));

console.log("\n=== APPEND-ONLY EVENT LOG ===");
for (const event of engine.events()) {
  console.log(`${String(event.sequence).padStart(3, "0")}  t=${event.at}  ${event.type}`);
}

