import type { IdGenerator } from "./types.ts";

export class RandomIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }
}


export class SequentialIdGenerator implements IdGenerator {
  private counter: number;

  constructor(startAt = 0) {
    this.counter = startAt;
  }

  next(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }
}
