/**
 * The market builder's deliberately small, keyboard-free value language.
 * A recipe is assembled by snapping game-value and arithmetic cards together,
 * rather than by asking a player to author an expression string.
 */
export type RecipeOperator = "add" | "subtract" | "multiply" | "divide";

export type ValueRecipe =
  | { kind: "value"; value: string }
  | { kind: "constant"; value: number }
  | {
      kind: "operation";
      operator: RecipeOperator;
      left: ValueRecipe;
      right: ValueRecipe;
    };

/** Player-created values use identifier-safe names so they remain selectable. */
export function isVariableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export const value = (name: string): ValueRecipe => ({
  kind: "value",
  value: name,
});

export const constant = (amount: number): ValueRecipe => ({
  kind: "constant",
  value: amount,
});

export const operation = (
  operator: RecipeOperator,
  left: ValueRecipe,
  right: ValueRecipe,
): ValueRecipe => ({ kind: "operation", operator, left, right });

export function evaluateRecipe(
  recipe: ValueRecipe | undefined,
  values: Readonly<Record<string, number>>,
): number {
  if (!recipe) throw new Error("This value slot is empty.");
  if (recipe.kind === "constant") return recipe.value;
  if (recipe.kind === "value") {
    const result = values[recipe.value];
    if (result === undefined) throw new Error(`Unknown value: ${recipe.value}`);
    return result;
  }
  const left = evaluateRecipe(recipe.left, values);
  const right = evaluateRecipe(recipe.right, values);
  if (recipe.operator === "add") return left + right;
  if (recipe.operator === "subtract") return left - right;
  if (recipe.operator === "multiply") return left * right;
  if (right === 0) throw new Error("Cannot divide by zero.");
  return left / right;
}

export function recipeLabel(recipe: ValueRecipe | undefined): string {
  if (!recipe) return "Empty";
  if (recipe.kind === "constant") return String(recipe.value);
  if (recipe.kind === "value") return humanizeValue(recipe.value);
  const symbol = {
    add: "+",
    subtract: "−",
    multiply: "×",
    divide: "÷",
  }[recipe.operator];
  return `${recipeLabel(recipe.left)} ${symbol} ${recipeLabel(recipe.right)}`;
}

export function humanizeValue(name: string): string {
  const labels: Record<string, string> = {
    amount: "Loan amount",
    days: "Requested days",
    income: "Monthly income",
    age: "Age",
    cash: "Available cash",
    rate: "Rate",
    margin: "Margin",
    reserve: "Reserve",
    limit: "Limit",
  };
  return labels[name] ?? name;
}

export type RecipePath = readonly ("left" | "right")[];

export function recipeAtPath(
  recipe: ValueRecipe,
  path: RecipePath,
): ValueRecipe {
  let current = recipe;
  for (const direction of path) {
    if (current.kind !== "operation") return current;
    current = current[direction];
  }
  return current;
}

export function replaceRecipeAtPath(
  recipe: ValueRecipe,
  path: RecipePath,
  next: ValueRecipe,
): ValueRecipe {
  if (path.length === 0) return next;
  if (recipe.kind !== "operation") return recipe;
  const [direction, ...rest] = path;
  if (!direction) return recipe;
  return {
    ...recipe,
    [direction]: replaceRecipeAtPath(recipe[direction], rest, next),
  };
}
