// Labels from Gemini, for buttons Steady has no words of its own for.
// Gemini sees button names only. Nothing it sends back is trusted until it passes `accept`.

import type { PageElement, PageMap } from '@/shared/pagemap';
import { need, type ChoiceLabelRequest } from '@/shared/ports';
import type { Phrase } from './phrases';

const TIME_LIMIT_MS = 12_000;
const MONEY_WORDS = /\b(pay|paid|buy|purchase|order|charge|donat|subscri|checkout)/i;
const REMOVAL_WORDS = /\b(remove|delete|cancel|take|clear|close|stop|end|leave|erase)/i;

/**
 * The plan: "A label that says 'pay' on the wrong button is worse than no label."
 * A label is kept only if it is one plain sentence in our own shape and agrees with what the page map knows.
 */
export function accept(text: string, el: PageElement): boolean {
  const t = text.trim();
  if (!/^Click this to [a-z]/.test(t)) return false;
  if (t.length > 90 || /[\n\r<>{}]|https?:|www\.|\.(com|net|org)\b/i.test(t)) return false;
  if ((t.match(/[.!?]/g) ?? []).length !== 1 || !/\.$/.test(t)) return false;
  if (MONEY_WORDS.test(t) && el.protection !== 'pay' && !MONEY_WORDS.test(el.label)) return false;
  if (el.protection === 'pay' && !MONEY_WORDS.test(t)) return false;
  if (el.protection === 'delete' && !REMOVAL_WORDS.test(t)) return false;
  return true;
}

type Cache = Record<string, string | null>;

function cacheKey(map: PageMap, names: string[]): string {
  let path = '/';
  try {
    path = new URL(map.url).pathname;
  } catch {
    // keep '/'
  }
  // A small, stable fingerprint of the page address and its button names. A return visit costs nothing.
  const text = `${map.origin}${path}|${[...names].sort().join('|')}`;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `guide:labels:${h.toString(36)}`;
}

/** Returns a sentence for each button Gemini was sure about. Buttons it wasn't sure about are simply missing. */
export async function askModel(buttons: PageElement[], map: PageMap): Promise<Map<string, Phrase>> {
  const out = new Map<string, Phrase>();
  if (!buttons.length) return out;
  const store = need('store');
  const key = cacheKey(map, buttons.map((b) => b.label));
  const name = (b: PageElement) => b.label.toLowerCase();
  const tone = (b: PageElement) => (b.protection === 'none' ? 'info' : 'careful');

  const cached = (await store.get<Cache>(key)) ?? {};
  const toAsk: PageElement[] = [];
  for (const b of buttons) {
    const hit = cached[name(b)];
    if (hit === undefined) toAsk.push(b);
    else if (hit && accept(hit, b)) out.set(b.id, { text: hit, tone: tone(b) });
  }

  const model = need('model');
  if (!toAsk.length || !model) return out;

  const request: ChoiceLabelRequest = {
    site: map.origin,
    stage: map.stage,
    buttons: toAsk.map((b) => ({ id: b.id, kind: b.kind, label: b.label, group: b.group, protection: b.protection, leavesSite: b.leavesSite })),
  };
  try {
    const reply = await Promise.race([
      model.labelChoices(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), TIME_LIMIT_MS)),
    ]);
    const byId = new Map(toAsk.map((b) => [b.id, b]));
    for (const b of toAsk) cached[name(b)] = null; // asked; unsure unless a good answer follows
    for (const item of reply.labels ?? []) {
      const b = byId.get(item.id);
      if (!b || item.confident !== true || typeof item.text !== 'string' || !accept(item.text, b)) continue;
      const text = item.text.trim();
      cached[name(b)] = text;
      out.set(b.id, { text, tone: tone(b) });
    }
    await store.set(key, cached);
  } catch (err) {
    console.warn('[Steady] could not get labels from the helper', err);
  }
  return out;
}
