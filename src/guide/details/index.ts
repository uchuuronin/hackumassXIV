// Feature 6, "Fill in my details".
//   1. Ask first. Nothing is written until the person says yes.
//   2. Fill every matching box in one go, then ask ONCE whether it looks right.
//   3. The boxes that are theirs (card, password, choices) come one at a time. When they finish
//      a box, Steady moves to the next by itself. Nobody has to say "next".
//   4. A long time on one box: say it again gently, then offer a way out. Never nag.
//   5. Before the button: point out anything that looks missing or misspelt.
//   6. Offer to remember what they typed, so next time is easier. Never a card, password or date of birth.
// It never presses the button. At the "show" level it fills nothing and only points.

import { DETAILS_KEY as KEY, type MyDetails } from '@/shared/details';
import type { FillKey, PageElement, PageForm, PageMap, SecretKind } from '@/shared/pagemap';
import { need, type FollowUp } from '@/shared/ports';
import { HELPER_KEYS, type HelpLevel, type Tool } from '@/shared/tools';
import { pageMap } from '../map';
import * as spotlight from '../spotlight';
import { typeItYourself } from '../words';
import { matchOption, valueFor, WANTS } from './values';
import { writeValue, type Undo } from './write';

/** Unhurried on purpose. */
const pace = {
  advanceMs: 700, // after a box is finished, a breath before moving on
  nudgeMs: 45_000, // this long on one box: say it again, gently
  offerHelpMs: 100_000, // this long: offer to stop or ask for help. Once.
};

export function setPace(change: Partial<typeof pace>): void {
  Object.assign(pace, change);
}

// ---- the card ----

export async function load(): Promise<MyDetails> {
  return (await need('store').get<MyDetails>(KEY)) ?? {};
}

export async function save(details: MyDetails): Promise<void> {
  const tidy: MyDetails = {};
  for (const [k, v] of Object.entries(details)) {
    if (typeof v === 'string' && v.trim()) tidy[k as keyof MyDetails] = v.trim();
  }
  await need('store').set(KEY, tidy);
}

export async function clear(): Promise<void> {
  await need('store').remove(KEY);
}

// ---- one visit to a form ----

export type StepKind = 'yours' | 'secret' | 'choice';

export interface FillState {
  status: 'offer' | 'check' | 'step' | 'done' | 'no-form' | 'stopped';
  /** What the helper says now. */
  said: string;
  /** Short answers to offer as buttons. */
  options?: string[];
  /** A second, separate message to show after this one ("One more thing…"). */
  then?: FollowUp;
  step?: { id: string; kind: StepKind; label: string };
}

interface Step {
  /** The box to point at. */
  id: string;
  /** Every box that belongs to this step: three for a date of birth, one per option for a set of choices. */
  ids: string[];
  kind: StepKind;
  label: string;
  text: string;
  secret?: SecretKind;
}

interface Fill {
  id: string;
  key: FillKey;
  value: string;
}

interface Session {
  phase: 'offer' | 'check' | 'walk';
  level: HelpLevel;
  details: MyDetails;
  form: PageForm;
  fields: PageElement[];
  fills: Fill[];
  reverts: Undo[];
  steps: Step[];
  at: number;
  /** Said once, before the first step. */
  lead: string;
  forward?: PageElement;
}

let session: Session | null = null;
let pendingRemember: MyDetails | null = null;
let advanceTimer: number | undefined;
let nudgeTimer: number | undefined;
let helpTimer: number | undefined;

type Box = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const box = (id: string) => pageMap.elementFor(id) as Box | null;
/** What is in the box right now. Read from the page, never from an older copy of the map. */
const live = (id: string) => String(box(id)?.value ?? '');
const ticked = (id: string) => (box(id) as HTMLInputElement | null)?.checked === true;
const quoted = (label: string) => `"${label.replace(/[.\s]+$/, '')}"`;
const isOptional = (el: PageElement) => /\boptional\b/i.test(el.label) && !el.required;

