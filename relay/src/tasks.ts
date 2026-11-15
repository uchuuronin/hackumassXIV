// POST /tasks and POST /tasks/find: passing a recorded task to another computer. Owner: C. Registered from server.ts.
//
// Settings (in the relay's .env):
//   MONGODB_URI_APP   the Atlas address with the database name in it (MONGODB_URI also works)
//   TASKS_DRY_RUN=1   keep tasks in the relay's memory, not in the database (for trying things out)

import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { MongoClient } from 'mongodb';
import { KEEP_DAYS, makeCode, memoryStore, tidyCode, tidyTask, type TaskStore } from './taskShare';

function mongoStore(uri: string): TaskStore {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  let ready: Promise<ReturnType<typeof collection>> | null = null;
  const collection = () => client.db().collection<{ _id: string; task: Record<string, unknown>; createdAt: Date }>('shared_tasks');
  const open = () =>
    (ready ??= client.connect().then(async () => {
      const col = collection();
      // The database removes a task by itself after seven days.
      await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 86_400 });
      return col;
    }));
  return {
    async put(code, task) {
      await (await open()).insertOne({ _id: code, task, createdAt: new Date() });
    },
    async get(code) {
      return (await (await open()).findOne({ _id: code }))?.task ?? null;
    },
  };
}

export function registerTasks(app: FastifyInstance): void {
  const uri = process.env.MONGODB_URI_APP ?? process.env.MONGODB_URI ?? '';
  const store: TaskStore | null = process.env.TASKS_DRY_RUN === '1' ? memoryStore() : uri ? mongoStore(uri) : null;

  // A helper sends a task a few times a day at most.
  app.post<{ Body: { task?: unknown } }>('/tasks', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const task = tidyTask(req.body?.task);
    if (!task) return reply.code(400).send({ error: 'bad task' });
    if (!store) return reply.code(503).send({ error: 'task sharing is not set up on the relay' });
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode((max) => randomInt(max));
        if (await store.get(code)) continue; // those three words are in use: try three others
        await store.put(code, task);
        return { code, days: KEEP_DAYS };
      }
      return reply.code(503).send({ error: 'try again' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not keep the task' });
    }
  });

  // Strict, so three words can't be found by guessing. A POST and not a GET, for two reasons: Chrome sends
  // no Origin with a GET from the extension, so the relay's origin check would refuse it, and the words
  // stay out of the address (and so out of the request log).
  app.post<{ Body: { words?: unknown } }>('/tasks/find', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const code = tidyCode(req.body?.words);;
    if (!code) return reply.code(400).send({ error: 'three words are needed' });
    if (!store) return reply.code(503).send({ error: 'task sharing is not set up on the relay' });
    try {
      const task = await store.get(code);
      return task ? { task } : reply.code(404).send({ error: 'not found' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'could not fetch the task' });
    }
  });
}
