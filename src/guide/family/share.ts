// Passing a recorded task to another computer with three everyday words. The panel's side. Owner: C.
//
// Why three words and not a code: they are said over the telephone and typed by someone who may not type
// much. "Garden, kettle, tulip" is easier to hear and to get right than "K7Q-9XM", and a small slip in the
// spelling is put right (src/shared/sharewords.ts).
//
// A task has where to click, choose and type. It never has anyone's answers in it. A task that arrives
// is checked and rebuilt (checkTask) and is always marked as having come from another computer.

import { RELAY_URL } from '@/helper/relay';
import { deviceStore } from '@/shared/device-store';
import { readWords } from '@/shared/sharewords';
import { checkTask, type RecordedTask } from '@/shared/tasks';

const TASKS_KEY = 'guide:tasks';
/** While building: point at a relay on this computer. Not set for anyone using Milo. */
const relayUrl = async () => (await deviceStore.get<string>('guide:relay-url')) ?? RELAY_URL;

const NO_REACH = "I couldn't reach Milo's server just now. Check the internet is working, then try again.";

export type Sent = { ok: true; words: string; days: number } | { ok: false; said: string };

/** The helper's side: send the steps, get three words back. */
export async function sendTask(task: RecordedTask): Promise<Sent> {
  try {
    const { shared: _shared, ...plain } = task; // where it came from is this computer's business
    const r = await fetch(`${await relayUrl()}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: plain }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { ok: false, said: r.status === 429 ? "That's a lot of tasks in a short time. Give it ten minutes, then try again." : "I couldn't send it just now. Please try again in a moment." };
    const reply = (await r.json()) as { code?: string; days?: number };
    return reply.code ? { ok: true, words: reply.code, days: reply.days ?? 7 } : { ok: false, said: "I couldn't send it just now. Please try again in a moment." };
  } catch {
    return { ok: false, said: NO_REACH };
  }
}

export type Found = { ok: true; task: RecordedTask; fixed: string[] } | { ok: false; said: string };

/** The other side: three words in, a task out. Nothing is saved until keepTask. */
export async function findTask(typed: string): Promise<Found> {
  const read = readWords(typed);
  if (!read.ok) return read;
  try {
    const r = await fetch(`${await relayUrl()}/tasks/find`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: read.words.join(' ') }),
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 404) return { ok: false, said: "I couldn't find a task under those three words. They only last 7 days. Could you check them with the person who gave them to you?" };
    if (!r.ok) return { ok: false, said: r.status === 429 ? "That's a lot of tries in a short time. Give it ten minutes, then try again." : NO_REACH };
    const task = checkTask(((await r.json()) as { task?: unknown }).task);
    if (!task) return { ok: false, said: "Something came back, but it isn't a task I can use, so I've left it alone." };
    return { ok: true, task, fixed: read.fixed };
  } catch {
    return { ok: false, said: NO_REACH };
  }
}

/** "Add it." A task with the same id replaces the older copy. */
export async function keepTask(task: RecordedTask): Promise<void> {
  const all = (await deviceStore.get<RecordedTask[]>(TASKS_KEY)) ?? [];
  await deviceStore.set(TASKS_KEY, [...all.filter((t) => t.id !== task.id), task]);
}
