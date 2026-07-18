import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const canvasSource = readFileSync(
  new URL("../src/market/components/MarketBuilderCanvas.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/market/market.css", import.meta.url),
  "utf8",
);

function cssRule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`);
  const end = styles.indexOf("\n}", start);
  assert.notEqual(end, -1, `unterminated CSS rule: ${selector}`);
  return styles.slice(start, end + 2);
}

test("canvas cards keep their independent absolute-positioning contract", () => {
  const card = cssRule(".mk-canvas-node-card");
  assert.match(card, /position:\s*absolute;/);
  assert.match(card, /box-sizing:\s*border-box;/);
  assert.match(card, /overflow:\s*hidden;/);
  assert.doesNotMatch(
    canvasSource,
    /mk-canvas-node-card\s+mk-workflow-node/,
    "canvas cards must not inherit the legacy document-flow node class",
  );
});

test("the compact start node cannot grow beyond its declared card", () => {
  const startHeader = cssRule(
    ".mk-canvas-node-card.type-start .mk-canvas-node-header",
  );
  assert.match(startHeader, /width:\s*180px;/);
  assert.match(startHeader, /box-sizing:\s*border-box;/);
});

test("condition scopes retain nested scope bounds", () => {
  assert.match(canvasSource, /const nestedScopes = this\.scopeBounds\.slice/);
  assert.match(canvasSource, /\.\.\.nestedScopes\.map\(\(scope\) => scope\.minX\)/);
  assert.match(canvasSource, /\.\.\.nestedScopes\.map\(\(scope\) => scope\.maxY\)/);
});
