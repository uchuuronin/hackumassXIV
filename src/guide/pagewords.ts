// The words on the page, for Gemini. Owner: C.
//
// Until now Gemini was told only the names of the buttons and boxes. That keeps everything private, and
// it also means Milo can't answer "which of these is cheapest?" or "what does this page want from me?".
// So Gemini may now read what she can read herself: the words in the main part of the page.
//
// What is never read, whatever the page:
//   - anything in a box she can type in, a list she chose from, or a part of the page she can write on
//   - anything hidden, and anything Milo drew
//   - email addresses, long numbers (cards, accounts) and anything shaped like an ID number: blanked out
// And some pages are not read at all:
//   - a page for signing in, entering a code, or paying, or any page showing a password or card box
//   - a page that looks like her bank, her payslip, her taxes or her medical records
// On those, Gemini gets the button names and nothing else, exactly as before.
// She can also switch reading off ("Read the page to answer my questions", in Settings).

import { STEADY_UI_ATTR } from '@/shared/pagemap';
import { pageMap } from './map';
import { isOn } from './switches';

export interface PageWords {
  /** The readable words, at most 6,000 characters. Empty when held back. */
  words: string;
  /** Why nothing was read: the page is a private kind, or she switched reading off. */
  held?: 'private' | 'off';
}

const LIMIT = 6000;
const NEVER = `[${STEADY_UI_ATTR}], script, style, noscript, template, svg, input, textarea, select, option, [contenteditable=""], [contenteditable="true"], [hidden]`;
const AROUND = 'nav, footer, aside, [role="navigation"], [role="contentinfo"], [role="complementary"]';
const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, blockquote, figcaption, label, button, summary, caption, div, section, article, main';
const PRIVATE_STAGES = new Set(['sign-in', 'sign-up', 'code', 'checkout', 'payment']);
const PRIVATE_WORDS = /\b(bank|banking|credit union|account (summary|balance|overview|activity)|statements?|payroll|pay ?stub|payslip|tax return|mychart|patient portal|medical records?|test results|prescriptions?|insurance claim)\b/i;

function isPrivate(): boolean {
  const map = pageMap.get();
  if (PRIVATE_STAGES.has(map.stage.kind)) return true;
  if (map.elements.some((e) => e.visible && e.secret)) return true;
  const about = `${location.hostname} ${document.title} ${document.querySelector('h1')?.textContent ?? ''}`;
  return PRIVATE_WORDS.test(about);
}

/** Blanks what could identify her or her money, even on an ordinary page. */
export function blank(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[an email address]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[a long number]')
    .replace(/\b\d(?:[ -]?\d){11,}\b/g, '[a long number]');
}

export function read(): PageWords {
  if (!document.body) return { words: '' };
  if (isPrivate()) return { words: '', held: 'private' };
  const articles = document.querySelectorAll('article');
  const root = document.querySelector('main, [role="main"]') ?? (articles.length === 1 ? articles[0]! : document.body);
  const whole = root === document.body;
  const seen = new Map<Element, boolean>();
  const visible = (el: Element): boolean => {
    let known = seen.get(el);
    if (known === undefined) {
      known = el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      seen.set(el, known);
    }
    return known;
  };
  const lines: string[] = [];
  let block: Element | null = null;
  let from: Element | null = null;
  let size = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && size < LIMIT * 1.5; node = walker.nextNode()) {
    const el = node.parentElement;
    const text = node.textContent ?? '';
    if (!el || !text.trim() || el.closest(NEVER) || (whole && el.closest(AROUND)) || !visible(el)) continue;
    const mine = el.closest(BLOCK);
    if (mine !== block || !lines.length) {
      block = mine;
      lines.push(mine?.matches('h1, h2, h3') ? '# ' : '');
    }
    // A price that has been crossed out is the old price. Said plainly, so Gemini never quotes it as today's.
    const old = el.closest('s, del, strike') || getComputedStyle(el).textDecorationLine.includes('line-through');
    const piece = old ? `(was ${text.trim()})` : text;
    // Two pieces set side by side with no space between them ("$34.00" and "$42.00") are two things, not one word.
    const line = lines[lines.length - 1]!;
    const joined = el !== from && /[\w$€£%)]$/.test(line) && /^[\w$€£(]/.test(piece);
    lines[lines.length - 1] = line + (joined ? ' ' : '') + piece;
    from = el;
    size += text.length;
  }
  let words = blank(lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line && line !== '#').join('\n'));
  if (words.length > LIMIT) words = words.slice(0, LIMIT + 1).replace(/\s+\S*$/, '');
  return { words };
}

/** May Milo take a picture of her screen now? Never on a private page, and not if she has switched it off. */
export async function mayLook(): Promise<{ ok: true } | { ok: false; held: 'private' | 'off' }> {
  if (!(await isOn('sight'))) return { ok: false, held: 'off' };
  if (isPrivate()) return { ok: false, held: 'private' };
  return { ok: true };
}

/** What may go to Gemini right now: nothing if she has switched reading off. */
export async function forGemini(): Promise<PageWords> {
  if (!(await isOn('words'))) return { words: '', held: 'off' };
  return read();
}
