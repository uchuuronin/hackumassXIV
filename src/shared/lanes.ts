// How each lane plugs into the page. Owner: C (start script).
// A lane exports one start function and adds one line to src/entrypoints/content.ts.

export interface LaneContext {
  /** Runs when the extension is reloaded or removed. Stop listeners and timers here. */
  onStop(cleanup: () => void): void;
  /** True for builds made with `npm run dev`. */
  dev: boolean;
}

export type StartLane = (ctx: LaneContext) => void | Promise<void>;
