// Feature 5, the player. A family member recorded a task once; now Milo walks the person through it.
//   - She does every step herself. Milo shows where, says what, and never clicks for her.
//   - When she has done a step, Milo moves to the next one by itself.
//   - It keeps its place from page to page, and remembers it if she stops.
//   - It says plainly when a step can't be found, and never guesses silently.
//   - If she is a long time on a step, or her clicks keep missing, it offers help. Once.

import { need } from '@/shared/ports';
import type { RecordedTask, TaskStep } from '@/shared/tasks';
import type { Tool, ToolResult } from '@/shared/tools';
import { calmPage, restorePage } from '../calm';
import * as details from '../details';
import { pageMap } from '../map';
import { locate, tasks } from '../recorder';
import * as spotlight from '../spotlight';
import { isOn } from '../switches';

const PLAYING = 'guide:playing';
const PLACES = 'guide:places';
/** What she picked last time, per task and step. On this computer only, and never a secret box or anything typed. */
const CHOICES = 'guide:lastChoices';

/** Unhurried on purpose. */
const pace = {
  advanceMs: 700, // after a step is done, a breath before the next
  nudgeMs: 45_000, // this long on one step: say it again, gently
  offerHelpMs: 100_000, // this long: offer to stop or ask for help. Once.
  settleMs: 600, // a page that has just opened may still be drawing itself
  missesBeforeHelp: 3,
  lastTimeMs: 5000, // how long last time's option stays pointed out
};

export function setPace(change: Partial<typeof pace>): void {
  Object.assign(pace, change);
}

export interface PlayState {
  status: 'step' | 'elsewhere' | 'missing' | 'ask' | 'going' | 'done' | 'stopped' | 'no-task';
  said: string;
  options?: string[];
  step?: { number: number; of: number; id?: string };
}

interface Run {
  task: RecordedTask;
  at: number;
  /** Every element that counts as the current step: one per option for a set of choices. */
  ids: string[];
  /** Said once, before the first step. */
  lead: string;
  misses: number;
  elsewhere: boolean;
}

let run: Run | null = null;
let pendingAsk: { task: RecordedTask; at: number } | null = null;
let detach: (() => void) | null = null;
let advanceTimer: number | undefined;
let nudgeTimer: number | undefined;
let helpTimer: number | undefined;
let lastTimeTimer: number | undefined;
let lastTimeShown = false;

const STEP_OPTIONS = ['Go on', 'Stop for now'];
/** When the page no longer matches what was recorded: she is never left alone on it. */
const OFF_ROUTE = ['What do I click?', 'Skip this step', "I'm stuck", 'Stop for now'];
const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));
const quoted = (text: string) => `"${text}"`;

const EXTRA: Record<string, string> = {
  pay: ' This is the one that pays. That click is yours, whenever you\'re ready.',
  delete: ' This one removes something. Only click it if you\'re sure.',
  submit: ' This sends what you\'ve filled in. Click it yourself when you\'re ready.',
};

function clearLastTime(): void {
  window.clearTimeout(lastTimeTimer);
  if (lastTimeShown) need('overlay').clear('last-time');
  lastTimeShown = false;
}

function clearTimers(): void {
  clearLastTime();
  window.clearTimeout(advanceTimer);
  window.clearTimeout(nudgeTimer);
  window.clearTimeout(helpTimer);
}

const onThisPage = (step: TaskStep) => step.page.origin === location.origin && step.page.path === location.pathname;

/** Every element that belongs to a step: the three boxes of a date of birth, or all the options under one question. */
function idsFor(step: TaskStep, id: string): string[] {
  const map = pageMap.get();
  const el = map.elements.find((e) => e.id === id);
  const group = step.locator.group;
  const isSet = !!group && (step.locator.kind === 'radio' || step.locator.secret === 'date-of-birth');
  if (!el || !isSet) return [id];
  return map.elements.filter((e) => e.group === group && e.kind === el.kind && e.secret === el.secret).map((e) => e.id);
}

/** Find the step on the page. Gives a page that has just opened a moment to finish drawing. */
async function find(step: TaskStep): Promise<{ id: string; confident: boolean } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = locate(step);
    if (found && pageMap.liveRect(found.id) && (found.confident || onThisPage(step))) return found;
    await wait(pace.settleMs);
  }
  return null;
}

