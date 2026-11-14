// Bundled and injected into pages by the tests, so the guide lane can be checked
// in a real browser without the rest of the extension. The other lanes' pieces are
// replaced by recorders: every call to the overlay or the voice lands in `calls`.
import * as choices from '@/guide/choices';
import { modelVia } from '@/guide/choices/prompt';
import { adaptOverlay } from '@/guide/adapters';
import { createClickSource } from '@/guide/clicks';
import * as details from '@/guide/details';
import * as recorder from '@/guide/recorder';
import { answer } from '@/guide/answers';
import * as family from '@/guide/family';
import * as player from '@/guide/player';
import * as spotlight from '@/guide/spotlight';
import { pageMap } from '@/guide/map';
import { toModelSafe } from '@/shared/pagemap';
import { provide, type ChoiceLabelReply, type ChoiceLabelRequest } from '@/shared/ports';

type Call = { port: string; method: string; args: unknown[] };

const calls: Call[] = [];
const log =
  (port: string, method: string) =>
  (...args: unknown[]) => {
    calls.push({ port, method, args });
  };

provide('overlay', { labels: log('overlay', 'labels'), spotlight: log('overlay', 'spotlight'), clear: log('overlay', 'clear') });
provide('speech', { say: log('speech', 'say') });
// Saved data has to outlive a page load, as it does in the real extension.
const fallback = new Map<string, string>();
const disk = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return fallback.get(k) ?? null; // pages with no address of their own have no storage
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      fallback.set(k, v);
    }
  },
  remove: (k: string) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      fallback.delete(k);
    }
  },
};
provide('store', {
  async get<T>(key: string) {
    const raw = disk.get(`steady-test:${key}`);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  },
  async set(key, value) {
    disk.set(`steady-test:${key}`, JSON.stringify(value));
  },
  async remove(key) {
    disk.remove(`steady-test:${key}`);
  },
});
// The same click source the extension uses.
provide('clicks', createClickSource());

const steady = {
  api: pageMap,
  toModelSafe,
  choices,
  /** Wire choice labels to a function that sends a prompt to Gemini and returns its text. */
  useGemini(ask: (prompt: string) => Promise<string>) {
    provide('model', modelVia(async (prompt) => {
      calls.push({ port: 'gemini', method: 'ask', args: [prompt] });
      return ask(prompt);
    }));
  },
  adaptOverlay,
  details,
  recorder,
  spotlight,
  player,
  family,
  answer,
  /** Tests play the part of the relay: true = sent, false = could not send. */
  setFamily(reply: boolean) {
    provide('family', {
      async tellHelper(note) {
        calls.push({ port: 'family', method: 'tellHelper', args: [note] });
        return reply;
      },
    });
  },
  calls,
  /** Tests set this to play the part of Gemini. */
  setModel(reply: ((request: ChoiceLabelRequest) => ChoiceLabelReply) | null) {
    provide(
      'model',
      reply && {
        async labelChoices(request) {
          calls.push({ port: 'model', method: 'labelChoices', args: [request] });
          return reply(request);
        },
      },
    );
  },
};

declare global {
  interface Window {
    __steady: typeof steady;
  }
}

window.__steady = steady;
