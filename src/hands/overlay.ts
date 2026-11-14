// The overlay (foundation piece). Owner: A.
// Draws boxes and labels in a shadow DOM on top of the page. Never changes the page itself.
// Clicks pass straight through. Nothing animates, so nothing needs a reduced-motion rule yet.
// Boxes, labels (placed in empty space, with a thin line back to the target when they sit further out),
// the steadied cursor, the dwell ring and the spotlight (dims everything except one box).

import { gentleCss, theme } from '@/shared/theme';
import { STEADY_UI_ATTR, type Rect } from '@/shared/pagemap';
import type { CursorPoints, Overlay, OverlayItem, OverlayTone } from '@/shared/overlay';
import { layoutLabels, leaderLine, type LabelRequest } from './layout';
import type { Obstacles } from './obstacles';

export interface OverlayOptions {
  /** What labels must keep clear of. Left out, labels only avoid each other and the targets. */
  obstacles?: () => Obstacles;
}

// The calm look, shared by all three lanes (src/shared/theme.ts): a pale note with dark words,
// and the tone shown as a quiet edge and ring instead of a bright filled box.
const COLOURS: Record<OverlayTone, { line: string; fill: string; text: string }> = {
  info: { line: theme.tones.info.line, fill: theme.tones.info.soft, text: theme.ink },
  step: { line: theme.tones.go.line, fill: theme.tones.go.soft, text: theme.ink },
  warning: { line: theme.tones.careful.line, fill: theme.tones.careful.soft, text: theme.ink },
};

const CSS = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
  .box { position: fixed; left: 0; top: 0; box-sizing: border-box; border: 3px solid; border-radius: ${theme.radius}px; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.8); }
  .raw { position: fixed; left: 0; top: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: ${theme.tones.careful.line}; }
  .ring { position: fixed; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; box-sizing: border-box; border-radius: 50%; border: 4px solid ${theme.main}; background: rgba(44, 100, 85, 0.12); }
  .dwell { position: fixed; left: 0; top: 0; width: 56px; height: 56px; margin: -28px 0 0 -28px; }
  .spot { position: fixed; left: 0; top: 0; border-radius: 12px; box-shadow: 0 0 0 200vmax ${theme.veil}; }
  .lines { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; overflow: visible; }
  .label {
    position: fixed; left: 0; top: 0; max-width: 320px; padding: 10px 14px; border-radius: ${theme.radius}px;
    border: 1px solid ${theme.hairline}; border-left: 6px solid;
    font: 500 18px/1.4 ${theme.font};
    box-shadow: ${theme.shadow};
  }
  ${gentleCss}
