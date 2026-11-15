// Calls the relay. Only the background worker imports this; the Gemini key lives on the relay.
import type { GeminiAnswer } from '@/shared/tools';

export const RELAY_URL = 'http://64.177.52.26'; // becomes https://api.<domain> once DNS is set

/** `search` and `json` are each one extra word in the request. A relay that doesn't know them ignores them. */
export async function askRelay(prompt: string, search = false, json = false): Promise<GeminiAnswer> {
  try {
    const r = await fetch(`${RELAY_URL}/gemini`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, ...(search ? { search: true } : {}), ...(json ? { json: true } : {}) }),
      signal: AbortSignal.timeout(35000),
    });
    if (!r.ok) {
      console.error('[Milo] relay said', r.status, await r.text().catch(() => ''));
      return { type: 'gemini/answer', ok: false, text: '' };
    }
    const j = (await r.json()) as { text?: string };
    return { type: 'gemini/answer', ok: true, text: j.text ?? '' };
  } catch (err) {
    console.error('[Milo] relay call failed', err);
    return { type: 'gemini/answer', ok: false, text: '' };
  }
}
