// The Big Pick panel: large buttons for a small control. Owner: A.
// Three kinds: a list of choices (dropdowns), a month of days (date fields), a number with big plus and minus.
// Each returns what the person chose, or null if they cancelled. Colours come from C's theme.

import { openDialog } from '@/shared/dialog';
import { STEADY_UI_ATTR } from '@/shared/pagemap';
import { theme } from '@/shared/theme';
import { monthGrid, monthHasDays, movePage, pageFor, parseIso, shiftMonth, stepNumber } from './logic';

export interface Choice {
  value: string;
  label: string;
  disabled: boolean;
  selected: boolean;
}

const PER_PAGE = 12;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .veil { position: fixed; inset: 0; z-index: 2147483646; background: ${theme.veil}; display: flex; align-items: center; justify-content: center; font-family: ${theme.font}; color: ${theme.ink}; }
  .card { width: min(760px, 94vw); max-height: 92vh; overflow: auto; background: ${theme.paper}; border: 3px solid ${theme.ink}; border-radius: 18px; padding: 22px; box-shadow: ${theme.shadow}; }
  h2 { margin: 0 0 16px; font-size: 30px; line-height: 1.2; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .week { display: grid; gap: 8px; grid-template-columns: repeat(7, 1fr); margin-bottom: 8px; }
  .head { text-align: center; font-weight: 700; font-size: 18px; color: ${theme.inkQuiet}; }
  button { font: 600 24px/1.2 ${theme.font}; color: ${theme.ink}; min-height: 66px; padding: 8px 14px; border: 3px solid ${theme.ink}; border-radius: ${theme.radius}px; background: ${theme.card}; cursor: pointer; box-shadow: 0 ${theme.depth}px 0 ${theme.ink}; transition: transform ${theme.motion.press}ms ${theme.motion.ease}, box-shadow ${theme.motion.press}ms ${theme.motion.ease}; }
  button:active:not([disabled]) { transform: translateY(${theme.depth}px); box-shadow: 0 0 0 ${theme.ink}; }
  button:focus-visible { outline: 4px solid ${theme.focus}; outline-offset: 3px; }
  @media (forced-colors: active) { button { box-shadow: none; } button.picked { border-width: 6px; } }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  button[disabled] { opacity: 0.35; cursor: default; box-shadow: none; border-style: dashed; }
  button.picked { background: ${theme.tones.go.soft}; border-color: ${theme.tones.go.line}; }
  button.main { background: ${theme.main}; color: ${theme.onMain}; }
  .bar { display: flex; gap: 12px; justify-content: space-between; align-items: center; margin: 16px 0 0; flex-wrap: wrap; }
  .bar.top { margin: 0 0 14px; }
  .note { font-size: 20px; color: ${theme.inkQuiet}; }
  .month { font-size: 28px; font-weight: 700; text-align: center; flex: 1; }
  .nav { min-width: 84px; }
  .number { display: flex; align-items: center; justify-content: center; gap: 22px; margin: 10px 0; }
  .value { font-size: 64px; font-weight: 700; min-width: 3.2ch; text-align: center; }
  .number button { min-width: 96px; font-size: 44px; }
`;

type Build = (card: HTMLElement, done: (value: unknown) => void, doc: Document) => void;

function open<T>(doc: Document, title: string, build: Build): Promise<T | null> {
  return new Promise((resolve) => {
    const host = doc.createElement('div');
    host.setAttribute(STEADY_UI_ATTR, '');
    const root = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    const veil = doc.createElement('div');
    veil.className = 'veil';
    const card = doc.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);
    const heading = doc.createElement('h2');
    heading.textContent = title;
    card.append(heading);
    veil.append(card);
    root.append(style, veil);

    let finished = false;
    let letGo: (() => void) | null = null;
    const done = (value: unknown) => {
      if (finished) return;
      finished = true;
      doc.removeEventListener('keydown', onKey, true);
      host.remove();
      letGo?.();
      resolve(value as T | null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      done(null);
    };
    doc.addEventListener('keydown', onKey, true);
    // A press on the dim area around the card cancels. A press on the card does not.
    veil.addEventListener('mousedown', (event) => {
      if (event.target === veil) done(null);
    });
    build(card, done, doc);
    doc.documentElement.append(host);
    const first = (card.querySelector('button.picked') ?? card.querySelector('button:not([disabled])')) as HTMLElement | null;
    // Shared pop-up rules (guide lane): named by its heading, Tab stays inside, focus goes back afterwards.
    letGo = openDialog(card, { title: heading, first });
  });
}

function button(doc: Document, text: string, onPress: () => void, className = ''): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (className) b.className = className;
  b.addEventListener('click', (event) => {
    event.preventDefault();
    onPress();
  });
  return b;
}

const cancelBar = (doc: Document, done: (v: unknown) => void, extra: HTMLElement[] = []): HTMLElement => {
  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.append(button(doc, 'Cancel', () => done(null)), ...extra);
  return bar;
};

/** A list of choices as big buttons. Long lists come in pages. */
export function pickFromList(doc: Document, title: string, choices: Choice[]): Promise<string | null> {
  return open<string>(doc, title, (card, done) => {
    const selected = choices.findIndex((c) => c.selected);
    let page = pageFor(choices.length, PER_PAGE, selected);
    const holder = doc.createElement('div');
    const render = () => {
      holder.replaceChildren();
      const grid = doc.createElement('div');
      grid.className = 'grid';
      for (const c of choices.slice(page.from, page.to)) {
        const b = button(doc, c.label, () => done(c.value), c.selected ? 'picked' : '');
        b.disabled = c.disabled;
        grid.append(b);
      }
      holder.append(grid);
      if (page.pages > 1) {
        const bar = doc.createElement('div');
        bar.className = 'bar';
        const earlier = button(doc, '◀ Earlier', () => { page = movePage(page, choices.length, PER_PAGE, -1); render(); });
        earlier.disabled = page.index === 0;
        const later = button(doc, 'Later ▶', () => { page = movePage(page, choices.length, PER_PAGE, 1); render(); });
        later.disabled = page.index === page.pages - 1;
        const note = doc.createElement('span');
        note.className = 'note';
        note.textContent = `${choices[page.from]?.label} to ${choices[page.to - 1]?.label}`;
        bar.append(earlier, note, later);
        holder.append(bar);
      }
    };
    render();
    card.append(holder, cancelBar(doc, done));
  });
}

/** A month of days. Returns "YYYY-MM-DD". `min` and `max` are in the same form. */
export function pickDate(doc: Document, title: string, current: string, min?: string, max?: string): Promise<string | null> {
  return open<string>(doc, title, (card, done) => {
    const today = new Date();
    const start = parseIso(current) ?? parseIso(min ?? '') ?? { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    let view = { year: start.year, month: start.month };
    const holder = doc.createElement('div');
    const render = () => {
      holder.replaceChildren();
      const head = doc.createElement('div');
      head.className = 'bar top';
      const prev = shiftMonth(view.year, view.month, -1);
      const next = shiftMonth(view.year, view.month, 1);
      const back = button(doc, '◀', () => { view = prev; render(); }, 'nav');
      back.disabled = !!min && !monthHasDays(prev.year, prev.month, min, max);
      back.setAttribute('aria-label', 'Earlier month');
      const fwd = button(doc, '▶', () => { view = next; render(); }, 'nav');
      fwd.disabled = !!max && !monthHasDays(next.year, next.month, min, max);
      fwd.setAttribute('aria-label', 'Later month');
      const label = doc.createElement('div');
      label.className = 'month';
      label.textContent = new Date(view.year, view.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      head.append(back, label, fwd);
      const names = doc.createElement('div');
      names.className = 'week';
      for (const w of WEEKDAYS) {
        const h = doc.createElement('div');
        h.className = 'head';
        h.textContent = w;
        names.append(h);
      }
      holder.append(head, names);
      for (const week of monthGrid(view.year, view.month, min, max)) {
        const row = doc.createElement('div');
        row.className = 'week';
        for (const d of week) {
          if (!d) {
            row.append(doc.createElement('div'));
            continue;
          }
          const b = button(doc, String(d.day), () => done(d.iso), d.iso === current ? 'picked' : '');
          b.disabled = d.disabled;
          b.setAttribute('aria-label', new Date(view.year, view.month, d.day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
          row.append(b);
        }
        holder.append(row);
      }
    };
    render();
    card.append(holder, cancelBar(doc, done));
  });
}

/** A number with a big minus and plus. For number fields and sliders. */
export function pickNumber(doc: Document, title: string, current: number, step: number, min?: number, max?: number, unit = ''): Promise<number | null> {
  return open<number>(doc, title, (card, done) => {
    let value = Number.isFinite(current) ? current : (min ?? 0);
    const row = doc.createElement('div');
    row.className = 'number';
    const shown = doc.createElement('div');
    shown.className = 'value';
    shown.setAttribute('aria-live', 'polite');
    const minus = button(doc, '−', () => { value = stepNumber(value, -1, step, min, max); update(); });
    minus.setAttribute('aria-label', 'Less');
    const plus = button(doc, '+', () => { value = stepNumber(value, 1, step, min, max); update(); });
    plus.setAttribute('aria-label', 'More');
    const update = () => {
      shown.textContent = `${value}${unit}`;
      minus.disabled = min !== undefined && value <= min;
      plus.disabled = max !== undefined && value >= max;
    };
    update();
    row.append(minus, shown, plus);
    const limits = doc.createElement('p');
    limits.className = 'note';
    limits.style.textAlign = 'center';
    limits.textContent = min !== undefined && max !== undefined ? `From ${min}${unit} to ${max}${unit}` : '';
    card.append(row, limits, cancelBar(doc, done, [button(doc, 'Done', () => done(value), 'main')]));
  });
}
