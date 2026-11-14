// Finding a recorded step on the page in front of the person.
// The plan: "A button can't be found: the helper says so, shows its best guess for confirmation,
// and offers 'I'm stuck'. It never guesses silently." So a weak match comes back with confident: false.

import type { PageElement, PageMap } from '@/shared/pagemap';
import type { TaskStep } from '@/shared/tasks';
import { pageMap } from '../map';

const SURE = 6; // the score a match needs to be shown without asking
const MAYBE = 4; // below this, there is no guess worth showing
const CLEAR_LEAD = 2; // and it must beat the runner-up by this much

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

export function attrsOf(el: Element | null): { id?: string; name?: string; testId?: string } {
  if (!el) return {};
  return {
    id: el.id || undefined,
    name: el.getAttribute('name') || undefined,
    testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || undefined,
  };
}

export function hrefPathOf(el: PageElement): string | undefined {
  if (!el.href || el.leavesSite) return undefined;
  try {
    return new URL(el.href).pathname;
  } catch {
    return undefined;
  }
}

function score(step: TaskStep, el: PageElement, map: PageMap): number {
  const want = step.locator;
  const pressable = (k: string) => k === 'button' || k === 'link';
  if (!(el.kind === want.kind || (pressable(el.kind) && pressable(want.kind)))) return 0;

  let s = 0;
  // A "choose yours" step names the question, so any option under that question is a match.
  const sameQuestion = want.kind === 'radio' && !!el.group && el.group.toLowerCase() === want.label.toLowerCase();
  if (el.label.toLowerCase() === want.label.toLowerCase() || sameQuestion) s += 6;
  else {
    const a = words(want.label);
    const b = words(el.label);
    const shared = [...a].filter((w) => b.has(w)).length;
    if (a.size && shared / a.size >= 0.5) s += 2;
  }

  const attrs = attrsOf(pageMap.elementFor(el.id));
  if (want.attrs.id && attrs.id === want.attrs.id) s += 4;
  if (want.attrs.name && attrs.name === want.attrs.name) s += 3;
  if (want.attrs.testId && attrs.testId === want.attrs.testId) s += 4;
  if (want.hrefPath && hrefPathOf(el) === want.hrefPath) s += 4;

  if (want.context && el.context) s += want.context.toLowerCase() === el.context.toLowerCase() ? 3 : -4;
  if (want.group && el.group?.toLowerCase() === want.group.toLowerCase()) s += 2;
  if (want.secret && el.secret === want.secret) s += 3;
  if (want.fillAs && el.fillAs === want.fillAs) s += 3;
  if (want.protection !== 'none' && el.protection === want.protection) s += 1;

  const form = map.forms.find((f) => f.id === el.formId);
  if (want.sendsForm && form?.submitId === el.id) s += 3;
  if (want.formLabel && form?.label.toLowerCase() === want.formLabel.toLowerCase()) s += 1;
  return s;
}

/** The element a step points at, or null. `confident: false` means "this is my best guess; ask before using it". */
export function locate(step: TaskStep, map: PageMap = pageMap.get()): { id: string; confident: boolean } | null {
  let best: { el: PageElement; s: number } | null = null;
  for (const el of map.elements) {
    if (!el.visible) continue;
    const s = score(step, el, map);
    if (!best || s > best.s) best = { el, s };
  }
  // The runner-up. Options under the same question are one answer, not rivals.
  let second = 0;
  for (const el of map.elements) {
    if (!best || !el.visible || el === best.el) continue;
    if (step.locator.kind === 'radio' && el.kind === 'radio' && el.group === best.el.group) continue;
    second = Math.max(second, score(step, el, map));
  }
  if (!best || best.s < MAYBE) return null;
  return { id: best.el.id, confident: best.s >= SURE && best.s - second >= CLEAR_LEAD };
}
