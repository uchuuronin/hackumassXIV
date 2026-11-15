// Many sites swap content in place without reloading. This tells the rest of Milo,
// a few times a second at most, that the map is out of date. It never slows the page:
// the observer only sets a flag, and the map is rebuilt when somebody next asks for it.

import { STEADY_UI_ATTR, type PageChange } from '@/shared/pagemap';

const QUIET_MS = 250; // wait for the page to settle
const MAX_WAIT_MS = 1200; // but never keep listeners waiting longer than this

type Listener = (why: PageChange) => void;

export class PageWatcher {
  private listeners = new Set<Listener>();
  private observer: MutationObserver | null = null;
  private quietTimer: number | undefined;
  private firstAt = 0;
  private pending: PageChange | null = null;
  private lastUrl = '';
  /** Goes up every time the page changes. The map cache is keyed on it. */
  generation = 0;

  constructor(private doc: Document) {}

  start(): void {
    if (this.observer || !this.doc.documentElement) return;
    this.lastUrl = this.doc.location?.href ?? '';
    this.observer = new MutationObserver((records) => {
      if (records.every((r) => isOurs(r.target))) return;
      this.generation++;
      this.queue('content');
    });
    this.observer.observe(this.doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'disabled', 'open', 'aria-hidden', 'aria-expanded', 'aria-modal', 'aria-label', 'href', 'type', 'value', 'checked', 'inert', 'class', 'style'],
    });
    const win = this.doc.defaultView;
    win?.addEventListener('popstate', this.onAddress);
    win?.addEventListener('hashchange', this.onAddress);
    win?.addEventListener('resize', this.onResize);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    const win = this.doc.defaultView;
    win?.removeEventListener('popstate', this.onAddress);
    win?.removeEventListener('hashchange', this.onAddress);
    win?.removeEventListener('resize', this.onResize);
    win?.clearTimeout(this.quietTimer);
    this.listeners.clear();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** For changes Milo makes itself, such as a new mark. */
  bump(why: PageChange): void {
    this.generation++;
    this.queue(why);
  }

  private onAddress = () => {
    this.generation++;
    this.queue('address');
  };

  private onResize = () => {
    this.generation++;
    this.queue('content');
  };

  private queue(why: PageChange): void {
    const win = this.doc.defaultView;
    if (!win) return;
    const now = Date.now();
    if (!this.pending) this.firstAt = now;
    // "address" outranks "content": listeners need to know the person moved on.
    if (this.pending !== 'address') this.pending = why === 'marks' && this.pending ? this.pending : why;
    win.clearTimeout(this.quietTimer);
    const wait = Math.max(0, Math.min(QUIET_MS, this.firstAt + MAX_WAIT_MS - now));
    this.quietTimer = win.setTimeout(() => this.flush(), wait);
  }

  private flush(): void {
    let why = this.pending ?? 'content';
    this.pending = null;
    // Sites that change the address with pushState fire no event we can hear, so compare.
    const url = this.doc.location?.href ?? '';
    if (url !== this.lastUrl) {
      this.lastUrl = url;
      why = 'address';
    }
    for (const listener of this.listeners) {
      try {
        listener(why);
      } catch (err) {
        console.error('[Milo] page-change listener failed', err);
      }
    }
  }
}

function isOurs(node: Node): boolean {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return !!el?.closest?.(`[${STEADY_UI_ATTR}]`);
}
