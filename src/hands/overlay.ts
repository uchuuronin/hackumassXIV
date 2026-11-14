// The overlay (foundation piece). Owner: A.
// Draws boxes and labels in a shadow DOM on top of the page. Never changes the page itself.
// Clicks pass straight through. Nothing animates, so nothing needs a reduced-motion rule yet.
// Step 1 is a plain box and label. Pointer, spotlight, cards and arrows are added to this file.

import { STEADY_UI_ATTR, type Rect } from '@/shared/pagemap';
import type { CursorPoints, Overlay, OverlayItem, OverlayTone } from '@/shared/overlay';

const COLOURS: Record<OverlayTone, { line: string; fill: string; text: string }> = {
  info: { line: '#1d4ed8', fill: '#1d4ed8', text: '#ffffff' },
  step: { line: '#15803d', fill: '#15803d', text: '#ffffff' },
  warning: { line: '#b45309', fill: '#b45309', text: '#ffffff' },
};

const CSS = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
  .box { position: fixed; left: 0; top: 0; box-sizing: border-box; border: 4px solid; border-radius: 10px; }
  .raw { position: fixed; left: 0; top: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #dc2626; }
  .ring { position: fixed; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; box-sizing: border-box; border-radius: 50%; border: 5px solid #1d4ed8; background: rgba(29, 78, 216, 0.15); }
  .label {
    position: fixed; left: 0; top: 0; max-width: 320px; padding: 8px 12px; border-radius: 8px;
    font: 600 18px/1.35 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
`;

interface Live {
  item: OverlayItem;
  box: HTMLDivElement;
  label?: HTMLDivElement;
  labelSize?: { w: number; h: number };
  /** Where the label was last placed, so later labels keep clear of it. */
  at?: Rect;
  last?: string;
}

const GAP = 8;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Try below, above, right, left. Take the first spot that is on screen and clear of other labels. */
function placeLabel(target: Rect, size: { w: number; h: number }, taken: Rect[]): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = Math.min(Math.max(target.x + target.width / 2 - size.w / 2, GAP), Math.max(vw - size.w - GAP, GAP));
  const cy = Math.min(Math.max(target.y + target.height / 2 - size.h / 2, GAP), Math.max(vh - size.h - GAP, GAP));
  const below: Rect = { x: cx, y: target.y + target.height + GAP, width: size.w, height: size.h };
  const spots: Rect[] = [
    below,
    { x: cx, y: target.y - size.h - GAP, width: size.w, height: size.h },
    { x: target.x + target.width + GAP, y: cy, width: size.w, height: size.h },
    { x: target.x - size.w - GAP, y: cy, width: size.w, height: size.h },
  ];
  const fits = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.width <= vw && r.y + r.height <= vh;
  return spots.find((r) => fits(r) && !taken.some((t) => overlaps(r, t))) ?? spots.find(fits) ?? below;
}

export function createOverlay(doc: Document = document): Overlay & { destroy(): void } {
  const host = doc.createElement('div');
  host.setAttribute(STEADY_UI_ATTR, '');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const layer = doc.createElement('div');
  layer.className = 'layer';
  root.append(style, layer);
  doc.documentElement.append(host);

  const items = new Map<string, Live>();
  let frame = 0;

  const rectOf = (item: OverlayItem): Rect | null => (typeof item.where === 'function' ? item.where() : item.where);

  function tick() {
    frame = 0;
    const taken: Rect[] = [];
    for (const live of items.values()) {
      const rect = rectOf(live.item);
      const hidden = !rect || rect.width <= 0 || rect.height <= 0;
      live.box.style.display = hidden || live.item.box === false ? 'none' : '';
      if (live.label) live.label.style.display = hidden ? 'none' : '';
      if (hidden || !rect) continue;
      // Write only when something moved, so a still page costs almost nothing.
      const key = `${rect.x}|${rect.y}|${rect.width}|${rect.height}|${window.innerWidth}|${window.innerHeight}`;
      if (key !== live.last) {
        live.last = key;
        live.box.style.transform = `translate(${rect.x - 4}px, ${rect.y - 4}px)`;
        live.box.style.width = `${rect.width + 8}px`;
        live.box.style.height = `${rect.height + 8}px`;
        if (live.label && live.labelSize) {
          live.at = placeLabel(rect, live.labelSize, taken);
          live.label.style.transform = `translate(${live.at.x}px, ${live.at.y}px)`;
        }
      }
      // Remember where this label sits so the next one keeps clear of it.
      if (live.at) taken.push(live.at);
    }
    if (items.size > 0) frame = requestAnimationFrame(tick);
  }
  const wake = () => {
    if (!frame && items.size > 0) frame = requestAnimationFrame(tick);
  };

  function drop(live: Live) {
    live.box.remove();
    live.label?.remove();
  }

  const rawDot = doc.createElement('div');
  rawDot.className = 'raw';
  rawDot.style.display = 'none';
  const ring = doc.createElement('div');
  ring.className = 'ring';
  ring.style.display = 'none';
  layer.append(rawDot, ring);
  const place = (el: HTMLElement, p: { x: number; y: number } | null | undefined) => {
    if (p === undefined) return;
    el.style.display = p ? '' : 'none';
    if (p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };

  return {
    setCursor(points: CursorPoints) {
      place(rawDot, points.raw);
      place(ring, points.steady);
    },
    show(item) {
      const old = items.get(item.id);
      if (old) drop(old);
      const tone = COLOURS[item.tone ?? 'info'];
      const box = doc.createElement('div');
      box.className = 'box';
      box.style.borderColor = tone.line;
      layer.append(box);
      const live: Live = { item, box };
      if (item.label) {
        const label = doc.createElement('div');
        label.className = 'label';
        label.style.background = tone.fill;
        label.style.color = tone.text;
        label.textContent = item.label;
        layer.append(label);
        const size = label.getBoundingClientRect();
        live.label = label;
        live.labelSize = { w: Math.ceil(size.width), h: Math.ceil(size.height) };
      }
      items.set(item.id, live);
      wake();
    },
    hide(id) {
      const live = items.get(id);
      if (!live) return;
      drop(live);
      items.delete(id);
    },
    clear() {
      for (const live of items.values()) drop(live);
      items.clear();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      items.clear();
      host.remove();
    },
  };
}