// Steady scrolling: the part that decides which wheel movements to keep. Owner: A.
// A shaky hand on a wheel or trackpad does two things: it jolts (one huge movement) and it flicks back
// the other way for a moment. The jolt is capped, and a small flick backwards straight after a movement
// forwards is dropped. A real change of direction (a bigger movement, or after a short pause) is kept.

export class ScrollFilter {
  /** The most one wheel event may move the page, in pixels. */
  maxStepPx = 240;
  /** A movement the other way within this many ms of the last kept one is a flick back... */
  reversalMs = 250;
  /** ...unless it is at least this big, which means the person meant it. */
  reversalPx = 40;

  private lastSign = 0;
  private lastAt = -Infinity;

  /** How far to scroll for this wheel movement (pixels, same sign), or 0 to drop it. */
  accept(t: number, delta: number): number {
    if (!Number.isFinite(delta) || delta === 0) return 0;
    const sign = Math.sign(delta);
    const reversing = this.lastSign !== 0 && sign !== this.lastSign && t - this.lastAt < this.reversalMs;
    if (reversing && Math.abs(delta) < this.reversalPx) return 0;
    this.lastSign = sign;
    this.lastAt = t;
    return sign * Math.min(Math.abs(delta), this.maxStepPx);
  }

  reset(): void {
    this.lastSign = 0;
    this.lastAt = -Infinity;
  }
}