function list(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

const GROUPS: Array<[word: string, keys: FillKey[]]> = [
  ['name', ['name', 'given-name', 'family-name']],
  ['email', ['email']],
  ['address', ['street-address', 'address-line1', 'address-line2', 'address-level2', 'address-level1', 'postal-code', 'country']],
  ['phone', ['tel']],
];
const groupWords = (keys: FillKey[]) => GROUPS.filter(([, members]) => members.some((k) => keys.includes(k))).map(([word]) => word);

function pickForm(map: PageMap): { form: PageForm; fields: PageElement[] } | undefined {
  const byId = new Map(map.elements.map((e) => [e.id, e]));
  let best: { form: PageForm; fields: PageElement[]; score: number } | undefined;
  for (const form of map.forms) {
    if (form.isSearch) continue;
    const fields = form.fieldIds.map((id) => byId.get(id)).filter((e): e is PageElement => !!e && e.visible && !e.disabled);
    if (!fields.length) continue;
    const score = fields.length + 3 * fields.filter((f) => f.fillAs).length;
    if (!best || score > best.score) best = { form, fields, score };
  }
  return best;
}

/** Splits the form into what Steady can fill and what is the person's own. `fill: false` leaves everything to them. */
function plan(fields: PageElement[], details: MyDetails, fill: boolean): { fills: Fill[]; steps: Step[] } {
  const hasSecondAddressLine = fields.some((f) => f.fillAs === 'address-line2');
  const fills: Fill[] = [];
  const steps: Step[] = [];
  const done = new Set<string>();

  for (const el of fields) {
    const name = quoted(el.label);
    const mates = el.secret && el.group ? fields.filter((f) => f.secret === el.secret && f.group === el.group) : [];

    if (el.kind === 'radio') {
      const group = el.group ?? el.label;
      if (done.has(`radio:${group}`)) continue;
      done.add(`radio:${group}`);
      const options = fields.filter((f) => f.kind === 'radio' && (f.group ?? f.label) === group);
      const chosen = options.find((f) => ticked(f.id));
      const now = chosen ? `At the moment it is set to ${quoted(chosen.label)}. Change it if you like, or tell me to go on.` : 'Nothing is chosen yet.';
      steps.push({ id: (chosen ?? el).id, ids: options.map((o) => o.id), kind: 'choice', label: group, text: `This one is your choice: ${quoted(group)}. ${now}` });
      continue;
    }
    if (el.kind === 'checkbox') {
      const text = ticked(el.id)
        ? `There is a tick box that is already ticked: ${name}. Untick it if you do not want it, or tell me to go on.`
        : `There is a tick box: ${name}. It is not ticked. Tick it only if you want it, or tell me to go on.`;
      steps.push({ id: el.id, ids: [el.id], kind: 'choice', label: el.label, text });
      continue;
    }
    if (el.secret && mates.length > 1) {
      // The three boxes of a date of birth are one step.
      const key = `${el.secret}:${el.group}`;
      if (done.has(key)) continue;
      done.add(key);
      if (mates.every((m) => live(m.id) !== '')) continue;
      steps.push({ id: el.id, ids: mates.map((m) => m.id), kind: 'secret', secret: el.secret, label: el.group!, text: `${quoted(el.group!)}. ${typeItYourself(el.secret)}` });
      continue;
    }

    // Never write over, and never ask again about, something that is already filled in.
    if (live(el.id) !== '') continue;

    if (el.secret) {
      steps.push({ id: el.id, ids: [el.id], kind: 'secret', secret: el.secret, label: el.label, text: `${name}. ${typeItYourself(el.secret)}` });
      continue;
    }
    if (el.fillAs) {
      const value = valueFor(el.fillAs, details, { hasSecondAddressLine });
      const dom = box(el.id);
      const fits = !!value && (!(dom instanceof HTMLSelectElement) || !!matchOption(dom, value));
      if (fill && fits) {
        fills.push({ id: el.id, key: el.fillAs, value });
        continue;
      }
      if (isOptional(el) && !value) continue;
      const what = el.kind === 'select' ? 'This list' : 'This box';
      steps.push({ id: el.id, ids: [el.id], kind: 'yours', label: el.label, text: `${what} is for ${WANTS[el.fillAs]}: ${name}.` });
      continue;
    }
    if (isOptional(el)) continue;
    if (el.kind === 'select') {
      steps.push({ id: el.id, ids: [el.id], kind: 'choice', label: el.label, text: `This one is your choice: ${name}. Nothing is chosen yet.` });
    } else if (!el.labelConfident) {
      const guess = el.labelSource === 'none' ? 'I can\'t read what this box is for.' : `This box looks like ${name}, but I am not sure.`;
      steps.push({ id: el.id, ids: [el.id], kind: 'yours', label: el.label, text: `${guess} Fill it in if you know what it wants.` });
    } else {
      steps.push({ id: el.id, ids: [el.id], kind: 'yours', label: el.label, text: `This one is for you: ${name}.` });
    }
  }
  return { fills, steps };
}

/** The button that moves on from this form. Steady points at it and stops. */
function forwardButton(map: PageMap, form: PageForm): PageElement | undefined {
  const sender = map.elements.find((e) => e.id === form.submitId && e.visible);
  if (sender) return sender;
  return map.elements.find((e) => e.formId === form.id && e.kind === 'button' && e.visible && !e.disabled && /^(next|continue|next step|proceed|save|done)$/i.test(e.label));
}

function clearTimers(): void {
  window.clearTimeout(advanceTimer);
  window.clearTimeout(nudgeTimer);
  window.clearTimeout(helpTimer);
}

/** Offered on every step, so nobody needs a key or a typed word to move on. */
const GO_ON = ['Go on'];

function stepState(step: Step, said: string): FillState {
  return { status: 'step', said, options: GO_ON, step: { id: step.id, kind: step.kind, label: step.label } };
}

/** Point at the current step and start the patience timers. */
async function present(): Promise<FillState> {
  const s = session!;
  clearTimers();
  let step = s.steps[s.at];
  while (step && !box(step.id)) step = s.steps[++s.at]; // the page changed and that box has gone
  if (!step) return finish();

  const said = s.lead ? `${s.lead} ${step.text}` : step.text;
  s.lead = '';
  // A ring only. The words are in the panel: a note beside the box would cover the next box.
  await spotlight.on(step.id, undefined, { dim: false });
  // Put the typing cursor in the box, so nothing needs pointing at.
  if (step.kind !== 'choice') box(step.id)?.focus({ preventScroll: true });

  const mine = step;
  const stillHere = () => session === s && s.phase === 'walk' && s.steps[s.at] === mine;
  nudgeTimer = window.setTimeout(() => {
    if (!stillHere()) return;
    // A box only counts as finished when she leaves it. If she has typed and is waiting, say how to move on.
    const typedAndWaiting = mine.kind !== 'choice' && mine.ids.every((id) => live(id) !== '');
    // The password nobody remembers: say what to do about it, instead of repeating "type your password".
    const forgot = mine.secret === 'password' && !typedAndWaiting ? pageMap.get().elements.find((e) => e.visible && /forgot|reset (your |my )?password|can.?t sign in|trouble signing/i.test(e.label)) : undefined;
    const again = forgot
      ? `There is no rush. If you can't remember your password, that happens to everyone. Click ${quoted(forgot.label)} and the website will help you make a new one.`
      : typedAndWaiting
        ? 'There is no rush. When you have finished this box, tell me to go on and I will show you the next one.'
        : `There is no rush. ${mine.text}`;
    need('speech').say(again, GO_ON);
  }, pace.nudgeMs);
  helpTimer = window.setTimeout(
    () =>
      stillHere() &&
      need('speech').say('Would you like to carry on, stop here for now, or ask someone for help? Everything you have typed stays where it is.', [
        'Carry on',
        'Stop for now',
        'Ask for help',
      ]),
    pace.offerHelpMs,
  );
  return stepState(step, said);
}

/** When she finishes a box, move on without being told. Also keeps up if she skips ahead. */
function onChange(event: Event): void {
  const s = session;
  if (!s || s.phase !== 'walk' || !(event.target instanceof Element)) return;
  const data = pageMap.describe(event.target);
  if (!data) return;
  const index = s.steps.findIndex((step) => step.ids.includes(data.id));
  if (index < s.at) return;
  const step = s.steps[index]!;
  // A date of birth is finished when all three parts are chosen.
  if (step.kind === 'secret' && step.ids.length > 1 && !step.ids.every((id) => live(id) !== '')) return;
  s.at = index;
  window.clearTimeout(advanceTimer);
  advanceTimer = window.setTimeout(async () => {
    if (session !== s) return;
    const next = await keep();
    need('speech').say(next.said, next.options, next.then);
  }, pace.advanceMs);
}

function begin(s: Session): void {
  stopQuietly();
  session = s;
  document.addEventListener('change', onChange, true);
}

function walk(s: Session, lead: string, fill: boolean): Promise<FillState> {
  const planned = plan(s.fields, s.details, fill);
  s.phase = 'walk';
  s.steps = planned.steps;
  s.at = 0;
  s.lead = lead;
  return s.steps.length ? present() : finish();
}

/** `level` is B's help level. At 'show' nothing is filled. At 'with-me' and 'do-it' Steady offers to fill. */
export async function start(level: HelpLevel = 'with-me', options: { lead?: string } = {}): Promise<FillState> {
  const state = await begun(level, options.lead !== undefined);
  // A lead from the caller ("This page wants to know it is you…") comes before whatever is said first.
  return options.lead && state.status !== 'no-form' ? { ...state, said: `${options.lead} ${state.said}` } : state;
}

async function begun(level: HelpLevel, hasOwnLead: boolean): Promise<FillState> {
  stopQuietly();
  pendingRemember = null;
  const map = pageMap.get();
  const picked = pickForm(map);
  if (!picked) return { status: 'no-form', said: 'I can\'t see any boxes on this page that I can help you fill in.' };

  const details = await load();
  const s: Session = { phase: 'walk', level, details, ...picked, fills: [], reverts: [], steps: [], at: 0, lead: '', forward: forwardButton(map, picked.form) };
  begin(s);

  if (level === 'show') return walk(s, '', false);
  if (!Object.keys(details).length) {
    return walk(s, hasOwnLead ? '' : 'I do not have your details saved yet, so we will go through the boxes together this time.', false);
  }
  const planned = plan(s.fields, details, true);
  if (!planned.fills.length) return walk(s, '', false);

  s.phase = 'offer';
  s.fills = planned.fills;
  s.steps = planned.steps;
  return {
    status: 'offer',
    said: `I can fill in your ${list(groupWords(s.fills.map((f) => f.key)))} from "My details". Shall I?`,
    options: ['Yes, fill them in', 'No, I will type them'],
  };
}

/** "Yes", "it looks right", "go on", "I've done that one". */
export async function keep(): Promise<FillState> {
  const s = session;
  if (!s) return { status: 'stopped', said: 'I am not filling anything in at the moment. Ask me to help with a form and I will.' };
  clearTimers();

  if (s.phase === 'offer') {
    for (const fill of s.fills) {
      const dom = box(fill.id);
      const revert = dom && live(fill.id) === '' ? writeValue(dom, fill.value) : null;
      if (revert) s.reverts.push(revert);
    }
    s.phase = 'check';
    const n = s.reverts.length;
    const words = list(groupWords(s.fills.map((f) => f.key)));
    return {
      status: 'check',
      said:
        n === 1
          ? `I have filled in your ${words}. Please have a look. If it is wrong, change it in the box. Tell me when it looks right.`
          : `I have filled in ${n} boxes with your ${words}. Please have a look. If one is wrong, change it in the box. Tell me when it looks right.`,
      options: ['It looks right', 'Take them out'],
    };
  }
  if (s.phase === 'check') {
    s.phase = 'walk';
    s.at = 0;
    s.lead = s.steps.length ? 'Now the ones only you can fill in.' : '';
    return s.steps.length ? present() : finish();
  }
  s.at += 1;
  return s.at < s.steps.length ? present() : finish();
}

/** "No." Before filling: leave it all to her. After filling: take it all out again. */
export async function undo(): Promise<FillState> {
  const s = session;
  if (!s) return { status: 'stopped', said: 'There is nothing to take out.' };
  if (s.phase === 'offer') return walk(s, 'That is fine. We can go through the boxes together.', false);
  if (s.phase === 'check') {
    for (const revert of s.reverts.reverse()) revert();
    s.reverts = [];
    return walk(s, 'I have taken them out again. We can go through the boxes together.', false);
  }
  const step = s.steps[s.at];
  return step ? stepState(step, `I have not put anything in this one. ${step.text}`) : finish();
}

/** Say the current step again. For "Carry on" and "what was that?". */
export function repeat(): FillState {
  const step = session?.phase === 'walk' ? session.steps[session.at] : undefined;
  return step ? stepState(step, step.text) : { status: 'stopped', said: 'I am not filling anything in at the moment.' };
}

// ---- before the button ----

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keepPrev = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keepPrev;
    }
  }
  return row[b.length]!;
}

