// POST /stuck: turns a "I'm stuck" note into one short email. Owner: C. Registered from server.ts.
//
// Settings (in the relay's .env; the values are in email.env, sent privately):
//   EMAIL_USER           the Gmail address Steady sends from   (GMAIL_USER and SMTP_USER also work)
//   EMAIL_APP_PASSWORD   its app password                      (GMAIL_APP_PASSWORD, EMAIL_PASS and SMTP_PASS also work)
//   STUCK_DRY_RUN=1      build the email and log it, but do not send it (for trying things out)

import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';
import { stuckMessage, type StuckBody } from './stuckMessage';

export function registerStuck(app: FastifyInstance): void {
  const user = process.env.EMAIL_USER ?? process.env.GMAIL_USER ?? process.env.SMTP_USER ?? '';
  const pass = process.env.EMAIL_APP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD ?? process.env.EMAIL_PASS ?? process.env.SMTP_PASS ?? '';
  const dryRun = process.env.STUCK_DRY_RUN === '1';
  const transport = dryRun ? nodemailer.createTransport({ jsonTransport: true }) : user && pass ? nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }) : null;

  // A person presses this by hand, a few times at most. Far stricter than the limit on the rest of the relay.
  app.post<{ Body: StuckBody }>('/stuck', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const message = stuckMessage(req.body ?? {});
    if (!message) return reply.code(400).send({ error: 'bad note' });
    if (!transport) return reply.code(503).send({ error: 'email is not set up on the relay' });
    try {
      await transport.sendMail({ from: `Steady <${user || 'steady@localhost'}>`, to: message.to, subject: message.subject, text: message.text });
      req.log.info({ dryRun }, 'stuck note sent'); // never log who it went to or what it said
      return { ok: true };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'email failed' });
    }
  });
}
