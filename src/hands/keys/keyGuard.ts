// Double-key guard. Owner: A.
// A shaky finger can hit one key twice in a few milliseconds. The second hit is dropped so a letter is
// typed once. Held keys (the computer's own repeat), shortcuts and non-letter keys are left alone.

export interface KeyHit {
  /** Which physical key, e.g. "KeyL". */
  code: string;
  /** What it types, e.g. "l". Single characters only are guarded. */
  key: string;
  /** Milliseconds, from any clock. */
  t: number;
  /** The computer is repeating a held key. */
  repeat: boolean;
  /** Ctrl, Cmd or Alt is down: a shortcut, not typing. */
  shortcut: boolean;
}

export class KeyGuard {
  /** Shortest gap, in ms, between two hits of the same key. 0 turns the guard off. */
  guardMs: number;
  private lastCode = '';
  private lastAt = -Infinity;

  constructor(guardMs = 0) {
    this.guardMs = guardMs;
  }

  /** True if this hit is a double and should be dropped. */
  shouldDrop(hit: KeyHit): boolean {
    if (this.guardMs <= 0 || hit.repeat || hit.shortcut || hit.key.length !== 1) return false;
    const drop = hit.code === this.lastCode && hit.t - this.lastAt < this.guardMs;
    if (!drop) {
      this.lastCode = hit.code;
      this.lastAt = hit.t;
    }
    return drop;
  }

  reset(): void {
    this.lastCode = '';
    this.lastAt = -Infinity;
  }
}
