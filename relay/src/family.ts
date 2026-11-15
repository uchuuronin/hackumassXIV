// Linking a helper's computer to the person they help, and notes sent back to her. Owner: C.
// The plain parts, kept apart from the server and the database so they can be checked on their own.
//
// How it fits together:
//   - Her Milo has a secret of its own (an "inbox" token). The relay only ever keeps a fingerprint of it.
//   - To link, HER computer asks for a short code: three everyday words, good for 15 minutes, used once.
//     The helper types it into their Milo and gets a token that can do one thing: put a task in her inbox.
//   - When she presses "I'm stuck" with reply notes switched on, the email carries a link to a small page.
//     A note typed there goes into her inbox. The page shows the task's name and the step number, nothing else.
//   - Her Milo collects what is in the inbox. Nothing is pushed to her, and nothing is kept for long.

import { createHash } from 'node:crypto';
import { makeCode, tidyCode, tidyTask } from './taskShare';

export const CODE_MINUTES = 15;
export const INBOX_DAYS = 7;
export const REPLY_DAYS = 2;
/** How many notes one "I'm stuck" message can be answered with. */
export const NOTES_PER_REPLY = 3;
export const NOTE_MAX = 200;
const INBOX_MAX = 20;

export type InboxItem =
  | { id: string; kind: 'linked'; at: number }
  | { id: string; kind: 'task'; at: number; task: Record<string, unknown> }
  | { id: string; kind: 'note'; at: number; text: string; from: string; task?: string; step?: number };

/** What the reply page may show: two first names, the task's name and the step. Never the page or anything typed. */
export interface ReplyInfo {
  inboxId: string;
  helperName: string;
  fromName: string;
  task?: string;
  step?: number;
  of?: number;
}

export interface FamilyStore {
  putCode(code: string, inboxId: string): Promise<void>;
  /** The inbox the code opens, or null. A code works once. */
  takeCode(code: string): Promise<string | null>;
  putLink(sendId: string, inboxId: string): Promise<void>;
  inboxOf(sendId: string): Promise<string | null>;
  countLinks(inboxId: string): Promise<number>;
  unlink(inboxId: string): Promise<void>;
  push(inboxId: string, item: InboxItem): Promise<void>;
  list(inboxId: string): Promise<InboxItem[]>;
  ack(inboxId: string, ids: string[]): Promise<void>;
  putReply(replyId: string, info: ReplyInfo): Promise<void>;
  getReply(replyId: string): Promise<(ReplyInfo & { used: number }) | null>;
  useReply(replyId: string): Promise<void>;
}

export const fingerprint = (token: string): string => createHash('sha256').update(token).digest('hex');
/** A secret made by `crypto.getRandomValues`, written as 32 to 64 hex characters. Anything else is refused. */
export const tidyToken = (value: unknown): string | null => (typeof value === 'string' && /^[a-f0-9]{32,64}$/.test(value) ? value : null);

const clean = (value: unknown, max: number): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * A helper's note, as plain text: no markup, no web addresses, one short paragraph. Null if nothing is left.
 * Web addresses are taken out because a note that says "go to this site" is how a scam would use this.
 */
export function tidyNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = clean(value.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ').replace(/\b[\w-]+\.(?:com|net|org|co|io|info|biz|ru|cn|xyz)\b\S*/gi, ' '), NOTE_MAX);
  return text || null;
}

// ---- Linking ----

/** Her computer asks for a code to read out. */
export async function newCode(store: FamilyStore, inboxToken: unknown, pick: (max: number) => number): Promise<string | null> {
  const token = tidyToken(inboxToken);
  if (!token) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode(pick);
    try {
      await store.putCode(code, fingerprint(token));
      return code;
    } catch {
      // those three words are in use just now: try three others
    }
  }
  return null;
}

/** The helper types the code. They get a token that can put tasks in her inbox, and she is told a helper is linked. */
export async function join(store: FamilyStore, codeText: unknown, newToken: () => string): Promise<string | null> {
  const code = tidyCode(codeText);
  const inboxId = code && (await store.takeCode(code));
  if (!inboxId) return null;
  const send = newToken();
  await store.putLink(fingerprint(send), inboxId);
  await store.push(inboxId, { id: newToken().slice(0, 16), kind: 'linked', at: Date.now() });
  return send;
}

