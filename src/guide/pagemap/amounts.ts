// Sums of money written on the page: prices, delivery, tax, the total, and anything that renews.
// A's key-word highlighting and B's "Check before you pay" both read these. Nobody writes a second detector.

import type { AmountKind, PageAmount } from '@/shared/pagemap';
import { clean, clip, isSteadyUi, textOf } from './dom';

const SYMBOLS: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR' };
const MONEY = /(?:(?:US|CA|AU)?\$|£|€|¥|₹)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP|CAD|AUD)\b/g;
/** The same pattern for tidying labels. Separate, because MONEY keeps its place while a text node is being read. */
const MONEY_ANY = new RegExp(MONEY.source, 'g');
/** A price split across tags: <span>$</span><span>12</span><sup>99</sup>. */
const SPLIT_MONEY = /^\D{0,3}((?:US|CA|AU)?\$|£|€)\s?(\d[\d,]*)\s?[.\s]?\s?(\d{2})?\s?$/;
const RECURRING = /(?:\/|\bper\b|\ba\b|\bevery\b|\beach\b)\s?(mo(?:nth)?|yr|year|week|day|quarter)\b|\b(monthly|annually|yearly|weekly)\b/i;

const MAX_AMOUNTS = 80;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT', 'OPTION', 'IFRAME']);

/** An amount plus the exact place it is written, for the CSS Custom Highlight API. */
export interface AmountHit extends PageAmount {
  range: Range;
}

export function findAmounts(doc: Document): AmountHit[] {
  const hits: AmountHit[] = [];
  if (!doc.body) return hits;
  const claimed = new Set<Element>();

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return /[$£€¥₹]|USD|EUR|GBP|CAD|AUD/.test(node.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode()) && hits.length < MAX_AMOUNTS) {
    const textNode = node as Text;
    const parent = textNode.parentElement!;
    if (parent.closest('[data-steady-ui]') || isSteadyUi(parent)) continue;
    const value = textNode.nodeValue ?? '';
    let matched = false;

    MONEY.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MONEY.exec(value)) && hits.length < MAX_AMOUNTS) {
      // "$12" followed by a separate <sup>99</sup> is handled by the split case below.
      const endsNode = m.index + m[0].length === value.trimEnd().length;
      if (endsNode && !/\.\d/.test(m[0]) && looksSplit(parent)) continue;
      const range = doc.createRange();
      range.setStart(textNode, m.index);
      range.setEnd(textNode, m.index + m[0].length);
      const hit = describe(m[0], range, parent);
      if (hit) {
        hits.push(hit);
        matched = true;
      }
    }

    if (!matched) {
      // The symbol sits in its own tag. Climb to the smallest element that reads as one price.
      let el: Element | null = parent;
      for (let hops = 0; el && hops < 3; hops++, el = el.parentElement) {
        if (claimed.has(el)) break;
        const whole = spaced(el);
        if (whole.length > 24) break;
        const split = SPLIT_MONEY.exec(whole);
        if (split && split[2]) {
          claimed.add(el);
          const range = doc.createRange();
          range.selectNodeContents(el);
          const text = `${split[1]}${split[2]}${split[3] ? `.${split[3]}` : ''}`;
          const hit = describe(text, range, el);
          if (hit) hits.push(hit);
          break;
        }
      }
    }
  }
  return hits;
}

function looksSplit(parent: Element): boolean {
  const holder = parent.parentElement;
  if (!holder) return false;
  const whole = spaced(holder);
  return whole.length <= 24 && SPLIT_MONEY.test(whole) && holder.children.length > 1;
}

