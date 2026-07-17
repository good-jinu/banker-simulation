import type { RandomSource } from "./types.ts";

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

export class SequenceRandom implements RandomSource {
  private index = 0;
  private readonly values: number[];

  constructor(values: number[]) {
    if (values.length === 0 || values.some((value) => value < 0 || value >= 1)) {
      throw new Error("SequenceRandom requires values in [0, 1)");
    }
    this.values = values;
  }

  next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    if (value === undefined) {
      throw new Error("Random sequence unexpectedly empty");
    }
    return value;
  }
}
