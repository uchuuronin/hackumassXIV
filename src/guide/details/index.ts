// Feature 6, "Fill in my details". The plan:
//   - fills matching fields one at a time, highlights each for review, reads it back;
//   - for fields it can't fill, reads the label and waits for the person;
//   - then points at the Submit button and stops. It never presses it.
// At the "Show me" level it fills nothing: it points at each box and the person types.

import { DETAILS_KEY as KEY, type MyDetails } from '@/shared/details';
import type { PageElement, PageForm, PageMap } from '@/shared/pagemap';
import { need } from '@/shared/ports';
import { HELPER_KEYS, type HelpLevel, type Tool } from '@/shared/tools';
import { pageMap } from '../map';
import * as spotlight from '../spotlight';
import { typeItYourself } from '../words';
import { matchOption, valueFor, WANTS } from './values';
import { writeValue, type Undo } from './write';

const GO_ON = 'Tell me when you are ready to go on.';

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

// ---- one walk through a form ----

export type StepKind = 'filled' | 'yours' | 'secret' | 'choice';

export interface FillState {
  status: 'step' | 'done' | 'needs-details' | 'no-form' | 'stopped';
  /** What the helper says. Already sent to the voice. */
  said: string;
  step?: { id: string; kind: StepKind; label: string; value?: string };
  /** Steps still to come after this one. */
  left?: number;
}

interface Step {
  id: string;
  kind: StepKind;
  label: string;
  /** What to say when the step is shown. */
  text: string;
  /** For "filled" steps: what goes in. Written only when the step is reached. */
  value?: string;
  revert?: Undo;
}

let session: { steps: Step[]; at: number; forward?: PageElement } | null = null;

const isOptional = (el: PageElement) => /\boptional\b/i.test(el.label) && !el.required;
const isEmpty = (el: PageElement) => !el.value || (el.kind === 'select' && !el.options?.some((o) => o.selected && o.value !== ''));

function pickForm(map: PageMap): PageForm | undefined {
  const byId = new Map(map.elements.map((e) => [e.id, e]));
  let best: { form: PageForm; score: number } | undefined;
  for (const form of map.forms) {
    if (form.isSearch) continue;
    const fields = form.fieldIds.map((id) => byId.get(id)).filter((e): e is PageElement => !!e && e.visible && !e.disabled);
    if (!fields.length) continue;
    const score = fields.length + 3 * fields.filter((f) => f.fillAs).length;
    if (!best || score > best.score) best = { form, score };
  }
  return best?.form;
}

