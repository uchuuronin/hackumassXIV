// Passing a recorded task from one computer to another. Owner: C.
// The plain parts, kept apart from the server and the database so they can be checked on their own.
//
// A task is the steps a helper recorded: where to click, choose and type. It never has anyone's answers
// in it. It is kept under three everyday words, for seven days, and anyone who has the words can fetch it.

import { WORDS } from './shareWords';

export const KEEP_DAYS = 7;
const MAX_STEPS = 80;
const MAX_BYTES = 64_000;

/** Three different words. `pick(max)` returns a whole number from 0 to max - 1. */
export function makeCode(pick: (max: number) => number): string {
  const chosen: string[] = [];
  while (chosen.length < 3) {
    const word = WORDS[pick(WORDS.length)]!;
    if (!chosen.includes(word)) chosen.push(word);
  }
  return chosen.join(' ');
}

/** "Garden, Kettle, tulip" → "garden kettle tulip". Null if it is not three words from the list. */
export function tidyCode(text: unknown): string | null {
  if (typeof text !== 'string' || text.length > 100) return null;
  const words = text.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ');
  return words.length === 3 && words.every((w) => WORDS.includes(w)) ? words.join(' ') : null;
}

/** A small, plain task, or null. The extension checks it again, strictly, when it arrives. */
export function tidyTask(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const task = input as Record<string, unknown>;
  if (typeof task.name !== 'string' || !task.name.trim()) return null;
  if (!Array.isArray(task.steps) || task.steps.length < 1 || task.steps.length > MAX_STEPS) return null;
  if (JSON.stringify(task).length > MAX_BYTES) return null;
  return task;
}

export interface TaskStore {
  put(code: string, task: Record<string, unknown>): Promise<void>;
  get(code: string): Promise<Record<string, unknown> | null>;
}

/** Kept in the relay's memory. For trying things out, and for the tests. */
export function memoryStore(): TaskStore {
  const kept = new Map<string, { task: Record<string, unknown>; at: number }>();
  return {
    async put(code, task) {
      kept.set(code, { task, at: Date.now() });
    },
    async get(code) {
      const found = kept.get(code);
      if (!found) return null;
      if (Date.now() - found.at > KEEP_DAYS * 86_400_000) {
        kept.delete(code);
        return null;
      }
      return found.task;
    },
  };
}
