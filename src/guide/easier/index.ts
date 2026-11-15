// "Make this page easier". Owner: C.
//
// A website should be readable and usable by someone with weak eyes, weak hearing or an unsteady hand.
// Many aren't. Steady can't make the site's owner fix it, but it can repair a good part of it from her
// side, on any page, and say honestly what it could not repair.
//
// What it repairs (the WCAG rule the site broke is in brackets):
//   - faint writing is made dark enough to read, keeping its colour (1.4.3)
//   - buttons, links and boxes with no name get one, for a screen reader and for Steady's own notes (4.1.2, 3.3.2)
//   - the keyboard's place can always be seen (2.4.7)
//   - things that keep moving are stopped, and adverts are dimmed (2.2.2)
//   - a page that blocks zooming is unblocked (1.4.4); a page that hides its language is given one (3.1.1)
//   - the main part of the page is marked, so a screen reader can jump to it (1.3.1, 2.4.1)
// What it can't repair, and says so: a video with no captions, a picture with no description.
//
// Two rules it never breaks. It never guesses a name: a button is named only when the page gives two
// clues that agree, or when Gemini can tell from the hints; otherwise it is left alone and counted.
// And everything it changes is written down, so "Put the page back" undoes all of it.
//
// What goes to Gemini: for each unnamed button, a few words taken from its own markup (class names,
// where its link goes, the name of its icon). Never the words on the page, never what follows a "?"
// in an address, never anything she typed.

import { getTool } from '@/helper/registry';
import { STEADY_UI_ATTR, type PageElement } from '@/shared/pagemap';
import { need } from '@/shared/ports';
import type { Tool } from '@/shared/tools';
import type { Answer } from '../answers';
import { pageMap } from '../map';
import { css, over, parse, ratio, readable, type RGB } from './colour';

export const MAKE = 'Make this page easier';
export const UNDO = 'Put the page back';
export const ALWAYS = 'Do this on every page';
export const NOT_ALWAYS = 'Stop doing it on every page';
export const BIGGER = 'Make the words bigger';

const KEY = 'guide:easier';
const MARK = 'data-steady-easier';
const MOST = 5000; // pieces of writing looked at on one page
const GEMINI_MS = 6000;

/** Every change, as the way to undo it. Newest last. */
let ledger: Array<() => void> = [];
let on = false;
let stopWatching: (() => void) | null = null;
let calmed = false;

export const isOn = (): boolean => on;

// ---- small tools for changing things in a way that can be undone ----

function setStyle(el: HTMLElement, prop: string, value: string): void {
  const old = el.style.getPropertyValue(prop);
  const oldPriority = el.style.getPropertyPriority(prop);
  el.style.setProperty(prop, value, 'important');
  ledger.push(() => {
    if (old) el.style.setProperty(prop, old, oldPriority);
    else el.style.removeProperty(prop);
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });
}

function setAttr(el: Element, name: string, value: string): void {
  const old = el.getAttribute(name);
  el.setAttribute(name, value);
  ledger.push(() => (old === null ? el.removeAttribute(name) : el.setAttribute(name, old)));
}

const mine = (el: Element): boolean => !!el.closest(`[${STEADY_UI_ATTR}]`);

// ---- faint writing ----

/** The colour behind an element, or null when a picture or a gradient is behind it and nobody can say. */
function groundOf(el: Element): RGB | null {
  const layers: Array<{ rgb: RGB; a: number }> = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') return null;
    const colour = parse(style.backgroundColor);
    if (!colour) return null;
    if (colour.a > 0) layers.push(colour);
    if (colour.a === 1) break;
  }
  let ground: RGB = [255, 255, 255];
  for (const layer of layers.reverse()) ground = over(layer.rgb, layer.a, ground);
  return ground;
}

/** Every element that holds words of its own and can be seen. */
function writing(doc: Document): HTMLElement[] {
  const found = new Set<HTMLElement>();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && found.size < MOST; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || !node.textContent?.trim() || found.has(el)) continue;
    if (el.closest(`[${STEADY_UI_ATTR}], script, style, noscript, svg, option, [disabled], [aria-disabled="true"]`)) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    found.add(el);
  }
  return [...found];
}