function plan(map: PageMap, form: PageForm, details: MyDetails, level: HelpLevel): Step[] {
  const byId = new Map(map.elements.map((e) => [e.id, e]));
  const fields = form.fieldIds.map((id) => byId.get(id)).filter((e): e is PageElement => !!e && e.visible && !e.disabled);
  const hasSecondAddressLine = fields.some((f) => f.fillAs === 'address-line2');
  const steps: Step[] = [];
  const doneGroups = new Set<string>();

  for (const el of fields) {
    const name = `"${el.label.replace(/[.\s]+$/, '')}"`;

    // One step for a whole set of radio buttons, and one for the three boxes of a date of birth.
    const sharesSecret = !!el.secret && !!el.group && fields.filter((f) => f.secret === el.secret && f.group === el.group).length > 1;
    if (el.kind === 'radio' || sharesSecret) {
      const group = el.group ?? el.label;
      const key = `${el.kind === 'radio' ? 'radio' : el.secret}:${group}`;
      if (doneGroups.has(key)) continue;
      doneGroups.add(key);
      if (el.secret) {
        steps.push({ id: el.id, kind: 'secret', label: group, text: `"${group}". ${typeItYourself(el.secret)} ${GO_ON}` });
      } else {
        const chosen = fields.find((f) => f.kind === 'radio' && (f.group ?? f.label) === group && f.checked);
        const now = chosen ? `At the moment it is set to "${chosen.label}". Change it if you like, then tell me to go on.` : 'Nothing is chosen yet. Pick one, then tell me to go on.';
        steps.push({ id: (chosen ?? el).id, kind: 'choice', label: group, text: `This one is your choice: "${group}". ${now}` });
      }
      continue;
    }

    if (el.secret) {
      steps.push({ id: el.id, kind: 'secret', label: el.label, text: `${name}. ${typeItYourself(el.secret)} ${GO_ON}` });
      continue;
    }

    if (el.kind === 'checkbox') {
      const text = el.checked
        ? `There is a tick box that is already ticked: ${name}. Untick it if you do not want it, then tell me to go on.`
        : `There is a tick box: ${name}. It is not ticked. Tick it only if you want it, then tell me to go on.`;
      steps.push({ id: el.id, kind: 'choice', label: el.label, text });
      continue;
    }

    // Never write over something the person already put in.
    if (!isEmpty(el)) continue;

    if (el.fillAs) {
      const value = valueFor(el.fillAs, details, { hasSecondAddressLine });
      const dom = pageMap.elementFor(el.id);
      const fits = value && (!(dom instanceof HTMLSelectElement) || matchOption(dom, value));
      if (level !== 'show' && fits) {
        const shown = dom instanceof HTMLSelectElement ? matchOption(dom, value)!.label.trim() : value;
        const text = el.kind === 'select' ? `I have chosen "${shown}" for ${name}. Is that right?` : `I have put "${shown}" in ${name}. Is that right?`;
        steps.push({ id: el.id, kind: 'filled', label: el.label, value, text });
        continue;
      }
      if (isOptional(el) && !value) continue;
      const how = el.kind === 'select' ? 'Choose it from the list' : 'Type it in';
      steps.push({ id: el.id, kind: 'yours', label: el.label, text: `This box is for ${WANTS[el.fillAs]}: ${name}. ${how}, then tell me when you are ready to go on.` });
      continue;
    }

    if (isOptional(el)) continue;
    if (el.kind === 'select') {
      steps.push({ id: el.id, kind: 'choice', label: el.label, text: `This one is your choice: ${name}. Nothing is chosen yet. Pick one, then tell me to go on.` });
    } else if (!el.labelConfident) {
      const guess = el.labelSource === 'none' ? 'I can\'t read what this box is for.' : `I think this box is ${name}, but I am not sure.`;
      steps.push({ id: el.id, kind: 'yours', label: el.label, text: `${guess} Fill it in if you know what it wants, then tell me when you are ready to go on.` });
    } else {
      steps.push({ id: el.id, kind: 'yours', label: el.label, text: `This one is for you: ${name}. Type it in, then tell me when you are ready to go on.` });
    }
  }
  return steps;
}

/** The button that moves on from this form. Steady points at it and stops. */
function forwardButton(map: PageMap, form: PageForm): PageElement | undefined {
  const sender = map.elements.find((e) => e.id === form.submitId && e.visible);
  if (sender) return sender;
  return map.elements.find((e) => e.formId === form.id && e.kind === 'button' && e.visible && !e.disabled && /^(next|continue|next step|proceed|save|done)$/i.test(e.label));
}

function say(state: FillState): FillState {
  need('speech').say(state.said);
  return state;
}

async function present(): Promise<FillState> {
  const s = session!;
  const step = s.steps[s.at]!;
  const el = pageMap.elementFor(step.id);
  if (!el) return keep(); // the page changed and this box has gone
  if (step.kind === 'filled' && step.value !== undefined && !step.revert) {
    const revert = writeValue(el, step.value);
    if (!revert) {
      step.kind = 'yours';
      step.text = `This one is for you: "${step.label}". Type it in, then tell me when you are ready to go on.`;
    } else {
      step.revert = revert;
    }
  }
  await spotlight.on(step.id, step.text);
  // Put the typing cursor in the box, so a correction needs no pointing.
  if (step.kind !== 'choice' && el instanceof HTMLElement) el.focus({ preventScroll: true });
  return say({
    status: 'step',
    said: step.text,
    step: { id: step.id, kind: step.kind, label: step.label, value: step.kind === 'filled' ? step.value : undefined },
    left: s.steps.length - s.at - 1,
  });
}

/**
 * `level` is B's help level. At 'show' nothing is filled: Steady points at each box and the person types.
 * At 'with-me' and 'do-it' it fills, and still shows every box before moving on.
 */
