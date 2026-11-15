// Feature 12, "I'm stuck". One press lets the person who helps her know.
//   - It asks first, in a way that is easy to say yes or no to. Asking for help should never feel like failing.
//   - It sends once. A second press a moment later does not send a second message.
//   - The message has the task's name and the step number. Nothing about the page, nothing she typed.

import type { MyDetails } from '@/shared/details';
import { DETAILS_KEY } from '@/shared/details';
import { HELPER_KEY, INBOX_KEY, REPLY_KEY, newSecret, type Helper, type HelperNote, type StuckNote } from '@/shared/family';
import { need } from '@/shared/ports';
import type { Tool, ToolResult } from '@/shared/tools';
import { listen } from '../listening';
import * as player from '../player';
import * as spotlight from '../spotlight';

/** Long enough for a person to read an email and pick up the telephone. */
const QUIET_MS = 3 * 60_000;

export interface StuckState {
  status: 'offer' | 'sent' | 'failed' | 'declined' | 'no-helper' | 'need-email' | 'need-name';
  said: string;
  options?: string[];
  /** How Milo's face should look while it says this. */
  mood?: 'worried' | 'reassuring';
}

let offering = false;
let lastSentAt = 0;
/** No helper is saved, and she is typing one in: first the address, then the name, then a yes. */
let asking: { step: 'email' } | { step: 'name'; email: string } | { step: 'confirm'; helper: Helper } | null = null;

const setAsking = (next: typeof asking): void => {
  asking = next;
  listen('family', next?.step === 'email' || next?.step === 'name'); // what she types now is the address or the name
};