/** Is this piece of writing too faint to read (WCAG 1.4.3)? If so, its colour and the ground behind it. */
function faint(el: HTMLElement): { text: RGB; ground: RGB; opacity: number } | null {
  const style = getComputedStyle(el); // read fresh: a parent fixed a moment ago may have fixed this one too
  if (style.visibility === 'hidden') return null;
  const text = parse(style.color);
  const ground = groundOf(el);
  if (!text || !ground) return null;
  const opacity = Number.isFinite(Number(style.opacity)) ? Number(style.opacity) : 1;
  const seen = over(text.rgb, text.a * opacity, ground);
  const size = parseFloat(style.fontSize);
  const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
  return ratio(seen, ground) >= (large ? 3 : 4.5) ? null : { text: text.rgb, ground, opacity };
}

/**
 * A quick look, changing nothing: is this page worth offering to repair? Used for the one quiet line
 * the panel shows when a page opens. It stops counting early, so it costs little.
 */
export function worth(): boolean {
  if (on || !document.body) return false;
  let pale = 0;
  for (const el of writing(document).slice(0, 400)) if (faint(el) && (pale += 1) >= 5) return true;
  const unnamed = pageMap.get().elements.filter((e) => e.visible && (e.kind === 'button' || e.kind === 'link') && (e.labelSource === 'icon' || e.labelSource === 'none')).length;
  return unnamed >= 3;
}

/** Makes faint writing readable. Returns how many pieces it changed. */
function darken(doc: Document): number {
  let changed = 0;
  for (const el of writing(doc)) {
    const found = faint(el);
    if (!found) continue;
    const { text, ground, opacity } = found;
    setStyle(el, 'color', css(readable(text, ground)));
    if (opacity < 1) setStyle(el, 'opacity', '1');
    // A link told apart only by its colour needs another sign once the colour has changed (1.4.1).
    const link = el.closest('a[href]') as HTMLElement | null;
    if (link && !getComputedStyle(link).textDecorationLine.includes('underline')) setStyle(link, 'text-decoration-line', 'underline');
    changed += 1;
  }
  return changed;
}

// ---- names for things that have none ----

/** Where the page map got a label from when the control has no proper name of its own. */
const WEAK = new Set(['placeholder', 'nearby', 'icon', 'name', 'none']);

