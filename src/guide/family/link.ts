// Linking a helper's computer to hers, tasks that arrive by themselves, and notes that come back.
// The panel's side. Owner: C. The relay's side is relay/src/family.ts.
//
// Who holds what:
//   - HER Steady makes a secret of its own (the "inbox"). To link, her computer asks the relay for a short
//     code and shows it. So linking always starts on her computer, with her (or someone sitting with her).
//   - The HELPER types the code into their Steady and gets a token that can do one thing: put a task in her inbox.
//   - Her Steady collects what is waiting. A task is checked and rebuilt before it is kept, exactly as one
//     that came by three words is. A note is plain text.

import { RELAY_URL } from '@/helper/relay';
import { deviceStore } from '@/shared/device-store';
import { HELPER_KEY, HELPS_KEY, INBOX_KEY, LINK_KEY, REPLY_KEY, newSecret, type Helper, type HelperNote } from '@/shared/family';
import { readWords } from '@/shared/sharewords';
import { checkTask, type RecordedTask } from '@/shared/tasks';

const TASKS_KEY = 'guide:tasks';
/** Things already collected, to tell the relay next time so it can let go of them. */
const GOT_KEY = 'guide:inbox-got';
/** Until when her Steady is expecting something soon (a helper typing the code, a note after "I'm stuck"). */
export const SOON_KEY = 'guide:inbox-soon';
const relayUrl = async () => (await deviceStore.get<string>('guide:relay-url')) ?? RELAY_URL;
const NO_REACH = "I couldn't reach Steady's server just now. Check the internet is working, then try again.";

