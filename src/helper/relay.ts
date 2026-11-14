// Calls the relay. Only the background worker imports this; the Gemini key lives on the relay.
import type { GeminiAnswer } from '@/shared/tools';

export const RELAY_URL = 'http://64.177.52.26'; // becomes https://api.<domain> once DNS is set

export async function askRelay(prompt: string): Promise<GeminiAnswer> {
  try {
    const r = await fetch(`${RELAY_URL}/gemini`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) {
      console.error('[Steady] relay said', r.status, await r.text().catch(() => ''));
      return { type: 'gemini/answer', ok: false, text: '' };
    }
    const j = (await r.json()) as { text?: string };
    return { type: 'gemini/answer', ok: true, text: j.text ?? '' };
  } catch (err) {
    console.error('[Steady] relay call failed', err);
    return { type: 'gemini/answer', ok: false, text: '' };
  }
}
