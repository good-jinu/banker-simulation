import { advanceWithAgents, runAgents } from "./domain/agents.ts";
import { SequentialIdGenerator } from "./domain/ids.ts";
import { SequenceRandom } from "./domain/random.ts";
import { worldReport } from "./reporting.ts";
import { createDefaultScenario } from "./scenario.ts";

const { engine, agents } = createDefaultScenario({
  ids: new SequentialIdGenerator(),
  random: new SequenceRandom([0.2]),
});

console.log("=== AFTER AGENTS NEGOTIATE ===");
console.log(worldReport(engine.inspect()));

const productId = engine.publishProduct({
  creator: "player",
  name: "Seasonal Farm Advance",
  fundingAsset: "coin",
  principalAmount: 10,
  term: 6,
  fixedInterestRate: 0.15,
  creatorFeeRate: 0.02,
  minimumRepaymentReputation: 0,
  collateral: { asset: "land", amount: 1 },
});
runAgents(engine, agents);

const application = [...engine.inspect().applications.values()].find(
  (candidate) => candidate.productId === productId && candidate.status === "open",
);
if (!application) throw new Error("The farmer did not apply for the published product");
engine.fundProduct({ productId, funder: "player", borrower: application.borrower });
runAgents(engine, agents);

console.log("\n=== AFTER THE PLAYER FUNDS MINA'S APPLICATION ===");
console.log(worldReport(engine.inspect()));

advanceWithAgents(engine, agents, 6);

console.log("\n=== AFTER THE FIRST HARVEST AND REPAYMENT ===");
console.log(worldReport(engine.inspect()));

console.log("\n=== APPEND-ONLY EVENT LOG ===");
for (const event of engine.events()) {
  console.log(`${String(event.sequence).padStart(3, "0")}  t=${event.at}  ${event.type}`);
}
