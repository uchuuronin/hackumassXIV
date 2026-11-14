// Putting a value in a box the way typing would, so the website notices, and taking it out again.
// This is the only place in the guide lane that changes a page.

import { matchOption } from './values';

export type Undo = () => void;

function announce(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Returns a function that puts the box back as it was, or null if the value could not be written. */
export function writeValue(el: Element, value: string): Undo | null {
  if (el instanceof HTMLSelectElement) {
    const option = matchOption(el, value);
    if (!option) return null;
    const before = el.selectedIndex;
    el.selectedIndex = option.index;
    announce(el);
    return () => {
      el.selectedIndex = before;
      announce(el);
    };
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly || el.disabled) return null;
    // Sites built with React only notice a change made through the browser's own setter.
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const before = el.value;
    const put = (v: string) => {
      if (set) set.call(el, v);
      else el.value = v;
      announce(el);
    };
    put(value);
    return () => put(before);
  }
  return null;
}