const SIMPLE: Partial<Record<FillKey, keyof MyDetails>> = {
  'given-name': 'givenName',
  'family-name': 'familyName',
  email: 'email',
  tel: 'phone',
  'address-line1': 'addressLine1',
  'street-address': 'addressLine1',
  'address-line2': 'addressLine2',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'postalCode',
  country: 'country',
};

/** Anything that looks missing or misspelt, and anything new worth remembering. Read on the device, kept nowhere. */
function review(s: Session): { flags: string[]; learn: MyDetails; learnKeys: FillKey[] } {
  const empty: string[] = [];
  const flags: string[] = [];
  const learn: MyDetails = {};
  const learnKeys: FillKey[] = [];
  const seen = new Set<string>();

  for (const el of s.fields) {
    if (!box(el.id) || el.kind === 'checkbox' || el.kind === 'radio') continue;
    const value = live(el.id).trim();

    if (el.secret && el.group) {
      const mates = s.fields.filter((f) => f.secret === el.secret && f.group === el.group);
      if (mates.length > 1) {
        if (!seen.has(el.group) && mates.some((m) => live(m.id) === '')) flags.push(`${quoted(el.group)} is not finished yet.`);
        seen.add(el.group);
        continue;
      }
    }
    if (!value) {
      if (!isOptional(el)) empty.push(quoted(el.label));
      continue;
    }
    if (el.secret || !el.fillAs) continue; // what is typed in a secret box is never looked at

    const isEmail = el.fillAs === 'email';
    if (isEmail && !/^\S+@\S+\.\S+$/.test(value)) {
      flags.push(`${quoted(el.label)} needs an @ sign to be an email address.`);
      continue;
    }
    const savedKey = SIMPLE[el.fillAs];
    const saved = savedKey ? (s.details[savedKey] ?? '') : '';
    const shown = el.kind === 'select' ? ((box(el.id) as HTMLSelectElement).selectedOptions[0]?.label.trim() ?? value) : value;
    if (saved && saved.toLowerCase() !== shown.toLowerCase()) {
      const d = distance(saved.toLowerCase(), shown.toLowerCase());
      if (saved.length >= 4 && d <= 2 && !(el.kind === 'select')) {
        flags.push(`${quoted(el.label)} says "${shown}", and I have "${saved}" saved. Please check which is right.`);
        continue;
      }
    }
    // Something she typed that Steady did not have: worth offering to remember.
    if (el.fillAs === 'name' && !s.details.givenName && !s.details.familyName) {
      const [first, ...rest] = shown.split(/\s+/);
      if (first) learn.givenName = first;
      if (rest.length) learn.familyName = rest.join(' ');
      learnKeys.push('name');
    } else if (savedKey && !saved && !(el.kind === 'select' && matchOption(box(el.id) as HTMLSelectElement, '') )) {
      learn[savedKey] = shown;
      learnKeys.push(el.fillAs);
    }
  }
  if (empty.length === 1) flags.unshift(`${empty[0]} is still empty.`);
  else if (empty.length) flags.unshift(`These boxes are still empty: ${list(empty.slice(0, 4))}.`);
  return { flags, learn, learnKeys };
}