/**
 * A step that needs nothing more from her: a box that already has something in it, a date of birth with all
 * its parts chosen, a list that "Help me fill this in" has set. Only whether it is empty is looked at, never
 * what is in it. A click is never counted as done, and neither is a choice that is hers to make each time.
 */
function alreadyDone(step: TaskStep): boolean {
  if (step.type === 'click' || !onThisPage(step)) return false;
  const found = locate(step);
  if (!found?.confident) return false;
  const el = pageMap.elementFor(found.id);
  const data = el && pageMap.describe(el);
  if (!el || !data?.visible) return false;
  if (step.type === 'type') return ((el as HTMLInputElement).value ?? '').trim() !== '';
  if (step.locator.secret === 'date-of-birth') return idsFor(step, found.id).every((id) => !!(pageMap.elementFor(id) as HTMLSelectElement | null)?.value);
  if (data.kind === 'select' && data.fillAs) return !!(el as HTMLSelectElement).value;
  return false;
}

function skipNote(labels: string[]): string {
  const names = [...new Set(labels)].map(quoted);
  if (names.length === 1) return `${names[0]} is filled in already, so we'll skip it.`;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are filled in already, so we'll skip those.`;
  return `${names.length} boxes are filled in already, so we'll skip those.`;
}

async function present(): Promise<PlayState> {
  const r = run!;
  clearTimers();
  // Don't ask for what is already there (she typed ahead, the website remembered it, or Milo filled it in).
  const skipped: string[] = [];
  while (r.task.steps[r.at] && alreadyDone(r.task.steps[r.at]!)) {
    skipped.push(r.task.steps[r.at]!.locator.label);
    r.at += 1;
  }
  if (skipped.length) r.lead = `${r.lead ? `${r.lead} ` : ''}${skipNote(skipped)}`;
  const step = r.task.steps[r.at];
  if (!step) return finish();
  const of = r.task.steps.length;
  const number = r.at + 1;
  const lead = r.lead ? `${r.lead} ` : '';
  r.lead = '';
  r.ids = [];
  r.elsewhere = false;
  void need('store').set(PLAYING, { taskId: r.task.id, at: r.at });

  const found = await find(step);
  if (run !== r) return { status: 'stopped', said: "I've stopped." };

  if (!found) {
    spotlight.off();
    if (!onThisPage(step)) {
      r.elsewhere = true;
      const where = step.page.origin === location.origin ? 'on another page of this website' : `on another website, ${hostOf(step.page.origin)}`;
      return { status: 'elsewhere', said: `${lead}Step ${number} is ${where}. Want me to take you there?`, options: ['Yes, take me there', 'Stop for now'], step: { number, of } };
    }
    return {
      status: 'missing',
      said: `${lead}I can't find step ${number} on this page: ${quoted(step.locator.label)}. The website may have changed since this was set up. You haven't done anything wrong. I can still tell you what the buttons here do.`,
      options: OFF_ROUTE,
      step: { number, of },
    };
  }

  const ids = idsFor(step, found.id);
  const last = await lastFor(r.task.id, r.at, step, ids);
  const say = sayOf(step, last?.words, r.at);
  const lit = await spotlight.on(found.id, say, { group: ids });
  if (run !== r) return { status: 'stopped', said: "I've stopped." };
  if (!lit.ok) return { status: 'missing', said: `${lead}${lit.said}`, options: OFF_ROUTE, step: { number, of } };
  r.ids = ids;

  const unsure = found.confident ? '' : ' I think it\'s this one, but the page looks a bit different from last time. Have a look before you go on.';
  const count = lead ? `Step ${number}.` : `Step ${number} of ${of}.`;
  const said = `${lead}${count} ${say}${EXTRA[step.locator.protection] ?? ''}${unsure}`;
  // Last time's option is pointed out for a moment. It is never chosen for her.
  if (last?.id) {
    need('overlay').labels('last-time', [{ targetId: last.id, text: 'Last time', tone: 'info' }]);
    lastTimeShown = true;
    lastTimeTimer = window.setTimeout(clearLastTime, pace.lastTimeMs);
  }

  const stillHere = () => run === r && r.task.steps[r.at] === step && !details.isActive();
  // Checking in can feel like being watched. It is a switch, and when it is off Milo simply waits.
  const mayNudge = async () => stillHere() && (await isOn('nudges'));
  nudgeTimer = window.setTimeout(async () => (await mayNudge()) && need('speech').say(`Take your time. ${say}`, STEP_OPTIONS), pace.nudgeMs);
  helpTimer = window.setTimeout(
    async () =>
      (await mayNudge()) &&
      need('speech').say('Want to keep going, stop here for now, or ask someone for a hand? Nothing you\'ve done is lost.', ['Carry on', 'Stop for now', "I'm stuck"]),
    pace.offerHelpMs,
  );
  return { status: 'step', said, options: STEP_OPTIONS, step: { number, of, id: found.id } };
}

