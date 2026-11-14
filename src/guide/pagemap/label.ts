// The name a person would use for a button, link or field.
// A wrong label is worse than no label, so every guess is flagged as a guess.

import type { LabelSource } from '@/shared/pagemap';
import { byId, clean, clip, textOf } from './dom';

export interface Name {
  label: string;
  source: LabelSource;
  confident: boolean;
}

const FIELD = 'input,select,textarea,[role="textbox"],[role="searchbox"],[role="combobox"],[role="slider"],[role="spinbutton"],[role="checkbox"],[role="radio"],[role="switch"],[contenteditable=""],[contenteditable="true"]';

/** Symbols that stand in for words on icon-only buttons. */
const GLYPHS: Array<[RegExp, string]> = [
  [/^[×✕✖⨯xX]$/, 'Close'],
  [/^[🗑🗑️]+$/u, 'Remove'],
  [/^[+＋]$/, 'More'],
  [/^[-−–]$/, 'Less'],
  [/^[‹<«←◀]$/, 'Back'],
  [/^[›>»→▶]$/, 'Next'],
  [/^[☰≡]$/, 'Menu'],
  [/^[⋮⋯…]$/, 'More options'],
  [/^[🔍🔎]$/u, 'Search'],
  [/^[♡♥❤]$/u, 'Save for later'],
  [/^[🛒🧺👜]$/u, 'Basket'],
  [/^[?？]$/, 'Help'],
  [/^[✎✏️🖉]+$/u, 'Edit'],
];

/** Icon names found in class names, test ids and picture file names. First match wins. */
const ICONS: Array<[RegExp, string]> = [
  [/trash|delete|remove|\bbin\b/, 'Remove'],
  [/close|dismiss|\bcross\b|\btimes\b/, 'Close'],
  [/cart|basket|\bbag\b/, 'Basket'],
  [/search|magnif/, 'Search'],
  [/hamburger|nav-?toggle|menu/, 'Menu'],
  [/wishlist|favou?rite|heart/, 'Save for later'],
  [/account|profile|avatar|\buser\b|person/, 'Account'],
  [/prev|chevron-?left|arrow-?left|\bback\b/, 'Back'],
  [/next|chevron-?right|arrow-?right|forward/, 'Next'],
  [/increment|\bplus\b|qty-?up/, 'More'],
  [/decrement|\bminus\b|qty-?down/, 'Less'],
  [/edit|pencil/, 'Edit'],
  [/download/, 'Download'],
  [/print/, 'Print'],
  [/share/, 'Share'],
  [/calendar|datepicker/, 'Calendar'],
  [/help|question|info/, 'Help'],
  [/settings|\bgear\b|\bcog\b/, 'Settings'],
  [/\bhome\b/, 'Home'],
  [/phone|\bcall\b/, 'Phone'],
  [/mail|envelope/, 'Email'],
  [/play/, 'Play'],
  [/pause/, 'Pause'],
];

const KIND_FALLBACK: Record<string, string> = {
  A: 'Link',
  BUTTON: 'Button',
  SELECT: 'List of choices',
  TEXTAREA: 'Text box',
  INPUT: 'Box to type in',
};

export function nameOf(el: Element): Name {
  // 1. What the site tells assistive tools.
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clip(
      labelledBy
        .split(/\s+/)
        .map((id) => textOf(byId(el, id)))
        .join(' '),
    );
    if (text) return { label: text, source: 'aria-labelledby', confident: true };
  }
  const aria = clip(el.getAttribute('aria-label'));
  if (aria) return { label: aria, source: 'aria-label', confident: true };

  return el.matches(FIELD) ? nameOfField(el) : nameOfPressable(el);
}

function nameOfField(el: Element): Name {
  const input = el as HTMLInputElement;
  const type = (el.getAttribute('type') ?? '').toLowerCase();

  if (el.tagName === 'INPUT' && (type === 'submit' || type === 'button' || type === 'reset')) {
    const value = clip(input.value);
    if (value) return { label: value, source: 'value', confident: true };
    return { label: type === 'reset' ? 'Reset' : 'Submit', source: 'value', confident: true };
  }
  if (el.tagName === 'INPUT' && type === 'image') {
    const alt = clip(el.getAttribute('alt'));
    if (alt) return { label: alt, source: 'alt', confident: true };
  }

  // 2. A real <label>.
  const labels = input.labels;
  if (labels && labels.length) {
    const text = clip(textOf(labels[0] ?? null));
    if (text) return { label: stripRequiredMark(text), source: 'label', confident: true };
  }

  // 3. Words inside the box.
  const placeholder = clip(el.getAttribute('placeholder'));
  if (placeholder) return { label: placeholder, source: 'placeholder', confident: true };
  const title = clip(el.getAttribute('title'));
  if (title) return { label: title, source: 'title', confident: true };

  // 4. Guesses, flagged as guesses.
  const nearby = nearbyText(el);
  if (nearby) return { label: stripRequiredMark(nearby), source: 'nearby', confident: false };
  const fromName = humanize(el.getAttribute('name')) || humanize(el.id);
  if (fromName) return { label: fromName, source: 'name', confident: false };

  return { label: KIND_FALLBACK[el.tagName] ?? 'Box to type in', source: 'none', confident: false };
}

