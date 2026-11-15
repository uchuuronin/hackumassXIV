// The words Steady uses to pass a task from one computer to another: three of them, said over the telephone.
// Everyday things, short, easy to hear and to spell. 128 words, so three of them make about two million
// combinations. The relay has the same list (relay/src/shareWords.ts); tests/share.words.spec.ts checks they match.

export const WORDS: readonly string[] = [
  'apple', 'river', 'garden', 'kettle', 'tulip', 'window', 'candle', 'button',
  'pillow', 'basket', 'ladder', 'bridge', 'carpet', 'pencil', 'bottle', 'blanket',
  'lemon', 'tiger', 'rabbit', 'spoon', 'table', 'chair', 'clock', 'lamp',
  'boat', 'train', 'cloud', 'stone', 'bread', 'honey', 'butter', 'cheese',
  'grape', 'melon', 'peach', 'cherry', 'carrot', 'onion', 'potato', 'tomato',
  'pepper', 'salad', 'biscuit', 'coffee', 'sugar', 'milk', 'water', 'forest',
  'meadow', 'valley', 'island', 'beach', 'harbor', 'castle', 'cottage', 'village',
  'market', 'church', 'school', 'farm', 'barn', 'fence', 'gate', 'path',
  'street', 'corner', 'park', 'pond', 'lake', 'hill', 'field', 'tree',
  'leaf', 'daisy', 'lily', 'violet', 'fern', 'robin', 'sparrow', 'eagle',
  'swan', 'duck', 'goose', 'horse', 'pony', 'sheep', 'goat', 'kitten',
  'puppy', 'mouse', 'otter', 'badger', 'fox', 'dolphin', 'crab', 'shell',
  'sand', 'wave', 'storm', 'snow', 'frost', 'wind', 'breeze', 'sunrise',
  'sunset', 'moon', 'star', 'planet', 'comet', 'rocket', 'piano', 'violin',
  'guitar', 'drum', 'flute', 'trumpet', 'ribbon', 'velvet', 'cotton', 'silver',
  'golden', 'copper', 'marble', 'crystal', 'paper', 'letter', 'stamp', 'parcel',
];

export type Read = { ok: true; words: [string, string, string]; fixed: string[] } | { ok: false; said: string };

/** How many slips apart two words are. Two letters the wrong way round ("kettel") count as one slip. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** The nearest word on the list, if exactly one is close. "kettel" → "kettle". */
function nearest(word: string): string | null {
  if (WORDS.includes(word)) return word;
  let best: string | null = null;
  let bestD = 3;
  let tie = false;
  for (const w of WORDS) {
    const d = distance(word, w);
    if (d < bestD) {
      best = w;
      bestD = d;
      tie = false;
    } else if (d === bestD) tie = true;
  }
  return best && !tie && bestD <= Math.min(2, Math.floor(word.length / 3)) ? best : null;
}

/**
 * Read three words typed by a person, however they typed them: capitals, commas, "and", a small slip
 * in the spelling. Says plainly what is wrong when it can't.
 */
export function readWords(text: string): Read {
  const typed = text.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').filter((w) => w && !['and', 'then', 'the', 'comma'].includes(w));
  if (typed.length !== 3) {
    const seen = typed.length === 0 ? "I can't see any yet" : typed.length === 1 ? 'I can see 1' : `I can see ${typed.length}`;
    return { ok: false, said: `I need three words, and ${seen}. They look like this: garden kettle tulip.` };
  }
  const words: string[] = [];
  const fixed: string[] = [];
  for (const word of typed) {
    const match = nearest(word);
    if (!match) return { ok: false, said: `I don't know the word "${word}". Could you check that one with the person who gave it to you?` };
    if (match !== word) fixed.push(match);
    words.push(match);
  }
  return { ok: true, words: words as [string, string, string], fixed };
}