async function finish(): Promise<FillState> {
  const s = session!;
  clearTimers();
  const { flags, learn, learnKeys } = review(s);
  const forward = s.forward;
  stopListening();
  session = null;

  let said = 'That is every box.';
  said += flags.length ? ` Before you go on, ${flags.length === 1 ? 'one thing' : 'a few things'} to check. ${flags.join(' ')}` : ' I can\'t see anything missing.';
  if (forward) {
    said += ` When you are happy, click ${quoted(forward.label)} yourself.`;
    if (forward.protection === 'pay') said += ' That is the button that pays, so I will never click it for you.';
    else if (forward.protection === 'submit') said += ' That is the button that sends it, so I will never click it for you.';
    await spotlight.on(forward.id, 'Check your answers, then click this yourself.', { dim: false });
  } else {
    spotlight.off();
  }

  // Remembering is Steady's own housekeeping: a second, separate message, so the first one stays short.
  const words = groupWords(learnKeys);
  if (!words.length) return { status: 'done', said };
  pendingRemember = learn;
  const many = Object.keys(learn).length > 1;
  return {
    status: 'done',
    said,
    then: {
      said: `One more thing. You typed your ${list(words)}, which I did not have saved. Shall I remember ${many ? 'them' : 'it'} for next time? ${many ? 'They stay' : 'It stays'} on this computer.`,
      options: many ? ['Yes, remember them', 'No, thank you'] : ['Yes, remember it', 'No, thank you'],
    },
  };
}

