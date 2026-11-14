// The click feed. Owner: A. Only A listens to raw clicks; everyone else subscribes through this port.
//   provide('clicks', bus.port)   (done in startHands)
//   need('clicks').onClick((target) => ...)   a click the person made, with what it landed on. A click that
//                                             was steered to a button reports that button.
//   need('clicks').onMiss?.((at) => ...)      a click that landed on nothing and was not steered.

import type { ClickPort } from '@/shared/ports';
import type { Point } from './filter/pointerFilter';

export interface ClickBus {
  port: Required<ClickPort>;
  emitClick(target: Element): void;
  emitMiss(at: Point): void;
}

export function createClickBus(): ClickBus {
  const clicks = new Set<(target: Element) => void>();
  const misses = new Set<(at: Point) => void>();
  return {
    port: {
      onClick(listener) {
        clicks.add(listener);
        return () => clicks.delete(listener);
      },
      onMiss(listener) {
        misses.add(listener);
        return () => misses.delete(listener);
      },
    },
    emitClick(target) {
      for (const listener of [...clicks]) listener(target);
    },
    emitMiss(at) {
      for (const listener of [...misses]) listener(at);
    },
  };
}
