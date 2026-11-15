import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { GoogleGenAI } from '@google/genai';
import { registerFamily } from './familyRoutes';
import { configFor, contentsFor, tidyPicture, triesFor } from './geminiTries';
import { registerStuck } from './stuck';
import { registerTasks } from './tasks';

const app = Fastify({ logger: true });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL ?? '';
const FALLBACK = process.env.GEMINI_FALLBACK_MODEL ?? '';
const ALLOWED = process.env.ALLOWED_ORIGIN;

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);

// 20 s limit per try: main model, one retry, then the lighter fallback model
//
// `search` (asked for by the guide lane, owner C, only when the person asks a question): the main model
// may look things up on the web for this one. If that try fails for any reason (a model that doesn't
// take the search tool, a time-out), the same prompt is asked again in the ordinary way, so a question
// with search on can never do worse than one without.
//
// `json` (also from the guide lane): the main model is told to answer in strict JSON. Same promise: if that
// try fails, the prompt is asked again plainly. The order of tries is in ./geminiTries.ts, with its tests.
// `image` (also from the guide lane): a picture of her screen, sent beside the words. Never with a web search.
async function ask(prompt: string, search = false, json = false, image?: string) {
  let lastErr: unknown = new Error('no model is set');
  for (const t of triesFor({ main: MODEL, fallback: FALLBACK, search: search && !image, json })) {
    try {
      const config = configFor(t);
      const r = await withTimeout(ai.models.generateContent({ model: t.model, contents: contentsFor(prompt, image) as never, ...(config ? { config } : {}) }), 20000);
      return { text: r.text ?? '', model: t.model, searched: t.search, json: t.json, saw: !!image };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
await app.register(cors, { origin: ALLOWED || true });

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health' || !ALLOWED) return;
  // The reply page (owner: C) is opened from an email in an ordinary browser, so it has no extension origin.
  // It is guarded by a long secret in its address instead. See ./familyRoutes.ts.
  // Only the exact shape of a reply link: /reply/ and its secret. Nothing with "..", an extra path or a query can ride along.
  if (/^\/reply\/[a-f0-9]{32,64}$/.test(req.url)) return;
  if (req.headers.origin !== ALLOWED) {
    return reply.code(403).send({ error: 'forbidden' });
  }
});

app.get('/health', async () => ({ ok: true }));

// "I'm stuck" (owner: C): one short, fixed email to the person who helps. See ./stuck.ts.
registerStuck(app);

// Passing a recorded task to another computer (owner: C): three words, kept for seven days. See ./tasks.ts.
registerTasks(app);

// Linking a helper by a short code, tasks that arrive by themselves, and reply notes (owner: C). See ./familyRoutes.ts.
registerFamily(app);

// A picture makes the request bigger than the usual 1 MB limit, so this one route allows 8 MB.
app.post<{ Body: { prompt: string; search?: boolean; json?: boolean; image?: string } }>('/gemini', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
  const prompt = req.body?.prompt;
  if (typeof prompt !== 'string' || !prompt || prompt.length > 20000) {
    return reply.code(400).send({ error: 'bad prompt' });
  }
  try {
    const image = tidyPicture(req.body?.image);
    if (image === null) return reply.code(400).send({ error: 'bad image' });
    return await ask(prompt, req.body?.search === true, req.body?.json === true, image);
  } catch (e) {
    req.log.error(e);
    return reply.code(502).send({ error: 'gemini failed' });
  }
});

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