/** A few words from a control's own markup. Letters only, so no numbers, codes or addresses slip through. */
function hints(el: Element, known: PageElement): string {
  const words = new Set<string>();
  const take = (text: string | null | undefined) => {
    for (const w of (text ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]{3,20}/g) ?? []) if (words.size < 10) words.add(w);
  };
  for (const node of [el, ...el.querySelectorAll('svg, use, img, i, span')].slice(0, 6)) {
    take(node.getAttribute('class'));
    take(node.id);
    take(node.getAttribute('data-icon'));
    take(node.getAttribute('name'));
    take((node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? '').split('#')[1]);
    take((node.getAttribute('src') ?? '').split(/[?#]/)[0]?.split('/').pop()?.replace(/\.\w+$/, ''));
  }
  let goes = '';
  const href = el.closest('a[href]')?.getAttribute('href');
  if (href) {
    try {
      goes = new URL(href, location.href).pathname.replace(/\d{3,}/g, '0').slice(0, 60); // the path only: nothing after a "?"
    } catch {
      goes = '';
    }
  }
  const guess = known.label && known.labelSource !== 'none' ? `; my guess: ${known.label}` : '';
  return `${known.kind}${goes && goes !== '/' ? `; goes to ${goes}` : ''}; words in its code: ${[...words].join(' ') || 'none'}${guess}`;
}

/** Words she can already see on the control (a "4" on the basket) stay in its name (WCAG 2.5.3). */
function withItsWords(el: Element, given: string): string {
  const shown = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return shown && !given.toLowerCase().includes(shown.toLowerCase()) ? `${given}, ${shown}` : given;
}

/** What common icon words mean. One word alone is a guess; two that agree are enough to name a button. */
const MEANS: Array<[name: string, words: RegExp]> = [
  ['Search', /^(search|magnif\w*|find|lookup)$/],
  ['Open the menu', /^(menu|hamburger|burger|nav|navigation|drawer)$/],
  ['Shopping cart', /^(cart|basket|bag|trolley)$/],
  ['My account', /^(user|account|profile|login|signin|person|avatar)$/],
  ['Close', /^(close|dismiss|cross)$/],
  ['Saved items', /^(heart|wishlist|favou?rites?|saved)$/],
  ['Help', /^(help|support|faq)$/],
  ['Share', /^(share|sharing)$/],
  ['Print', /^(print|printer)$/],
];

/**
 * A name from the control's own markup, only when two separate clues say the same thing: two different
 * words ("nav" and "hamburger"), or the same word in two places (on the link and on the icon inside it).
 */
function byRules(el: Element): string | null {
  const clues = new Map<string, Set<string>>();
  [el, ...el.querySelectorAll('svg, use, img, i, span')].slice(0, 6).forEach((node, where) => {
    const href = node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? '';
    const text = [node.getAttribute('class'), node.id, node.getAttribute('data-icon'), href.split('#')[1], href.split(/[?#]/)[0]?.split('/').pop()?.replace(/\.\w+$/, '')].join(' ');
    for (const word of text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]{3,20}/g) ?? []) {
      const hit = MEANS.find(([, words]) => words.test(word));
      if (!hit) continue;
      if (!clues.has(hit[0])) clues.set(hit[0], new Set());
      clues.get(hit[0])!.add(word).add(`at ${where}:${word}`.replace(/:.*/, '')); // a different word, or a different place
    }
  });
  // Where it sits is a clue too: the button that sends a search box is the search button.
  const form = el.closest('form');
  const sends = el.matches('button:not([type="button"]), input[type="submit"], input[type="image"]');
  if (form && sends && form.querySelector('input[type="search"], input[name="q"], input[name="search"], [role="searchbox"]')) {
    if (!clues.has('Search')) clues.set('Search', new Set());
    clues.get('Search')!.add('beside a search box').add('in its form');
  }
  const agreed = [...clues].filter(([, seen]) => seen.size >= 3); // one word in one place makes 2 entries; a second clue makes 3
  return agreed.length === 1 ? agreed[0]![0] : null; // two meanings at once is no answer
}

export function namePrompt(items: string[], pageKind: string): string {
  return [
    'Some buttons and links on a web page have no words on them. Name each one for an older person, so a screen reader can say what it does.',
    'You are given only a few words from each one\'s code. Reply with ONLY JSON, the item number to its name: {"1": "Search", "2": "?"}.',
    'A name is one to four plain words that say what it does: "Open the menu", "Search", "Shopping cart", "Close".',
    'If the words do not make it clear, answer "?". Never guess. A wrong name is worse than none.',
    `KIND OF PAGE: ${pageKind}`,
    'ITEMS:',
    ...items.map((item, i) => `${i + 1}. ${item}`),
  ].join('\n');
}

/** Gemini's names, checked: short, plain words, nothing that looks like code, a link or a sales line. */
export function readNames(text: string, count: number): Array<string | null> {
  const out: Array<string | null> = Array.from({ length: count }, () => null);
  const json = text.match(/\{[^]*\}/)?.[0];
  if (!json) return out;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return out;
  }
  for (let i = 0; i < count; i += 1) {
    const name = typeof parsed[String(i + 1)] === 'string' ? (parsed[String(i + 1)] as string).trim() : '';
    if (/^[A-Za-z][A-Za-z' -]{1,38}$/.test(name) && name.split(/\s+/).length <= 4) out[i] = name;
  }
  return out;
}

/** Names what can be named. Returns how many got a name and how many buttons had to be left. */
async function name(useGemini: boolean): Promise<{ named: number; left: number }> {
  const map = pageMap.get();
  const unsure: Array<{ el: Element; known: PageElement }> = [];
  let named = 0;
  for (const known of map.elements) {
    if (!known.visible || !WEAK.has(known.labelSource)) continue;
    const el = pageMap.elementFor(known.id);
    if (!el || mine(el) || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) continue;
    if (known.labelConfident && known.label && known.labelSource !== 'none') {
      setAttr(el, 'aria-label', withItsWords(el, known.label));
      named += 1;
    } else {
      const ruled = known.kind === 'button' || known.kind === 'link' ? byRules(el) : null;
      if (ruled) {
        setAttr(el, 'aria-label', withItsWords(el, ruled));
        if (!el.getAttribute('title')) setAttr(el, 'title', ruled);
        named += 1;
      } else unsure.push({ el, known });
    }
  }
  const model = useGemini ? need('model') : null;
  let names: Array<string | null> = unsure.map(() => null);
  if (model?.ask && unsure.length) {
    const asked = unsure.slice(0, 25);
    try {
      const reply = await Promise.race([
        model.ask(namePrompt(asked.map((u) => hints(u.el, u.known)), map.stage.kind)),
        new Promise<string>((resolve) => window.setTimeout(() => resolve(''), GEMINI_MS)),
      ]);
      names = [...readNames(String(reply ?? ''), asked.length), ...unsure.slice(25).map(() => null)];
    } catch {
      // no Gemini: the unsure ones stay as they are
    }
  }
  let left = 0;
  unsure.forEach(({ el, known }, i) => {
    const given = names[i];
    if (given) {
      setAttr(el, 'aria-label', withItsWords(el, given));
      if (!el.getAttribute('title')) setAttr(el, 'title', given); // seen on hover too, for someone who can see but not guess the icon
      named += 1;
    } else if (known.kind === 'button' || known.kind === 'link') left += 1;
  });
  return { named, left };
}

// ---- movement, the keyboard's place, and the page's own settings ----

const SHEET = `
  :focus-visible { outline: 3px solid #1d5fd0 !important; outline-offset: 2px !important; box-shadow: 0 0 0 6px #ffffff !important; }
`;

/**
 * Stops one thing that moves for ever, and leaves it where it can be read. Stopping is not enough by
 * itself: a line of news frozen half off the page, or a blinking word frozen on "invisible", is worse
 * than before. So the movement is taken away and the thing is laid out as ordinary words.
 */
function settle(target: HTMLElement, animation: Animation): void {
  animation.pause();
  ledger.push(() => {
    try {
      if (animation.playState === 'paused') animation.play(); // one that was taken away starts again by itself when its style comes back
    } catch {
      // the thing it moved has gone
    }
  });
  if (!(target instanceof HTMLElement)) return;
  const frames = (animation.effect as KeyframeEffect).getKeyframes?.() ?? [];
  const slides = frames.some((f) => /translate|matrix/.test(String(f.transform ?? ''))) || frames.some((f) => 'left' in f || 'marginLeft' in f);
  const fades = frames.some((f) => 'opacity' in f || 'visibility' in f);
  const box = target.parentElement;
  if (slides && box && /hidden|clip/.test(getComputedStyle(box).overflowX)) {
    // A ticker: show the whole line, wrapped, inside its own box.
    setStyle(target, 'animation', 'none');
    setStyle(target, 'transform', 'none');
    setStyle(target, 'padding-left', '0');
    setStyle(target, 'margin-left', '0');
    setStyle(target, 'white-space', 'normal');
    setStyle(box, 'white-space', 'normal');
  }
  if (fades) {
    setStyle(target, 'opacity', '1');
    setStyle(target, 'visibility', 'visible');
  }
}

/** Stops what is moving. Returns how many things were. */
function still(doc: Document): number {
  const moving = new Set<Element>();
  for (const animation of doc.getAnimations?.() ?? []) {
    const effect = animation.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (!target || mine(target) || animation.playState !== 'running') continue;
    if (effect.getComputedTiming().iterations !== Infinity) continue; // something that runs once and stops is not the trouble
    moving.add(target);
    settle(target as HTMLElement, animation);
  }
  for (const el of doc.querySelectorAll('marquee')) {
    if (mine(el)) continue;
    moving.add(el);
    (el as HTMLElement & { stop?: () => void; start?: () => void }).stop?.();
    ledger.push(() => (el as HTMLElement & { start?: () => void }).start?.());
  }
  return moving.size;
}

function sheet(doc: Document): void {
  if (doc.querySelector(`style[${MARK}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = SHEET;
  (doc.head ?? doc.documentElement).append(style);
  ledger.push(() => style.remove());
}

/** A page may not forbid zooming (WCAG 1.4.4). */
function allowZoom(doc: Document): void {
  const meta = doc.querySelector('meta[name="viewport"]');
  const content = meta?.getAttribute('content');
  if (!meta || !content || !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*[01](\.\d+)?(\D|$)/i.test(content)) return;
  const kept = content.split(',').map((part) => part.trim()).filter((part) => !/^(user-scalable|maximum-scale)\s*=/i.test(part));
  setAttr(meta, 'content', kept.join(', '));
}

/** The main part of the page, marked so a screen reader can jump straight to it. */
function markMain(doc: Document): void {
  if (doc.querySelector('main, [role="main"]')) return;
  const articles = doc.querySelectorAll('article');
  const pick = articles.length === 1 ? articles[0] : doc.querySelector('#main, #content, #main-content, .main-content, .content');
  if (pick && !mine(pick) && !pick.hasAttribute('role')) setAttr(pick, 'role', 'main');
}

/** A page that doesn't say what language it is in is read out in the wrong voice (WCAG 3.1.1). */
async function sayLanguage(doc: Document): Promise<void> {
  if (doc.documentElement.getAttribute('lang')) return;
  const i18n = (globalThis as { chrome?: { i18n?: { detectLanguage?: (text: string) => Promise<{ isReliable: boolean; languages: Array<{ language: string; percentage: number }> }> } } }).chrome?.i18n;
  if (!i18n?.detectLanguage) return;
  try {
    const found = await i18n.detectLanguage((doc.body?.innerText ?? '').slice(0, 2000));
    const best = found.languages[0];
    if (found.isReliable && best && best.percentage >= 80) setAttr(doc.documentElement, 'lang', best.language);
  } catch {
    // leave it as the site made it
  }
}

// ---- what it can only tell her about ----

function cannotFix(doc: Document): { videos: number; pictures: number; small: boolean } {
  const videos = [...doc.querySelectorAll('video')].filter((v) => !mine(v) && v.getBoundingClientRect().width > 0 && !v.querySelector('track[kind="captions"], track[kind="subtitles"]')).length;
  const pictures = [...doc.querySelectorAll('img:not([alt])')].filter((img) => {
    const box = img.getBoundingClientRect();
    return !mine(img) && box.width >= 48 && box.height >= 48 && !img.closest('[aria-label], [aria-hidden="true"]');
  }).length;
  const sizes = [...doc.querySelectorAll('p, li')].filter((el) => !mine(el) && el.textContent && el.textContent.trim().length > 40).slice(0, 80).map((el) => parseFloat(getComputedStyle(el).fontSize)).sort((a, b) => a - b);
  const middle = sizes[Math.floor(sizes.length / 2)];
  return { videos, pictures, small: middle !== undefined && middle < 16 };
}

// ---- doing it, saying it, undoing it ----

const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;
const list = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

interface Done { faint: number; named: number; left: number; moving: number; calmed: boolean }

async function repair(useGemini: boolean): Promise<Done> {
  const doc = document;
  allowZoom(doc);
  markMain(doc);
  await sayLanguage(doc);
  // Order matters. Count and stop what is moving, and change the colours, before the stylesheet goes in:
  // it shortens every transition to nothing, and a colour read in the middle of one is the old colour.
  const moving = still(doc);
  const faint = darken(doc);
  const { named, left } = await name(useGemini);
  sheet(doc);
  let quieted = false;
  if (!calmed) {
    try {
      const reply = await getTool('quiet_page')?.run({});
      calmed = !!reply;
      quieted = !!reply && !/already looks calm/.test(reply.said ?? '');
    } catch {
      // a page that can't be calmed is still easier than it was
    }
  }
  return { faint, named, left, moving, calmed: quieted };
}

function report(done: Done): Answer {
  const { videos, pictures, small } = cannotFix(document);
  const did: string[] = [];
  if (done.faint) did.push(`made ${many(done.faint, 'piece', 'pieces')} of faint writing darker`);
  if (done.named) did.push(`gave ${done.named === 1 ? '1 button or box' : `${done.named} buttons and boxes`} a name`);
  if (done.moving) did.push(`stopped ${many(done.moving, 'thing', 'things')} moving`);
  if (done.calmed) did.push('dimmed the adverts');
  const said: string[] = [];
  said.push(did.length ? `Done. I ${list(did)}.` : "I looked this page over and it reads well already. I've made sure you can always see where the keyboard is.");
  if (done.left) said.push(`There ${done.left === 1 ? "is 1 button I couldn't work out, so I've left it" : `are ${done.left} buttons I couldn't work out, so I've left them`} as ${done.left === 1 ? 'it is' : 'they are'}.`);
  if (videos) said.push(`There's a video here with no captions. I can't add those, but Chrome can: it's called Live Caption, in Chrome's settings under Accessibility.`);
  if (pictures) said.push(`${many(pictures, 'picture has', 'pictures have')} no description, and I can't describe pictures.`);
  if (small) said.push('The writing here is small. I can make it bigger.');
  const changed = did.length > 0 || done.left > 0 || videos > 0 || pictures > 0 || small;
  const options = changed ? [...(small ? [BIGGER] : []), ALWAYS, UNDO] : [];
  return { said: said.join(' '), options, mood: did.length ? 'glad' : undefined };
}

function watch(): void {
  stopWatching?.();
  let timer: number | undefined;
  let last = 0;
  // New things arrive on a page that is already open (a longer list, a pop-up). They are repaired too, quietly.
  const off = pageMap.onChange(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!on || Date.now() - last < 3000) return;
      last = Date.now();
      still(document);
      darken(document);
      void name(false);
    }, 800);
  });
  stopWatching = () => {
    window.clearTimeout(timer);
    off();
    stopWatching = null;
  };
}

/** She asked for it. */
export async function start(): Promise<Answer> {
  if (on) undoAll(); // asked twice: start from the page as the site made it, so the count is honest
  on = true;
  const done = await repair(true);
  watch();
  return report(done);
}

function undoAll(): void {
  stopWatching?.();
  for (const back of ledger.reverse()) {
    try {
      back();
    } catch {
      // that part of the page has gone
    }
  }
  ledger = [];
  on = false;
  if (calmed) {
    calmed = false;
    void Promise.resolve(getTool('unquiet_page')?.run({})).catch(() => undefined);
  }
}

export function undo(): Answer {
  const was = on;
  undoAll();
  return { said: was ? "I've put the page back the way it was." : "I haven't changed anything on this page." };
}

export async function always(): Promise<Answer> {
  await need('store').set(KEY, { always: true });
  if (!on) await start();
  return { said: "I will. From now on I'll do this on every page you open, without a word. Tell me if you want me to stop.", options: [NOT_ALWAYS] };
}

export async function notAlways(): Promise<Answer> {
  await need('store').remove(KEY);
  return { said: "All right. I'll only do it when you ask.", options: on ? [UNDO] : [] };
}

export async function bigger(): Promise<Answer> {
  const tool = getTool('reading_set');
  if (!tool) return { said: "I can't change the size of the writing on this page." };
  const reply = await tool.run({ setting: 'size', value: 'bigger' });
  return { said: reply.said ?? 'The writing is bigger now.', options: [BIGGER, UNDO] };
}

/** On every new page: if she asked for this always, do it, and say nothing. */
export async function resume(): Promise<void> {
  const kept = await need('store').get<{ always?: boolean }>(KEY);
  if (!kept?.always || on) return;
  on = true;
  await repair(true);
  watch();
}

export const easierTool: Tool = {
  name: 'make_page_easier',
  owner: 'guide',
  description:
    'Repair the page she is on so it is easier to read and use: darken faint writing, name buttons that have no words, show where the keyboard is, stop things moving, dim adverts. Use when she says the page is hard to read, hard to see, too busy, flashing, or asks to make it easier or clearer. Everything can be put back.',
  parameters: {},
  async run() {
    const reply = await start();
    return { ok: true, said: reply.said, data: { options: reply.options, mood: reply.mood } };
  },
  async undo() {
    undoAll();
  },
};
