// "Follow the dot": the first step of the fitting. Owner: A.
// A dot drifts slowly across the page. The person follows it with their pointer for about fifteen seconds.
// The raw pointer comes from the pointer tracker, the only code that listens to it.

import { STEADY_UI_ATTR } from '@/shared/pagemap';
import type { PointerTracker } from '../pointer';
import { analyseTremor, type FollowSample, type TremorReading } from './analysis';

const COUNTDOWN_S = 3;
export const FOLLOW_S = 15;
const DOT = 30;

/** Where the dot is, `s` seconds in. Slow and smooth, so following it is easy and any shake stands out. */
export function dotAt(s: number, width: number, height: number): { x: number; y: number } {
  return {
    x: width / 2 + width * 0.3 * Math.sin((2 * Math.PI * s) / 9),
    y: height / 2 + height * 0.25 * Math.sin((2 * Math.PI * s) / 7 + 1),
  };
}

export type FollowResult = { done: true; reading: TremorReading | null } | { done: false };

const CSS = `
  :host { all: initial; }
  .back { position: fixed; inset: 0; z-index: 2147483647; background: rgba(250, 247, 240, 0.97); font: 600 22px/1.4 system-ui, sans-serif; color: #1f2a37; }
  .card { position: fixed; left: 50%; top: 32px; transform: translateX(-50%); max-width: min(640px, 90vw); text-align: center; background: #fff; border: 2px solid #1d4ed8; border-radius: 16px; padding: 14px 22px; box-shadow: 0 6px 24px rgba(0,0,0,0.15); }
  .card small { display: block; font-weight: 500; font-size: 18px; color: #475569; margin-top: 4px; }
  .dot { position: fixed; left: 0; top: 0; width: ${DOT}px; height: ${DOT}px; margin: -${DOT / 2}px 0 0 -${DOT / 2}px; border-radius: 50%; background: #dc2626; box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.25); }
  .bar { position: fixed; left: 0; bottom: 0; height: 8px; background: #1d4ed8; width: 0; }
  button { font: 600 18px system-ui, sans-serif; margin-top: 10px; min-height: 48px; min-width: 96px; padding: 8px 18px; border-radius: 10px; border: 2px solid #475569; background: #fff; color: #1f2a37; cursor: pointer; }
  button:focus-visible { outline: 4px solid #1d4ed8; outline-offset: 3px; }
`;

/**
 * Runs the test. Resolves with the reading, or `{ done: false }` if the person pressed Escape or Skip.
 * Uses its own full-page cover so the page underneath can't be clicked by accident.
 */
export function runFollowTheDot(doc: Document, tracker: PointerTracker): Promise<FollowResult> {
  return new Promise((resolve) => {
    const host = doc.createElement('div');
    host.setAttribute(STEADY_UI_ATTR, '');
    const root = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    const back = doc.createElement('div');
    back.className = 'back';
    const card = doc.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'status'); // each new instruction is read out, not only shown
    const dot = doc.createElement('div');
    dot.className = 'dot';
    const bar = doc.createElement('div');
    bar.className = 'bar';
    const skip = doc.createElement('button');
    skip.textContent = 'Skip';
    back.append(card, dot, bar);
    root.append(style, back);
    doc.documentElement.append(host);

    const say = (main: string, small = '') => {
      card.replaceChildren(main);
      if (small) {
        const note = doc.createElement('small');
        note.textContent = small;
        card.append(note);
      }
      card.append(skip);
    };

    const samples: FollowSample[] = [];
    let frame = 0;
    let finished = false;
    const startedAt = performance.now();

    const finish = (result: FollowResult) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      doc.removeEventListener('keydown', onKey, true);
      host.remove();
      resolve(result);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish({ done: false });
    };
    doc.addEventListener('keydown', onKey, true);
    skip.addEventListener('click', () => finish({ done: false }));

    const tick = (now: number) => {
      if (finished) return;
      const elapsed = (now - startedAt) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = elapsed - COUNTDOWN_S;
      const pos = dotAt(Math.max(s, 0), w, h);
      dot.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      if (s < 0) {
        say(`Get ready: ${Math.ceil(-s)}`, 'Hold your mouse or trackpad the way you normally do.');
      } else if (s < FOLLOW_S) {
        say('Follow the red dot', 'Keep the pointer on it. Go at your own pace; it does not need to be perfect.');
        bar.style.width = `${(s / FOLLOW_S) * 100}%`;
        const at = tracker.raw();
        if (at) samples.push({ t: now, x: at.x, y: at.y, dotX: pos.x, dotY: pos.y });
      } else {
        finish({ done: true, reading: analyseTremor(samples) });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}
