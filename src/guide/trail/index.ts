// Feature 8, "Where was I?". A private trail, kept on this computer only: the page she was on, how far
// down it she had scrolled, and what she typed into ordinary boxes. When she comes back after the telephone
// rings, or the website clears the page, Milo can put her back where she was.
//
// What is never kept: anything in a box that looks like a password, a card, a code, an ID number, bank
// details or a date of birth, and anything in a box Milo can't name for certain.
// Nothing is put back without a yes, and nothing she has typed since is ever written over.

import { isOn } from '../switches';
import type { ElementKind, PageElement } from '@/shared/pagemap';
import { need } from '@/shared/ports';
import type { Tool } from '@/shared/tools';
import type { Answer } from '../answers';
import { writeValue } from '../details/write';
import { pageMap } from '../map';
import * as player from '../player';

const TRAIL = 'guide:trail';
const ARRIVING = 'guide:trail-arriving';
const KEEP_DAYS = 7;
const KEEP_PAGES = 5;
const ORDINARY: ElementKind[] = ['text', 'email', 'tel', 'number', 'textarea', 'select', 'date', 'time'];

interface Kept {
  label: string;
  kind: ElementKind;
  /** The website's own names for the box, to find it again. */
  attrs: { id?: string; name?: string };
  value: string;
}

export interface Place {
  /** The website and page, without anything after a "?". */
  key: string;
  url: string;
  title: string;
  when: number;
  scrollY: number;
  fields: Kept[];
}

let offering: { kind: 'restore' | 'go'; place: Place } | null = null;

const keyHere = () => location.origin + location.pathname;
const quoted = (text: string) => `"${text}"`;
const boxes = (n: number) => (n === 1 ? '1 box' : `${n} boxes`);

function names(fields: Kept[]): string {
  const shown = fields.slice(0, 4).map((f) => quoted(f.label));
  if (fields.length > 4) return `${shown.join(', ')} and ${fields.length - 4} more`;
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** A box whose contents may be kept: part of a form, named for certain, and nothing private. */
const ordinary = (el: PageElement): boolean => !el.secret && el.labelConfident && ORDINARY.includes(el.kind) && !el.disabled && !!el.formId;
/** A name or an address, not a letter: long writing (an email, a message) is never kept. */
const MAX_LENGTH = 200;

export async function all(): Promise<Place[]> {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  return ((await need('store').get<Place[]>(TRAIL)) ?? []).filter((p) => p.when > cutoff);
}

async function put(place: Place | null, key = keyHere()): Promise<void> {
  const others = (await all()).filter((p) => p.key !== key);
  const next = place && place.fields.length ? [place, ...others] : others;
  await need('store').set(TRAIL, next.slice(0, KEEP_PAGES));
}

const blank = (): Place => ({ key: keyHere(), url: location.href, title: document.title, when: Date.now(), scrollY: 0, fields: [] });

function valueOf(dom: Element): string {
  if (dom instanceof HTMLSelectElement) return dom.value === '' ? '' : (dom.selectedOptions[0]?.label.trim() ?? '');
  return dom instanceof HTMLInputElement || dom instanceof HTMLTextAreaElement ? dom.value : '';
}

/** The box on today's page that a kept value belongs to. */
function boxFor(kept: Kept): Element | null {
  const found = pageMap.get().elements.filter((e) => ordinary(e) && e.kind === kept.kind);
  const same = (e: PageElement) => {
    const dom = pageMap.elementFor(e.id);
    return !!dom && ((!!kept.attrs.id && dom.id === kept.attrs.id) || (!!kept.attrs.name && dom.getAttribute('name') === kept.attrs.name));
  };
  const el = found.find(same) ?? found.find((e) => e.label === kept.label);
  return el ? pageMap.elementFor(el.id) : null;
}

/** What was kept for this page and is missing from it now. */
async function missingHere(): Promise<{ place: Place; missing: Kept[] } | null> {
  const place = (await all()).find((p) => p.key === keyHere());
  if (!place) return null;
  const missing = place.fields.filter((kept) => {
    const dom = boxFor(kept);
    return !!dom && valueOf(dom) === '';
  });
  return { place, missing };
}

/**
 * Keep the trail as she goes. Only a box she has just changed is written down; a page that comes back
 * empty never wipes what was kept. Sending the form means she is finished with it, so the trail for it goes.
 */
export function watch(options: { saveMs?: number } = {}): () => void {
  const saveMs = options.saveMs ?? 600;
  let timer: number | undefined;
  const changed = new Set<Element>();

  const save = async () => {
    if (!(await isOn('trail'))) return changed.clear(); // she has asked Milo not to keep her place
    const place = (await all()).find((p) => p.key === keyHere()) ?? blank();
    for (const dom of changed) {
      // The page map's full entry, which knows whether the box belongs to a form.
      const seen = pageMap.describe(dom);
      const el = seen && (pageMap.get().elements.find((e) => e.id === seen.id) ?? seen);
      if (!el || !ordinary(el)) continue;
      const attrs = { id: dom.id || undefined, name: dom.getAttribute('name') || undefined };
      place.fields = place.fields.filter((f) => !(f.kind === el.kind && (f.label === el.label || (!!attrs.name && f.attrs.name === attrs.name))));
      const value = valueOf(dom);
      if (value && value.length <= MAX_LENGTH) place.fields.push({ label: el.label, kind: el.kind, attrs, value });
    }
    changed.clear();
    Object.assign(place, { url: location.href, title: document.title, when: Date.now(), scrollY: Math.round(window.scrollY) });
    await put(place);
  };
  const soon = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void save(), saveMs);
  };
  const onChange = (e: Event) => {
    if (!(e.target instanceof Element)) return;
    changed.add(e.target);
    soon();
  };
  const onScroll = async () => {
    // Only worth noting how far down she is once there is something on this page to come back to.
    if ((await all()).some((p) => p.key === keyHere())) soon();
  };
  const onSubmit = () => {
    window.clearTimeout(timer);
    void put(null);
  };
  // Back on a page she had started: note its address as it is today. What was kept is left alone.
  void all().then((kept) => {
    const place = kept.find((p) => p.key === keyHere());
    if (place && place.url !== location.href) void put({ ...place, url: location.href, title: document.title });
  });
  document.addEventListener('change', onChange, true);
  document.addEventListener('submit', onSubmit, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('submit', onSubmit, true);
    window.removeEventListener('scroll', onScroll);
  };
}