/** A linked helper sends a task. It waits in her inbox until her Milo collects it. */
export async function sendTask(store: FamilyStore, sendToken: unknown, taskInput: unknown, newId: () => string): Promise<'ok' | 'not-linked' | 'bad-task' | 'full'> {
  const token = tidyToken(sendToken);
  const inboxId = token && (await store.inboxOf(fingerprint(token)));
  if (!inboxId) return 'not-linked';
  const task = tidyTask(taskInput);
  if (!task) return 'bad-task';
  if ((await store.list(inboxId)).length >= INBOX_MAX) return 'full';
  await store.push(inboxId, { id: newId().slice(0, 16), kind: 'task', at: Date.now(), task });
  return 'ok';
}

/** Her Milo collects what is waiting, and says which earlier items it has safely received. */
export async function readInbox(store: FamilyStore, inboxToken: unknown, ack: unknown): Promise<{ items: InboxItem[]; linked: boolean } | null> {
  const token = tidyToken(inboxToken);
  if (!token) return null;
  const inboxId = fingerprint(token);
  const got = Array.isArray(ack) ? ack.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{8,32}$/.test(id)).slice(0, 50) : [];
  if (got.length) await store.ack(inboxId, got);
  return { items: await store.list(inboxId), linked: (await store.countLinks(inboxId)) > 0 };
}

/** She unlinks: every helper's token for her inbox stops working. */
export async function unlink(store: FamilyStore, inboxToken: unknown): Promise<boolean> {
  const token = tidyToken(inboxToken);
  if (!token) return false;
  await store.unlink(fingerprint(token));
  return true;
}

// ---- Reply notes ----

/** "I'm stuck" was sent with reply notes on: make the secret that goes in the email's link. */
export async function openReply(store: FamilyStore, inboxToken: unknown, about: { helperName?: unknown; fromName?: unknown; task?: unknown; step?: unknown; of?: unknown }, newToken: () => string): Promise<string | null> {
  const token = tidyToken(inboxToken);
  if (!token) return null;
  const step = Number(about.step);
  const of = Number(about.of);
  const info: ReplyInfo = { inboxId: fingerprint(token), helperName: clean(about.helperName, 60) || 'Your helper', fromName: clean(about.fromName, 60) || 'Someone you help' };
  const task = clean(about.task, 120);
  if (task) info.task = task;
  if (Number.isInteger(step) && step >= 1 && step <= 500) info.step = step;
  if (Number.isInteger(of) && of >= 1 && of <= 500) info.of = of;
  const reply = newToken();
  await store.putReply(fingerprint(reply), info);
  return reply;
}

export async function replyInfo(store: FamilyStore, replyToken: unknown): Promise<(ReplyInfo & { used: number }) | null> {
  const token = tidyToken(replyToken);
  return token ? store.getReply(fingerprint(token)) : null;
}

/** The helper sends a note from the reply page. */
export async function leaveNote(store: FamilyStore, replyToken: unknown, noteText: unknown, newId: () => string): Promise<'ok' | 'gone' | 'empty' | 'enough'> {
  const token = tidyToken(replyToken);
  const info = token && (await store.getReply(fingerprint(token)));
  if (!token || !info) return 'gone';
  if (info.used >= NOTES_PER_REPLY) return 'enough';
  const text = tidyNote(noteText);
  if (!text) return 'empty';
  const item: InboxItem = { id: newId().slice(0, 16), kind: 'note', at: Date.now(), text, from: info.helperName };
  if (info.task) item.task = info.task;
  if (info.step) item.step = info.step;
  await store.push(info.inboxId, item);
  await store.useReply(fingerprint(token));
  return 'ok';
}

