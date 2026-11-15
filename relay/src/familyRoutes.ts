// Linking a helper by a short code, tasks that arrive by themselves, and reply notes. Owner: C.
// Registered from server.ts. The rules are in ./family.ts; this file only joins them to the web server.
//
//   POST /family/code    { inbox }            her computer asks for three words            -> { code, minutes }
//   POST /family/join    { code }             the helper types them                        -> { send }
//   POST /family/task    { send, task }       a linked helper sends a task                 -> { ok }
//   POST /family/inbox   { inbox, ack? }      her Steady collects what is waiting          -> { items, linked }
//   POST /family/unlink  { inbox }            she unlinks                                  -> { ok }
//   GET  /reply/:token                        the small page the "I'm stuck" email links to
//   POST /reply/:token   note=...             the helper sends a note from that page
//
// The /reply page is opened from an email, in an ordinary browser, so it cannot carry the extension's origin.
// server.ts lets /reply/ through its origin check for that reason. Everything under /family/ still needs it.

import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { CODE_MINUTES, join, leaveNote, newCode, readInbox, replyInfo, replyPage, sendTask, unlink } from './family';
import { familyStore } from './familyStore';

const token = () => randomBytes(16).toString('hex');
const few = (max: number) => ({ config: { rateLimit: { max, timeWindow: '10 minutes' } } });
const NOT_SET_UP = { error: 'family linking is not set up on the relay' };

export function registerFamily(app: FastifyInstance): void {
  const store = familyStore();
  // The reply page is a plain form, so it works with scripts switched off.
  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
  }

  app.post<{ Body: { inbox?: unknown } }>('/family/code', few(10), async (req, reply) => {
    if (!store) return reply.code(503).send(NOT_SET_UP);
    try {
      const code = await newCode(store, req.body?.inbox, (max) => randomInt(max));
      return code ? { code, minutes: CODE_MINUTES } : reply.code(400).send({ error: 'bad request' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not make a code' });
    }
  });

  // Strict, so a code can't be found by guessing: ten tries in ten minutes against two million combinations.
  app.post<{ Body: { code?: unknown } }>('/family/join', few(10), async (req, reply) => {
    if (!store) return reply.code(503).send(NOT_SET_UP);
    try {
      const send = await join(store, req.body?.code, token);
      return send ? { send } : reply.code(404).send({ error: 'not found' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not link' });
    }
  });

  app.post<{ Body: { send?: unknown; task?: unknown } }>('/family/task', few(20), async (req, reply) => {
    if (!store) return reply.code(503).send(NOT_SET_UP);
    try {
      const result = await sendTask(store, req.body?.send, req.body?.task, token);
      if (result === 'ok') return { ok: true };
      return reply.code(result === 'not-linked' ? 403 : result === 'full' ? 429 : 400).send({ error: result });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not send the task' });
    }
  });

  // Her Steady asks every few seconds while it is waiting for a reply, so this one is allowed more often.
  app.post<{ Body: { inbox?: unknown; ack?: unknown } }>('/family/inbox', few(400), async (req, reply) => {
    if (!store) return reply.code(503).send(NOT_SET_UP);
    try {
      const inbox = await readInbox(store, req.body?.inbox, req.body?.ack);
      return inbox ?? reply.code(400).send({ error: 'bad request' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not read the inbox' });
    }
  });

  app.post<{ Body: { inbox?: unknown } }>('/family/unlink', few(10), async (req, reply) => {
    if (!store) return reply.code(503).send(NOT_SET_UP);
    try {
      return (await unlink(store, req.body?.inbox)) ? { ok: true } : reply.code(400).send({ error: 'bad request' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not unlink' });
    }
  });

  const html = (reply: { type(t: string): { send(body: string): unknown }; header(name: string, value: string): unknown }, body: string) => {
    reply.header('cache-control', 'no-store');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
    return reply.type('text/html; charset=utf-8').send(body);
  };

  app.get<{ Params: { token: string } }>('/reply/:token', few(30), async (req, reply) => {
    try {
      const info = store ? await replyInfo(store, req.params.token) : null;
      return html(reply.code(info ? 200 : 404), replyPage(info, info ? 'ask' : 'gone'));
    } catch (e) {
      req.log.error(e);
      return html(reply.code(502), replyPage(null, 'gone'));
    }
  });

  app.post<{ Params: { token: string }; Body: { note?: unknown } }>('/reply/:token', few(6), async (req, reply) => {
    try {
      const info = store ? await replyInfo(store, req.params.token) : null;
      if (!store || !info) return html(reply.code(404), replyPage(null, 'gone'));
      const result = await leaveNote(store, req.params.token, req.body?.note, token);
      req.log.info('reply note received'); // never log what it said or who it was for
      return html(reply.code(result === 'ok' ? 200 : 400), replyPage(info, result === 'ok' ? 'sent' : result === 'gone' ? 'gone' : result));
    } catch (e) {
      req.log.error(e);
      return html(reply.code(502), replyPage(null, 'gone'));
    }
  });
}
