// Two tools the helper can use to act on the page: click and fill. Owner: A.
// Registered in startHands with B's registerTool. Both take a page-map id (from the model-safe map).
//
// Safety, the plan's limits:
//   click: only what mayAutoClick allows. Never pay, delete, submit, a fake button, a disabled one.
//   fill:  never a secret field (password, card, ID number, one-time code, date of birth), a disabled or
//          read-only field, a file chooser, or anything inside another site's frame.

import { fullLabel, type PageElement, type PageMapApi } from '@/shared/pagemap';
import type { Tool, ToolResult } from '@/shared/tools';
import type { ClickBus } from './clicks';

const GONE: ToolResult = { ok: false, said: 'I can no longer find that on the page. It may have changed.' };

const TEXT_KINDS = new Set(['text', 'email', 'tel', 'search', 'number', 'textarea', 'date', 'time']);

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Pages built with React and similar only notice a value set through the browser's own setter.
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function yes(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['true', 'yes', 'on', 'checked', '1'].includes(v)) return true;
  if (['false', 'no', 'off', 'unchecked', '0'].includes(v)) return false;
  return null;
}

/** Why Steady must not fill this field, in plain words, or null if it may. */
export function whyNotFill(info: PageElement | null, el: Element): string | null {
  if (!info) return 'I can only fill boxes I can read on the page.';
  if (info.secret) return 'That box is for private details, so you need to type it yourself.';
  if (info.disabled || (el as HTMLInputElement).readOnly) return 'That box can not be changed right now.';
  if (!info.visible) return 'That box is hidden.';
  if (info.kind === 'file') return 'I can not choose files for you.';
  if (info.kind === 'password') return 'That box is for private details, so you need to type it yourself.';
  return null;
}

export function createHandsTools(pageMap: PageMapApi, bus?: ClickBus): Tool[] {
  let lastFill: { el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; before: string } | undefined;

  const click: Tool = {
    name: 'click',
    owner: 'hands',
    description: 'Click a button, link, checkbox or option on the page. Never pays, deletes or sends: those need the person to press.',
    parameters: { id: { type: 'string', description: 'The page-map id of what to click.', required: true } },
    async run(args) {
      const el = pageMap.elementFor(String(args.id ?? ''));
      if (!(el instanceof HTMLElement)) return GONE;
      const info = pageMap.describe(el);
      const name = info ? fullLabel(info) : 'that';
      const verdict = pageMap.mayAutoClick(el);
      if (!verdict.allowed) return { ok: false, said: verdict.reason ?? `"${name}" needs a real press from you.` };
      el.click();
      bus?.emitClick(el);
      return { ok: true, said: `Pressed "${name}".` };
    },
  };

  const fill: Tool = {
    name: 'fill',
    owner: 'hands',
    description: 'Type into a box, choose from a dropdown, or tick or untick a checkbox. Never fills private boxes such as passwords or card numbers.',
    parameters: {
      id: { type: 'string', description: 'The page-map id of the box.', required: true },
      value: { type: 'string', description: 'What to put in. For a dropdown, the option as written. For a checkbox, "yes" or "no".', required: true },
    },
    async run(args) {
      const el = pageMap.elementFor(String(args.id ?? ''));
      if (!el) return GONE;
      const info = pageMap.describe(el);
      const refused = whyNotFill(info, el);
      if (refused) return { ok: false, said: refused };
      const name = info ? fullLabel(info) : 'that box';
      const value = String(args.value ?? '');

      if (el instanceof HTMLSelectElement) {
        const want = value.trim().toLowerCase();
        const option = [...el.options].find((o) => !o.disabled && (o.value.toLowerCase() === want || o.text.trim().toLowerCase() === want));
        if (!option) return { ok: false, said: `"${value}" is not one of the choices for "${name}".` };
        lastFill = { el, before: el.value };
        el.value = option.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, said: `Chose "${option.text.trim()}" for "${name}".` };
      }
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const want = el.type === 'radio' ? true : yes(value);
        if (want === null) return { ok: false, said: `Say "yes" or "no" for "${name}".` };
        if (el.checked !== want) el.click();
        bus?.emitClick(el);
        return { ok: true, said: want ? `Ticked "${name}".` : `Unticked "${name}".` };
      }
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && info && TEXT_KINDS.has(info.kind)) {
        lastFill = { el, before: el.value };
        setNativeValue(el, value);
        return { ok: true, said: `Typed that into "${name}".` };
      }
      return { ok: false, said: `I can not fill "${name}".` };
    },
    async undo() {
      if (!lastFill) return;
      const { el, before } = lastFill;
      if (el instanceof HTMLSelectElement) {
        el.value = before;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else setNativeValue(el, before);
      lastFill = undefined;
    },
  };

  return [click, fill];
}
