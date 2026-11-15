// Feature 12 on the relay: linking a helper by a short code, a task arriving, and a note sent back.
import { expect, test } from '@playwright/test';
import { CODE_MINUTES, NOTES_PER_REPLY, join, leaveNote, memoryFamily, newCode, openReply, readInbox, replyInfo, replyPage, sendTask, tidyNote, unlink } from '../relay/src/family';
import { stuckMessage } from '../relay/src/stuckMessage';

const HERS = 'a'.repeat(32);
let n = 0;
const token = () => (++n).toString(16).padStart(32, '0');
const pick = (max: number) => (n++ * 7) % max;
const TASK = { version: 1, id: 't1', name: 'Book a doctor', site: 'https://clinic.example', recordedAt: 1, steps: [{ type: 'click', say: 'Click "Next".', locator: { label: 'Next', kind: 'button', protection: 'none' }, page: { origin: 'https://clinic.example', path: '/', stage: 'booking' } }] };

test('her computer gets three words; the helper types them and is linked; she is told', async () => {
  const store = memoryFamily();
  const code = (await newCode(store, HERS, pick))!;
  expect(code.split(' ')).toHaveLength(3);
  const send = await join(store, code.toUpperCase().replace(/ /g, ', '), token);
  expect(send).toMatch(/^[a-f0-9]{32}$/);
  const inbox = (await readInbox(store, HERS, []))!;
  expect(inbox.linked).toBe(true);
  expect(inbox.items.map((i) => i.kind)).toEqual(['linked']);
});

test('a code works once, and only for a quarter of an hour', async () => {
  let clock = 1_000_000;
  const store = memoryFamily(() => clock);
  const code = (await newCode(store, HERS, pick))!;
  expect(await join(store, code, token)).not.toBeNull();
  expect(await join(store, code, token)).toBeNull(); // used
  const late = (await newCode(store, HERS, pick))!;
  clock += (CODE_MINUTES + 1) * 60_000;
  expect(await join(store, late, token)).toBeNull(); // too late
  expect(await join(store, 'garden kettle', token)).toBeNull();
  expect(await newCode(store, 'not a token', pick)).toBeNull();
});

test('a linked helper sends a task: it waits in her inbox until her Milo says it has it', async () => {
  const store = memoryFamily();
  const send = (await join(store, (await newCode(store, HERS, pick))!, token))!;
  expect(await sendTask(store, send, TASK, token)).toBe('ok');
  const first = (await readInbox(store, HERS, []))!.items;
  expect(first.map((i) => i.kind)).toEqual(['linked', 'task']);
  expect((first[1] as unknown as { task: { name: string } }).task.name).toBe('Book a doctor');
  expect((await readInbox(store, HERS, []))!.items).toHaveLength(2); // not lost if the first answer never arrived
  expect((await readInbox(store, HERS, first.map((i) => i.id)))!.items).toEqual([]); // collected
});

test('someone who is not linked, or no longer linked, cannot put anything in her inbox', async () => {
  const store = memoryFamily();
  expect(await sendTask(store, token(), TASK, token)).toBe('not-linked');
  const send = (await join(store, (await newCode(store, HERS, pick))!, token))!;
  expect(await sendTask(store, send, { name: 'no steps' }, token)).toBe('bad-task');
  expect(await unlink(store, HERS)).toBe(true);
  expect(await sendTask(store, send, TASK, token)).toBe('not-linked');
  expect((await readInbox(store, HERS, []))!.linked).toBe(false);
  expect(await readInbox(store, 'someone else', [])).toBeNull();
});

test('a reply note: plain words only, short, and it carries the helper\'s name and the step', async () => {
  const store = memoryFamily();
  const reply = (await openReply(store, HERS, { helperName: 'Maya', fromName: 'Rose', task: 'Book a doctor', step: 3, of: 11 }, token))!;
  expect(await replyInfo(store, reply)).toMatchObject({ helperName: 'Maya', fromName: 'Rose', task: 'Book a doctor', step: 3, of: 11, used: 0 });
  expect(await leaveNote(store, reply, '  Pick <b>Dr. Herrera</b>, you saw her last time.\nSee http://evil.example/login and www.bad.example now ', token)).toBe('ok');
  const [note] = (await readInbox(store, HERS, []))!.items;
  expect(note).toMatchObject({ kind: 'note', from: 'Maya', task: 'Book a doctor', step: 3, text: 'Pick b Dr. Herrera /b , you saw her last time. See and now' });
  expect(await leaveNote(store, reply, '   ', token)).toBe('empty');
  expect(await leaveNote(store, token(), 'hello', token)).toBe('gone');
});

test('one "I\'m stuck" can be answered a few times, not without end', async () => {
  const store = memoryFamily();
  const reply = (await openReply(store, HERS, { helperName: 'Maya', fromName: 'Rose' }, token))!;
  for (let i = 0; i < NOTES_PER_REPLY; i++) expect(await leaveNote(store, reply, `note ${i}`, token)).toBe('ok');
  expect(await leaveNote(store, reply, 'one more', token)).toBe('enough');
});

test('a note is cut to a short length and web addresses are taken out', () => {
  expect(tidyNote('x'.repeat(500))!.length).toBe(200);
  expect(tidyNote('go to paypa1.com/verify right now')).toBe('go to right now');
  expect(tidyNote(42)).toBeNull();
});

test('the reply page shows the task and the step, never a page or anything typed, and escapes names', () => {
  const page = replyPage({ inboxId: 'x', helperName: 'Maya', fromName: '<script>Rose', task: 'Book "a" doctor', step: 3, of: 11 }, 'ask');
  expect(page).toContain('They were on step 3 of 11 of “Book &quot;a&quot; doctor”.');
  expect(page).not.toContain('<script>Rose');
  expect(page).not.toMatch(/<script/i); // no scripts on the page at all
  expect(replyPage(null, 'gone')).toContain('This link has finished');
});

test('with no first name saved, the email and the reply page say "they" and "them", not "Someone you help" over and over', () => {
  const mail = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Someone you help', task: 'Book a doctor', step: 9, of: 18 }, 'http://relay.example/reply/abc')!;
  expect(mail.subject).toBe('Someone you help would like a hand');
  expect(mail.text).toContain('Someone you help pressed "I\'m stuck" in Milo, the helper on their computer, and would like a hand.\nThey were on step 9 of 18 of "Book a doctor".');
  expect(mail.text).toContain('To send them a short note that appears in Milo, open this link:');
  expect(mail.text.match(/Someone you help/g)).toHaveLength(1);
  const named = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose', task: 'Book a doctor', step: 9, of: 18 })!;
  expect(named.text).toContain('Rose was on step 9 of 18 of "Book a doctor".');

  const about = { inboxId: 'x', helperName: 'Maya', fromName: 'Someone you help', task: 'Book a doctor', step: 9, of: 18 };
  expect(replyPage(about, 'ask')).toContain('<h1>Someone you help would like a hand</h1>');
  expect(replyPage(about, 'sent')).toContain('They will see your note in Milo');
  expect(replyPage(about, 'ask')).toContain('what website they were on');
  expect(replyPage({ ...about, fromName: 'Rose' }, 'sent')).toContain('Rose will see your note in Milo');
});

test('the email only gets a link when reply notes are on', () => {
  const plain = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' })!;
  expect(plain.text).not.toContain('http');
  const withLink = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' }, 'http://relay.example/reply/abc')!;
  expect(withLink.text).toContain('To send Rose a short note that appears in Milo, open this link:\nhttp://relay.example/reply/abc\nIt works for 2 days.');
});