`;

interface Live {
  item: OverlayItem;
  box: HTMLDivElement;
  label?: HTMLDivElement;
  leader?: SVGGElement;
  labelSize?: { w: number; h: number };
  /** Where the label sits now. */
  at?: Rect;
  /** Where the target is now. */
  rect?: Rect;
  last?: string;
}

const SPOT_PAD = 6;

export function createOverlay(doc: Document = document, options: OverlayOptions = {}): Overlay & { destroy(): void } {
  const host = doc.createElement('div');
  host.setAttribute(STEADY_UI_ATTR, '');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const layer = doc.createElement('div');
  layer.className = 'layer';
  root.append(style, layer);
  doc.documentElement.append(host);

  // Bottom to top: the dimming, the lines from far-off labels to their targets, then boxes and labels.
  const spot = doc.createElement('div');
  spot.className = 'spot';
  spot.style.display = 'none';
  const SVG = 'http://www.w3.org/2000/svg';
  const lines = doc.createElementNS(SVG, 'svg');
  lines.setAttribute('class', 'lines');
  layer.append(spot, lines);
  let spotWhere: Rect | (() => Rect | null) | null = null;
  let obstacleVersion = -1;
  let dirty = false;

  const items = new Map<string, Live>();
  let frame = 0;

  const rectOf = (item: OverlayItem): Rect | null => (typeof item.where === 'function' ? item.where() : item.where);

  function tick() {
    frame = 0;
    let changed = dirty;
    dirty = false;
    const requests: LabelRequest[] = [];
    for (const live of items.values()) {
      const rect = rectOf(live.item);
      const hidden = !rect || rect.width <= 0 || rect.height <= 0;
      live.box.style.display = hidden || live.item.box === false ? 'none' : '';
      if (live.label) live.label.style.display = hidden ? 'none' : '';
      if (live.leader) live.leader.style.display = hidden ? 'none' : '';
      if (hidden || !rect) {
        live.rect = undefined;
        continue;
      }
      live.rect = rect;
      // Write only when something moved, so a still page costs almost nothing.
      const key = `${rect.x}|${rect.y}|${rect.width}|${rect.height}|${window.innerWidth}|${window.innerHeight}`;
      if (key !== live.last) {
        live.last = key;
        changed = true;
        live.box.style.transform = `translate(${rect.x - 4}px, ${rect.y - 4}px)`;
        live.box.style.width = `${rect.width + 8}px`;
        live.box.style.height = `${rect.height + 8}px`;
      }
      if (live.label) {
        // Measure now, not only when it was made: the first measure can be too early (styles, fonts, display).
        const size = live.label.getBoundingClientRect();
        if (size.width > 0 && size.height > 0) {
          const next = { w: Math.ceil(size.width), h: Math.ceil(size.height) };
          if (!live.labelSize || live.labelSize.w !== next.w || live.labelSize.h !== next.h) changed = true;
          live.labelSize = next;
        }
      }
      if (live.label && live.labelSize) {
        requests.push({ id: live.item.id, target: rect, width: live.labelSize.w, height: live.labelSize.h, previous: live.at });
      }
    }

    const obstacles = options.obstacles?.();
    if (obstacles && obstacles.version !== obstacleVersion) {
      obstacleVersion = obstacles.version;
      changed = true;
    }
    if (changed && requests.length) {
      const places = layoutLabels(requests, obstacles?.rects ?? [], { width: window.innerWidth, height: window.innerHeight });
      for (const live of items.values()) {
        const at = places.get(live.item.id);
        if (!at || !live.label || !live.rect) continue;
        live.at = at;
        live.label.style.transform = `translate(${at.x}px, ${at.y}px)`;
        if (live.leader) {
          const line = leaderLine(live.rect, at);
          const [stem, dot] = [live.leader.firstElementChild, live.leader.lastElementChild];
          live.leader.style.display = line ? '' : 'none';
          if (line && stem && dot) {
            stem.setAttribute('x1', String(line.from.x));
            stem.setAttribute('y1', String(line.from.y));
            stem.setAttribute('x2', String(line.to.x));
            stem.setAttribute('y2', String(line.to.y));
            dot.setAttribute('cx', String(line.to.x));
            dot.setAttribute('cy', String(line.to.y));
          }
        }
      }
    }

    if (spotWhere) {
      const r = typeof spotWhere === 'function' ? spotWhere() : spotWhere;
      if (r && r.width > 0 && r.height > 0) {
        spot.style.display = '';
        spot.style.transform = `translate(${r.x - SPOT_PAD}px, ${r.y - SPOT_PAD}px)`;
        spot.style.width = `${r.width + SPOT_PAD * 2}px`;
        spot.style.height = `${r.height + SPOT_PAD * 2}px`;
      } else {
        spot.style.display = 'none';
      }
    }
    if (items.size > 0 || spotWhere) frame = requestAnimationFrame(tick);
  }
  const wake = () => {
    dirty = true;
    if (!frame && (items.size > 0 || spotWhere)) frame = requestAnimationFrame(tick);
  };

  function drop(live: Live) {
    live.box.remove();
    live.label?.remove();
    live.leader?.remove();
    dirty = true;
  }

  const rawDot = doc.createElement('div');
  rawDot.className = 'raw';
  rawDot.style.display = 'none';
  const ring = doc.createElement('div');
  ring.className = 'ring';
  ring.style.display = 'none';
  layer.append(rawDot, ring);
  const RADIUS = 22;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dwell = doc.createElementNS(SVG, 'svg');
  dwell.setAttribute('class', 'dwell');
  dwell.setAttribute('viewBox', '0 0 56 56');
  dwell.style.display = 'none';
  const ringPart = (stroke: string, width: number) => {
    const c = doc.createElementNS(SVG, 'circle');
    c.setAttribute('cx', '28');
    c.setAttribute('cy', '28');
    c.setAttribute('r', String(RADIUS));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', String(width));
    return c;
  };
  const track = ringPart('rgba(255,255,255,0.9)', 9);
  const bar = ringPart(theme.main, 6);
  bar.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
  bar.setAttribute('transform', 'rotate(-90 28 28)');
  dwell.append(track, bar);
  layer.append(dwell);

  const place = (el: HTMLElement, p: { x: number; y: number } | null | undefined) => {
    if (p === undefined) return;
    el.style.display = p ? '' : 'none';
    if (p) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };

  return {
    setDwell(progress, at) {
      if (progress === null || !at) {
        dwell.style.display = 'none';
        return;
      }
      dwell.style.display = '';
      dwell.style.transform = `translate(${at.x}px, ${at.y}px)`;
      bar.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)))));
    },
    setSpotlight(where) {
      spotWhere = where;
      if (!where) {
        spot.style.display = 'none';
        return;
      }
      wake();
    },
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
        label.className = 'label steady-appear';
        label.style.background = tone.fill;
        label.style.color = tone.text;
        label.style.borderLeftColor = tone.line;
        label.textContent = item.label;
        layer.append(label);
        const size = label.getBoundingClientRect();
        const leader = doc.createElementNS(SVG, 'g');
        const stem = doc.createElementNS(SVG, 'line');
        stem.setAttribute('stroke', tone.line);
        stem.setAttribute('stroke-width', '2');
        stem.setAttribute('stroke-linecap', 'round');
        const dot = doc.createElementNS(SVG, 'circle');
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', tone.line);
        leader.append(stem, dot);
        leader.style.display = 'none';
        lines.append(leader);
        live.leader = leader;
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