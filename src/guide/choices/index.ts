// Feature 5, "Labels at every choice": a plain sentence beside each main button on the page.
// C's logic. Drawn through A's overlay. Gemini (B) is asked only about buttons Steady has no words for.

import type { PageElement, PageMap } from '@/shared/pagemap';
import { need, type OverlayLabel } from '@/shared/ports';
import type { Tool } from '@/shared/tools';
import { pageMap } from '../map';
import { askModel } from './model';
import { basketWord, phraseFor, type Phrase } from './phrases';

const LAYER = 'choices';
const HOVER = 'hover';
/** "One thing at a time": a page full of notes is as hard to read as a page full of buttons. */
const MAX_LABELS = 6;

export interface ChoicesResult {
  labels: OverlayLabel[];
  /** Names of main buttons Steady would not vouch for. They get no label. */
  unsure: string[];
  /** What the helper says afterwards. */
  said: string;
  /** When there are boxes to do before the button: a note on the first of them, shown before any button's note. */
  start?: OverlayLabel;
}

/** One thing the page wants before its button will work: a box to fill in, or a choice to make. */
interface ToDo {
  el: PageElement;
  name: string;
  how: 'type' | 'list' | 'one-of' | 'tick';
}

const TEXT_KINDS = new Set(['text', 'email', 'password', 'number', 'tel', 'date', 'time', 'textarea']);
const short = (name: string) => (name.length > 60 ? `${name.slice(0, 57).trimEnd()}…` : name);

/**
 * What is still to do in the form before `button`, in reading order. Someone who asks "what do I click?"
 * on a page with empty boxes is not helped by being sent to the button first: it won't work yet.
 * Only whether a box is empty is looked at, never what is in it.
 */
function before(button: PageElement, map: PageMap): ToDo[] {
  const form = map.forms.find((f) => f.id === button.formId);
  if (!form || form.isSearch) return [];
  const mine = map.elements.slice(0, map.elements.indexOf(button)).filter((e) => e.formId === form.id && e.visible && !e.disabled && !e.covered);
  const todo: ToDo[] = [];
  const groups = new Set<string>();
  for (const el of mine) {
    if (/\boptional\b/i.test(el.label)) continue;
    const dom = pageMap.elementFor(el.id);
    if (el.kind === 'radio') {
      const group = el.group ?? (dom as HTMLInputElement | null)?.name ?? el.label;
      if (groups.has(group)) continue;
      groups.add(group);
      const same = mine.filter((e) => e.kind === 'radio' && (e.group ?? (pageMap.elementFor(e.id) as HTMLInputElement | null)?.name ?? e.label) === group);
      if (!same.some((e) => e.checked)) todo.push({ el, name: short(group), how: 'one-of' });
    } else if (el.kind === 'select') {
      const select = dom as HTMLSelectElement | null;
      const picked = select?.selectedOptions?.[0];
      const placeholder = !picked || select!.value === '' || (select!.selectedIndex === 0 && /^(select|choose|pick|please|-)/i.test(picked.text.trim()));
      if (placeholder) todo.push({ el, name: short(el.label), how: 'list' });
    } else if (el.kind === 'checkbox') {
      if (el.required && !el.checked) todo.push({ el, name: short(el.label), how: 'tick' });
    } else if (TEXT_KINDS.has(el.kind)) {
      if (((dom as HTMLInputElement | null)?.value ?? '').trim() === '') todo.push({ el, name: short(el.label), how: 'type' });
    }
  }
  return todo;
}

const START: Record<ToDo['how'], string> = {
  type: 'Start here. Type in this box.',
  list: 'Start here. Choose from this list.',
  'one-of': 'Start here. Choose one of these.',
  tick: 'Start here. Tick this box.',
};
const COUNT = ['', 'one', 'two', 'three'];