export async function start(level: HelpLevel = 'with-me'): Promise<FillState> {
  stopQuietly();
  const map = pageMap.get();
  const form = pickForm(map);
  if (!form) return say({ status: 'no-form', said: 'I can\'t see any boxes on this page that I can help you fill in.' });

  const details = await load();
  if (level !== 'show' && !Object.keys(details).length) {
    return say({
      status: 'needs-details',
      said: 'I do not have your details yet. Open "My details" and add your name and address. Then ask me again and I will fill them in for you.',
    });
  }
  const steps = plan(map, form, details, level);
  session = { steps, at: 0, forward: forwardButton(map, form) };
  return steps.length ? present() : finish();
}

/** "Yes, that's right" or "I've done that one": move on. */
export async function keep(): Promise<FillState> {
  if (!session) return say({ status: 'stopped', said: 'I am not filling anything in at the moment.' });
  session.at += 1;
  return session.at < session.steps.length ? present() : finish();
}

/** "No, that's not right": take the value out again and leave the box to the person. */
export async function undo(): Promise<FillState> {
  const step = session?.steps[session.at];
  if (!session || !step) return say({ status: 'stopped', said: 'There is nothing to undo.' });
  if (step.kind !== 'filled' || !step.revert) return say({ status: 'step', said: 'I did not put anything in this one.', step: { id: step.id, kind: step.kind, label: step.label } });
  step.revert();
  step.kind = 'yours';
  step.text = `I have taken it out. Type what you want in "${step.label}", then tell me when you are ready to go on.`;
  return say({ status: 'step', said: step.text, step: { id: step.id, kind: 'yours', label: step.label }, left: session.steps.length - session.at - 1 });
}

async function finish(): Promise<FillState> {
  const forward = session?.forward;
  session = null;
  let said = 'That is every box. Please check your answers.';
  if (forward) {
    said += ` When you are happy, click "${forward.label}" yourself.`;
    if (forward.protection === 'pay') said += ' That is the button that pays, so I will never click it for you.';
    else if (forward.protection === 'submit') said += ' That is the button that sends it, so I will never click it for you.';
    await spotlight.on(forward.id, `Check your answers, then click this yourself.`);
  } else {
    spotlight.off();
  }
  return say({ status: 'done', said });
}

function stopQuietly(): void {
  session = null;
  spotlight.off();
}

export function stop(): FillState {
  stopQuietly();
  return say({ status: 'stopped', said: 'I have stopped. Everything already filled in is still there.' });
}

/** For B's tool list: "Help me fill this form." */
export const fillDetailsTool: Tool = {
  name: 'fill_my_details',
  owner: 'guide',
  description:
    'Go through the form on this page one box at a time. Puts in the person\'s saved name, address, phone and email, showing each one for review. At the "show" level it fills nothing and only points. Never fills passwords, card numbers or codes, and never presses Submit. Use for "help me fill this in".',
  parameters: {
    level: { type: 'string', description: 'The help level. Leave out to use the level the person has set.', enum: ['show', 'with-me', 'do-it'] },
  },
  async run(args) {
    const asked = args.level === 'show' || args.level === 'with-me' || args.level === 'do-it' ? args.level : undefined;
    const level = asked ?? (await need('store').get<HelpLevel>(HELPER_KEYS.level)) ?? 'with-me';
    const state = await start(level);
    return { ok: state.status === 'step' || state.status === 'done', said: state.said, data: state.step };
  },
  async undo() {
    await undo();
  },
};

/** "Yes, that's right" and "I've done that one". For the panel's answer button. */
export const fillNextTool: Tool = {
  name: 'fill_next',
  owner: 'guide',
  description: 'While filling a form: the person said yes, or has finished the box they were asked to do. Move on to the next box.',
  parameters: {},
  async run() {
    const state = await keep();
    return { ok: state.status === 'step' || state.status === 'done', said: state.said, data: state.step };
  },
};

/** "No, that's not right". */
export const fillTakeOutTool: Tool = {
  name: 'fill_take_out',
  owner: 'guide',
  description: 'While filling a form: the person said the value just put in is wrong. Take it out and leave the box to them.',
  parameters: {},
  async run() {
    const state = await undo();
    return { ok: true, said: state.said, data: state.step };
  },
};

export const fillStopTool: Tool = {
  name: 'fill_stop',
  owner: 'guide',
  description: 'Stop filling the form. Everything already filled in stays.',
  parameters: {},
  async run() {
    return { ok: true, said: stop().said };
  },
};
