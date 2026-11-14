// What an element is, whether Steady may press it, and whether Steady may fill it.
// When unsure, lean safe: a protected button only costs one real press;
// an unprotected "Place order" could cost money.

import type { ElementKind, FillKey, Protection, SecretKind } from '@/shared/pagemap';
import { clean } from './dom';

// ---- Kind ----

const INPUT_KINDS: Record<string, ElementKind> = {
  text: 'text',
  url: 'text',
  email: 'email',
  password: 'password',
  number: 'number',
  tel: 'tel',
  date: 'date',
  'datetime-local': 'date',
  month: 'date',
  week: 'date',
  time: 'time',
  search: 'search',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'range',
  file: 'file',
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
};

const ROLE_KINDS: Record<string, ElementKind> = {
  button: 'button',
  tab: 'button',
  menuitem: 'button',
  option: 'button',
  link: 'link',
  checkbox: 'checkbox',
  switch: 'checkbox',
  radio: 'radio',
  combobox: 'select',
  textbox: 'text',
  searchbox: 'search',
  slider: 'range',
  spinbutton: 'number',
};

export function kindOf(el: Element): ElementKind {
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return INPUT_KINDS[type] ?? (type === 'color' ? 'other' : 'text');
  }
  if (tag === 'SELECT') return 'select';
  if (tag === 'TEXTAREA') return 'textarea';
  const role = el.getAttribute('role');
  if (role && ROLE_KINDS[role]) return ROLE_KINDS[role];
  if (tag === 'A') return 'link';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if ((el as HTMLElement).isContentEditable) return 'textarea';
  return 'button';
}

const FIELD_KINDS = new Set<ElementKind>(['text', 'email', 'password', 'number', 'tel', 'date', 'time', 'search', 'textarea', 'select']);

export function isField(kind: ElementKind): boolean {
  return FIELD_KINDS.has(kind);
}

// ---- Secrets: never filled, never kept, never read out ----

