/**
 * Tiny arithmetic expression language for player-authored contract amounts,
 * e.g. `principal * (1 + day * 0.0001)`.  Supports numbers, named variables,
 * `+ - * /`, and parentheses.  Parsed with a hand-written recursive-descent
 * parser — no eval, no host globals.
 */

type Token =
  | { type: "number"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" };

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
    } else if (/[0-9.]/.test(char)) {
      const match = /^\d*\.?\d+/.exec(source.slice(index));
      if (!match) throw new ExpressionError(`Bad number near "${char}"`);
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
    } else if (/[a-zA-Z_]/.test(char)) {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(source.slice(index))!;
      tokens.push({ type: "name", value: match[0] });
      index += match[0].length;
    } else if (
      char === "+" ||
      char === "-" ||
      char === "*" ||
      char === "/" ||
      char === "(" ||
      char === ")"
    ) {
      tokens.push({ type: "op", value: char });
      index += 1;
    } else {
      throw new ExpressionError(`Unexpected character "${char}"`);
    }
  }
  return tokens;
}

class Parser {
  private position = 0;
  private readonly tokens: Token[];
  private readonly variables: Readonly<Record<string, number>>;

  constructor(tokens: Token[], variables: Readonly<Record<string, number>>) {
    this.tokens = tokens;
    this.variables = variables;
  }

  parse(): number {
    if (this.tokens.length === 0)
      throw new ExpressionError("The expression is empty");
    const value = this.expression();
    if (this.position < this.tokens.length)
      throw new ExpressionError("Unexpected trailing input");
    return value;
  }

  private expression(): number {
    let value = this.term();
    while (this.peekOp("+") || this.peekOp("-")) {
      const op = (this.tokens[this.position]! as { value: string }).value;
      this.position += 1;
      const right = this.term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    while (this.peekOp("*") || this.peekOp("/")) {
      const op = (this.tokens[this.position]! as { value: string }).value;
      this.position += 1;
      const right = this.factor();
      if (op === "/" && right === 0)
        throw new ExpressionError("Division by zero");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  private factor(): number {
    const token = this.tokens[this.position];
    if (!token) throw new ExpressionError("The expression ends abruptly");
    if (token.type === "number") {
      this.position += 1;
      return token.value;
    }
    if (token.type === "name") {
      const value = this.variables[token.value];
      if (value === undefined)
        throw new ExpressionError(`Unknown variable "${token.value}"`);
      this.position += 1;
      return value;
    }
    if (token.type === "op" && token.value === "-") {
      this.position += 1;
      return -this.factor();
    }
    if (token.type === "op" && token.value === "(") {
      this.position += 1;
      const value = this.expression();
      if (!this.peekOp(")"))
        throw new ExpressionError("A parenthesis is never closed");
      this.position += 1;
      return value;
    }
    throw new ExpressionError(`Unexpected "${token.value}"`);
  }

  private peekOp(op: string): boolean {
    const token = this.tokens[this.position];
    return token?.type === "op" && token.value === op;
  }
}

/** Evaluate an expression, rounding money results to whole cents. */
export function evaluateExpression(
  source: string,
  variables: Readonly<Record<string, number>>,
): number {
  const value = new Parser(tokenize(source), variables).parse();
  if (!Number.isFinite(value))
    throw new ExpressionError("The expression does not produce a number");
  return Math.round(value * 100) / 100;
}

/**
 * Check syntax and variable references without needing real values.
 * Returns null when the expression is valid, otherwise the problem.
 */
export function expressionIssue(
  source: string,
  allowedNames: readonly string[],
): string | null {
  try {
    evaluateExpression(
      source,
      Object.fromEntries(allowedNames.map((name) => [name, 1])),
    );
    return null;
  } catch (error) {
    return error instanceof ExpressionError ? error.message : String(error);
  }
}
