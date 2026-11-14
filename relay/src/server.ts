import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { GoogleGenAI } from '@google/genai';

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
async function ask(prompt: string) {
  const tries = [MODEL, MODEL, FALLBACK].filter(Boolean);
  let lastErr: unknown;
  for (const model of tries) {
    try {
      const r = await withTimeout(
        ai.models.generateContent({ model, contents: prompt }),
        20000,
      );
      return { text: r.text ?? '', model };
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
  if (req.headers.origin !== ALLOWED) {
    return reply.code(403).send({ error: 'forbidden' });
  }
});

app.get('/health', async () => ({ ok: true }));

app.post<{ Body: { prompt: string } }>('/gemini', async (req, reply) => {
  const prompt = req.body?.prompt;
  if (typeof prompt !== 'string' || !prompt || prompt.length > 20000) {
    return reply.code(400).send({ error: 'bad prompt' });
  }
  try {
    return await ask(prompt);
  } catch (e) {
    req.log.error(e);
    return reply.code(502).send({ error: 'gemini failed' });
  }
});

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
