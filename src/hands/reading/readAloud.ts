// Read aloud. Owner: A. What is read: the words the person has selected, or else the main part of the page.
// The voice itself is B's (the background worker's `tts/say` and `tts/stop`).

const LIMIT = 1800;

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Cut at the end of a sentence when there is one near the limit, so the voice doesn't stop mid-word. */
export function clipForSpeech(text: string, limit = LIMIT): string {
  const t = tidy(text);
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > limit * 0.5 ? cut.slice(0, end + 1) : cut;
}

/** A selection of one word is usually a leftover double-click, not "read this". Two words or more is a choice. */
export function selectionIsChoice(text: string): boolean {
  return tidy(text).split(' ').filter(Boolean).length >= 2;
}

export function textToRead(doc: Document): { text: string; fromSelection: boolean } {
  const selected = tidy(doc.getSelection()?.toString() ?? '');
  if (selectionIsChoice(selected)) return { text: clipForSpeech(selected), fromSelection: true };
  const main = doc.querySelector('main, [role="main"], article') ?? doc.body;
  return { text: clipForSpeech((main as HTMLElement | null)?.innerText ?? ''), fromSelection: false };
}

/** True when read aloud would read the person's selection rather than the page. */
export function willReadSelection(doc: Document): boolean {
  return selectionIsChoice(doc.getSelection()?.toString() ?? '');
}

export function readAloud(doc: Document, rate: number, send: (message: unknown) => void): string {
  const { text, fromSelection } = textToRead(doc);
  if (!text) return 'There is nothing here to read out.';
  send({ type: 'tts/say', text, rate });
  return fromSelection ? 'Reading the words you selected.' : 'Reading this page out loud.';
}

export function stopReading(send: (message: unknown) => void): void {
  send({ type: 'tts/stop' });
}