// ---- what the step says, and what she picked last time ----

/**
 * The instruction for a step, in words that sound like a person. Built when the step is shown, from what
 * was recorded about the place, so tasks recorded earlier get the newer wording too.
 */
function sayOf(step: TaskStep, last?: string, turn = 0): string {
  const { label, context, labelConfident, kind, secret } = step.locator;
  if (step.type === 'click') {
    if (!labelConfident) return `Click this button. I think it's ${quoted(label)}.`;
    return context ? `Click ${quoted(label)} for the ${context}.` : `Click ${quoted(label)}.`;
  }
  if (step.type === 'type') return `Type in ${quoted(label)}.`;
  if (secret === 'date-of-birth') return `Choose your date of birth: ${quoted(label)}.`;
  if (kind === 'checkbox') return `${quoted(label)} is a tick box. Only tick it if you want it.`;
  // A choice is hers to make afresh each time. Last time's is mentioned, never made for her.
  // The ending changes from step to step. The same sentence three times in a row sounds like a recording.
  const again = ["Go with that again, or pick something else. It's up to you.", 'Same again, or something different?', 'Keep that, or change it. Either is fine.'][turn % 3]!;
  const fresh = ['pick what fits you today.', 'choose whichever suits you.', "it's your pick."][turn % 3]!;
  return last ? `For ${quoted(label)}, last time you picked ${last}. ${again}` : `For ${quoted(label)}, ${fresh}`;
}

/** A day or a time, the way a person would say it. */
export function spoken(kind: 'date' | 'time', value: string): string {
  if (kind === 'date') {
    const day = new Date(`${value}T12:00`);
    return Number.isNaN(day.getTime()) ? '' : `a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.getDay()]}`;
  }
  const [h, m] = value.split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return '';
  const hour = h % 12 === 0 ? 12 : h % 12;
  const clock = m ? `${hour}:${String(m).padStart(2, '0')}` : `${hour}`;
  return h === 12 && !m ? '12 noon' : `${clock} ${h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening'}`;
}