// ---- The reply page ----

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One small page, no scripts, large type. `state` says what just happened. */
export function replyPage(info: ReplyInfo | null, state: 'ask' | 'sent' | 'empty' | 'enough' | 'gone'): string {
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>A note for someone you help</title>
<style>body{font:20px/1.5 system-ui,sans-serif;color:#1f2b3a;background:#fbf9f4;margin:0;padding:24px}main{max-width:560px;margin:0 auto;background:#fff;border:2px solid #1f2b3a;border-radius:16px;padding:24px}h1{font-size:28px;margin:0 0 12px}textarea{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:2px solid #1f2b3a;border-radius:12px;min-height:110px}button{font:inherit;font-weight:700;padding:14px 22px;margin-top:14px;border:2px solid #1f2b3a;border-radius:12px;background:#1f2b3a;color:#fff;cursor:pointer}small{display:block;margin-top:16px;color:#4a5868}label{font-weight:700;display:block;margin:14px 0 6px}</style></head><body><main>`;
  const foot = '</main></body></html>';
  if (!info || state === 'gone') return `${head}<h1>This link has finished</h1><p>It only works for ${REPLY_DAYS} days. A telephone call is the quickest way to help now.</p>${foot}`;
  const who = esc(info.fromName);
  // With no first name saved: the heading says "Someone you help" once, and after that it is "they".
  const named = info.fromName !== 'Someone you help';
  const they = named ? who : 'They';
  const lower = named ? who : 'they';
  const where = info.task && info.step && info.of ? `They were on step ${info.step} of ${info.of} of “${esc(info.task)}”.` : info.task ? `They were doing “${esc(info.task)}”.` : '';
  if (state === 'sent') return `${head}<h1>Sent</h1><p>${they} will see your note in Milo, beside the step they are on. A telephone call still helps most.</p>${foot}`;
  if (state === 'enough') return `${head}<h1>That's all the notes for this one</h1><p>You've sent ${NOTES_PER_REPLY} notes for this message. A telephone call is the quickest way to help now.</p>${foot}`;
  const problem = state === 'empty' ? '<p role="alert"><strong>There was nothing to send. Please write a few words.</strong> Web addresses are taken out.</p>' : '';
  return `${head}<h1>${who} would like a hand</h1><p>${where} You can send one short note. It appears in Milo on their computer, beside the step they are on.</p>${problem}
<form method="post"><label for="note">Your note (up to ${NOTE_MAX} letters, plain words only)</label><textarea id="note" name="note" maxlength="${NOTE_MAX}" required></textarea><button type="submit">Send the note</button></form>
<small>Milo did not tell us what website ${lower} ${named ? 'was' : 'were'} on or anything they typed, so this page can't show it. Web addresses in a note are taken out.</small>${foot}`;
}

// ---- A store kept in the relay's memory: for trying things out, and for the tests ----

export function memoryFamily(now: () => number = Date.now): FamilyStore {
  const codes = new Map<string, { inboxId: string; at: number }>();
  const links = new Map<string, string>();
  const inbox = new Map<string, InboxItem[]>();
  const replies = new Map<string, { info: ReplyInfo; used: number; at: number }>();
  return {
    async putCode(code, inboxId) {
      const held = codes.get(code);
      if (held && now() - held.at < CODE_MINUTES * 60_000) throw new Error('in use');
      codes.set(code, { inboxId, at: now() });
    },
    async takeCode(code) {
      const held = codes.get(code);
      codes.delete(code);
      return held && now() - held.at < CODE_MINUTES * 60_000 ? held.inboxId : null;
    },
    async putLink(sendId, inboxId) {
      links.set(sendId, inboxId);
    },
    async inboxOf(sendId) {
      return links.get(sendId) ?? null;
    },
    async countLinks(inboxId) {
      return [...links.values()].filter((id) => id === inboxId).length;
    },
    async unlink(inboxId) {
      for (const [sendId, id] of links) if (id === inboxId) links.delete(sendId);
    },
    async push(inboxId, item) {
      inbox.set(inboxId, [...(inbox.get(inboxId) ?? []), item]);
    },
    async list(inboxId) {
      return (inbox.get(inboxId) ?? []).filter((item) => now() - item.at < INBOX_DAYS * 86_400_000);
    },
    async ack(inboxId, ids) {
      inbox.set(inboxId, (inbox.get(inboxId) ?? []).filter((item) => !ids.includes(item.id)));
    },
    async putReply(replyId, info) {
      replies.set(replyId, { info, used: 0, at: now() });
    },
    async getReply(replyId) {
      const held = replies.get(replyId);
      return held && now() - held.at < REPLY_DAYS * 86_400_000 ? { ...held.info, used: held.used } : null;
    },
    async useReply(replyId) {
      const held = replies.get(replyId);
      if (held) held.used += 1;
    },
  };
}