/** Everything the site says about a field, lower-cased, for matching. */
export function haystack(el: Element, label: string): string {
  return clean(
    [label, el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('data-testid')]
      .filter(Boolean)
      .join(' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]]+/g, ' ')
      .toLowerCase(),
  );
}

function autocompleteTokens(el: Element): string[] {
  return (el.getAttribute('autocomplete') ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && t !== 'on' && t !== 'off' && !t.startsWith('section-') && t !== 'shipping' && t !== 'billing' && t !== 'home' && t !== 'work' && t !== 'mobile');
}

const AUTOCOMPLETE_SECRETS: Record<string, SecretKind> = {
  'cc-number': 'card-number',
  'cc-exp': 'card-expiry',
  'cc-exp-month': 'card-expiry',
  'cc-exp-year': 'card-expiry',
  'cc-csc': 'card-code',
  'cc-name': 'card-name',
  'cc-given-name': 'card-name',
  'cc-family-name': 'card-name',
  'cc-type': 'card-name',
  'current-password': 'password',
  'new-password': 'password',
  'one-time-code': 'one-time-code',
  bday: 'date-of-birth',
  'bday-day': 'date-of-birth',
  'bday-month': 'date-of-birth',
  'bday-year': 'date-of-birth',
};

const GIFT_CARD = /gift ?card|gift ?code|voucher (code|number)|redeem|redemption|itunes|google play (card|code)|steam (card|code)|prepaid card/;
const CARD_NUMBER = /\b(card|cc|credit|debit)\s?(number|num|no|nr)\b|cardnumber|ccnum|\bcard #/;
const CARD_CODE = /\bcvv2?\b|\bcvc2?\b|\bcsc\b|\bcvn\b|card (security|verification) (code|value|number)|security code/;
const CARD_EXPIRY = /expir|\bexp\s?(date|month|year|mm|yy)\b|\bmm\s?\/\s?yy/;
const CARD_NAME = /name on (the )?card|card ?holder|cc ?name/;
const ONE_TIME_CODE = /one\s?time|\botp\b|verification code|verify code|confirmation code|\d\s?digit code|passcode|auth(entication|enticator)? code|\b2fa\b|two\s?(factor|step)|sms code|code (we|sent)/;
const ID_NUMBER = /\bssn\b|social security|national insurance|\bnino\b|passport|driver'?s? ?licen[sc]e|licen[sc]e (number|no)|tax ?(id|payer)|\bitin\b|\btin\b|\bein\b|medicare (number|id|no)|member ?(id|number)|policy (id|number)|subscriber ?(id|number)|national id|government id|identity (number|document)|\bid number\b/;
const BANK = /routing|account (number|no)\b|\biban\b|sort ?code|\bswift\b|\bbic\b|bank account/;
const DOB = /date of birth|birth ?(date|day|month|year)|\bdob\b|birthday|when were you born/;
const PASSWORD_LIKE = /password|passphrase|\bpin\b(?! ?code)|security (answer|question)|maiden name|secret (word|answer)/;

export function secretOf(el: Element, kind: ElementKind, label: string, formHasCard: boolean): SecretKind | undefined {
  if (kind === 'button' || kind === 'link' || kind === 'checkbox' || kind === 'radio' || kind === 'file' || kind === 'range') return undefined;
  for (const token of autocompleteTokens(el)) {
    const hit = AUTOCOMPLETE_SECRETS[token];
    if (hit) return hit;
  }
  const hay = haystack(el, label);
  if (GIFT_CARD.test(hay)) return 'gift-card';
  if (CARD_NAME.test(hay)) return 'card-name';
  if (CARD_NUMBER.test(hay)) return 'card-number';
  if (/\bcvv2?\b|\bcvc2?\b|\bcsc\b|\bcvn\b|card (security|verification)/.test(hay)) return 'card-code';
  if (ONE_TIME_CODE.test(hay)) return 'one-time-code';
  if (CARD_CODE.test(hay)) return formHasCard ? 'card-code' : 'one-time-code';
  if (CARD_EXPIRY.test(hay) && (formHasCard || /card|cc\b/.test(hay))) return 'card-expiry';
  if (ID_NUMBER.test(hay)) return 'id-number';
  if (BANK.test(hay)) return 'bank-account';
  if (DOB.test(hay)) return 'date-of-birth';
  if (kind === 'password' || PASSWORD_LIKE.test(hay)) return 'password';
  return undefined;
}

/** Quick check used before the full pass: does this form ask for a card? */
export function looksLikeCardField(el: Element): boolean {
  const tokens = autocompleteTokens(el);
  if (tokens.includes('cc-number') || tokens.includes('cc-csc')) return true;
  const hay = haystack(el, '');
  return CARD_NUMBER.test(hay) && !GIFT_CARD.test(hay);
}

// ---- "My details": name, address, phone, email ----

const AUTOCOMPLETE_FILL: Record<string, FillKey> = {
  name: 'name',
  'given-name': 'given-name',
  'family-name': 'family-name',
  email: 'email',
  tel: 'tel',
  'tel-national': 'tel',
  'street-address': 'street-address',
  'address-line1': 'address-line1',
  'address-line2': 'address-line2',
  'address-level2': 'address-level2',
  'address-level1': 'address-level1',
  'postal-code': 'postal-code',
  country: 'country',
  'country-name': 'country',
};

const NOT_A_PERSONS_NAME = /user|login|company|business|organi[sz]ation|employer|card|nick|pet|middle|maiden|doctor|provider|pharmacy|file|product|school|bank|account|display|project|gift|recipient|friend|emergency|contact name|spouse|child|parent|guardian/;
const NOT_THEIR_ADDRESS = /e ?mail|\bip\b|web|url|site|mac address|recipient|gift|friend|billing same|pharmacy|provider|employer/;

const LABEL_FILL: Array<[FillKey, RegExp, RegExp?]> = [
  ['given-name', /first ?name|given ?name|\bfname\b|forename/, NOT_A_PERSONS_NAME],
  ['family-name', /last ?name|sur ?name|family ?name|\blname\b/, NOT_A_PERSONS_NAME],
  ['email', /e ?mail/, /friend|recipient|gift|newsletter name/],
  ['tel', /phone|mobile|\btel\b|telephone|\bcell\b/, /emergency|friend|recipient|pharmacy|provider|employer/],
  ['address-line2', /address ?(line)? ?2|\bapt\b|apartment|\bsuite\b|\bunit\b|\bflat\b/, NOT_THEIR_ADDRESS],
  ['postal-code', /\bzip\b|zip ?code|post ?code|postal|pin ?code/, NOT_THEIR_ADDRESS],
  ['address-level2', /\bcity\b|\btown\b|suburb|locality/, NOT_THEIR_ADDRESS],
  ['address-level1', /\bstate\b|province|\bcounty\b/, /united states|statement|\bstatus\b|employer|issued|licen[sc]e/],
  ['country', /country/, /code|phone|birth|citizenship|issued/],
  ['address-line1', /address ?(line)? ?1|street|\baddress\b/, NOT_THEIR_ADDRESS],
  ['name', /full ?name|your name|^name$|\bname\b/, NOT_A_PERSONS_NAME],
];

const FILLABLE = new Set<ElementKind>(['text', 'email', 'tel', 'number', 'search', 'select', 'textarea']);

/** Fill only on a clear match. Anything unclear is left for the person. */
export function fillOf(
  el: Element,
  kind: ElementKind,
  label: string,
  labelConfident: boolean,
): { fillAs: FillKey; fillFrom: 'autocomplete' | 'type' | 'label' } | undefined {
  if (!FILLABLE.has(kind) || kind === 'search') return undefined;
  if ((el as HTMLInputElement).readOnly) return undefined;
  for (const token of autocompleteTokens(el)) {
    const hit = AUTOCOMPLETE_FILL[token];
    if (hit) return { fillAs: hit, fillFrom: 'autocomplete' };
  }
  const hay = haystack(el, label);
  if (kind === 'email' && !/friend|recipient|gift/.test(hay)) return { fillAs: 'email', fillFrom: 'type' };
  if (kind === 'tel' && !/emergency|friend|recipient|pharmacy|provider|employer/.test(hay)) return { fillAs: 'tel', fillFrom: 'type' };
  // A guessed label is not a clear match, unless the name attribute says the same thing.
  const attrs = haystack(el, '');
  for (const [key, yes, no] of LABEL_FILL) {
    if (!yes.test(hay)) continue;
    if (no && no.test(hay)) return undefined;
    if (!labelConfident && !yes.test(attrs)) return undefined;
    if (kind === 'textarea' && key !== 'street-address' && key !== 'address-line1') return undefined;
    if (kind === 'select' && key !== 'address-level1' && key !== 'country') return undefined;
    return { fillAs: key, fillFrom: 'label' };
  }
  return undefined;
}

// ---- Protection: pay, delete, submit ----

const DELETE_WORDS =
  /\b(delete|remove|erase|discard|trash|clear (all|basket|cart|bag|form)|empty (the |my |your )?(basket|cart|bag)|cancel (my |your |this |the )?(order|subscription|membership|appointment|booking|reservation|plan|account|trial)|close (my |your )?account|deactivate|unsubscribe|deregister|terminate|start over)\b/;

const PAY_WORDS =
  /\b(pay|place (your |my |the )?order|buy( it)? now|buy with|complete (your |my |the )?(purchase|order|payment|booking)|confirm (and pay|your order|my order|order|purchase|payment)|submit (your |my )?(order|payment)|purchase|order now|subscribe|donate|start (my |your )?(free )?trial|make (a )?payment|send money|send payment|transfer (money|funds|now)|top up|add funds|upgrade (now|plan)|renew (now|plan|membership)|bid now|place bid)\b/;
const NOT_PAY = /pay ?later options|payment (methods|options|history)|purchase history|how to pay|ways to pay|subscribe to (our )?newsletter/;

const SUBMIT_WORDS =
  /\b(submit|send|book|confirm|apply|register|sign ?up|create (an |my |your )?account|schedule|request|reserve|post|publish|save|sign ?in|log ?in|log ?on|verify|agree|accept (and|&) continue|finish)\b/;

const LINK_SUBMIT_WORDS = /\b(submit|send|confirm|apply|register|sign ?up|create (an |my |your )?account|book now|post|publish)\b/;

export interface FormFacts {
  isSearch: boolean;
  takesPayment: boolean;
}

function quote(label: string): string {
  return label.length > 40 ? `${label.slice(0, 40)}…` : label;
}

export function protectionOf(
  el: Element,
  kind: ElementKind,
  label: string,
  form: FormFacts | null,
): { protection: Protection; reason?: string } {
  if (kind !== 'button' && kind !== 'link') return { protection: 'none' };
  const text = label.toLowerCase();
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  const tag = el.tagName;
  const isSubmitButton =
    !!form && ((tag === 'BUTTON' && type !== 'button' && type !== 'reset') || (tag === 'INPUT' && (type === 'submit' || type === 'image')));

  if (tag === 'BUTTON' || tag === 'INPUT') {
    if (type === 'reset') return { protection: 'delete', reason: 'it clears everything typed in this form' };
  }
  if (DELETE_WORDS.test(text)) return { protection: 'delete', reason: `it says "${quote(label)}"` };

  if (isSubmitButton && form?.takesPayment) return { protection: 'pay', reason: 'it sends your card details' };
  if (PAY_WORDS.test(text) && !NOT_PAY.test(text)) return { protection: 'pay', reason: `it says "${quote(label)}"` };

  if (isSubmitButton && !form?.isSearch) return { protection: 'submit', reason: 'it sends this form' };

  // Buttons that send something without a <form> around them.
  if (form?.isSearch) return { protection: 'none' };
  if (tag !== 'A') {
    if (SUBMIT_WORDS.test(text)) return { protection: 'submit', reason: `it says "${quote(label)}"` };
  } else {
    // A link normally just opens a page. Only a link that goes nowhere ("#") and is worded
    // like a send button is treated as one.
    const href = el.getAttribute('href') ?? '';
    const goesNowhere = href === '' || href.startsWith('#') || /^javascript:/i.test(href) || el.getAttribute('role') === 'button';
    if (goesNowhere && LINK_SUBMIT_WORDS.test(text)) return { protection: 'submit', reason: `it says "${quote(label)}"` };
  }
  return { protection: 'none' };
}

/** A search box only looks things up. It is not counted as "submit". */
export function isSearchForm(form: Element): boolean {
  if (form.getAttribute('role') === 'search' || form.closest('[role="search"]')) return true;
  if (form.querySelector('input[type="search"]')) return true;
  const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), select, textarea');
  if (fields.length !== 1) return false;
  const only = fields[0]!;
  const hay = haystack(only, '') + ' ' + (form.getAttribute('action') ?? '').toLowerCase() + ' ' + (form.id ?? '').toLowerCase();
  return /search|query|\bq\b|find|lookup/.test(hay);
}
