// Plain words for common buttons, worked out on the device with no network.
//
// House rules for every sentence Rose reads (keep these when you edit):
//   - Start with "Click this to", then say what happens. One short sentence.
//   - Everyday words. "Basket", not "cart contents". No "submit", "proceed", "authenticate".
//   - Use the shop's own word for the basket (basket, cart or bag), so the label matches the page.
//   - When the button's name was a guess, say "I think this…". Never state a guess as fact.
//   - Only sentences that are true on any site. If a rule can be wrong, leave it to Gemini or leave it out.

import type { PageElement, PageMap } from '@/shared/pagemap';
import type { LabelTone } from '@/shared/ports';

export interface Phrase {
  text: string;
  tone: LabelTone;
}

interface Rule {
  test: RegExp;
  /** Only when the button has this protection. */
  protection?: PageElement['protection'];
  /** Only on this kind of page. */
  stage?: PageMap['stage']['kind'];
  tone: LabelTone;
  sure: (c: Words) => string;
  /** Wording for when the button's name was a guess. No `guess` means: say nothing for a guessed name. */
  guess?: (c: Words) => string;
}

interface Words {
  /** "the Brass reading lamp" or "it". */
  item: string;
  /** The shop's own word: basket, cart or bag. */
  basket: string;
}

const RULES: Rule[] = [
  {
    test: /^(place|submit|complete|confirm|finish)( your| my| the)? (order|purchase)\b|^pay( now)?$|^buy( it)? now$|^confirm and pay\b|^complete payment$/,
    protection: 'pay',
    tone: 'careful',
    sure: () => 'Click this to place your order and pay. Check the total first.',
  },
  {
    test: /^(remove|delete)( item| from (basket|cart|bag))?$/,
    protection: 'delete',
    stage: 'basket',
    tone: 'careful',
    sure: (c) => `Click this to take ${c.item} out of your ${c.basket}.`,
    guess: (c) => `I think this takes ${c.item} out of your ${c.basket}.`,
  },
  {
    test: /^(proceed to |go to |continue to |secure )?check ?out( now| securely)?$/,
    tone: 'go',
    sure: () => 'Click this to go ahead and pay.',
  },
  {
    test: /^(continue|keep) (shopping|browsing)$|^back to (the )?(shop|store)$/,
    tone: 'info',
    sure: () => 'Click this to go back and look at more things.',
  },
  {
    test: /^back to (your |the |my )?(basket|cart|bag)$|^(view|edit) (your |my )?(basket|cart|bag)$/,
    tone: 'info',
    sure: (c) => `Click this to go back to your ${c.basket}.`,
  },
  {
    test: /^add to (my |your )?(basket|cart|bag)$/,
    tone: 'go',
    sure: (c) => `Click this to put ${c.item} in your ${c.basket}.`,
  },
  {
    test: /^(next|continue|next step|proceed)$/,
    tone: 'go',
    sure: () => 'Click this to go on to the next step.',
  },
  {
    test: /^(go )?back$|^previous( step)?$/,
    tone: 'info',
    sure: () => 'Click this to go back one step.',
  },
  {
    test: /^(confirm|book)( my| an| the| this)? (appointment|booking|visit)$|^book (now|appointment)$/,
    tone: 'careful',
    sure: () => 'Click this to book the appointment.',
  },
  {
    test: /^(sign|log) ?in$/,
    protection: 'submit',
    tone: 'go',
    sure: () => 'Click this to sign in.',
  },
  {
    test: /^(close|dismiss|no,? thanks|not now|maybe later)$/,
    tone: 'info',
    sure: () => 'Click this to close this box.',
    guess: () => 'I think this closes this box.',
  },
];

/** Cookie boxes are the pop-up Rose meets most. Only used when the pop-up says it is about cookies. */
const COOKIE_RULES: Rule[] = [
  { test: /^(accept|allow|agree)( to)?( all)?( cookies)?$|^(ok|got it|i agree)$/, tone: 'info', sure: () => 'Click this to allow cookies and close this box.' },
  { test: /^(reject|decline|refuse|deny)( all)?( cookies)?$|^(only )?(necessary|essential)( cookies)?( only)?$/, tone: 'info', sure: () => 'Click this to say no to extra cookies and close this box.' },
];

export function basketWord(map: PageMap): string {
  const text = `${map.title} ${map.url} ${map.elements.map((e) => e.label).join(' ')}`.toLowerCase();
  const count = (word: string) => text.split(word).length - 1;
  const cart = count('cart');
  const bag = count(' bag') + count('/bag');
  const basket = count('basket');
  if (cart > basket && cart >= bag) return 'cart';
  if (bag > basket && bag > cart) return 'bag';
  return 'basket';
}

/** A sentence for this button, or null when Steady has no words that are sure to be true. */
export function phraseFor(el: PageElement, map: PageMap, basket = basketWord(map)): Phrase | null {
  // The plan: choice labels never land on a flagged button. B's warning labels those.
  if (el.marks.some((m) => m.kind === 'fake')) return null;

  const label = el.label.toLowerCase().replace(/[.!→➜›»]+$/u, '').trim();
  const words: Words = { item: el.context ? `the ${el.context}` : 'it', basket };
  const aboutCookies = el.inDialog && /cookie|privacy|consent|tracking/i.test(map.dialog?.label ?? '');

  for (const rule of aboutCookies ? [...COOKIE_RULES, ...RULES] : RULES) {
    if (!rule.test.test(label)) continue;
    if (rule.protection && el.protection !== rule.protection) continue;
    if (rule.stage && map.stage.kind !== rule.stage) continue;
    if (el.labelConfident) return { text: rule.sure(words), tone: rule.tone };
    if (rule.guess) return { text: rule.guess(words), tone: rule.tone };
    return null;
  }
  return null;
}