function nameOfPressable(el: Element): Name {
  const text = clip(textOf(el));
  if (text) {
    for (const [glyph, word] of GLYPHS) {
      if (glyph.test(text)) return { label: word, source: 'icon', confident: false };
    }
    if (/\p{L}/u.test(text)) return { label: text, source: 'text', confident: true };
  }
  // Only numbers, such as "4" on a basket badge or "14" on a calendar. Look for a better name first.
  const numbersOnly = text && /\p{N}/u.test(text) ? text : '';

  const img = el.matches('img') ? el : el.querySelector('img[alt]');
  const alt = clip(img?.getAttribute('alt'));
  if (alt) return { label: alt, source: 'alt', confident: true };

  const svgTitle = clip(el.querySelector('svg > title')?.textContent);
  if (svgTitle) return { label: svgTitle, source: 'alt', confident: true };

  const title = clip(el.getAttribute('title'));
  if (title) return { label: title, source: 'title', confident: true };

  const icon = iconGuess(el);
  if (icon) return { label: icon, source: 'icon', confident: false };
  if (numbersOnly) return { label: numbersOnly, source: 'text', confident: true };

  const fromName = humanize(el.getAttribute('name')) || humanize(el.id);
  if (fromName) return { label: fromName, source: 'name', confident: false };

  return { label: KIND_FALLBACK[el.tagName] ?? 'Button', source: 'none', confident: false };
}

function iconGuess(el: Element): string {
  const parts: string[] = [];
  const add = (node: Element | null) => {
    if (!node) return;
    parts.push(
      node.getAttribute('class') ?? '',
      node.id,
      node.getAttribute('data-icon') ?? '',
      node.getAttribute('data-testid') ?? '',
      node.getAttribute('data-action') ?? '',
      node.getAttribute('name') ?? '',
    );
  };
  add(el);
  for (const inner of el.querySelectorAll('svg, i, span, img, use')) {
    add(inner);
    parts.push(inner.getAttribute('href') ?? '', inner.getAttribute('xlink:href') ?? '', fileName(inner.getAttribute('src')));
    if (parts.length > 60) break;
  }
  const hay = parts.join(' ').toLowerCase().replace(/[_]+/g, '-');
  for (const [pattern, word] of ICONS) if (pattern.test(hay)) return word;
  return '';
}

function fileName(src: string | null): string {
  if (!src || src.startsWith('data:')) return '';
  return (src.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
}

/** Words just before an unlabelled field: the previous sibling, or the table cell before it. */
function nearbyText(el: Element): string {
  let node: Node | null = el.previousSibling;
  let hops = 0;
  while (node && hops++ < 3) {
    const text = node.nodeType === 3 ? clean(node.nodeValue) : node.nodeType === 1 && !(node as Element).matches(FIELD) ? textOf(node, 60) : '';
    if (text) return text.length <= 60 ? text : '';
    node = node.previousSibling;
  }
  const cell = el.closest('td,dd');
  const before = cell?.previousElementSibling;
  if (before && /^(TD|TH|DT)$/.test(before.tagName)) {
    const text = textOf(before, 60);
    if (text) return text;
  }
  const parent = el.parentElement;
  if (parent && parent.children.length <= 3) {
    const prev = parent.previousElementSibling;
    if (prev && !prev.querySelector(FIELD) && !prev.matches(FIELD)) {
      const text = textOf(prev, 60);
      if (text && text.length <= 60) return text;
    }
  }
  return '';
}

function stripRequiredMark(text: string): string {
  return clean(text.replace(/\s*[*✱]\s*$/, '').replace(/\s*\((required|optional)\)\s*$/i, (m) => (/optional/i.test(m) ? ' (optional)' : ''))) || text;
}

/** "billing_first-name" -> "Billing first name". Returns '' for machine-made ids. */
export function humanize(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.length > 40 || /[:.[\]]/.test(raw) || /\d{3,}/.test(raw) || /^[a-f0-9-]{12,}$/i.test(raw)) return '';
  const words = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(input|field|txt|ctl|btn|frm|form|id)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (words.length < 2 || !/[a-z]{2}/.test(words)) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Words that describe a field: aria-describedby, or the placeholder when the label came from elsewhere. */
export function hintOf(el: Element, name: Name): string | undefined {
  const describedBy = el.getAttribute('aria-describedby');
  if (describedBy) {
    const text = clip(
      describedBy
        .split(/\s+/)
        .map((id) => textOf(byId(el, id)))
        .join(' '),
      120,
    );
    if (text) return text;
  }
  if (name.source !== 'placeholder') {
    const placeholder = clip(el.getAttribute('placeholder'), 60);
    if (placeholder && placeholder.toLowerCase() !== name.label.toLowerCase()) return placeholder;
  }
  return undefined;
}

/** The question a radio or checkbox answers: the <legend>, or the group's own name. */
export function groupOf(el: Element): string | undefined {
  const fieldset = el.closest('fieldset');
  const legend = fieldset?.querySelector(':scope > legend');
  const fromLegend = clip(textOf(legend ?? null), 80);
  if (fromLegend) return fromLegend;
  const group = el.closest('[role="radiogroup"],[role="group"]');
  if (group) {
    const aria = clip(group.getAttribute('aria-label'));
    if (aria) return aria;
    const by = group.getAttribute('aria-labelledby');
    if (by) {
      const text = clip(by.split(/\s+/).map((id) => textOf(byId(group, id))).join(' '));
      if (text) return text;
    }
  }
  return undefined;
}
