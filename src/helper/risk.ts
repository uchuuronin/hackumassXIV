// Spots the three requests that scams use most. Pure text matching: nothing leaves the device. Owner: B.
export type RiskKind = 'gift-card' | 'wire' | 'remote';
export interface Risk { kind: RiskKind; line: string }

const GIFT = /\b(pay|payment|settle|clear|fix|scratch|read out|send)\b[^.]{0,40}\bgift ?cards?\b|\bgift ?cards?\b[^.]{0,40}\b(pay|payment|settle|code|pin|scratch|read out)\b/i;
const WIRE = /\bwire (transfer|money|funds|payment)\b|\bwestern union\b|\bmoneygram\b/i;
const REMOTE = /\b(anydesk|teamviewer|ultraviewer|quicksupport|remote (access|support|desktop))\b|\b(control|connect to|take over) your (computer|pc|screen)\b/i;

/** `giftCardField` is true when the page has a box asking for a gift card code while paying. */
export function findRisks(text: string, giftCardField: boolean): Risk[] {
  const out: Risk[] = [];
  if (giftCardField || GIFT.test(text)) out.push({ kind: 'gift-card', line: 'Paying with gift card codes is a very common scam.' });
  if (WIRE.test(text)) out.push({ kind: 'wire', line: 'This mentions a wire transfer. Scammers like these because the money cannot be taken back.' });
  if (REMOTE.test(text)) out.push({ kind: 'remote', line: 'This wants to control your computer from far away. A real shop does not need that.' });
  return out;
}