const OFFER = ['Yes, put it back', 'No, thank you'];

/** "Where was I?" */
export async function where(): Promise<Answer> {
  offering = null;
  if (!player.where() && !(await isOn('trail'))) {
    return { said: 'I\'m not keeping your place at the moment. You can turn that back on in Settings, under "Remember my place".' };
  }
  // In the middle of a saved task: the step she is on.
  const at = player.where();
  if (at) {
    const step = await player.repeat();
    return { said: `We're doing ${quoted(at.task)}. ${step.said}`, options: step.options };
  }
  // A page she had started, that has come back empty.
  const here = await missingHere();
  if (here?.missing.length) {
    offering = { kind: 'restore', place: here.place };
    return { said: `You were part-way through this page. I kept what you typed in ${boxes(here.missing.length)}: ${names(here.missing)}. Want me to put it back?`, options: OFFER };
  }
  if (here?.place.fields.length) return { said: "You're right where you left off. Everything you typed is still here." };
  // A saved task she stopped part-way.
  const stopped = await player.stoppedTask();
  if (stopped) return player.start(stopped);
  // A page somewhere else that she had started.
  const last = (await all())[0];
  if (last) {
    offering = { kind: 'go', place: last };
    return { said: `Last time you were part-way through a page called ${quoted(last.title)}. Want me to take you back there?`, options: ['Yes, take me there', 'No, thank you'] };
  }
  return { said: "I don't have anything from before. We can start fresh whenever you like." };
}

/** "Yes, put it back." Only into boxes that are empty now. */
export async function restore(): Promise<Answer> {
  const here = await missingHere();
  offering = null;
  if (!here?.missing.length) return { said: "There's nothing to put back. Everything is already here." };
  let done = 0;
  for (const kept of here.missing) {
    const dom = boxFor(kept);
    if (dom && valueOf(dom) === '' && writeValue(dom, kept.value)) done += 1;
  }
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: here.place.scrollY, behavior: calm ? 'auto' : 'smooth' });
  return { said: `Done. I've put back ${boxes(done)}. I never keep card numbers or passwords, so those are still yours to type.` };
}

/** "No, thank you." */
export function decline(): Answer {
  offering = null;
  return { said: "No problem. I've left the page as it is." };
}

/** "Yes, take me there": back to the page she had started. Only ever a page she was on herself. */
export async function goBack(): Promise<Answer> {
  const place = offering?.kind === 'go' ? offering.place : null;
  offering = null;
  if (!place) return { said: "I don't have a page to take you back to." };
  await need('store').set(ARRIVING, place.key);
  location.assign(place.url);
  return { said: 'Taking you there now.' };
}

/** On a page she asked to be taken back to: offer to put back what she had typed. */
export async function arrive(): Promise<Answer | null> {
  const expected = await need('store').get<string>(ARRIVING);
  if (!expected) return null;
  await need('store').remove(ARRIVING);
  if (expected !== keyHere()) return null;
  const here = await missingHere();
  if (!here?.missing.length) return { said: 'Here we are. This is where you were.' };
  offering = { kind: 'restore', place: here.place };
  return { said: `Here we are. I kept what you typed in ${boxes(here.missing.length)}: ${names(here.missing)}. Want me to put it back?`, options: OFFER };
}

/** For the timeout warning: is there something to put back on this page? Sets up the offer if so. */
export async function keptHere(): Promise<number> {
  const here = await missingHere();
  if (!here?.missing.length) return 0;
  offering = { kind: 'restore', place: here.place };
  return here.missing.length;
}

/** How many boxes could be put back on this page. Looks only; offers nothing. */
export async function keptCount(): Promise<number> {
  return (await missingHere())?.missing.length ?? 0;
}

/** Waiting for a yes or no about putting things back, or about going back to a page. */
export const offeringWhat = (): 'restore' | 'go' | null => offering?.kind ?? null;

/** "Forget where I was." */
export async function forget(): Promise<{ said: string }> {
  offering = null;
  await need('store').remove(TRAIL);
  await need('store').remove(ARRIVING);
  return { said: "Done. I've forgotten where you were." };
}

export const whereTool: Tool = {
  name: 'where_was_i',
  owner: 'guide',
  description:
    'The person lost their place: "where was I?", "what was I doing?", "the page went blank". Says the step of the saved task they are in, or offers to put back what they had typed on a page that came back empty, or to take them back to a page they had started. Never restores passwords or card details.',
  parameters: {},
  async run() {
    const reply = await where();
    return { ok: true, said: reply.said, data: { options: reply.options } };
  },
};
