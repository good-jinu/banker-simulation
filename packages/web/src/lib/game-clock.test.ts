import { describe, expect, it } from "vitest";
import { GameClock, type FrameScheduler } from "./game-clock.ts";

function fakeScheduler() {
  let nextHandle = 1;
  let queued: ((now: number) => void) | null = null;
  const scheduler: FrameScheduler = {
    request(callback) {
      queued = callback;
      return nextHandle++;
    },
    cancel() {
      queued = null;
    },
  };
  return {
    scheduler,
    step(now: number) {
      const callback = queued;
      queued = null;
      expect(callback).toBeTypeOf("function");
      callback?.(now);
    },
  };
}

describe("GameClock", () => {
  it("accumulates fractional days and emits one tick per whole day", () => {
    const frames = fakeScheduler();
    let ticks = 0;
    const clock = new GameClock(
      () => {
        ticks += 1;
        return true;
      },
      100,
      frames.scheduler,
    );

    clock.start();
    frames.step(0);
    clock.play();
    frames.step(250);
    expect(ticks).toBe(2);
    frames.step(300);
    expect(ticks).toBe(3);
    frames.step(350);
    expect(ticks).toBe(3);
  });

  it("does not advance while paused and resumes from the latest frame", () => {
    const frames = fakeScheduler();
    let ticks = 0;
    const clock = new GameClock(
      () => {
        ticks += 1;
        return true;
      },
      200,
      frames.scheduler,
    );

    clock.start();
    frames.step(0);
    clock.play();
    frames.step(50);
    clock.pause();
    frames.step(1_000);
    expect(ticks).toBe(0);
    clock.play();
    frames.step(1_050);
    expect(ticks).toBe(0);
    frames.step(1_200);
    expect(ticks).toBe(1);
  });

  it("pauses after the simulation asks it to stop", () => {
    const frames = fakeScheduler();
    let ticks = 0;
    const clock = new GameClock(
      () => {
        ticks += 1;
        return false;
      },
      100,
      frames.scheduler,
    );

    clock.start();
    frames.step(0);
    clock.play();
    frames.step(100);
    expect(ticks).toBe(1);
  });
});
