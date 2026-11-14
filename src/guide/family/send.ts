// The background worker's part of "I'm stuck": hand the note to the relay, which sends the email.
// Only the background worker imports this (pages can't call the relay themselves).

import { RELAY_URL } from '@/helper/relay';
import type { StuckNote, StuckSent } from '@/shared/family';

export async function sendStuck(note: StuckNote): Promise<StuckSent> {
  try {
    const r = await fetch(`${RELAY_URL}/stuck`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(note),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) console.error('[Steady] the relay would not send the "I\'m stuck" note:', r.status);
    return { type: 'stuck/sent', ok: r.ok };
  } catch (err) {
    console.error('[Steady] could not reach the relay for the "I\'m stuck" note', err);
    return { type: 'stuck/sent', ok: false };
  }
}