/** The short name of an option: "Dr. Amara Okafor", without the small print beside it. */
function shortLabel(el: Element): string {
  const label = (el as HTMLInputElement).labels?.[0] ?? el.closest('label');
  const own = label ? [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim() : '';
  return own.length >= 2 ? own : (pageMap.describe(el)?.label ?? '');
}

/** What she just picked, in words. Null for anything typed, ticked or secret. */
function chosenWords(target: Element): string | null {
  if (target instanceof HTMLSelectElement) {
    const option = target.selectedOptions[0];
    return option && target.value !== '' ? quoted(option.label.trim()) : null;
  }
  if (!(target instanceof HTMLInputElement)) return null;
  if (target.type === 'radio') return quoted(shortLabel(target));
  if (target.type === 'date' || target.type === 'time') return spoken(target.type, target.value) || null;
  return null;
}

export async function lastChoices(): Promise<Record<string, Record<number, string>>> {
  return (await need('store').get<Record<string, Record<number, string>>>(CHOICES)) ?? {};
}

async function keepChoice(taskId: string, index: number, step: TaskStep, target: Element): Promise<void> {
  if (step.type !== 'choose' || step.locator.secret || step.locator.kind === 'checkbox') return;
  if (!(await isOn('lastTime'))) return; // she has asked Milo not to keep what she picks
  const words = chosenWords(target);
  if (!words) return;
  const all = await lastChoices();
  await need('store').set(CHOICES, { ...all, [taskId]: { ...all[taskId], [index]: words } });
}

/** Last time's choice for this step, if it is still on offer today. `id` is the option to point out. */
async function lastFor(taskId: string, index: number, step: TaskStep, ids: string[]): Promise<{ words: string; id?: string } | null> {
  if (step.type !== 'choose' || step.locator.secret || !(await isOn('lastTime'))) return null;
  const words = (await lastChoices())[taskId]?.[index];
  if (!words) return null;
  const first = ids[0] ? pageMap.elementFor(ids[0]) : null;
  if (first instanceof HTMLSelectElement) return [...first.options].some((o) => quoted(o.label.trim()) === words) ? { words } : null;
  if (first instanceof HTMLInputElement && first.type === 'radio') {
    const id = ids.find((i) => {
      const el = pageMap.elementFor(i);
      return !!el && quoted(shortLabel(el)) === words;
    });
    return id ? { words, id } : null;
  }
  return { words };
}

/** "Forget what I picked last time." */
export async function forgetChoices(): Promise<{ said: string }> {
  await need('store').remove(CHOICES);
  return { said: "Done. I've forgotten what you picked last time." };
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, '');
  } catch {
    return origin;
  }
}

/** Which step, if any, did she just do? Looks a little ahead, in case she is quicker than the instructions. */
function stepDone(target: Element, how: 'click' | 'change'): number {
  const r = run;
  const data = r && pageMap.describe(target);
  if (!r || !data) return -1;
  for (let i = r.at; i < Math.min(r.at + 3, r.task.steps.length); i++) {
    const step = r.task.steps[i]!;
    if ((step.type === 'click') !== (how === 'click')) continue;
    let ids = r.ids;
    if (i !== r.at) {
      const found = onThisPage(step) ? locate(step) : null;
      ids = found?.confident ? idsFor(step, found.id) : [];
    }
    if (!ids.includes(data.id)) continue;
    // A date of birth is done when all three parts are chosen.
    if (step.locator.secret === 'date-of-birth' && ids.some((id) => !(pageMap.elementFor(id) as HTMLSelectElement | null)?.value)) return -1;
    return i;
  }
  return -1;
}

function advanceFrom(index: number): void {
  const r = run;
  if (!r) return;
  clearTimers();
  r.at = index + 1;
  r.misses = 0;
  // Saved straight away: the click may be taking her to another page.
  void need('store').set(PLAYING, { taskId: r.task.id, at: r.at });
  const next = r.task.steps[r.at];
  // If the next step is on another page, the page is probably on its way. Give it time before saying anything.
  const delay = pace.advanceMs + (next && !onThisPage(next) ? 2500 : 0);
  advanceTimer = window.setTimeout(async () => {
    if (run !== r || details.isActive()) return; // the form is being filled in: wait, and catch up after
    const state = await present();
    need('speech').say(state.said, state.options);
  }, delay);
}

function listen(): void {
  detach?.();
  const clicks = need('clicks');
  const offClick = clicks.onClick((target) => {
    if (details.isActive()) return;
    const done = stepDone(target, 'click');
    if (done >= 0) advanceFrom(done);
  });
  const offMiss = clicks.onMiss?.(() => {
    const r = run;
    if (!r || r.elsewhere) return;
    r.misses += 1;
    if (r.misses < pace.missesBeforeHelp) return;
    r.misses = 0;
    void isOn('nudges').then((on) => on && run === r && need('speech').say('Those clicks didn\'t land on anything. It happens. Want me to show you the step again, or would you rather ask someone for a hand?', ['Show me again', "I'm stuck"]));
  });
  const onChange = (e: Event) => {
    if (!(e.target instanceof Element)) return;
    // While "Help me fill this in" is working, several boxes change at once. The task waits (see catchUp).
    if (details.isActive()) return;
    const done = stepDone(e.target, 'change');
    if (done < 0) return;
    if (run) void keepChoice(run.task.id, done, run.task.steps[done]!, e.target);
    advanceFrom(done);
  };
  document.addEventListener('change', onChange, true);
  detach = () => {
    offClick();
    offMiss?.();
    document.removeEventListener('change', onChange, true);
    detach = null;
  };
}

