// Big Pick: when a small control is pressed (a dropdown, a date field, a slider, a number box), show its
// choices as large buttons instead. Owner: A.
// Only plain browser controls are taken over. A site's own drop-downs made from buttons and lists are left alone.

import type { LaneContext } from '@/shared/lanes';
import { STEADY_UI_ATTR, type PageMapApi } from '@/shared/pagemap';
import { pickDate, pickFromList, pickNumber } from './panel';

export interface BigPick {
  enabled(): boolean;
  setEnabled(on: boolean): void;
  /** Open it for a control, whether Big Pick is on or not. Resolves when the person has chosen or cancelled. */
  openFor(el: Element): Promise<boolean>;
}

type Kind = 'list' | 'date' | 'number' | null;

function kindOf(el: Element): Kind {
  if (el instanceof HTMLSelectElement) return el.multiple || el.size > 1 || el.disabled ? null : 'list';
  if (el instanceof HTMLInputElement && !el.disabled && !el.readOnly) {
    if (el.type === 'date') return 'date';
    if (el.type === 'number' || el.type === 'range') return 'number';
  }
  return null;
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  if (el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  } else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function startBigPick(ctx: LaneContext, pageMap: PageMapApi): BigPick {
  let on = false;
  let busy = false;

  const titleOf = (el: Element): string => {
    const info = pageMap.describe(el);
    const label = info?.label || el.getAttribute('aria-label') || (el as HTMLInputElement).name || 'Choose';
    return info?.group ? `${info.group}: ${label}` : label;
  };

  const openFor = async (el: Element): Promise<boolean> => {
    const kind = kindOf(el);
    if (!kind || busy) return false;
    busy = true;
    try {
      const title = titleOf(el);
      if (kind === 'list' && el instanceof HTMLSelectElement) {
        const choices = [...el.options]
          .filter((o) => o.value !== '' && !o.hidden)
          .map((o) => ({ value: o.value, label: o.text.trim() || o.value, disabled: o.disabled, selected: o.selected }));
        if (!choices.length) return false;
        const picked = await pickFromList(document, title, choices);
        if (picked !== null) setValue(el, picked);
      } else if (kind === 'date' && el instanceof HTMLInputElement) {
        const picked = await pickDate(document, title, el.value, el.min || undefined, el.max || undefined);
        if (picked !== null) setValue(el, picked);
      } else if (kind === 'number' && el instanceof HTMLInputElement) {
        const num = (v: string, fallback?: number) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);
        const step = num(el.step, 1) ?? 1;
        const picked = await pickNumber(document, title, num(el.value, num(el.min, 0)) ?? 0, step, num(el.min), num(el.max ?? '') ?? num(el.max));
        if (picked !== null) setValue(el, String(picked));
      }
      (el as HTMLElement).focus({ preventScroll: true });
      return true;
    } finally {
      busy = false;
    }
  };

  const taken = (event: Event): Element | null => {
    if (!on || !event.isTrusted || !(event.target instanceof Element)) return null;
    if (event.target.closest(`[${STEADY_UI_ATTR}]`)) return null;
    return kindOf(event.target) ? event.target : null;
  };
  // The browser's own tiny menu opens on the press, so the press is what is stopped.
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const el = taken(event);
    if (!el) return;
    event.preventDefault();
    void openFor(el);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== ' ' && event.key !== 'Enter' && !(event.altKey && event.key === 'ArrowDown')) return;
    const el = taken(event);
    if (!el || !(el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === 'date'))) return;
    if (event.key === 'Enter' && el instanceof HTMLSelectElement) return; // Enter on a dropdown submits a form; leave it
    event.preventDefault();
    void openFor(el);
  };
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  ctx.onStop(() => {
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
  });

  return {
    enabled: () => on,
    setEnabled: (next) => {
      on = next;
    },
    openFor,
  };
}
