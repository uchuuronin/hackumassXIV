// Listening to her, with Chrome's speech recognition. Owner: C (lifted out of the panel so it can be tested).
//
// The bug this fixes: Milo used to ask Chrome for its on-device speech model and wait for the download
// before listening. That download can take minutes, or never finish, so "Talk to me" seemed to do nothing.
// Now it starts listening at once. If the on-device model is ready it is used, and the audio never leaves
// the computer. If not, Chrome's ordinary recogniser is used (Google's speech service turns the audio
// into words), and the on-device model is asked for in the background, for next time.

/** What Chrome says about its on-device model, at most this long. */
const ASK_MS = 600;

export interface HearOptions {
  lang?: string;
  /** How long a pause means she has finished. */
  quietMs?: number;
  onStart?(): void;
  /** The words so far, as she speaks. */
  onWords?(words: string): void;
  /** She paused: the whole of what she said. */
  onDone(words: string): void;
  /** "no-speech", "not-allowed", "audio-capture", "network", ... Said once. */
  onError(code: string): void;
}

interface Recogniser {
  lang: string;
  processLocally?: boolean;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecogniserClass = (new () => Recogniser) & {
  available?(o: unknown): Promise<string>;
  install?(o: unknown): Promise<unknown>;
};

export function listen(SR: unknown, o: HearOptions): { stop(): void } {
  const Class = SR as RecogniserClass;
  const lang = o.lang ?? 'en-US';
  let rec: Recogniser | null = null;
  let stopped = false;
  let finished = false;
  let heard = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (fn: () => void) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    fn();
  };

  const begin = (local: boolean) => {
    if (stopped) return;
    try {
      rec = new Class();
      rec.lang = lang;
      if (local) rec.processLocally = true;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        heard = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
        if (!heard) return;
        o.onWords?.(heard);
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            rec?.stop();
          } catch {
            // already stopped
          }
          finish(() => o.onDone(heard));
        }, o.quietMs ?? 1800);
      };
      rec.onerror = (e) => finish(() => o.onError(String(e.error || 'unknown')));
      rec.onend = () => finish(() => (heard ? o.onDone(heard) : o.onError('no-speech')));
      rec.start();
      o.onStart?.();
    } catch {
      finish(() => o.onError('unknown'));
    }
  };

  // Is the on-device model ready? Asked briefly; never waited on.
  const opts = { langs: [lang], processLocally: true };
  let decided = false;
  const decide = (local: boolean) => {
    if (decided) return;
    decided = true;
    begin(local);
  };
  const wait = setTimeout(() => decide(false), ASK_MS);
  Promise.resolve()
    .then(() => Class.available?.(opts))
    .then((state) => {
      clearTimeout(wait);
      if (state === 'downloadable') void Promise.resolve(Class.install?.(opts)).catch(() => undefined); // for next time
      decide(state === 'available');
    })
    .catch(() => {
      clearTimeout(wait);
      decide(false);
    });

  return {
    stop() {
      stopped = true;
      try {
        rec?.stop();
      } catch {
        // already stopped
      }
    },
  };
}
