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
          up.delete(SPOTLIGHT);
        }
        return;
      }
      // A's overlay draws a box and a label today. When it gains dimming, this is the call to change.
      getOverlay().show({ id: SPOTLIGHT, where: () => pageMap.liveRect(target.targetId), label: target.text, tone: 'step' });
      up.set(SPOTLIGHT, [SPOTLIGHT]);
    },
    clear(layer) {
      if (layer) return takeDown(layer);
      for (const key of [...up.keys()]) takeDown(key);
    },
  };
}