function begin(task: RecordedTask, at: number, lead: string): Promise<PlayState> {
  // A task that came from another computer: say so once, and where it goes, before the first step.
  if (lead && task.shared && !task.shared.said) {
    const sender = task.shared.from ? `${task.shared.from} sent you this one` : 'Someone sent you this one from another computer';
    lead = lead.replace(' together. ', ` together. ${sender}, and it's for the website ${hostOf(task.site)}. `);
    void markSaid(task.id);
  }
  quiet();
  void calmPage(); // the plan: the page is quietened during guided steps
  pendingAsk = null;
  run = { task, at, ids: [], lead, misses: 0, elsewhere: false };
  listen();
  return present();
}

async function markSaid(taskId: string): Promise<void> {
  const all = await tasks();
  await need('store').set('guide:tasks', all.map((t) => (t.id === taskId && t.shared ? { ...t, shared: { ...t.shared, said: true } } : t)));
}

const leadFor = (task: RecordedTask) => {
  const n = task.steps.length;
  return `Let's do ${quoted(task.name)} together. It's ${n === 1 ? 'just 1 step' : `${n} steps`}, and there's no rush.`;
};

async function places(): Promise<Record<string, number>> {
  return (await need('store').get<Record<string, number>>(PLACES)) ?? {};
}

/** Start a saved task. If she stopped part-way last time, ask whether to carry on from there. */
export async function start(taskId: string, options: { at?: number } = {}): Promise<PlayState> {
  const task = (await tasks()).find((t) => t.id === taskId || t.name === taskId);
  if (!task || !task.steps.length) return { status: 'no-task', said: 'I can\'t find that task. It may have been removed.' };
  if (options.at !== undefined) return begin(task, options.at, options.at === 0 ? leadFor(task) : '');

  const saved = (await places())[task.id] ?? 0;
  if (saved > 0 && saved < task.steps.length) {
    quiet();
    pendingAsk = { task, at: saved };
    return {
      status: 'ask',
      said: `Last time you got to step ${saved + 1} of ${task.steps.length} in ${quoted(task.name)}. Want to pick up from there?`,
      options: [`Carry on from step ${saved + 1}`, 'Start again'],
    };
  }
  return begin(task, 0, leadFor(task));
}

export async function carryOn(): Promise<PlayState> {
  if (pendingAsk) return begin(pendingAsk.task, pendingAsk.at, '');
  return repeat();
}

export async function startAgain(): Promise<PlayState> {
  const task = pendingAsk?.task ?? run?.task;
  if (!task) return idle();
  return begin(task, 0, leadFor(task));
}

/** On every page load: if a task is in progress, carry on where it was. */
export async function resume(): Promise<PlayState | null> {
  const saved = await need('store').get<{ taskId: string; at: number }>(PLAYING);
  if (!saved) return null;
  const task = (await tasks()).find((t) => t.id === saved.taskId);
  if (!task) {
    await need('store').remove(PLAYING);
    return null;
  }
  return begin(task, saved.at, '');
}

/** "Go on" or "Skip this step": move to the next step without doing this one. Nothing is clicked. */
/** "Help me fill this in" was pressed in the middle of a task: say nothing until it has finished. */
export function hush(): void {
  if (run) clearTimers();
}

/** The filling-in has finished: skip what is now filled, and show the first step that is still to do. */
export async function catchUp(): Promise<PlayState | null> {
  if (!run) return null;
  run.lead = '';
  return present();
}

export async function next(): Promise<PlayState> {
  if (!run) return idle();
  run.at += 1;
  run.misses = 0;
  return present();
}

/** Say and show the current step again. */
export async function repeat(): Promise<PlayState> {
  if (!run) return idle();
  return present();
}

/** "Yes, take me there": open the page the current step is on. Only ever a page the family member recorded. */
export async function goThere(): Promise<PlayState> {
  const step = run?.task.steps[run.at];
  if (!run || !step) return idle();
  await need('store').set(PLAYING, { taskId: run.task.id, at: run.at });
  location.assign(step.page.origin + step.page.path);
  return { status: 'going', said: 'Taking you there now.' };
}