/** The opening sentences when there is something to do before the button. */
function lead(button: PageElement, todo: ToDo[], map: PageMap, buttons: number): string {
  const choosing = todo.filter((t) => t.how !== 'type').length;
  const noun = choosing === todo.length ? 'things to choose' : choosing * 2 >= todo.length ? 'things to fill in or choose' : 'boxes to fill in';
  const names = todo.map((t) => `"${t.name}"`);
  const heading = map.headings.find((h) => h.level === 1)?.text.trim();
  const page = heading && heading.length <= 60 && !todo.some((t) => t.name === heading) && heading !== button.label ? `This page is "${heading}". ` : '';
  let what: string;
  if (todo.length === 1) what = `Before "${button.label}", this page needs one thing from you: ${names[0]}.`;
  else if (todo.length <= 3) what = `Before "${button.label}", there are ${COUNT[todo.length]} ${noun} on this page: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
  else what = `Before "${button.label}", there are ${todo.length} ${noun} on this page. The first is ${names[0]}.`;
  const show = `I'll show you where ${todo.length === 1 ? 'it is' : 'to start'}, and then the ${buttons === 1 ? 'button for afterwards' : 'main buttons'}.`;
  const fill = todo.filter((t) => t.el.fillAs).length >= 2 ? ' I can do your name and address with you. Just press "Help me fill this in".' : '';
  return `${page}${what} ${show}${fill}`;
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

/** How long things stay up. Slow on purpose: nobody should have to read in a hurry. */
const pace = {
  noteMs: 3500, // each note, plus…
  perCharMs: 55, // …this much for every letter in it
  hoverMs: 700, // rest the pointer this long on a button to see its note again
  lingerMs: 2000, // and the note stays this long after the pointer leaves
};

export function setPace(change: Partial<typeof pace>): void {
  Object.assign(pace, change);
}

/** Goes up each time the notes are shown or hidden, so an older showing knows to stop. */
let showing = 0;
/** The notes from the last "what do I click?", kept so a button can explain itself again. */
let notes = new Map<string, Phrase>();
let stopHover: (() => void) | null = null;
/** True from "what do I click?" until the notes are taken away. */
let active = false;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function show(): Promise<ChoicesResult> {
  if (active) hide(); // asked again: start afresh
  active = true;
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
  notes = new Map();
  for (const c of chosen) {
    const phrase = c.phrase ?? fromModel.get(c.el.id);
    if (phrase) {
      labels.push({ targetId: c.el.id, text: phrase.text, tone: phrase.tone });
      notes.set(c.el.id, phrase);
    } else unsure.push(c.el.label);
  }

  // Shown in the order that matters to someone deciding what to do: the way forward first,
  // other ways on next, and the buttons that take something away last.
  const rank = (tone: OverlayLabel['tone']) => (tone === 'go' ? 0 : tone === 'careful' || tone === 'stop' ? 2 : 1);
  const inOrder = [...labels].sort((a, b) => rank(a.tone) - rank(b.tone));

  // The button that moves things on, and whatever its form still wants first.
  const forward = chosen.map((c) => c.el).find((el) => el.formId && labels.some((l) => l.targetId === el.id && (l.tone === 'go' || el.protection !== 'none')));
  const todo = forward ? before(forward, map) : [];
  const start: OverlayLabel | undefined = todo[0] && { targetId: todo[0].el.id, text: START[todo[0].how], tone: 'info' };
  void oneAtATime(start ? [start, ...inOrder] : inOrder, ++showing);
  // A cookie box is the pop-up people meet most, and nobody ever says what a cookie is.
  const cookies = /cookie|privacy|consent|tracking/i.test(map.dialog?.label ?? '')
    ? 'This box is asking about cookies. Cookies are little notes a website keeps on your computer so it remembers you. It\'s safe to say no, and the website will still work. '
    : '';
  if (forward && start) return { labels, unsure, start, said: cookies + lead(forward, todo, map, labels.length) };
  return { labels, unsure, said: cookies + summary(labels.length, unsure) };
}

/** One note at a time, so they never sit on top of each other. Then they clear, and hovering takes over. */
async function oneAtATime(labels: OverlayLabel[], mine: number): Promise<void> {
  for (const label of labels) {
    if (mine !== showing) return;
    if (!pageMap.liveRect(label.targetId)) continue;
    need('overlay').labels(LAYER, [label]);
    await wait(pace.noteMs + pace.perCharMs * label.text.length);
  }
  if (mine !== showing) return;
  if (labels.length) need('overlay').clear(LAYER);
  stopHover = watchHover(mine);
}

/**
 * Rest the pointer on a button and its note comes back. Patient both ways: it waits before showing,
 * and a pointer that slips off for a moment (a shaky hand) does not lose the note.
 * NOTE for A: this listens to pointerover and pointerout only, never to movement. If the tracker is
 * exported from the hands lane one day, this is the place to use the steadied pointer instead.
 */
function watchHover(mine: number): () => void {
  let over: Element | null = null; // the button the pointer is resting on
  let shownFor: Element | null = null;
  let showTimer: number | undefined;
  let hideTimer: number | undefined;

  const phraseAt = (button: Element): { id: string; phrase: Phrase } | null => {
    const data = pageMap.describe(button);
    if (!data || (data.kind !== 'button' && data.kind !== 'link')) return null;
    const known = notes.get(data.id);
    if (known) return { id: data.id, phrase: known };
    const map = pageMap.get();
    const full = map.elements.find((e) => e.id === data.id) ?? data;
    const phrase = phraseFor(full, map);
    return phrase ? { id: data.id, phrase } : null;
  };

  const onOver = (e: Event) => {
    if (mine !== showing || !(e.target instanceof Element)) return;
    const button = e.target.closest('a,button,[role="button"],input[type="submit"],input[type="button"]');
    if (!button) return;
    window.clearTimeout(hideTimer);
    if (button === over || button === shownFor) return;
    over = button;
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      if (mine !== showing || over !== button) return;
      const hit = phraseAt(button);
      if (!hit) return;
      shownFor = button;
      need('overlay').labels(HOVER, [{ targetId: hit.id, text: hit.phrase.text, tone: hit.phrase.tone }]);
    }, pace.hoverMs);
  };

  const onOut = (e: Event) => {
    if (!(e.target instanceof Element) || !over || !over.contains(e.target)) return;
    const left = over;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (over !== left) return;
      over = null;
      window.clearTimeout(showTimer);
      if (shownFor) need('overlay').clear(HOVER);
      shownFor = null;
    }, shownFor === left ? pace.lingerMs : Math.min(300, pace.lingerMs));
  };

  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('pointerout', onOut, true);
  return () => {
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('pointerout', onOut, true);
    window.clearTimeout(showTimer);
    window.clearTimeout(hideTimer);
  };
}

