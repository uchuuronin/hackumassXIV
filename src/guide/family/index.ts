// Feature 12, "I'm stuck". One press lets the person who helps her know.
//   - It asks first, in a way that is easy to say yes or no to. Asking for help should never feel like failing.
//   - It sends once. A second press a moment later does not send a second message.
//   - The message has the task's name and the step number. Nothing about the page, nothing she typed.

import type { MyDetails } from '@/shared/details';
import { DETAILS_KEY } from '@/shared/details';
import { HELPER_KEY, type Helper, type StuckNote } from '@/shared/family';
import { need } from '@/shared/ports';
import type { Tool, ToolResult } from '@/shared/tools';
import * as player from '../player';

/** Long enough for a person to read an email and pick up the telephone. */
const QUIET_MS = 3 * 60_000;

export interface StuckState {
  status: 'offer' | 'sent' | 'failed' | 'declined' | 'no-helper';
  said: string;
  options?: string[];
}

let offering = false;
let lastSentAt = 0;

export async function loadHelper(): Promise<Helper | null> {
  const saved = await need('store').get<Helper>(HELPER_KEY);
  return saved?.name?.trim() && /^\S+@\S+\.\S+$/.test(saved.email ?? '') ? saved : null;
}

export async function saveHelper(helper: Helper): Promise<void> {
  await need('store').set(HELPER_KEY, { name: helper.name.trim(), email: helper.email.trim() });
}

export async function clearHelper(): Promise<void> {
  await need('store').remove(HELPER_KEY);
}

const NO_HELPER: StuckState = { status: 'no-helper', said: 'I don\'t know who to ask yet. You can add the person who helps you under "Who helps you" in My details.' };

/** "I'm stuck": ask whether to tell her helper. Nothing is sent yet. */
export async function offer(): Promise<StuckState> {
  const helper = await loadHelper();
  if (!helper) return NO_HELPER;
  if (lastSentAt && Date.now() - lastSentAt < QUIET_MS) {
    return { status: 'sent', said: `I told ${helper.name} a moment ago. Give them a little time to answer.` };
  }
  offering = true;
  const at = player.where();
  const about = at ? ` with step ${at.step} of "${at.task}"` : '';
  return { status: 'offer', said: `Want me to let ${helper.name} know you'd like a hand${about}?`, options: [`Yes, tell ${helper.name}`, 'No, not yet'] };
}

/** "Yes, tell Maya." */
export async function send(): Promise<StuckState> {
  const helper = await loadHelper();
  if (!helper) return NO_HELPER;
  offering = false;
  const mine = (await need('store').get<MyDetails>(DETAILS_KEY)) ?? {};
  const at = player.where();
  const note: StuckNote = { to: helper.email, helperName: helper.name, fromName: mine.givenName?.trim() || 'Someone you help' };
  if (at) Object.assign(note, { task: at.task, step: at.step, of: at.of });

  let ok = false;
  try {
    ok = await need('family').tellHelper(note);
  } catch {
    ok = false;
  }
  if (!ok) {
    offering = true; // "Try again" is a yes
    return { status: 'failed', said: `I couldn't reach ${helper.name} just now. That's not your fault. You could phone them, or I can try again.`, options: ['Try again', 'No, not yet'] };
  }
  lastSentAt = Date.now();
  return { status: 'sent', said: `I've told ${helper.name}. Nothing's lost. Everything on this page stays just as it is. You can wait for them, or keep going if you like.` };
}

export function decline(): StuckState {
  offering = false;
  return { status: 'declined', said: 'That\'s fine. I\'m here if you change your mind.' };
}

/** Waiting for a yes or a no. */
export const isOffering = (): boolean => offering;

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