async function post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> } | null> {
  try {
    const r = await fetch(`${await relayUrl()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    return { status: r.status, data: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null;
  }
}

async function inbox(): Promise<string> {
  let secret = await deviceStore.get<string>(INBOX_KEY);
  if (!secret) await deviceStore.set(INBOX_KEY, (secret = newSecret()));
  return secret;
}

/** Collect often for the next while: something is expected. */
export const expectSoon = (minutes = 15): Promise<void> => deviceStore.set(SOON_KEY, Date.now() + minutes * 60_000);

// ---- Her computer ----

export type Code = { ok: true; code: string; minutes: number } | { ok: false; said: string };

/** "Get a code to read to them." */
export async function getCode(): Promise<Code> {
  const r = await post('/family/code', { inbox: await inbox() });
  if (!r) return { ok: false, said: NO_REACH };
  if (r.status === 429) return { ok: false, said: "That's a lot of codes in a short time. Give it ten minutes, then try again." };
  if (r.status !== 200 || typeof r.data.code !== 'string') return { ok: false, said: "I couldn't make a code just now. Please try again in a moment." };
  await expectSoon(Number(r.data.minutes) || 15);
  return { ok: true, code: r.data.code, minutes: Number(r.data.minutes) || 15 };
}

export const isLinked = async (): Promise<boolean> => (await deviceStore.get<{ linked: boolean }>(LINK_KEY))?.linked === true;

/** "Unlink": every helper's computer stops being able to send here. */
export async function unlinkAll(): Promise<boolean> {
  const r = await post('/family/unlink', { inbox: await inbox() });
  if (r?.status !== 200) return false;
  await deviceStore.set(LINK_KEY, { linked: false, at: Date.now() });
  return true;
}

/** Is there any reason to ask the relay at all? Someone with no link and no reply notes never does. */
export async function shouldCollect(): Promise<{ yes: boolean; soon: boolean }> {
  const soon = ((await deviceStore.get<number>(SOON_KEY)) ?? 0) > Date.now();
  const yes = soon || (await isLinked()) || (await deviceStore.get<boolean>(REPLY_KEY)) === true;
  return { yes, soon };
}

export interface Collected {
  /** Tasks that have just been added, with the helper's name on them. */
  tasks: RecordedTask[];
  notes: HelperNote[];
  /** A helper's computer has just been linked. */
  justLinked: boolean;
  helperName: string;
}

/** Ask the relay what is waiting. Tasks are checked and kept; notes are handed back to be shown. */
export async function collect(): Promise<Collected | null> {
  const secret = await deviceStore.get<string>(INBOX_KEY);
  if (!secret) return null;
  const got = (await deviceStore.get<string[]>(GOT_KEY)) ?? [];
  const r = await post('/family/inbox', { inbox: secret, ack: got });
  if (r?.status !== 200 || !Array.isArray(r.data.items)) return null;

  const helperName = (await deviceStore.get<Helper>(HELPER_KEY))?.name?.trim() || 'Your helper';
  const out: Collected = { tasks: [], notes: [], justLinked: false, helperName };
  const seen = new Set(got);
  const ids: string[] = [];
  const wasLinked = await isLinked();
  for (const raw of r.data.items as Array<Record<string, unknown>>) {
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!id) continue;
    ids.push(id);
    if (seen.has(id)) continue; // collected last time; the relay is being told now
    if (raw.kind === 'linked') out.justLinked = !wasLinked;
    if (raw.kind === 'task') {
      const task = checkTask(raw.task);
      if (task) out.tasks.push({ ...task, shared: { at: Date.now(), from: helperName } });
    }
    if (raw.kind === 'note' && typeof raw.text === 'string' && (await deviceStore.get<boolean>(REPLY_KEY)) === true) {
      out.notes.push({ text: raw.text, from: helperName, task: typeof raw.task === 'string' ? raw.task : undefined, step: typeof raw.step === 'number' ? raw.step : undefined });
    }
  }
  if (out.tasks.length) {
    const all = (await deviceStore.get<RecordedTask[]>(TASKS_KEY)) ?? [];
    const fresh = new Set(out.tasks.map((t) => t.id));
    await deviceStore.set(TASKS_KEY, [...all.filter((t) => !fresh.has(t.id)), ...out.tasks]);
  }
  if (r.data.linked === true !== wasLinked) await deviceStore.set(LINK_KEY, { linked: r.data.linked === true, at: Date.now() });
  await deviceStore.set(GOT_KEY, ids);
  return out;
}

// ---- The helper's computer ----

export type Joined = { ok: true; fixed: string[] } | { ok: false; said: string };

/** The helper types the three words that her computer is showing. */
export async function joinWith(typed: string): Promise<Joined> {
  const read = readWords(typed);
  if (!read.ok) return read;
  const r = await post('/family/join', { code: read.words.join(' ') });
  if (!r) return { ok: false, said: NO_REACH };
  if (r.status === 404) return { ok: false, said: "Those words didn't link anything. They work once, for 15 minutes. Ask them to press \"Get a code to read to them\" again." };
  if (r.status === 429) return { ok: false, said: "That's a lot of tries in a short time. Give it ten minutes, then try again." };
  if (r.status !== 200 || typeof r.data.send !== 'string') return { ok: false, said: "I couldn't link just now. Please try again in a moment." };
  await deviceStore.set(HELPS_KEY, { send: r.data.send, at: Date.now() });
  return { ok: true, fixed: read.fixed };
}

export const isHelping = async (): Promise<boolean> => !!(await deviceStore.get<{ send: string }>(HELPS_KEY))?.send;
export const stopHelping = (): Promise<void> => deviceStore.remove(HELPS_KEY);

export type SentOver = { ok: true } | { ok: false; said: string; unlinked?: boolean };

/** Send a task straight to the linked computer. Only the steps go, never anyone's answers. */
export async function sendLinked(task: RecordedTask): Promise<SentOver> {
  const helps = await deviceStore.get<{ send: string }>(HELPS_KEY);
  if (!helps?.send) return { ok: false, said: 'This computer is not linked to anyone yet.', unlinked: true };
  const { shared: _shared, ...plain } = task;
  const r = await post('/family/task', { send: helps.send, task: plain });
  if (!r) return { ok: false, said: NO_REACH };
  if (r.status === 403) {
    await deviceStore.remove(HELPS_KEY);
    return { ok: false, said: 'They have unlinked this computer, so I could not send it. You can link again with a new code.', unlinked: true };
  }
  if (r.status === 429) return { ok: false, said: 'They have a lot waiting already. Ask them to open Steady, then try again.' };
  return r.status === 200 ? { ok: true } : { ok: false, said: "I couldn't send it just now. Please try again in a moment." };
}
