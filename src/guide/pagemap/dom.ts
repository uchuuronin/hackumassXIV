// Low-level page reading: finding candidates, visibility, rectangles, text.
// Read-only. Nothing in the page map writes to the page.

import { STEADY_UI_ATTR, type Rect } from '@/shared/pagemap';

/** Real controls and things that declare themselves as controls. */
export const ACTIONABLE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[onclick]',
  '[tabindex="0"]',
].join(',');

/** A press on anything inside these lands on the element itself. */
const NATIVE_TARGET = 'a[href],button,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"]';
const FORM_CONTROL = 'input,select,textarea';
/** Everything in ACTIONABLE except the two weak signals, [onclick] and [tabindex]. */
const SPECIFIC = ACTIONABLE.split(',').filter((s) => s !== '[onclick]' && s !== '[tabindex="0"]').join(',');
/** Tags worth checking for a hand cursor when nothing else says "clickable". */
const POINTER_TAGS = new Set(['DIV', 'SPAN', 'LI', 'IMG', 'TD', 'P', 'I', 'B', 'SVG', 'svg', 'FIGURE', 'ARTICLE']);
const MAX_POINTER_CHECKS = 2500;

export interface Candidate {
  el: Element;
  /** Offset of the frame the element is in, relative to the top window. */
  offsetX: number;
  offsetY: number;
  inFrame: boolean;
  /** Found only by its hand cursor. */
  inferred: boolean;
}

export interface FrameInfo {
  el: HTMLIFrameElement;
  offsetX: number;
  offsetY: number;
  sameSite: boolean;
}

export function isSteadyUi(el: Element): boolean {
  return el.hasAttribute(STEADY_UI_ATTR);
}

/**
 * Every candidate control on the page, in reading order, including open shadow roots
 * and frames from the same site.
 */
export function collect(doc: Document, includeFrames: boolean): { candidates: Candidate[]; frames: FrameInfo[] } {
  const raw: Candidate[] = [];
  const frames: FrameInfo[] = [];
  let pointerChecks = 0;

  const walk = (root: Document | ShadowRoot, offsetX: number, offsetY: number, inFrame: boolean, depth: number) => {
    const win = (root.nodeType === 9 ? (root as Document) : root.ownerDocument)?.defaultView;
    if (!win) return;
    const pointerEls = new WeakSet<Element>();
    const all = root.querySelectorAll('*');
    let skipInside: Element | null = null;

    for (const el of all) {
      if (skipInside) {
        if (skipInside.contains(el)) continue;
        skipInside = null;
      }
      if (isSteadyUi(el)) {
        skipInside = el;
        continue;
      }
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;

      if (tag === 'IFRAME') {
        const frame = el as HTMLIFrameElement;
        let inner: Document | null = null;
        try {
          inner = frame.contentDocument;
        } catch {
          inner = null;
        }
        const r = frame.getBoundingClientRect();
        frames.push({ el: frame, offsetX, offsetY, sameSite: !!inner });
        if (inner && includeFrames && depth < 3 && inner.body) {
          walk(inner, offsetX + r.left + frame.clientLeft, offsetY + r.top + frame.clientTop, true, depth + 1);
        }
        continue;
      }

      if (el.matches(ACTIONABLE)) {
        raw.push({ el, offsetX, offsetY, inFrame, inferred: false });
        // Anything inside a real button or an onclick element is part of it, not a second button.
        if (el.matches(`${NATIVE_TARGET},[onclick]`)) pointerEls.add(el);
      } else if (POINTER_TAGS.has(tag) && pointerChecks < MAX_POINTER_CHECKS) {
        // A hand cursor is inherited, so only the outermost element with one is the "button".
        const parent = el.parentElement;
        if (parent && pointerEls.has(parent)) {
          pointerEls.add(el);
        } else if (!el.closest('label')) {
          pointerChecks++;
          if (win.getComputedStyle(el).cursor === 'pointer') {
            pointerEls.add(el);
            raw.push({ el, offsetX, offsetY, inFrame, inferred: true });
          }
        }
      }

      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow && depth < 6) walk(shadow, offsetX, offsetY, inFrame, depth + 1);
    }
  };

  walk(doc, 0, 0, false, 0);
  return { candidates: dedupe(raw), frames };
}

/**
 * One press, one entry. A <span> inside a <button> is the button. A clickable <div>
 * that only wraps real buttons is not a button.
 */
function dedupe(raw: Candidate[]): Candidate[] {
  const set = new Map<Element, Candidate>();
  for (const c of raw) set.set(c.el, c);
  const hasInner = new Set<Element>();
  const drop = new Set<Element>();

  const generic = (c: Candidate) => c.inferred || !c.el.matches(SPECIFIC);

  for (const c of raw) {
    let up = parentAcrossShadow(c.el);
    let hops = 0;
    while (up && hops++ < 40) {
      const anc = set.get(up);
      if (anc) {
        if (generic(anc)) hasInner.add(up);
        else if (up.matches(NATIVE_TARGET) && !c.el.matches(FORM_CONTROL)) drop.add(c.el);
      }
      up = parentAcrossShadow(up);
    }
  }
  return raw.filter((c) => !drop.has(c.el) && !(generic(c) && hasInner.has(c.el)));
}

