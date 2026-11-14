// The recorder (features 5 and 12). A family member does a task once; Steady keeps the steps.
//   - three step types: click this, choose yours, type this yourself;
//   - several locators per step;
//   - sending a form counts as a click on its send button;
//   - what was typed or chosen is never kept. Only where.

import type { Tool } from '@/shared/tools';
import type { PageElement } from '@/shared/pagemap';
import { need } from '@/shared/ports';
import type { RecordedTask, StepLocator, StepType, TaskStep } from '@/shared/tasks';
import { pageMap } from '../map';
import { attrsOf, hrefPathOf, locate } from './locate';

export { locate };

const RECORDING = 'guide:recording'; // the task being recorded, kept so it survives a page load
const TASKS = 'guide:tasks';

const TYPED = new Set(['text', 'email', 'password', 'number', 'tel', 'search', 'textarea']);

let current: RecordedTask | null = null;
let detach: (() => void) | null = null;

export function isRecording(): boolean {
  return !!current;
}

export async function start(name: string): Promise<{ said: string }> {
  detach?.();
  current = { version: 1, id: `t${Date.now().toString(36)}`, name: name.trim() || 'A task', site: location.origin, recordedAt: Date.now(), steps: [] };
  await need('store').set(RECORDING, current);
  listen();
  return { said: 'I am watching now. Do the task the way you normally would. I never save what you type or choose.' };
}

/** Call on every page load. Carries on if a recording was under way. */
export async function resume(): Promise<boolean> {
  if (current) return true;
  const saved = await need('store').get<RecordedTask>(RECORDING);
  if (!saved) return false;
  current = saved;
  listen();
  return true;
}

export async function stop(): Promise<{ task: RecordedTask; said: string }> {
  const task = current ?? { version: 1 as const, id: 'none', name: '', site: location.origin, recordedAt: Date.now(), steps: [] };
  detach?.();
  detach = null;
  current = null;
  const store = need('store');
  await store.remove(RECORDING);
  if (task.steps.length) {
    const all = (await store.get<RecordedTask[]>(TASKS)) ?? [];
    await store.set(TASKS, [...all.filter((t) => t.id !== task.id), task]);
  }
  const count = task.steps.length === 1 ? '1 step' : `${task.steps.length} steps`;
  return { task, said: task.steps.length ? `Saved "${task.name}" with ${count}.` : 'Nothing was recorded, so I have not saved anything.' };
}

export async function tasks(): Promise<RecordedTask[]> {
  return (await need('store').get<RecordedTask[]>(TASKS)) ?? [];
}

function listen(): void {
  detach?.();
  // Clicks come from A's click events. Only A listens to raw clicks.
  const offClick = need('clicks').onClick((target) => {
    const el = lookUp(target);
    if (el && (el.kind === 'button' || el.kind === 'link')) add('click', el);
  });
  // A box that was filled in or changed. The new value is never read.
  const onChange = (e: Event) => {
    if (!(e.target instanceof Element)) return;
    const el = lookUp(e.target);
    if (!el || el.kind === 'button' || el.kind === 'link') return;
    add(TYPED.has(el.kind) ? 'type' : 'choose', el);
  };
  // Enter pressed in a box: the same as clicking the form's send button.
  const onSubmit = (e: Event) => {
    if (!(e.target instanceof HTMLFormElement)) return;
    const map = pageMap.get();
    const inside = map.elements.find((el) => el.formId && pageMap.elementFor(el.id)?.closest('form') === e.target);
    const form = map.forms.find((f) => f.id === inside?.formId);
    const sender = map.elements.find((el) => el.id === form?.submitId);
    if (sender) add('click', sender);
  };
  document.addEventListener('change', onChange, true);
  document.addEventListener('submit', onSubmit, true);
  detach = () => {
    offClick();
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('submit', onSubmit, true);
  };
}

/** The page map's entry for what was touched, with its context and form. */
function lookUp(target: Element): PageElement | null {
  const data = pageMap.describe(target);
  if (!data) return null;
  return pageMap.get().elements.find((e) => e.id === data.id) ?? data;
}

function add(type: StepType, el: PageElement): void {
  if (!current) return;
  const map = pageMap.get();
  const form = map.forms.find((f) => f.id === el.formId);
  // A set of options, or the three boxes of a date of birth, is one step: "choose yours".
  const asGroup = el.group && (el.kind === 'radio' || el.secret === 'date-of-birth') ? el.group : undefined;
  const name = asGroup ?? el.label;

  // For a set of options the step points at the question, never at the answer that was picked.
  const isOptionSet = el.kind === 'radio' && !!asGroup;
  const domAttrs = attrsOf(pageMap.elementFor(el.id));
  const locator: StepLocator = {
    kind: el.kind,
    label: isOptionSet ? asGroup : el.label,
    labelConfident: el.labelConfident,
    context: isOptionSet ? undefined : el.context,
    group: el.group,
    formLabel: form?.label,
    protection: el.protection,
    secret: el.secret,
    fillAs: el.fillAs,
    sendsForm: form?.submitId === el.id,
    region: el.region,
    attrs: isOptionSet ? { name: domAttrs.name } : domAttrs,
    hrefPath: hrefPathOf(el),
  };
  let path = location.pathname;
  try {
    path = new URL(map.url).pathname;
  } catch {
    // keep location.pathname
  }
  const step: TaskStep = { type, say: sayFor(type, el, name), locator, page: { origin: map.origin, path, stage: map.stage.kind } };

  // Touching the same thing twice in a row is one step.
  const last = current.steps[current.steps.length - 1];
  const same = (a: TaskStep, b: TaskStep) => a.type === b.type && a.say === b.say && a.page.path === b.page.path;
  if (last && same(last, step)) return;

  current.steps.push(step);
  void need('store').set(RECORDING, current);
}

function sayFor(type: StepType, el: PageElement, name: string): string {
  if (type === 'type') return `Type this yourself: "${name}".`;
  if (type === 'choose') return `Choose your own: "${name}".`;
  // A button with no words on it: the name is Steady's guess, so the step says so.
  if (!el.labelConfident) return `Click this button. I think it is "${el.label}".`;
  return el.context ? `Click "${el.label}" for the ${el.context}.` : `Click "${el.label}".`;
}

// ---- tools, for the panel: a family member records a task ----

export const recordStartTool: Tool = {
  name: 'record_start',
  owner: 'guide',
  description: 'For a family member: start recording a task on this website, so Steady can walk the person through it later. Keeps where to click, choose and type. Never keeps what was typed or chosen.',
  parameters: { name: { type: 'string', description: 'What to call the task, in plain words: "Book a doctor\'s appointment"', required: true } },
  async run(args) {
    const name = String(args.name ?? '').trim();
    if (!name) return { ok: false, said: 'Give the task a name first, such as "Order my prescription".' };
    return { ok: true, ...(await start(name)) };
  },
};

export const recordStopTool: Tool = {
  name: 'record_stop',
  owner: 'guide',
  description: 'For a family member: stop recording and save the task.',
  parameters: {},
  async run() {
    if (!isRecording()) return { ok: false, said: 'I am not recording at the moment.' };
    const { task, said } = await stop();
    return { ok: true, said, data: { id: task.id, name: task.name, steps: task.steps.length } };
  },
};
