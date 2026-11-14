// Where the person is, in plain words. Used for "Where was I?", Pay Pause and choosing what to offer.

import type { PageAmount, PageElement, PageHeading, PageStage, StageKind } from '@/shared/pagemap';

const LABELS: Record<StageKind, string> = {
  'sign-in': 'Signing in',
  'sign-up': 'Making an account',
  code: 'Typing a code',
  basket: 'Your basket',
  checkout: 'Delivery details',
  payment: 'Paying',
  booking: 'Booking',
  confirmation: 'All done',
  search: 'Search results',
  form: 'Filling in a form',
  reading: 'Reading',
};

export function stageOf(url: string, title: string, headings: PageHeading[], elements: PageElement[], amounts: PageAmount[]): PageStage {
  const kind = pick(url, title, headings, elements, amounts);
  return { kind, label: LABELS[kind] };
}

function pick(url: string, title: string, headings: PageHeading[], elements: PageElement[], amounts: PageAmount[]): StageKind {
  const seen = elements.filter((e) => e.visible && !e.disabled);
  const fields = seen.filter((e) => !['button', 'link'].includes(e.kind));
  const has = (secret: string) => fields.some((e) => e.secret === secret);
  let path = '';
  let query = '';
  try {
    const u = new URL(url);
    path = (u.pathname + u.hash).toLowerCase();
    query = u.search.toLowerCase();
  } catch {
    // leave empty
  }
  const top = `${headings.filter((h) => h.level <= 2).map((h) => h.text).join(' | ')} | ${title}`.toLowerCase();
  const where = `${path} | ${top}`;

  // What the page asks for is stronger evidence than what it is called.
  if (has('card-number')) return 'payment';
  if (has('one-time-code') && fields.length <= 4) return 'code';
  if (has('password')) {
    const passwords = fields.filter((e) => e.secret === 'password').length;
    return passwords > 1 || fields.length > 5 || /sign ?up|register|create (an |your )?account|join/.test(where) ? 'sign-up' : 'sign-in';
  }
  if (/thank you|thanks for|confirmed|order (placed|received|complete)|all (set|done)|success|receipt/.test(top) && fields.length <= 2) {
    return 'confirmation';
  }
  const addressFields = fields.filter((e) => e.fillAs && /address|postal|level/.test(e.fillAs)).length;
  if (/checkout|delivery|shipping|billing/.test(where) && (addressFields >= 1 || fields.length >= 3)) return 'checkout';
  if (addressFields >= 3 && amounts.some((a) => a.kind === 'total')) return 'checkout';
  if (/\b(cart|basket|bag)\b/.test(where)) return 'basket';
  if (/\bbook(ing)?\b|appointment|schedul|reserv/.test(where)) return 'booking';
  if (/[?&](q|query|search|s|k)=/.test(query) || /search results|results for/.test(top)) return 'search';
  if (fields.filter((e) => e.kind !== 'search').length >= 3) return 'form';
  return 'reading';
}