export function parentAcrossShadow(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** The button, link or field that a press on `target` would land on. */
export function actionableFor(target: Element): Element | null {
  let el: Element | null = target;
  let fallback: Element | null = null;
  let hops = 0;
  while (el && hops++ < 60) {
    if (isSteadyUi(el)) return null;
    if (el.matches(`${NATIVE_TARGET},${FORM_CONTROL},[role="checkbox"],[role="radio"],[role="switch"],[role="option"],[role="combobox"],[role="textbox"],[role="searchbox"],[role="slider"],[role="spinbutton"],[contenteditable=""],[contenteditable="true"]`)) {
      return el;
    }
    if (el.tagName === 'LABEL') {
      const control = (el as HTMLLabelElement).control;
      if (control) return control;
    }
    if (!fallback && el.matches('[onclick],[tabindex="0"]')) fallback = el;
    el = parentAcrossShadow(el);
  }
  if (fallback) return fallback;
  // Last resort: the outermost element showing a hand cursor around the target.
  const win = target.ownerDocument.defaultView;
  if (!win) return null;
  let found: Element | null = null;
  el = target;
  hops = 0;
  while (el && el !== target.ownerDocument.body && hops++ < 8) {
    if (win.getComputedStyle(el).cursor === 'pointer') found = el;
    else if (found) break;
    el = el.parentElement;
  }
  return found;
}

export function rectOf(el: Element, offsetX = 0, offsetY = 0): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left + offsetX),
    y: Math.round(r.top + offsetY),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

/** Things a link or button can wrap whose size the wrapper's own box doesn't show (a picture on a line with no height). */
const PICTURE = 'img, svg, picture, video, canvas, [role="img"]';
const WRAPPER = 'a, button, [role="button"], [role="link"]';

/**
 * What the person sees as the control. A link around a picture can have a box a few pixels tall while the
 * picture is much bigger, so for links and buttons the pictures inside count too. Used for drawing boxes
 * and labels; the map's own numbers (rectOf) are left as they are.
 */
export function seenRectOf(el: Element, offsetX = 0, offsetY = 0): Rect {
  const base = rectOf(el, offsetX, offsetY);
  if (!el.matches(WRAPPER)) return base;
  let x1 = base.x;
  let y1 = base.y;
  let x2 = base.x + base.width;
  let y2 = base.y + base.height;
  let count = 0;
  for (const pic of el.querySelectorAll(PICTURE)) {
    if (++count > 8) break;
    const r = pic.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    x1 = Math.min(x1, Math.round(r.left + offsetX));
    y1 = Math.min(y1, Math.round(r.top + offsetY));
    x2 = Math.max(x2, Math.round(r.right + offsetX));
    y2 = Math.max(y2, Math.round(r.bottom + offsetY));
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  // 1px boxes are the usual "for screen readers only" trick.
  if (r.width < 2 || r.height < 2) return false;
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  // Parked far off the page.
  if (r.right + win.scrollX < 0 || r.bottom + win.scrollY < 0) return false;
  const check = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility;
  if (typeof check === 'function') {
    return check.call(el, { checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true });
  }
  const s = win.getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
}

export function inViewport(rect: Rect, win: Window): boolean {
  return rect.x < win.innerWidth && rect.x + rect.width > 0 && rect.y < win.innerHeight && rect.y + rect.height > 0;
}

/** Is something else on top of this element at its middle point? */
export function isCovered(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  const x = Math.min(Math.max(r.left + r.width / 2, 1), win.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), win.innerHeight - 1);
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false; // middle is off screen
  const root = el.getRootNode() as Document | ShadowRoot;
  const top = typeof root.elementFromPoint === 'function' ? root.elementFromPoint(x, y) : null;
  if (!top || top === el) return false;
  if (el.contains(top) || top.contains(el)) return false;
  if (top.tagName === 'LABEL' && (top as HTMLLabelElement).control === el) return false;
  const hostChain = top.getRootNode();
  if (hostChain instanceof ShadowRoot && el.contains(hostChain.host)) return false;
  // Milo's own notes let clicks through, so they never show up here. A Milo panel or pop-up that
  // takes clicks does cover what is under it: nothing should highlight, steer to or click a button behind it.
  return true;
}

const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SELECT', 'TEXTAREA', 'INPUT', 'IFRAME']);

/** Visible words inside a node, skipping form controls, scripts and pictures. */
export function textOf(node: Node | null, limit = 200): string {
  if (!node) return '';
  let out = '';
  const visit = (n: Node, isRoot: boolean) => {
    if (out.length > limit * 2) return;
    if (n.nodeType === 3) {
      out += n.nodeValue;
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (SKIP_TEXT.has(el.tagName) || el.tagName.toLowerCase() === 'svg') return;
    // Hidden parts inside are skipped. The node asked about is read even if the page hides it.
    if (!isRoot && ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true')) return;
    const breaks = /^(DIV|P|LI|TR|TD|TH|BR|H[1-6]|SECTION|ARTICLE|DT|DD|SMALL|LABEL|BUTTON|A|UL|OL|DL)$/.test(el.tagName);
    if (breaks) out += ' ';
    for (const child of el.childNodes) visit(child, false);
    if (breaks) out += ' ';
  };
  visit(node, true);
  return clip(out, limit);
}

export function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** Tidy and shorten at a word boundary. */
export function clip(text: string | null | undefined, limit = 80): string {
  const t = clean(text);
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** getElementById that also works inside a shadow root. */
export function byId(from: Element, id: string): Element | null {
  const root = from.getRootNode() as Document | ShadowRoot;
  return typeof root.getElementById === 'function' ? root.getElementById(id) : from.ownerDocument.getElementById(id);
}

/** Two addresses on the same website? Compares the last two parts of the host name. */
export function sameSite(a: string, b: string): boolean {
  const site = (host: string) => (/^[\d.]+$|^\[/.test(host) ? host : host.split('.').slice(-2).join('.'));
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return site(ua.hostname) === site(ub.hostname) && ua.port === ub.port;
  } catch {
    return true;
  }
}