async function finish(): Promise<PlayState> {
  const r = run!;
  quiet();
  await need('store').remove(PLAYING);
  const all = await places();
  delete all[r.task.id];
  await need('store').set(PLACES, all);
  return { status: 'done', said: `That was the last step. You're all done with ${quoted(r.task.name)}.` };
}

/** Stop quietly, without touching what is saved. */
function quiet(): void {
  clearTimers();
  detach?.();
  if (run) void restorePage(); // the page was calmed for the guided steps: put it back
  run = null;
  spotlight.off();
}

export async function stop(): Promise<PlayState> {
  const r = run;
  pendingAsk = null;
  if (!r) return idle();
  quiet();
  await need('store').remove(PLAYING);
  if (r.at > 0) {
    await need('store').set(PLACES, { ...(await places()), [r.task.id]: r.at });
    return { status: 'stopped', said: `Okay, I've stopped. I'll remember you got to step ${r.at + 1} of ${quoted(r.task.name)}.` };
  }
  return { status: 'stopped', said: `Okay, I've stopped. You can start ${quoted(r.task.name)} again whenever you like.` };
}

const idle = (): PlayState => ({ status: 'stopped', said: 'We\'re not in the middle of a task right now.' });

/** What she is in the middle of, for "I'm stuck". The task's name and the step number. Nothing about the page. */
export function where(): { taskId: string; task: string; step: number; of: number } | null {
  return run ? { taskId: run.task.id, task: run.task.name, step: run.at + 1, of: run.task.steps.length } : null;
}

export const isPlaying = (): boolean => !!run;

/** A saved task she stopped part-way through, if there is one. For "Where was I?". */
export async function stoppedTask(): Promise<string | null> {
  const kept = await places();
  const all = await tasks();
  return all.find((t) => (kept[t.id] ?? 0) > 0)?.id ?? null;
}
/** Waiting for "carry on from step 2" or "start again". */
export const isAsking = (): boolean => !!pendingAsk;

// ---- tools, for B's tool list ----

const result = (state: PlayState): ToolResult => ({ ok: state.status !== 'no-task', said: state.said, data: { status: state.status, options: state.options, step: state.step } });

export const listTasksTool: Tool = {
  name: 'list_tasks',
  owner: 'guide',
  description: 'List the tasks a family member has recorded for this person, such as "Book a doctor\'s appointment". Use for "what can you help me do?".',
  parameters: {},
  async run() {
    const all = await tasks();
    if (!all.length) return { ok: true, said: 'There aren\'t any saved tasks yet. Someone who helps you can set one up.', data: { tasks: [] } };
    return {
      ok: true,
      said: all.length === 1 ? `There is one saved task: ${quoted(all[0]!.name)}.` : `There are ${all.length} saved tasks.`,
      data: { tasks: all.map((t) => ({ id: t.id, name: t.name, site: t.site, steps: t.steps.length })), options: all.map((t) => t.name) },
    };
  },
};

export const playTaskTool: Tool = {
  name: 'play_task',
  owner: 'guide',
  description:
    'Walk the person through a saved task, one step at a time. They do each step themselves; Milo shows where and moves on when it is done. Never clicks for them. The result\'s data.options are answers to show as buttons.',
  parameters: { task: { type: 'string', description: 'The id or the name of the saved task', required: true } },
  run: async (args) => result(await start(String(args.task ?? ''))),
};

export const playNextTool: Tool = {
  name: 'play_next',
  owner: 'guide',
  description: 'During a saved task: the person said "go on" or "skip this step". Moves to the next step. Nothing is clicked.',
  parameters: {},
  run: async () => result(await next()),
};

export const playRepeatTool: Tool = {
  name: 'play_repeat',
  owner: 'guide',
  description: 'During a saved task: show and say the current step again. Use for "what was that?", "show me again" and "carry on".',
  parameters: {},
  run: async () => result(await repeat()),
};

export const playStopTool: Tool = {
  name: 'play_stop',
  owner: 'guide',
  description: 'Stop the saved task. Milo remembers the step, so it can be picked up again later.',
  parameters: {},
  run: async () => result(await stop()),
};
