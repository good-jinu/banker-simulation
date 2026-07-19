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
const recipeFieldSource = readFileSync(
  new URL("../src/market/components/RecipeField.tsx", import.meta.url),
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

test("the start node is only a compact graph entry point", () => {
  assert.match(
    canvasSource,
    /case "start":\s*return \{ width: 180, height: 52 \}/,
  );
  assert.doesNotMatch(canvasSource, /mk-canvas-start-detail/);
  assert.doesNotMatch(styles, /\.mk-canvas-start-detail/);
});

test("condition scopes retain nested scope bounds", () => {
  assert.match(canvasSource, /const nestedScopes = this\.scopeBounds\.slice/);
  assert.match(
    canvasSource,
    /\.\.\.nestedScopes\.map\(\(scope\) => scope\.minX\)/,
  );
  assert.match(
    canvasSource,
    /\.\.\.nestedScopes\.map\(\(scope\) => scope\.maxY\)/,
  );
});

test("condition scopes include their branch terminal controls", () => {
  assert.match(canvasSource, /return startY \+ 22;/);
  assert.match(canvasSource, /const scopeBottom = contentBottom \+ 24;/);
  assert.match(
    canvasSource,
    /\? scopeBottom \+ rowGap \+ nextSize\.height \/ 2/,
  );
  assert.match(canvasSource, /return terminalY \+ 22;/);
});

test("node edits refresh the overlaid form card content", () => {
  assert.match(canvasSource, /JSON\.stringify\(card\.node\)/);
  assert.match(canvasSource, /card\.names\.join\(","\)/);
});

test("add controls are centered in the space between node edges", () => {
  assert.match(
    canvasSource,
    /this\.addPlus\(centerX, y \+ size\.height \/ 2 \+ rowGap \/ 2,/,
  );
});

test("guided Pixi add controls stay thumb-sized and auto-fit after edits", () => {
  assert.match(canvasSource, /new Rectangle\(-32, -32, 64, 64\)/);
  assert.match(
    canvasSource,
    /if \(!this\.fitted \|\| this\.highlightAddControls\)/,
  );
  assert.match(canvasSource, /const topInset = 72;/);
  assert.match(canvasSource, /const bottomInset = 84;/);
});

test("formula parts append horizontally and remove from their picker", () => {
  const expression = cssRule(".mk-recipe-expression");
  assert.match(expression, /flex-wrap:\s*nowrap;/);
  assert.match(expression, /overflow-x:\s*auto;/);
  assert.match(recipeFieldSource, /className="mk-recipe-expand"/);
  assert.match(recipeFieldSource, /className="mk-formula-picker-remove"/);
  assert.doesNotMatch(recipeFieldSource, /className="mk-recipe-remove"/);
  assert.match(
    recipeFieldSource,
    /onChange\(operation\("add", recipe, constant\(1\)\)\)/,
  );
});

test("only the add control expands a formula", () => {
  assert.match(
    recipeFieldSource,
    /if \(selected\.kind !== "operation"\) return;/,
  );
  assert.match(
    recipeFieldSource,
    /selectedRecipe\.kind === "operation" \? \([\s\S]*operatorCards[\s\S]*\) : \([\s\S]*valueCards/,
  );
  assert.doesNotMatch(
    recipeFieldSource,
    /operation\(operatorName, selected, constant\(1\)\)/,
  );
});

test("number entry is rendered above fixed-height canvas cards", () => {
  assert.match(recipeFieldSource, /className="mk-keypad-backdrop"/);
  assert.match(recipeFieldSource, /createPortal\([\s\S]*<NumberKeypad/);
  assert.match(styles, /\.mk-keypad-backdrop \{[\s\S]*position:\s*fixed;/);
  assert.match(styles, /\.mk-keypad-backdrop \{[\s\S]*z-index:\s*110;/);
});
