// Feature 5, "Labels at every choice": a plain sentence beside each main button on the page.
// C's logic. Drawn through A's overlay. Gemini (B) is asked only about buttons Steady has no words for.

import type { PageElement, PageMap } from '@/shared/pagemap';
import { need, type OverlayLabel } from '@/shared/ports';
import type { Tool } from '@/shared/tools';
import { pageMap } from '../map';
import { askModel } from './model';
import { basketWord, phraseFor, type Phrase } from './phrases';

const LAYER = 'choices';
/** "One thing at a time": a page full of notes is as hard to read as a page full of buttons. */
const MAX_LABELS = 6;

export interface ChoicesResult {
  labels: OverlayLabel[];
  /** Names of main buttons Steady would not vouch for. They get no label. */
  unsure: string[];
  /** What the helper says afterwards. */
  said: string;
}

/** A small button that only serves the box next to it ("Apply" beside a promo code) is not a main choice. */
function servesAField(el: PageElement): boolean {
  const dom = pageMap.elementFor(el.id);
  const parent = dom?.parentElement;
  if (!parent || parent.children.length > 3) return false;
  return !!parent.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])');
}

function candidates(map: PageMap): PageElement[] {
  const usable = map.elements.filter(
    (e) => (e.kind === 'button' || e.kind === 'link') && e.visible && !e.disabled && !e.covered && !e.marks.some((m) => m.kind === 'fake'),
  );
  // While a pop-up is open, nothing behind it can be used.
  if (map.dialog) return usable.filter((e) => e.inDialog);
  return usable.filter((e) => e.region === 'main' || e.region === 'side');
}

export async function show(): Promise<ChoicesResult> {
  const map = pageMap.get();
  const basket = basketWord(map);
  const scored: Array<{ el: PageElement; phrase: Phrase | null; score: number; order: number }> = [];

  candidates(map).forEach((el, order) => {
    const phrase = phraseFor(el, map, basket);
    let score = 0;
    if (phrase) score = el.protection === 'pay' ? 100 : phrase.tone === 'go' ? 80 : phrase.tone === 'careful' ? 70 : 50;
    else if (!el.labelConfident || el.inferred) return; // a guessed name with no sure meaning: say nothing
    else if (servesAField(el)) return;
    else if (el.protection !== 'none') score = 40;
    else if (el.kind === 'button' || el.rect.height >= 28) score = 20;
    else return; // an ordinary text link
    if (el.inViewport) score += 5;
    scored.push({ el, phrase, score, order });
  });

  const chosen = scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, MAX_LABELS).sort((a, b) => a.order - b.order);
  const fromModel = await askModel(
    chosen.filter((c) => !c.phrase).map((c) => c.el),
    map,
  );

  const labels: OverlayLabel[] = [];
  const unsure: string[] = [];
  for (const c of chosen) {
    const phrase = c.phrase ?? fromModel.get(c.el.id);
    if (phrase) labels.push({ targetId: c.el.id, text: phrase.text, tone: phrase.tone });
    else unsure.push(c.el.label);
  }

  if (labels.length) need('overlay').labels(LAYER, labels);
  else need('overlay').clear(LAYER);
  return { labels, unsure, said: summary(labels.length, unsure) };
}

export function hide(): void {
  need('overlay').clear(LAYER);
}

function summary(shown: number, unsure: string[]): string {
  if (!shown && !unsure.length) return 'I can\'t see any buttons to explain on this page.';
  if (!shown) {
    return 'I am not sure what the buttons on this page do, so I have not labelled them. You can press "I\'m stuck" and we will ask for help.';
  }
  const done = shown === 1 ? 'I have put a note beside the main button.' : `I have put a note beside the ${shown} main buttons.`;
  if (!unsure.length) return done;
  const names = unsure.slice(0, 3).map((n) => `"${n}"`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${done} I am not sure about ${list}, so I left ${unsure.length === 1 ? 'it' : 'them'} alone.`;
}

/** For B's tool list: "What do I click?" */
export const labelChoicesTool: Tool = {
  name: 'label_choices',
  owner: 'guide',
  parameters: {},
  description:
    'Put a short plain-words note beside each main button on the page, saying what it does. Use when the person asks "what do I click?", "which button?", or seems unsure what the buttons do.',
  async run() {
    const result = await show();
    return { ok: result.labels.length > 0, said: result.said };
  },
  async undo() {
    hide();
  },
};

export const hideChoicesTool: Tool = {
  name: 'hide_choice_labels',
  owner: 'guide',
  description: 'Take away the notes beside the buttons.',
  parameters: {},
  async run() {
    hide();
    return { ok: true, said: 'I have taken the notes away.' };
  },
};
