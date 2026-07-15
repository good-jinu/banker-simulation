import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgents } from "./domain/agents.ts";
import { worldReport } from "./reporting.ts";
import { createDefaultScenario } from "./scenario.ts";
import { SqliteEventStore } from "./infrastructure/sqlite-event-store.ts";

const databasePath = resolve(process.env.GAME_DB ?? "data/game.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const store = new SqliteEventStore(databasePath);
const { engine, agents } = createDefaultScenario({ store });
const prompt = createInterface({ input: stdin, output: stdout });

function help(): void {
  console.log(`Commands:
  status
  agreements
  advance <ticks>
  transfer <to> <asset> <amount>
  offer <party> <give-asset> <give-amount> <receive-asset> <receive-amount> <delay>
  accept <agreement-id>
  events
  help
  quit`);
}

console.log(`Banker Simulation — persistent world at ${databasePath}`);
console.log("You control the entity 'player'. Type 'help' for commands.");
console.log(worldReport(engine.inspect()));

try {
  while (true) {
    const input = (await prompt.question("\nworld> ")).trim();
    const [command, ...args] = input.split(/\s+/);
    try {
      if (!command) continue;
      if (command === "quit" || command === "exit") break;
      if (command === "help") help();
      else if (command === "status" || command === "agreements") {
        console.log(worldReport(engine.inspect()));
      } else if (command === "events") {
        for (const event of engine.events()) {
          console.log(`${event.sequence}\tt=${event.at}\t${event.type}`);
        }
      } else if (command === "advance") {
        const ticks = Number(args[0]);
        const current = engine.inspect().time;
        engine.advanceTo(current + ticks);
        runAgents(engine, agents);
        console.log(worldReport(engine.inspect()));
      } else if (command === "transfer") {
        const [to, asset, rawAmount] = args;
        if (!to || !asset || !rawAmount) throw new Error("Usage: transfer <to> <asset> <amount>");
        engine.transfer({ actor: "player", from: "player", to, asset, amount: Number(rawAmount) });
        console.log("Transfer recorded.");
      } else if (command === "offer") {
        const [party, giveAsset, rawGive, receiveAsset, rawReceive, rawDelay] = args;
        if (!party || !giveAsset || !rawGive || !receiveAsset || !rawReceive || !rawDelay) {
          throw new Error(
            "Usage: offer <party> <give-asset> <give-amount> <receive-asset> <receive-amount> <delay>",
          );
        }
        const now = engine.inspect().time;
        const agreementId = engine.proposeAgreement({
          proposer: "player",
          parties: ["player", party],
          memo: "Player-created delayed exchange",
          obligations: [
            { from: "player", to: party, asset: giveAsset, amount: Number(rawGive), dueAt: now },
            {
              from: party,
              to: "player",
              asset: receiveAsset,
              amount: Number(rawReceive),
              dueAt: now + Number(rawDelay),
            },
          ],
        });
        runAgents(engine, agents);
        console.log(`Proposed ${agreementId}.`);
      } else if (command === "accept") {
        const agreementId = args[0];
        if (!agreementId) throw new Error("Usage: accept <agreement-id>");
        engine.acceptAgreement(agreementId, "player");
        console.log("Agreement accepted.");
      } else {
        console.log(`Unknown command: ${command}. Type 'help'.`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
} finally {
  prompt.close();
  store.close();
}
