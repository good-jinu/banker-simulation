export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ConcurrencyError extends Error {
  constructor(expected: number, actual: number) {
    super(`Event stream changed: expected version ${expected}, found ${actual}`);
    this.name = "ConcurrencyError";
  }
}

