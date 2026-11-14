// Reading a tremor out of a "follow the dot" run. Owner: A. Pure maths, no page access.
// The person follows a dot that moves slowly and smoothly. What is left after taking the dot's path away,
// and the slow wandering out of what remains, is the shake: how fast (Hz) and how big (px).

export interface FollowSample {
  /** Milliseconds, from any clock. */
  t: number;
  /** Where the pointer was. */
  x: number;
  y: number;
  /** Where the dot was at the same moment. */
  dotX: number;
  dotY: number;
}

export interface TremorReading {
  /** The strongest shake frequency, snapped to the nearest half Hz. */
  hz: number;
  /** About how far the pointer shakes either way from where the hand means it to be, in px. */
  amplitudePx: number;
  /** How much the strongest frequency stands out from the rest. Under about 3, there was probably no clear tremor. */
  clarity: number;
  /** How many seconds of movement the reading is based on. */
  seconds: number;
}

export const BAND_LOW_HZ = 3;
export const BAND_HIGH_HZ = 12;
const GRID_HZ = 100;
/** Following the dot wanders slowly. Taking out anything slower than this window leaves the shake. */
const SMOOTH_S = 0.4;
const STEP_HZ = 0.25;

/** Put uneven samples onto an even grid by joining the dots. */
function resample(times: number[], values: number[], hz: number): number[] {
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined || last <= first) return [];
  const dt = 1000 / hz;
  const out: number[] = [];
  let j = 0;
  for (let t = first; t <= last; t += dt) {
    while (j < times.length - 2 && (times[j + 1] ?? Infinity) < t) j += 1;
    const t0 = times[j] ?? first;
    const t1 = times[j + 1] ?? t0;
    const v0 = values[j] ?? 0;
    const v1 = values[j + 1] ?? v0;
    out.push(t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v0);
  }
  return out;
}

/** The signal with its slow part taken away. */
function highPass(signal: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  const out: number[] = [];
  for (let i = half; i < signal.length - half; i += 1) {
    let sum = 0;
    for (let k = i - half; k <= i + half; k += 1) sum += signal[k] ?? 0;
    out.push((signal[i] ?? 0) - sum / (2 * half + 1));
  }
  return out;
}

function power(signal: number[], hz: number): number {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * hz) / GRID_HZ;
  signal.forEach((v, i) => {
    re += v * Math.cos(w * i);
    im -= v * Math.sin(w * i);
  });
  return (re * re + im * im) / (signal.length * signal.length);
}

/** Null when there isn't enough movement to say anything (under 4 seconds). */
export function analyseTremor(samples: FollowSample[]): TremorReading | null {
  if (samples.length < 30) return null;
  const times = samples.map((s) => s.t);
  const rx = resample(times, samples.map((s) => s.x - s.dotX), GRID_HZ);
  const ry = resample(times, samples.map((s) => s.y - s.dotY), GRID_HZ);
  const window = Math.round(SMOOTH_S * GRID_HZ);
  const hx = highPass(rx, window);
  const hy = highPass(ry, window);
  const seconds = hx.length / GRID_HZ;
  if (seconds < 4) return null;

  const spectrum: Array<{ hz: number; p: number }> = [];
  for (let hz = BAND_LOW_HZ; hz <= BAND_HIGH_HZ + 1e-9; hz += STEP_HZ) {
    spectrum.push({ hz, p: power(hx, hz) + power(hy, hz) });
  }
  const top = spectrum.reduce((a, b) => (b.p > a.p ? b : a));
  const sorted = spectrum.map((s) => s.p).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const clarity = median > 0 ? top.p / median : 0;

  const meanSquare = [...hx, ...hy].reduce((sum, v) => sum + v * v, 0) / Math.max(hx.length, 1) / 2;
  return {
    hz: Math.round(top.hz * 2) / 2,
    amplitudePx: Math.sqrt(meanSquare) * Math.SQRT2,
    clarity,
    seconds,
  };
}

/** What to change in the settings. A reading that is not clear leaves the shake speed alone. */
export function settingsFromReading(reading: TremorReading): { tremorHz?: number; reach: number } {
  const clear = reading.clarity >= 3 && reading.amplitudePx >= 0.8;
  // Reach: how far from a button a click still counts as meant for it. Wider for a bigger shake.
  const reach = Math.min(40, Math.max(16, Math.round(14 + reading.amplitudePx * 3)));
  return clear ? { tremorHz: Math.min(BAND_HIGH_HZ, Math.max(BAND_LOW_HZ, reading.hz)), reach } : { reach };
}
