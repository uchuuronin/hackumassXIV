// Spots the three requests that scams use most. Pure text matching: nothing leaves the device. Owner: B.
// Looks for the request, not the words: a gift-card box or a bank's "wire transfer" option is ordinary.
export type RiskKind = 'gift-card' | 'wire' | 'remote';
export interface Risk { kind: RiskKind; line: string }

const SCAM_WORDS = '(irs|tax(es)?|bail|fine|fee|overdue|debt|owe[sd]?|arrest|warrant|invoice|police)';
const GIFT = new RegExp(
  `\\b${SCAM_WORDS}\\b[^.]{0,60}\\bgift ?cards?\\b|\\bgift ?cards?\\b[^.]{0,60}\\b${SCAM_WORDS}\\b|\\b(read out|read me|scratch|send (me|us))\\b[^.]{0,30}\\b(gift ?cards?|codes?|pins?)\\b`,
  'i',
);
const WIRE = /\bwestern union\b|\bmoneygram\b|\bwire (me |us )?(the |your )?(money|funds)\b/i;
const REMOTE = /\b(anydesk|teamviewer|ultraviewer|quicksupport|ammyy|logmein)\b|\b(control|connect to|take over|access) your (computer|pc|screen|laptop)\b/i;

/** `giftCardField` is kept for callers but a gift-card box alone is not a warning sign. */
export function findRisks(text: string, _giftCardField: boolean): Risk[] {
  const out: Risk[] = [];
  if (GIFT.test(text)) out.push({ kind: 'gift-card', line: 'Paying with gift card codes is a very common scam.' });
  if (WIRE.test(text)) out.push({ kind: 'wire', line: 'This mentions sending money by wire. Scammers like these because the money cannot be taken back.' });
  if (REMOTE.test(text)) out.push({ kind: 'remote', line: 'This wants to control your computer from far away. A real shop does not need that.' });
  return out;
}
