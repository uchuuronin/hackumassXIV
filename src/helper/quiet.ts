// Quiet the page: dims adverts and sales pop-ups, and pauses video that started by itself. Owner: B.
// Only styles change. Nothing is removed or added, and everything stays clickable.
import { pageMap } from '@/guide';
import { STEADY_UI_ATTR } from '@/shared/pagemap';
import { advertAround, advertFrame } from './fake';

interface Saved { opacity: string; filter: string; transition: string }
const dimmed = new Map<HTMLElement, Saved>();
const paused = new Set<HTMLVideoElement>();
let timer: number | undefined;

const AD_SELECTOR = '[data-ad], [data-ad-slot], [class*="advert" i], [id*="advert" i], [class*="sponsored" i], [aria-label*="advert" i]';
const POPUP_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"], [class*="popup" i], [class*="modal" i], [class*="overlay" i], [id*="popup" i], [id*="modal" i]';
const POPUP_WORDS = /subscribe|newsletter|sign up|\d+% off|discount|special offer|don't miss|limited time|allow notifications|install our app/i;

/** A box bigger than this share of the window is probably the page itself, not an advert. */
function tooBig(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width * r.height > window.innerWidth * window.innerHeight * 0.6;
}

function dim(el: Element | null): void {
  if (!el || !(el instanceof HTMLElement)) return;
  if (el === document.body || el === document.documentElement) return;
  if (el.closest(`[${STEADY_UI_ATTR}]`) || dimmed.has(el) || tooBig(el)) return;
  if ([...dimmed.keys()].some((d) => d.contains(el))) return;
  dimmed.set(el, { opacity: el.style.opacity, filter: el.style.filter, transition: el.style.transition });
  el.style.transition = 'opacity 200ms ease, filter 200ms ease';
  el.style.opacity = '0.3';
  el.style.filter = 'grayscale(1)';
}

function popups(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(POPUP_SELECTOR))) {
    if (el.closest(`[${STEADY_UI_ATTR}]`)) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 60) continue;
    if (el.querySelector('input[type="password"]')) continue;
    if (POPUP_WORDS.test((el.textContent ?? '').slice(0, 600))) out.push(el);
  }
  return out;
}

function apply(): void {
  const map = pageMap.get();
  for (const el of map.elements) {
    if (!el.marks.some((m) => m.kind === 'fake')) continue;
    const node = pageMap.elementFor(el.id);
    if (node) dim(advertAround(node));
  }
  for (const f of map.frames) dim(advertFrame(f));
  for (const el of Array.from(document.querySelectorAll(AD_SELECTOR))) dim(el);
  for (const el of popups()) dim(el);
  for (const v of Array.from(document.querySelectorAll('video'))) {
    if (v.paused || v.ended) continue;
    if (!v.muted && !v.autoplay) continue; // the person probably started this one
    v.pause();
    paused.add(v);
  }
}

export function quiet(): { dimmed: number; paused: number } {
  apply();
  window.clearInterval(timer);
  timer = window.setInterval(apply, 2500); // catches adverts that load a little later
  return { dimmed: dimmed.size, paused: paused.size };
}

export function unquiet(): void {
  window.clearInterval(timer);
  timer = undefined;
  for (const [el, s] of dimmed) {
    el.style.opacity = s.opacity;
    el.style.filter = s.filter;
    el.style.transition = s.transition;
  }
  dimmed.clear();
  for (const v of paused) v.play().catch(() => undefined); // muted videos may resume without a click
  paused.clear();
}
