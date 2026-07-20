const MS_PER_GAME_DAY = 6_000;

export const CLOCK_SPEEDS = [1, 2, 5] as const;
export type ClockSpeed = (typeof CLOCK_SPEEDS)[number];

export type FrameScheduler = {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
};

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Wall-clock driver for the in-game calendar.  The simulation itself never
 * sees fractional time: this class accumulates real elapsed milliseconds and
 * fires exactly one `onDayTick` per whole in-game day, so a run produces the
 * same event sequence whether it was played at 1x, 5x, or skipped ahead.
 */
export class GameClock {
  private accumulatedMs = 0;
  private lastFrameMs: number | null = null;
  private frameHandle: number | null = null;
  private disposed = false;
  paused = true;
  speed: ClockSpeed = 1;

  /** Return false from the tick to stop the clock (for example, run over). */
  constructor(
    private readonly onDayTick: () => boolean,
    private readonly msPerDay: number = MS_PER_GAME_DAY,
    private readonly scheduler: FrameScheduler = browserFrameScheduler,
  ) {}

  start(): void {
    if (this.disposed || this.frameHandle !== null) return;
    this.lastFrameMs = null;
    this.frameHandle = this.scheduler.request(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) this.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
  }

  play(): void {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  setSpeed(speed: ClockSpeed): void {
    this.speed = speed;
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    // Clamp the delta so a throttled or backgrounded tab never fast-forwards
    // the simulation when it becomes visible again.
    const delta =
      this.lastFrameMs === null ? 0 : Math.min(now - this.lastFrameMs, 250);
    this.lastFrameMs = now;
    let shouldContinue = true;
    if (!this.paused) {
      this.accumulatedMs += delta * this.speed;
      while (this.accumulatedMs >= this.msPerDay) {
        this.accumulatedMs -= this.msPerDay;
        if (!this.onDayTick()) {
          this.pause();
          this.accumulatedMs = 0;
          shouldContinue = false;
          break;
        }
      }
    }
    if (!shouldContinue || this.disposed) {
      this.frameHandle = null;
      return;
    }
    this.frameHandle = this.scheduler.request(this.frame);
  };
}
