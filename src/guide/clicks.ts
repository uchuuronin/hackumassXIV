// Clicks, for the recorder. A passive listener: it only watches, and never cancels or changes a click.
//
// It deliberately does NOT look at isTrusted. A's click steadying cancels a click that just missed
// a button and fires it again on the button, and that second click is not "trusted". It is still
// what the person meant, so the recorder must hear it. The cancelled first click never gets here
// with a button as its target, so nothing is counted twice.
//
// A can replace this at any time with provide('clicks', …) from the hands lane.

import type { ClickPort } from '@/shared/ports';

export function createClickSource(doc: Document = document): ClickPort & { stop(): void } {
  const listeners = new Set<(target: Element) => void>();
  const onClick = (e: MouseEvent) => {
    if (e.target instanceof Element) for (const listener of listeners) listener(e.target);
  };
  doc.addEventListener('click', onClick, true);
  return {
    onClick(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      doc.removeEventListener('click', onClick, true);
      listeners.clear();
    },
  };
}