export function hide(): void {
  active = false;
  showing++;
  stopHover?.();
  stopHover = null;
  need('overlay').clear(LAYER);
  need('overlay').clear(HOVER);
}

function summary(shown: number, unsure: string[]): string {
  if (!shown && !unsure.length) return 'I can\'t see any buttons to explain on this page.';
  if (!shown) {
    return 'I\'m not sure what the buttons on this page do, so I\'ve left them alone. You can press "I\'m stuck" and we\'ll ask for help.';
  }
  const done =
    shown === 1
      ? 'I\'ll show you the main button. After that, rest the pointer on it and I\'ll tell you again what it does.'
      : `I'll show you the ${shown} main buttons, one at a time. After that, rest the pointer on any button and I'll tell you again what it does.`;
  if (!unsure.length) return done;
  const names = unsure.slice(0, 3).map((n) => `"${n}"`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${done} I'm not sure about ${list}, so I left ${unsure.length === 1 ? 'it' : 'them'} alone.`;
}

/** For B's tool list: "What do I click?" */
export const labelChoicesTool: Tool = {
  name: 'label_choices',
  owner: 'guide',
  parameters: {},
  description:
    'Show a short plain-words note beside each main button on the page, one at a time, saying what it does. Afterwards the person can rest the pointer on a button to see its note again. Use when the person asks "what do I click?", "which button?", or seems unsure what the buttons do.',
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
    return { ok: true, said: 'I\'ve taken the notes away.' };
  },
};