/** "your daughter, Maya" when she has said who they are to her, otherwise "Maya". */
const who = (helper: Helper): string => (helper.relation ? `your ${helper.relation}, ${helper.name}` : helper.name);
const tidyRelation = (text?: string): string | undefined => {
  const t = (text ?? '').toLowerCase().replace(/^my\s+/, '').replace(/[^a-z' -]/g, '').trim().slice(0, 24);
  return t || undefined;
};

export async function loadHelper(): Promise<Helper | null> {
  const saved = await need('store').get<Helper>(HELPER_KEY);
  if (!saved?.name?.trim() || !/^\S+@\S+\.\S+$/.test(saved.email ?? '')) return null;
  const relation = tidyRelation(saved.relation);
  return relation ? { name: saved.name, email: saved.email, relation } : { name: saved.name, email: saved.email };
}

export async function saveHelper(helper: Helper): Promise<void> {
  const relation = tidyRelation(helper.relation);
  await need('store').set(HELPER_KEY, { name: helper.name.trim(), email: helper.email.trim(), ...(relation ? { relation } : {}) });
}

export async function clearHelper(): Promise<void> {
  await need('store').remove(HELPER_KEY);
}

const NO_HELPER: StuckState = { status: 'no-helper', said: 'I don\'t know who to ask yet. You can add the person who helps you under "Who helps you" in My details.' };

/** "I'm stuck": ask whether to tell her helper. Nothing is sent yet. */
export async function offer(): Promise<StuckState> {
  const helper = await loadHelper();
  if (!helper) {
    // Nobody to ask yet. Don't send her off to a settings screen while she's stuck: ask here.
    setAsking({ step: 'email' });
    return {
      status: 'need-email',
      mood: 'worried',
      said: "Oh no. I don't have anyone to ask yet. If you know the email address of someone you trust, type it in the box below. I'll send them a short note to say you'd like a hand.",
      options: ['No, not yet'],
    };
  }
  if (lastSentAt && Date.now() - lastSentAt < QUIET_MS) {
    return { status: 'sent', mood: 'reassuring', said: `I told ${helper.name} a moment ago. Give them a little time to answer.` };
  }
  offering = true;
  const at = player.where();
  const about = at ? ` with step ${at.step} of "${at.task}"` : '';
  const name = helper.relation ? `${who(helper)},` : helper.name;
  return { status: 'offer', mood: 'worried', said: `Want me to let ${name} know you'd like a hand${about}?`, options: [`Yes, tell ${helper.name}`, 'No, not yet'] };
}

/** She typed or said something while Milo is asking who to tell. */
export function heard(words: string): StuckState {
  if (asking?.step === 'email') {
    const email = words.trim().toLowerCase().replace(/[.,;!]+$/, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { status: 'need-email', mood: 'worried', said: "That doesn't look like an email address yet. It should look like name@example.com. Have another go, or we can leave it for now.", options: ['No, not yet'] };
    }
    setAsking({ step: 'name', email });
    return { status: 'need-name', said: "Thank you. And what's their first name?", options: ['No, not yet'] };
  }
  if (asking?.step === 'name') {
    const name = words
      .replace(/[^\p{L}' -]/gu, '')
      .trim()
      .slice(0, 30)
      .replace(/(^|[ -])(\p{L})/gu, (_m, gap: string, letter: string) => gap + letter.toUpperCase());
    if (!name) return { status: 'need-name', said: "I didn't catch a name. What's their first name?", options: ['No, not yet'] };
    const helper: Helper = { name, email: asking.email };
    setAsking({ step: 'confirm', helper });
    offering = true;
    return {
      status: 'offer',
      mood: 'worried',
      said: `I'll send a short note to ${name} at ${helper.email}. Shall I? I'll remember them for next time, and you can change that in My details.`,
      options: [`Yes, tell ${name}`, 'No, not yet'],
    };
  }
  return { status: 'declined', said: '' };
}

/** She started something else: stop asking, keep nothing. */
export function reset(): void {
  setAsking(null);
  offering = false;
}

/** Waiting for her to type the address or the name. */
export const isAsking = (): boolean => asking?.step === 'email' || asking?.step === 'name';

/** "Yes, tell Maya." */
export async function send(): Promise<StuckState> {
  // She has just typed in who to tell, and said yes: now it is kept.
  if (asking?.step === 'confirm') {
    await saveHelper(asking.helper);
    setAsking(null);
  }
  const helper = await loadHelper();
  if (!helper) return NO_HELPER;
  offering = false;
  const mine = (await need('store').get<MyDetails>(DETAILS_KEY)) ?? {};
  const at = player.where();
  const note: StuckNote = { to: helper.email, helperName: helper.name, fromName: mine.givenName?.trim() || 'Someone you help' };
  if (at) Object.assign(note, { task: at.task, step: at.step, of: at.of });
  // Reply notes are off unless she has ticked the box. When on, the email gets a link for one short note back.
  if ((await need('store').get<boolean>(REPLY_KEY)) === true) {
    let inbox = await need('store').get<string>(INBOX_KEY);
    if (!inbox) await need('store').set(INBOX_KEY, (inbox = newSecret()));
    note.replyInbox = inbox;
  }

  let ok = false;
  try {
    ok = await need('family').tellHelper(note);
  } catch {
    ok = false;
  }
  if (!ok) {
    offering = true; // "Try again" is a yes
    return { status: 'failed', mood: 'worried', said: `I couldn't reach ${helper.name} just now. That's not your fault. You could phone them, or I can try again.`, options: ['Try again', 'No, not yet'] };
  }
  lastSentAt = Date.now();
  return {
    status: 'sent',
    mood: 'reassuring',
    said: `Don't worry. I've told ${who(helper)}. Nothing's lost, and everything on this page stays just as it is. You can wait for them, or keep going if you like.`,
  };
}

export function decline(): StuckState {
  setAsking(null);
  offering = false;
  return { status: 'declined', said: 'That\'s fine. I\'m here if you change your mind.' };
}

/** Waiting for a yes or a no. */
export const isOffering = (): boolean => offering;

// ---- A note that came back from her helper ----

const NOTE_LAYER = 'family-note';
let noteTimer: number | undefined;

/** Plain words only, whatever arrived: no markup, no web addresses, cut short. */
function plainNote(text: unknown, max: number): string {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f<>]+/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Show her helper's note. If she is in the middle of a saved task, it is drawn beside the step she is on,
 * with the helper's name, for long enough to read twice. It is always said as well.
 */
export function showNote(note: HelperNote): StuckState {
  const text = plainNote(note.text, 200);
  const from = plainNote(note.from, 40) || 'Your helper';
  if (!text) return { status: 'declined', said: '' };
  const said = `${from} says: "${text}"`;
  const lit = player.isPlaying() ? spotlight.lit() : null;
  if (lit) {
    window.clearTimeout(noteTimer);
    need('overlay').labels(NOTE_LAYER, [{ targetId: lit, text: said, tone: 'info' }]);
    noteTimer = window.setTimeout(() => need('overlay').clear(NOTE_LAYER), 45_000);
  }
  return { status: 'sent', mood: 'reassuring', said: lit ? `${said} I've put it beside the step you're on.` : said };
}

// ---- tools, for B's tool list ----

const result = (state: StuckState): ToolResult => ({ ok: state.status !== 'failed' && state.status !== 'no-helper', said: state.said, data: { status: state.status, options: state.options } });

export const stuckTool: Tool = {
  name: 'im_stuck',
  owner: 'guide',
  description:
    'The person is stuck and wants a family member to know. This only ASKS whether to send the message; run stuck_send after they say yes. Use for "I\'m stuck", "I need help from my daughter", "ask someone for help".',
  parameters: {},
  run: async () => result(await offer()),
};

export const stuckSendTool: Tool = {
  name: 'stuck_send',
  owner: 'guide',
  description: 'The person said yes: send the "I\'m stuck" message to their helper. It carries the task name and step number only.',
  parameters: {},
  run: async () => result(await send()),
};

export const stuckCancelTool: Tool = {
  name: 'stuck_cancel',
  owner: 'guide',
  description: 'The person said no to telling their helper. Nothing is sent.',
  parameters: {},
  run: async () => result(decline()),
};