/** "Yes, remember them." Adds what she typed to "My details". Never a card, a password or a date of birth. */
export async function remember(): Promise<FillState> {
  if (!pendingRemember) return { status: 'stopped', said: 'There is nothing new to remember.' };
  const many = Object.keys(pendingRemember).length > 1;
  await save({ ...(await load()), ...pendingRemember });
  pendingRemember = null;
  return { status: 'done', said: `I will remember ${many ? 'them' : 'it'} for next time.` };
}

function stopListening(): void {
  document.removeEventListener('change', onChange, true);
}

function stopQuietly(): void {
  clearTimers();
  stopListening();
  session = null;
  spotlight.off();
}

/** In the middle of helping with a form. */
export const isActive = (): boolean => !!session;

export function stop(): FillState {
  stopQuietly();
  return { status: 'stopped', said: 'I have stopped. Everything already filled in is still there.' };
}

// ---- tools, for B's tool list ----

const result = (state: FillState) => ({ ok: state.status !== 'no-form' && state.status !== 'stopped', said: state.said, data: { status: state.status, options: state.options, then: state.then, step: state.step } });

export const fillDetailsTool: Tool = {
  name: 'fill_my_details',
  owner: 'guide',
  description:
    'Help with the form on this page. Offers to fill in the person\'s saved name, address, phone and email in one go, asks once if it looks right, then points at each box that is theirs to fill. Moves on by itself as they finish each box. Never fills passwords, card numbers or codes, and never presses Submit. Use for "help me fill this in". The result\'s data.options are answers to show as buttons.',
  parameters: {
    level: { type: 'string', description: 'The help level. Leave out to use the level the person has set.', enum: ['show', 'with-me', 'do-it'] },
  },
  async run(args) {
    const asked = args.level === 'show' || args.level === 'with-me' || args.level === 'do-it' ? args.level : undefined;
    return result(await start(asked ?? (await need('store').get<HelpLevel>(HELPER_KEYS.level)) ?? 'with-me'));
  },
  async undo() {
    await undo();
  },
};

export const fillNextTool: Tool = {
  name: 'fill_next',
  owner: 'guide',
  description: 'While helping with a form: the person said yes, "it looks right", "go on", or has finished the box they were on.',
  parameters: {},
  run: async () => result(await keep()),
};

export const fillTakeOutTool: Tool = {
  name: 'fill_take_out',
  owner: 'guide',
  description: 'While helping with a form: the person said no. Before filling, this leaves every box to them. After filling, it takes everything Steady put in back out.',
  parameters: {},
  run: async () => result(await undo()),
};

export const fillRepeatTool: Tool = {
  name: 'fill_repeat',
  owner: 'guide',
  description: 'While helping with a form: say the current box again. Use for "what was that?" and "carry on".',
  parameters: {},
  run: async () => result(repeat()),
};

export const fillRememberTool: Tool = {
  name: 'fill_remember',
  owner: 'guide',
  description: 'After a form: the person agreed that Steady may remember the name, address, phone or email they typed, for next time.',
  parameters: {},
  run: async () => result(await remember()),
};

export const fillStopTool: Tool = {
  name: 'fill_stop',
  owner: 'guide',
  description: 'Stop helping with the form. Everything already filled in stays.',
  parameters: {},
  run: async () => result(stop()),
};
