// Joins the guide lane to A's overlay. The guide lane speaks in "labels" and "spotlight";
// A's overlay speaks in items with a `where`. This is the only place that knows both.
// Wired up in src/entrypoints/content.ts, so the guide and hands lanes don't import each other.

import type { Overlay, OverlayTone } from '@/shared/overlay';
import type { LabelTone, OverlayPort } from '@/shared/ports';
import { pageMap } from './map';

const TONES: Record<LabelTone, OverlayTone> = {
  go: 'step', // green: this is the way forward
  careful: 'warning', // amber: pays, sends or removes
  stop: 'warning',
  info: 'info',
};
const SPOTLIGHT = 'guide:spotlight';

export function adaptOverlay(getOverlay: () => Overlay): OverlayPort {
  /** What this lane has on screen, by layer, so it only ever takes down its own items. */
  const up = new Map<string, string[]>();

  const takeDown = (layer: string) => {
    for (const id of up.get(layer) ?? []) getOverlay().hide(id);
    up.delete(layer);
  };

  return {
    labels(layer, labels) {
      takeDown(layer);
      const ids: string[] = [];
      for (const label of labels) {
        const id = `guide:${layer}:${label.targetId}`;
        getOverlay().show({ id, where: () => pageMap.liveRect(label.targetId), label: label.text, tone: TONES[label.tone] });
        ids.push(id);
      }
      if (ids.length) up.set(layer, ids);
    },
    spotlight(target) {
      if (!target) {
        if (up.has(SPOTLIGHT)) {
          getOverlay().hide(SPOTLIGHT);
          getOverlay().setSpotlight?.(null);
          up.delete(SPOTLIGHT);
        }
        return;
      }
      // One element, or the whole set of options under one question.
      const ids = target.group?.length ? target.group : [target.targetId];
      const where = () => {
        const rects = ids.map((id) => pageMap.liveRect(id)).filter((r): r is NonNullable<typeof r> => !!r);
        if (rects.length <= 1) return rects[0] ?? null;
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
      };
      getOverlay().show({ id: SPOTLIGHT, where, label: target.text, tone: 'step' });
      // Dim the rest of the page, unless the step asked for a ring only.
      getOverlay().setSpotlight?.(target.dim === false ? null : where);
      up.set(SPOTLIGHT, [SPOTLIGHT]);
    },
    clear(layer) {
      if (layer) return takeDown(layer);
      for (const key of [...up.keys()]) takeDown(key);
    },
  };
}