/** The text of an element with a space between its pieces, so "$" "12" "99" reads "$ 12 99", not "$1299". */
function spaced(el: Element): string {
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode()) && parts.length < 12) {
    const t = clean(n.nodeValue);
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

function describe(text: string, range: Range, el: Element): AmountHit | null {
  const r = range.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const number = parseFloat(text.replace(/[^\d.]/g, ''));
  if (!isFinite(number)) return null;
  const symbol = /[$£€¥₹]/.exec(text)?.[0];
  const code = /USD|EUR|GBP|CAD|AUD/.exec(text)?.[0] ?? (/CA\$/.test(text) ? 'CAD' : /AU\$/.test(text) ? 'AUD' : undefined);
  const currency = code ?? (symbol ? SYMBOLS[symbol] : undefined) ?? 'USD';

  const context = contextOf(el, text);
  // "a month" right after the sum, or anywhere in a row that holds only this sum.
  const alone = (context.row.match(MONEY_ANY) ?? []).length <= 1;
  const recurring = RECURRING.exec(context.after)?.[0] ?? (alone ? RECURRING.exec(context.row)?.[0] : undefined);
  const win = el.ownerDocument.defaultView;
  const struck =
    !!el.closest('s,del,strike') || (win ? /line-through/.test(win.getComputedStyle(el).textDecorationLine ?? '') : false);

  return {
    kind: kindOf(context.label),
    label: context.label,
    text: clean(text),
    value: number,
    currency,
    recurring: recurring ? clean(recurring) : undefined,
    struck,
    rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    range,
  };
}

/** The words that say what the amount is. */
function contextOf(el: Element, amount: string): { label: string; row: string; after: string } {
  const sum = clean(amount);
  const split = (rowText: string, given?: string) => {
    const at = rowText.indexOf(sum);
    const before = at >= 0 ? rowText.slice(0, at) : rowText;
    const after = at >= 0 ? rowText.slice(at + sum.length) : '';
    const words = (given ?? before).replace(MONEY_ANY, ' ').replace(/[:\s·,|-]+$/, '');
    const label = clip(words, 60) || clip(after.replace(MONEY_ANY, ' ').replace(/^[:\s·,|-]+/, ''), 60);
    return { label, row: rowText, after: after.slice(0, 40) };
  };

  // <dt>Order total</dt><dd>$83.92</dd>
  const dd = el.closest('dd');
  const dt = dd?.previousElementSibling;
  if (dd && dt && dt.tagName === 'DT') {
    const name = clean(textOf(dt, 80));
    return split(`${name} ${clean(textOf(dd, 80))}`, name);
  }
  // A table row: the first cell names it.
  const tr = el.closest('tr');
  if (tr) {
    const rowText = clean(textOf(tr, 160));
    const first = clean(textOf(tr.querySelector('th,td'), 80));
    if (rowText.length <= 140) return split(rowText, /\p{L}{2}/u.test(first.replace(MONEY_ANY, '')) ? first : undefined);
  }
  // Otherwise climb until there are words beside the number.
  let row: Element = el;
  let rowText = clean(el.textContent);
  for (let hops = 0; hops < 4 && row.parentElement; hops++) {
    if (rowText.replace(MONEY_ANY, '').replace(/[^\p{L}]/gu, '').length >= 3) break;
    const up: Element = row.parentElement;
    const upText = clean(textOf(up, 160));
    if (upText.length > 140) break;
    // A box holding several sums is not about this one. (Two is fine: a price beside its old price.)
    if ((upText.match(MONEY_ANY) ?? []).length > 2) break;
    row = up;
    rowText = upText;
  }
  return split(rowText);
}

function kindOf(label: string): AmountKind {
  const t = label.toLowerCase();
  // "Free delivery on orders over $60": a condition, not a charge.
  if (/\b(over|above|under|below|from|up to|at least|minimum|spend|worth|more than|less than)$/.test(t)) return 'price';
  if (/sub ?total|items? total|merchandise/.test(t)) return 'subtotal';
  if (/\btotal\b|amount due|to pay|balance due|you pay|due today|pay today/.test(t)) return 'total';
  if (/shipping|delivery|postage|handling/.test(t)) return 'delivery';
  if (/\btax\b|\bvat\b|\bgst\b/.test(t)) return 'tax';
  if (/discount|saving|you save|coupon|promo|off\b/.test(t)) return 'discount';
  return 'price';
}

/** The data part only, for the page map. */
export function toPageAmounts(hits: AmountHit[]): PageAmount[] {
  return hits.map(({ range: _range, ...rest }) => rest);
}
