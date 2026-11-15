// How Steady sounds: the words (TONE) and the voice that reads them aloud (speak).
// Proposed by C after the Saturday evening review: "it speaks like AI", "make it a warm shop helper".
//
// TONE is one short instruction for any language model that writes Steady's words.
// The sentences written by hand in src/guide follow the same rules.

export const TONE = `How you talk: like a kind, unhurried person helping at a shop counter. You are talking to one person.
- Say "I" and "you". Use short everyday words and contractions: I'll, you're, that's, don't.
- One idea per sentence. Two short sentences at most.
- Say what to do next, in the order the person will do it.
- If you are not sure, say "I think" once. Do not guess silently.
- Never hurry the person and never blame them. If something went wrong, it was the website.
- Do not say: "please note", "simply", "just click", "I understand", "great question", "as an AI", "feel free", "kindly".
- No exclamation marks, no lists, no brackets, no emoji.`;

/** Warmest first. The names are the voices Chrome and Edge offer on Windows, macOS and ChromeOS. */
const PREFERRED = [
  /natural/i, // Microsoft's "Online (Natural)" voices, where the browser has them
  /^Google US English$/i,
  /Samantha|Ava|Allison/i, // macOS
  /Chrome OS US English/i,
  /Zira|Jenny|Aria/i, // Windows
];

interface TtsVoice {
  voiceName?: string;
  lang?: string;
}
interface Tts {
  getVoices(): Promise<TtsVoice[]>;
  speak(text: string, options?: Record<string, unknown>): unknown;
  stop(): void;
}

let chosen: string | undefined;
let looked = false;

async function pickVoice(tts: Tts): Promise<string | undefined> {
  if (looked) return chosen;
  looked = true;
  try {
    const voices = (await tts.getVoices()).filter((v) => !v.lang || /^en/i.test(v.lang));
    for (const want of PREFERRED) {
      const hit = voices.find((v) => v.voiceName && want.test(v.voiceName) && (!v.lang || /^en[-_]US/i.test(v.lang)));
      if (hit) {
        chosen = hit.voiceName;
        break;
      }
    }
    console.log('[Steady] voice:', chosen ?? '(the browser default)', '| available:', voices.map((v) => v.voiceName).join(', '));
  } catch {
    // no list of voices: the browser's default voice is used
  }
  return chosen;
}

const ABBREVIATION = /\b(Dr|Mr|Mrs|Ms|St|Prof|No|vs|approx|e\.g|i\.e)\.$/i;

/** Split what is to be said into sentences. Careful with "Dr.", "$12.99" and a question inside quotes. */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let current = '';
  // A sentence ends at . ! ? … (and a closing quote), followed by a space and a capital letter or an opening quote.
  for (const piece of text.trim().split(/(?<=[.!?…]["')]?)\s+(?=[A-Z"'(])/)) {
    current = current ? `${current} ${piece}` : piece;
    const quotes = (current.match(/"/g) ?? []).length;
    if (ABBREVIATION.test(current) || quotes % 2 === 1) continue; // "Dr." is not the end, and neither is the middle of a quoted name
    out.push(current);
    current = '';
  }
  if (current) out.push(current);
  return out.length ? out : [text];
}

/**
 * Read a sentence or two aloud. Spoken one sentence at a time, a little slower than normal, so there is
 * a breath between sentences and a long message never runs together.
 */
export async function speak(tts: Tts, text: string, how: { rate?: number } = {}): Promise<void> {
  // A's read aloud sends the person's own speed. Anything outside what a voice can do is ignored.
  const rate = typeof how.rate === 'number' && how.rate >= 0.5 && how.rate <= 2 ? how.rate : 0.92;
  const voiceName = await pickVoice(tts);
  const sentences = sentencesOf(text);
  tts.stop();
  sentences.forEach((sentence, i) => {
    tts.speak(sentence, { voiceName, lang: 'en-US', rate, pitch: 1.05, enqueue: i > 0 });
  });
}
