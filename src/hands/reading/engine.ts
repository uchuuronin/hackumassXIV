// Puts the reading settings on the page. Owner: A.
// Style sheet for spacing, font, contrast and colour; an SVG filter for colour-vision correction; the browser's own
// zoom for size (asked of the background worker); and the CSS Custom Highlight API to mark prices and totals.

import { STEADY_UI_ATTR } from '@/shared/pagemap';
import type { AmountHit } from '@/guide/pagemap/amounts';
import { buildCss, DEFAULT_READING, FILTER_ID, isDarkColour, svgMatrix, type ReadingSettings } from './settings';

export interface EngineDeps {
  /** Send a message to the background worker (zoom). */
  send(message: unknown): void;
  /** The amounts on the page with the exact place each is written. Optional: without it there is no highlighting. */
  amounts?: () => AmountHit[];
  /** Called when the page changes enough for the highlights to be worked out again. Returns a function that stops. */
  onPageChange?: (listener: () => void) => () => void;
}

export interface ReadingEngine {
  apply(settings: ReadingSettings): void;
  /** Is the page dark already, in its own colours? */
  isDark(): boolean;
  destroy(): void;
}

interface Registry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}
const registry = (): Registry | null => (typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: Registry }).highlights ?? null : null);
const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
const NAMES = ['steady-total', 'steady-renews', 'steady-amount'] as const;

export function createReadingEngine(doc: Document, deps: EngineDeps): ReadingEngine {
  const style = doc.createElement('style');
  style.setAttribute('data-steady-reading', '');
  let svg: SVGSVGElement | null = null;
  let current: ReadingSettings = DEFAULT_READING;
  let lastZoom: number | undefined;
  let stopWatching: (() => void) | undefined;

  const colourFilter = (kind: ReadingSettings['colour']): void => {
    if (kind === 'none' || kind === 'warm') {
      svg?.remove();
      svg = null;
      return;
    }
    if (!svg) {
      const NS = 'http://www.w3.org/2000/svg';
      svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute(STEADY_UI_ATTR, '');
      svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
      const filter = doc.createElementNS(NS, 'filter');
      filter.setAttribute('id', FILTER_ID);
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      filter.append(doc.createElementNS(NS, 'feColorMatrix'));
      svg.append(filter);
      doc.documentElement.append(svg);
    }
    const matrix = svg.querySelector('feColorMatrix');
    matrix?.setAttribute('type', 'matrix');
    matrix?.setAttribute('values', svgMatrix(kind));
  };

  const opaque = (c: string | undefined): string | undefined =>
    c && !/^rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent' ? c : undefined;

  /** The body's own background, if it has an opaque one. Read with our style sheet off, so it is the page's own. */
  const bodyColour = (): string | undefined => {
    if (style.isConnected) style.remove();
    return doc.body ? opaque(doc.defaultView?.getComputedStyle(doc.body).backgroundColor) : undefined;
  };

  /** The colour the person actually sees in the middle of the page: the first opaque background going up from there. */
  const seenColour = (): string | undefined => {
    if (style.isConnected) style.remove();
    const view = doc.defaultView;
    if (!view) return undefined;
    let el: Element | null = doc.elementFromPoint(view.innerWidth / 2, view.innerHeight / 2);
    while (el) {
      if (!el.closest(`[${STEADY_UI_ATTR}]`)) {
        const c = opaque(view.getComputedStyle(el).backgroundColor);
        if (c) return c;
      }
      el = el.parentElement;
    }
    return opaque(view.getComputedStyle(doc.documentElement).backgroundColor);
  };

  const pageIsDark = (): boolean => isDarkColour(seenColour());

  const clearHighlights = () => {
    const reg = registry();
    for (const name of NAMES) reg?.delete(name);
  };

  const paintHighlights = () => {
    const reg = registry();
    if (!reg || !HighlightCtor || !deps.amounts) return;
    const total: Range[] = [];
    const renews: Range[] = [];
    const other: Range[] = [];
    for (const hit of deps.amounts()) {
      if (hit.struck) continue; // an old, crossed-out price is not what is charged
      if (hit.recurring) renews.push(hit.range);
      else if (hit.kind === 'total') total.push(hit.range);
      else other.push(hit.range);
    }
    reg.set('steady-total', new HighlightCtor(...total));
    reg.set('steady-renews', new HighlightCtor(...renews));
    reg.set('steady-amount', new HighlightCtor(...other));
  };

  const watch = (on: boolean) => {
    stopWatching?.();
    stopWatching = undefined;
    if (on && deps.onPageChange) stopWatching = deps.onPageChange(paintHighlights);
  };

  const zoom = (pct: number) => {
    const factor = pct / 100;
    // Don't touch the person's own zoom until the size has been asked for.
    if (factor === lastZoom || (lastZoom === undefined && factor === 1)) return;
    lastZoom = factor;
    deps.send({ type: 'reading/zoom', factor });
  };

  return {
    apply(settings) {
      current = settings;
      const css = buildCss(settings, bodyColour(), settings.contrast === 'dark' && pageIsDark());
      style.textContent = css;
      if (css && !style.isConnected) doc.documentElement.append(style);
      if (!css) style.remove();
      colourFilter(settings.colour);
      zoom(settings.sizePct);
      if (settings.highlight) {
        paintHighlights();
        watch(true);
      } else {
        watch(false);
        clearHighlights();
      }
    },
    isDark: pageIsDark,
    destroy() {
      void current;
      watch(false);
      clearHighlights();
      style.remove();
      svg?.remove();
      zoom(100);
    },
  };
}
