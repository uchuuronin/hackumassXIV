// TEMPORARY. Stand-ins for A's overlay and B's voice, so the guide lane can be seen and checked
// before those pieces exist. Used only in `npm run dev`, and only until the owner calls
// provide('overlay', …) or provide('speech', …). Delete this file when both have landed.
//
// It follows the plan's interface rules, so what you see here is a fair preview:
//   words in a plain font on a solid label, at least 18px; labels sit in empty space and cover
//   nothing; they follow the page; nothing flashes; no animation when motion is turned off.

import { STEADY_UI_ATTR, type Rect } from '@/shared/pagemap';
import type { LabelTone, OverlayLabel, OverlayPort, SpeechPort } from '@/shared/ports';
import { pageMap } from '../map';

const TONE: Record<LabelTone, string> = { go: '#1f7a3d', careful: '#a45a00', stop: '#b3261e', info: '#2f5d8a' };
const GAP = 12;

const CSS = `
  :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
  * { box-sizing: border-box; }
  .note { position: fixed; max-width: 300px; padding: 8px 12px; background: #fffdf5; color: #1b1b1b;
    font: 18px/1.35 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; border: 2px solid; border-left-width: 8px;
    border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  .ring { position: fixed; border: 3px solid; border-radius: 8px; }
  .dim { position: fixed; background: rgba(15, 20, 25, .5); transition: opacity .25s; }
  .said { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); max-width: min(720px, 92vw); padding: 12px 18px;
    background: #1b1b1b; color: #fff; font: 20px/1.4 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; border-radius: 10px; }
  .said small { display: block; font-size: 13px; opacity: .7; margin-bottom: 2px; }
  @media (prefers-reduced-motion: reduce) { .dim { transition: none; } }
`;

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function createStandIns(): { overlay: OverlayPort; speech: SpeechPort; stop(): void } {
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  const layers = new Map<string, OverlayLabel[]>();
  let lit: { targetId: string; text?: string } | null = null;
  let said = '';
  let frame = 0;
  let settle: number | undefined;
  /** Where each note sits relative to its target, so it can follow the page while scrolling. */
  const offsets = new Map<string, { dx: number; dy: number }>();

  const ensure = () => {
    if (root) return root;
    host = document.createElement('div');
    host.setAttribute(STEADY_UI_ATTR, 'standin');
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div id="dims"></div><svg id="lines" width="100%" height="100%" style="position:fixed;inset:0"></svg><div id="notes"></div><div id="said" role="status" aria-live="polite"></div>`;
    document.documentElement.appendChild(host);
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove, { passive: true });
    return root;
  };

  /** Does this spot on the page hold something a person would want to read or press? */
  const busy = (box: Box): boolean => {
    // A grid of points across the box, so a note can't slip in between two lines of text.
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 3; j++) points.push([box.x + 3 + ((box.width - 6) * i) / 4, box.y + 3 + ((box.height - 6) * j) / 3]);
    }
    for (const [x, y] of points) {
      const el = document.elementFromPoint(x, y);
      if (!el || el === host) continue;
      if (/^(IMG|SVG|INPUT|SELECT|TEXTAREA|BUTTON|A|VIDEO|IFRAME|LABEL)$/i.test(el.tagName)) return true;
      for (const child of el.childNodes) if (child.nodeType === 3 && child.nodeValue?.trim()) return true;
    }
    return false;
  };

  /**
   * A place for a note near its target: in empty space, on screen, covering nothing.
   * Looks right beside the target first, then further out. A thin line joins the two.
   * No clean place means no note: the rule is that a label never covers the page.
   */
  const place = (target: Rect, size: { width: number; height: number }, taken: Box[]): Box | null => {
    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    const onScreen = (b: Box) => b.x >= 4 && b.y >= 4 && b.x + b.width <= window.innerWidth - 4 && b.y + b.height <= window.innerHeight - 4;
    for (const gap of [GAP, 48, 110, 190, 280]) {
      const right = target.x + target.width + gap;
      const left = target.x - size.width - gap;
      const below = target.y + target.height + gap;
      const above = target.y - size.height - gap;
      const spots: Box[] = [
        { x: right, y: cy - size.height / 2 },
        { x: left, y: cy - size.height / 2 },
        { x: cx - size.width / 2, y: below },
        { x: cx - size.width / 2, y: above },
        { x: right, y: below },
        { x: left, y: below },
        { x: right, y: above },
        { x: left, y: above },
        { x: target.x + target.width - size.width, y: below },
        { x: target.x, y: below },
        { x: target.x + target.width - size.width, y: above },
        { x: target.x, y: above },
      ].map((p) => ({ ...p, ...size }));
      const clean = spots.find((b) => onScreen(b) && !taken.some((t) => overlaps(b, t)) && !busy(b));
      if (clean) return clean;
    }
    return null;
  };

  /** The line from a note to its target: from the edge of one to the edge of the other. */
  const leader = (target: Rect, note: Box, colour: string): string => {
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const nx = clamp(target.x + target.width / 2, note.x, note.x + note.width);
    const ny = clamp(target.y + target.height / 2, note.y, note.y + note.height);
    const tx = clamp(nx, target.x, target.x + target.width);
    const ty = clamp(ny, target.y, target.y + target.height);
    if (Math.hypot(nx - tx, ny - ty) < GAP + 2) return '';
    return `<line x1="${nx}" y1="${ny}" x2="${tx}" y2="${ty}" stroke="${colour}" stroke-width="3" stroke-linecap="round"/><circle cx="${tx}" cy="${ty}" r="5" fill="${colour}"/>`;
  };

  const draw = (replace: boolean) => {
    const r = ensure();
    const notes = r.getElementById('notes')!;
    const dims = r.getElementById('dims')!;
    const lines = r.getElementById('lines')!;
    // The spoken sentence sits at the bottom, or at the top when the lit step is near the bottom.
    const litRect = lit && pageMap.liveRect(lit.targetId);
    const atTop = !!litRect && litRect.y + litRect.height > window.innerHeight - 190;
    r.getElementById('said')!.innerHTML = said
      ? `<div class="said" style="${atTop ? 'bottom:auto;top:16px' : ''}"><small>Steady says (stand-in for the voice)</small>${escape(said)}</div>`
      : '';

    const items: Array<OverlayLabel & { ring: boolean }> = [...layers.values()].flat().map((l) => ({ ...l, ring: false }));
    if (lit) items.unshift({ targetId: lit.targetId, text: lit.text ?? '', tone: 'info', ring: true });

    dims.innerHTML = '';
    notes.innerHTML = '';
    let drawnLines = '';
    const taken: Box[] = [];
    const caption = r.querySelector('.said')?.getBoundingClientRect();
    if (caption) taken.push({ x: caption.left, y: caption.top, width: caption.width, height: caption.height });
    // Never put a note on top of another button or box.
    for (const el of pageMap.get({ visibleOnly: true }).elements) taken.push(el.rect);

    for (const item of items) {
      const target = pageMap.liveRect(item.targetId);
      if (!target || target.y + target.height < 0 || target.y > window.innerHeight) continue;
      if (item.ring) {
        const pad = 6;
        const hole = { x: target.x - pad, y: target.y - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
        const panes = [
          [0, 0, window.innerWidth, Math.max(0, hole.y)],
          [0, hole.y + hole.height, window.innerWidth, Math.max(0, window.innerHeight - hole.y - hole.height)],
          [0, hole.y, Math.max(0, hole.x), hole.height],
          [hole.x + hole.width, hole.y, Math.max(0, window.innerWidth - hole.x - hole.width), hole.height],
        ];
        dims.innerHTML =
          panes.map(([x, y, w, h]) => `<div class="dim" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`).join('') +
          `<div class="ring" style="left:${hole.x}px;top:${hole.y}px;width:${hole.width}px;height:${hole.height}px;border-color:#ffd24a"></div>`;
      }
      if (!item.text) continue;
      const note = document.createElement('div');
      note.className = 'note';
      note.style.borderColor = TONE[item.tone];
      note.textContent = item.text;
      note.style.visibility = 'hidden';
      notes.appendChild(note);
      const size = { width: note.offsetWidth, height: note.offsetHeight };
      const key = `${item.ring ? 'lit' : 'note'}:${item.targetId}`;
      const kept = offsets.get(key);
      const spot = !replace && kept ? { x: target.x + kept.dx, y: target.y + kept.dy, ...size } : place(target, size, taken);
      if (!spot || spot.y < 0 || spot.y + size.height > window.innerHeight) {
        note.remove(); // no room that covers nothing: better no note than a note on top of the page
        continue;
      }
      drawnLines += leader(target, spot, TONE[item.tone]);
      offsets.set(key, { dx: spot.x - target.x, dy: spot.y - target.y });
      taken.push(spot);
      note.style.left = `${Math.round(spot.x)}px`;
      note.style.top = `${Math.round(spot.y)}px`;
      note.style.visibility = 'visible';
    }
    lines.innerHTML = drawnLines;
  };

  const redraw = (replace: boolean) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw(replace));
  };
  // While the page moves, notes ride along with their targets. When it settles, find the best places again.
  const onMove = () => {
    redraw(false);
    window.clearTimeout(settle);
    settle = window.setTimeout(() => redraw(true), 160);
  };
  const stopWatching = pageMap.onChange((why) => why !== 'marks' && root && redraw(true));

  return {
    overlay: {
      labels(layer, labels) {
        layers.set(layer, labels);
        redraw(true);
      },
      spotlight(target) {
        lit = target;
        redraw(true);
      },
      clear(layer) {
        if (layer) layers.delete(layer);
        else {
          layers.clear();
          lit = null;
        }
        redraw(true);
      },
    },
    speech: {
      say(text) {
        said = text;
        redraw(false);
      },
    },
    stop() {
      stopWatching();
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      host?.remove();
    },
  };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
