// Tremor filter. Owner: A.
// Takes the raw pointer position and gives back a steadier one.
//
// Two stages per axis:
//   1. A notch at the person's tremor frequency (about 4 to 12 shakes a second) takes the shake out
//      without slowing the hand down.
//   2. A One Euro filter (Casiez, Roussel and Vogel, 2012) smooths what is left. It smooths a lot when
//      the hand is slow, which is when shake shows, and very little when the hand moves fast, so the
//      pointer doesn't trail behind a deliberate movement.
//
// Plain TypeScript with no browser calls, so it can be tested in Node and runs on every pointer event.

export interface FilterOptions {
  /** The person's tremor frequency in hertz. The fitting measures it. */
  tremorHz: number;
  /** Notch width. Low = wide, which copes with a tremor that drifts in frequency. */
  notchQ: number;
  /** Turn the notch off to hear what the One Euro stage does alone. */
  notch: boolean;
  /** One Euro: lowest cutoff in hertz, used when the hand is slow. Lower = steadier but laggier. */
  minCutoff: number;
  /** One Euro: how fast the cutoff rises with speed. Higher = less lag on quick moves. */
  beta: number;
  /** One Euro: cutoff for the speed estimate, in hertz. */
  dCutoff: number;
}

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  tremorHz: 6,
  notchQ: 3,
  notch: true,
  minCutoff: 1,
  beta: 0.03,
  dCutoff: 0.5,
};

/** After a pause this long the hand has stopped. Start fresh from where it is. */
const RESET_AFTER_S = 0.25;
const MIN_DT_S = 0.001;
const MAX_DT_S = 0.1;

function smoothing(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

class OneEuro {
  private x: number | undefined;
  private dx = 0;

  filter(value: number, dt: number, o: FilterOptions): number {
    if (this.x === undefined) {
      this.x = value;
      return value;
    }
    const rawSpeed = (value - this.x) / dt;
    this.dx += smoothing(o.dCutoff, dt) * (rawSpeed - this.dx);
    const cutoff = o.minCutoff + o.beta * Math.abs(this.dx);
    this.x += smoothing(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = undefined;
    this.dx = 0;
  }
}

/**
 * Second-order notch, run on a fixed internal clock.
 * Pointer events arrive at uneven gaps. A filter whose settings change with every gap can ring and
 * make a shake bigger, so the position is laid onto an even 240-per-second grid (by straight-line
 * interpolation between events) and the notch runs on that grid with settings that never change.
 */
const GRID_HZ = 240;
const GRID_S = 1 / GRID_HZ;

class Notch {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private out = 0;
  private prevT = 0;
  private prevV = 0;
  private nextTick = 0;
  private primed = false;

  filter(value: number, timeS: number, o: FilterOptions): number {
    if (!this.primed) {
      this.x1 = this.x2 = this.y1 = this.y2 = this.out = value;
      this.prevT = timeS;
      this.prevV = value;
      this.nextTick = timeS + GRID_S;
      this.primed = true;
      return value;
    }
    if (timeS <= this.prevT) return this.out; // same instant or out of order: nothing new to filter
    const w0 = (2 * Math.PI * o.tremorHz) / GRID_HZ;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * o.notchQ);
    const a0 = 1 + alpha;
    const b1 = -2 * cos;
    const span = timeS - this.prevT;
    let steps = 0;
    while (this.nextTick <= timeS && steps++ < 64) {
      const v = this.prevV + (value - this.prevV) * ((this.nextTick - this.prevT) / span);
      const y = (v + b1 * this.x1 + this.x2 - b1 * this.y1 - (1 - alpha) * this.y2) / a0;
      this.x2 = this.x1;
      this.x1 = v;
      this.y2 = this.y1;
      this.y1 = y;
      this.out = y;
      this.nextTick += GRID_S;
    }
    this.prevT = timeS;
    this.prevV = value;
    return this.out;
  }

  reset(): void {
    this.primed = false;
  }
}

export interface Point {
  x: number;
  y: number;
}

export class PointerFilter {
  private o: FilterOptions;
  private lastMs: number | undefined;
  private readonly nx = new Notch();
  private readonly ny = new Notch();
  private readonly ex = new OneEuro();
  private readonly ey = new OneEuro();

  constructor(options: Partial<FilterOptions> = {}) {
    this.o = { ...DEFAULT_FILTER_OPTIONS, ...options };
  }

  get options(): Readonly<FilterOptions> {
    return this.o;
  }

  setOptions(options: Partial<FilterOptions>): void {
    this.o = { ...this.o, ...options };
  }

  /** Feed one raw position and its time in milliseconds. Returns the steadied position. */
  filter(x: number, y: number, timeMs: number): Point {
    const gap = this.lastMs === undefined ? Infinity : (timeMs - this.lastMs) / 1000;
    if (gap > RESET_AFTER_S) this.reset();
    this.lastMs = timeMs;
    const dt = gap > RESET_AFTER_S ? 1 / 60 : Math.min(Math.max(gap, MIN_DT_S), MAX_DT_S);
    const t = timeMs / 1000;
    const sx = this.o.notch ? this.nx.filter(x, t, this.o) : x;
    const sy = this.o.notch ? this.ny.filter(y, t, this.o) : y;
    return { x: this.ex.filter(sx, dt, this.o), y: this.ey.filter(sy, dt, this.o) };
  }

  reset(): void {
    this.nx.reset();
    this.ny.reset();
    this.ex.reset();
    this.ey.reset();
    this.lastMs = undefined;
  }
}
