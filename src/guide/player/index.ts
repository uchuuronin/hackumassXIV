// Feature 5, the player. A family member recorded a task once; now Steady walks the person through it.
//   - She does every step herself. Steady shows where, says what, and never clicks for her.
//   - When she has done a step, Steady moves to the next one by itself.
//   - It keeps its place from page to page, and remembers it if she stops.
//   - It says plainly when a step can't be found, and never guesses silently.
//   - If she is a long time on a step, or her clicks keep missing, it offers help. Once.

import { need } from '@/shared/ports';
import type { RecordedTask, TaskStep } from '@/shared/tasks';
import type { Tool, ToolResult } from '@/shared/tools';
import { pageMap } from '../map';
import { locate, tasks } from '../recorder';
import * as spotlight from '../spotlight';

const PLAYING = 'guide:playing';
const PLACES = 'guide:places';

/** Unhurried on purpose. */
const pace = {
  advanceMs: 700, // after a step is done, a breath before the next
  nudgeMs: 45_000, // this long on one step: say it again, gently
  offerHelpMs: 100_000, // this long: offer to stop or ask for help. Once.
  settleMs: 600, // a page that has just opened may still be drawing itself
  missesBeforeHelp: 3,
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

const STEP_OPTIONS = ['Go on', 'Stop for now'];
const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));
const quoted = (text: string) => `"${text}"`;

const EXTRA: Record<string, string> = {
  pay: ' This is the button that pays. Click it yourself, and only when you are ready.',
  delete: ' This removes something. Click it yourself, and only if you are sure.',
  submit: ' This sends what you have filled in. Click it yourself when you are ready.',
};

function clearTimers(): void {
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

async function present(): Promise<PlayState> {
  const r = run!;
  clearTimers();
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
  if (run !== r) return { status: 'stopped', said: 'I have stopped.' };

  if (!found) {
    spotlight.off();
    if (!onThisPage(step)) {
      r.elsewhere = true;
      const where = step.page.origin === location.origin ? 'on another page of this website' : `on another website, ${hostOf(step.page.origin)}`;
      return { status: 'elsewhere', said: `${lead}Step ${number} is ${where}. Shall I take you there?`, options: ['Yes, take me there', 'Stop for now'], step: { number, of } };
    }
    return {
      status: 'missing',
      said: `${lead}I can't find step ${number} on this page: ${quoted(step.locator.label)}. The page may have changed since this was recorded. You have not done anything wrong.`,
      options: ['Skip this step', "I'm stuck", 'Stop for now'],
      step: { number, of },
    };
  }

  const ids = idsFor(step, found.id);
  const lit = await spotlight.on(found.id, step.say, { group: ids });
  if (run !== r) return { status: 'stopped', said: 'I have stopped.' };
  if (!lit.ok) return { status: 'missing', said: `${lead}${lit.said}`, options: ['Skip this step', "I'm stuck", 'Stop for now'], step: { number, of } };
  r.ids = ids;

  const unsure = found.confident ? '' : ' I think it is this one, but the page looks a little different. Please check before you go on.';
  const count = lead ? `Step ${number}.` : `Step ${number} of ${of}.`;
  const said = `${lead}${count} ${step.say}${EXTRA[step.locator.protection] ?? ''}${unsure}`;

  const stillHere = () => run === r && r.task.steps[r.at] === step;
  nudgeTimer = window.setTimeout(() => stillHere() && need('speech').say(`There is no rush. ${step.say}`, STEP_OPTIONS), pace.nudgeMs);
  helpTimer = window.setTimeout(
    () =>
      stillHere() &&
      need('speech').say('Would you like to carry on, stop here for now, or ask someone for help? Nothing you have done is lost.', ['Carry on', 'Stop for now', "I'm stuck"]),
    pace.offerHelpMs,
  );
  return { status: 'step', said, options: STEP_OPTIONS, step: { number, of, id: found.id } };
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
    if (run !== r) return;
    const state = await present();
    need('speech').say(state.said, state.options);
  }, delay);
}

function listen(): void {
  detach?.();
  const clicks = need('clicks');
  const offClick = clicks.onClick((target) => {
    const done = stepDone(target, 'click');
    if (done >= 0) advanceFrom(done);
  });
  const offMiss = clicks.onMiss?.(() => {
    const r = run;
    if (!r || r.elsewhere) return;
    r.misses += 1;
    if (r.misses < pace.missesBeforeHelp) return;
    r.misses = 0;
    need('speech').say('Those clicks did not land on anything. That happens. Shall I show you the step again, or would you like to ask someone for help?', ['Show me again', "I'm stuck"]);
  });
  const onChange = (e: Event) => {
    if (!(e.target instanceof Element)) return;
    const done = stepDone(e.target, 'change');
    if (done >= 0) advanceFrom(done);
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
  quiet();
  pendingAsk = null;
  run = { task, at, ids: [], lead, misses: 0, elsewhere: false };
  listen();
  return present();
}

const leadFor = (task: RecordedTask) => {
  const n = task.steps.length;
  return `Let us do ${quoted(task.name)} together. There ${n === 1 ? 'is 1 step' : `are ${n} steps`}, and there is no rush.`;
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
      said: `Last time you got to step ${saved + 1} of ${task.steps.length} in ${quoted(task.name)}. Shall we carry on from there?`,
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
  const n = r.task.steps.length;
  quiet();
  await need('store').remove(PLAYING);
  const all = await places();
  delete all[r.task.id];
  await need('store').set(PLACES, all);
  return { status: 'done', said: `That was the last step. You have done ${n === 1 ? 'the one step' : `all ${n} steps`} of ${quoted(r.task.name)}.` };
}

/** Stop quietly, without touching what is saved. */
function quiet(): void {
  clearTimers();
  detach?.();
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
    return { status: 'stopped', said: `I have stopped. I will remember that you got to step ${r.at + 1} of ${quoted(r.task.name)}.` };
  }
  return { status: 'stopped', said: `I have stopped. You can start ${quoted(r.task.name)} again whenever you like.` };
}

const idle = (): PlayState => ({ status: 'stopped', said: 'I am not in the middle of a task at the moment.' });

/** What she is in the middle of, for "I'm stuck". The task's name and the step number. Nothing about the page. */
export function where(): { taskId: string; task: string; step: number; of: number } | null {
  return run ? { taskId: run.task.id, task: run.task.name, step: run.at + 1, of: run.task.steps.length } : null;
}

export const isPlaying = (): boolean => !!run;
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
    if (!all.length) return { ok: true, said: 'There are no saved tasks yet. A family member can record one for you.', data: { tasks: [] } };
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
    'Walk the person through a saved task, one step at a time. They do each step themselves; Steady shows where and moves on when it is done. Never clicks for them. The result\'s data.options are answers to show as buttons.',
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
  description: 'Stop the saved task. Steady remembers the step, so it can be picked up again later.',
  parameters: {},
  run: async () => result(await stop()),
};
