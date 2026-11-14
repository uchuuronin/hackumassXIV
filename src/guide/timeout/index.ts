// Feature 8, the timeout warning. Some websites count down quietly and then clear the page. The person
// who types slowly and carefully is exactly who gets caught, and they think they did something wrong.
//   - Steady notices the warning, says what it means in plain words, and shows the way to more time.
//   - It offers to press "stay" for her, and presses it only after a yes. It is never a button that pays or sends.
//   - If the page has already reset, it says that was the website, not her.
// It reads only the warning itself, on this computer. Nothing leaves the page.

import { STEADY_UI_ATTR, type PageElement } from '@/shared/pagemap';
import { need } from '@/shared/ports';
import type { Tool } from '@/shared/tools';
import { pageMap } from '../map';
import * as spotlight from '../spotlight';

export interface TimeoutState {
  status: 'none' | 'warning' | 'ended' | 'kept';
  said: string;
  options?: string[];
}

/** Where websites put this kind of notice. An ordinary paragraph that mentions time is never one. */
const PLACES =
  '[role="status"],[role="alert"],[role="alertdialog"],[role="dialog"],[role="timer"],[aria-live],' +
  '[class*="timeout" i],[class*="session" i],[class*="expir" i],[class*="idle" i],[id*="timeout" i],[id*="session" i],[id*="expir" i]';
const WARNING =
  /\b(session|page|form|you|booking|basket|cart|order)\b[^.]{0,60}\b(will|is about to|are about to|is going to|are going to)\b[^.]{0,30}\b(expire|time ?out|reset|end|clear|be cleared|be signed out|be logged out|sign you out|log you out)\b/i;
const ENDED = /\b(session|page|form)\b[^.]{0,40}\b(ended|expired|timed out|was cleared|been reset|been cleared)\b|\byou (have been|were) (signed|logged) out\b/i;
const STAY = /\b(stay|continue|extend|still here|keep (me )?(signed|logged) in|more time|i.?m here)\b/i;
const NONE: TimeoutState = { status: 'none', said: '' };

let stay: { id: string } | null = null;

interface Notice {
  el: Element;
  kind: 'warning' | 'ended';
  text: string;
}

function findNotice(): Notice | null {
  for (const el of document.querySelectorAll(PLACES)) {
    if (el.closest(`[${STEADY_UI_ATTR}]`)) continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 300) continue; // a whole page wrapped in a "session" box is not a notice
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    if (ENDED.test(text)) return { el, kind: 'ended', text };
    if (WARNING.test(text)) return { el, kind: 'warning', text };
  }
  return null;
}

/** "0:45", "90 seconds", "2 minutes" → plain words. */
function timeLeft(text: string): string {
  let seconds: number | null = null;
  const clock = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const mins = text.match(/\b(\d{1,3})\s*(minutes?|mins?)\b/i);
  const secs = text.match(/\b(\d{1,4})\s*(seconds?|secs?)\b/i);
  if (clock) seconds = Number(clock[1]) * 60 + Number(clock[2]);
  else if (mins) seconds = Number(mins[1]) * 60;
  else if (secs) seconds = Number(secs[1]);
  if (seconds === null) return 'soon';
  if (seconds < 50) return 'in less than a minute';
  if (seconds < 100) return 'in about a minute';
  return `in about ${Math.round(seconds / 60)} minutes`;
}

function stayButton(notice: Element): PageElement | undefined {
  const inside = pageMap
    .get()
    .elements.filter((e) => e.visible && !e.disabled && (e.kind === 'button' || e.kind === 'link'))
    .filter((e) => {
      const dom = pageMap.elementFor(e.id);
      return !!dom && notice.contains(dom);
    });
  return inside.find((e) => STAY.test(e.label) && e.protection === 'none');
}

/** Look at the page now. Lights the way to more time if there is one. Presses nothing. */
export async function check(): Promise<TimeoutState> {
  const notice = findNotice();
  stay = null;
  if (!notice) return NONE;

  if (notice.kind === 'ended') {
    return { status: 'ended', said: 'This page has reset itself, and what was typed has been cleared. That was the website, not you. We can fill it in again together.', options: ['Help me fill this in'] };
  }
  const resets = /\b(reset|clear)/i.test(notice.text);
  const what = resets ? 'reset' : 'sign you out';
  const when = timeLeft(notice.text);
  const button = stayButton(notice.el);
  if (!button) {
    return {
      status: 'warning',
      said: `This page says it will ${what} ${when}. I can't see a button that asks for more time. If it does ${what}, that is the website, not you, and we can do this again together.`,
    };
  }
  stay = { id: button.id };
  await spotlight.on(button.id, 'This gives you more time.', { dim: false });
  return {
    status: 'warning',
    said: `This page says it will ${what} ${when}. Nothing is lost yet. The ${button.kind === 'link' ? 'link' : 'button'} "${button.label}" gives you more time. Shall I click it for you?`,
    options: ['Yes, keep my place', 'I will click it'],
  };
}

/** "Yes, keep my place": press the stay button. Only ever a button the safety limit allows. */
export async function keepPlace(): Promise<TimeoutState> {
  const el = stay && pageMap.elementFor(stay.id);
  if (!el || !(el instanceof HTMLElement)) return { status: 'none', said: 'I can\'t see that button any more. The page may already have given you more time.' };
  if (!pageMap.mayAutoClick(el).allowed) return { status: 'warning', said: 'I would rather you click that one yourself. It is the one I have lit up.' };
  spotlight.off();
  stay = null;
  el.click();
  return { status: 'kept', said: 'Done. The page has given you more time. There is no rush.' };
}

/** "I will click it." */
export function leave(): TimeoutState {
  return { status: 'warning', said: 'All right. It is the one I have lit up.' };
}

/**
 * Keep an eye on the page. Speaks once when a warning appears, and once if the page then resets.
 * A countdown that ticks every second does not make it speak again.
 */
export function watch(): () => void {
  const told = new WeakMap<Element, string>();
  let timer: number | undefined;
  const look = async () => {
    const notice = findNotice();
    if (!notice || told.get(notice.el) === notice.kind) return;
    told.set(notice.el, notice.kind);
    const state = await check();
    if (state.status !== 'none') need('speech').say(state.said, state.options);
  };
  const soon = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void look(), 400);
  };
  const observer = new MutationObserver(soon);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  soon();
  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}

export const timeoutTool: Tool = {
  name: 'check_timeout',
  owner: 'guide',
  description: 'Check whether this page is warning that it will reset or sign the person out soon, and show the way to more time. Use for "why did my form disappear?" and "is this page going to time out?".',
  parameters: {},
  async run() {
    const state = await check();
    return { ok: true, said: state.said || 'I can\'t see any warning about time on this page.', data: { status: state.status, options: state.options } };
  },
};
