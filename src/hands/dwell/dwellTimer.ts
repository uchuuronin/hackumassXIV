// Dwell click timing. Owner: A. Pure logic, no page access, so it is easy to test.
// Feed it, every frame, which button the steadied pointer is on and where the pointer is.
// It says how full the ring is and when to click.
//
// Rules:
//   - The ring fills while the pointer stays on the same button and hardly moves.
//   - Moving to another button, or off the button, empties it.
//   - Moving more than `holdPx` while on the button starts the count again.
//   - After a click, nothing more happens until the pointer leaves that button. Holding still never
//     clicks twice.

import type { Point } from '../filter/pointerFilter';

export interface DwellOptions {
  /** How long to hold still before it clicks, in milliseconds. */
  dwellMs: number;
  /** How far the pointer may drift while holding, in pixels. */
  holdPx: number;
}

export const DEFAULT_DWELL: DwellOptions = { dwellMs: 1000, holdPx: 12 };

export interface DwellState {
  /** 0 to 1. 0 means nothing is filling. */
  progress: number;
  /** True once, at the moment it should click. */
  fire: boolean;
}

export class DwellTimer {
  private id: string | null = null;
  private anchor: Point | null = null;
  private since = 0;
  private done = false;

  options: DwellOptions;

  constructor(options: DwellOptions = DEFAULT_DWELL) {
    this.options = options;
  }

  update(id: string | null, at: Point, nowMs: number): DwellState {
    if (!id) {
      this.reset();
      return { progress: 0, fire: false };
    }
    if (id !== this.id) {
      this.id = id;
      this.anchor = at;
      this.since = nowMs;
      this.done = false;
    } else if (!this.done && this.anchor && Math.hypot(at.x - this.anchor.x, at.y - this.anchor.y) > this.options.holdPx) {
      this.anchor = at;
      this.since = nowMs;
    }
    if (this.done) return { progress: 0, fire: false };
    const progress = Math.min(1, (nowMs - this.since) / this.options.dwellMs);
    if (progress >= 1) {
      this.done = true;
      return { progress: 1, fire: true };
    }
    return { progress, fire: false };
  }

  /** The person pressed for real. Don't click again on this button until they leave it. */
  pressedForReal(): void {
    if (this.id) this.done = true;
  }

  reset(): void {
    this.id = null;
    this.anchor = null;
    this.done = false;
  }
}
