// Marks on buttons: "fake" (B) and "current-step" (C). C keeps the list.
// A checks it, through mayAutoClick, before every steadied or dwell click.

import type { Mark, MarkKind } from '@/shared/pagemap';

const marks = new WeakMap<Element, Map<MarkKind, Mark>>();
const marked = new Set<WeakRef<Element>>();

export function addMark(el: Element, kind: MarkKind, reason: string): void {
  let mine = marks.get(el);
  if (!mine) {
    mine = new Map();
    marks.set(el, mine);
    marked.add(new WeakRef(el));
  }
  mine.set(kind, { kind, reason });
}

export function removeMark(el: Element, kind: MarkKind): void {
  marks.get(el)?.delete(kind);
}

export function clearAllMarks(kind?: MarkKind): void {
  for (const ref of marked) {
    const el = ref.deref();
    if (!el) {
      marked.delete(ref);
      continue;
    }
    if (kind) marks.get(el)?.delete(kind);
    else marks.delete(el);
  }
  if (!kind) marked.clear();
}

export function marksOf(el: Element): Mark[] {
  const mine = marks.get(el);
  return mine ? [...mine.values()] : [];
}

/** A mark on a button also covers everything inside it, and a mark on a frame covers the frame. */
export function markNear(el: Element, kind: MarkKind): Mark | undefined {
  let at: Element | null = el;
  let hops = 0;
  while (at && hops++ < 12) {
    const hit = marks.get(at)?.get(kind);
    if (hit) return hit;
    at = at.parentElement;
  }
  return undefined;
}
