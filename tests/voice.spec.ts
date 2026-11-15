// How Steady's words are handed to the voice: one sentence at a time, without tripping on "Dr." or "$12.99".
import { expect, test } from '@playwright/test';
import { sentencesOf, speak, TONE } from '../src/shared/voice';

test('splits into sentences, so there is a breath between them', () => {
  expect(sentencesOf('That\'s every box. When you\'re ready, click "Place order" yourself. That\'s the one that pays, so I\'ll never press it for you.')).toEqual([
    "That's every box.",
    'When you\'re ready, click "Place order" yourself.',
    "That's the one that pays, so I'll never press it for you.",
  ]);
});

test('does not break after "Dr.", inside a price, or inside a quoted name', () => {
  expect(sentencesOf('For "Who would you like to see?", last time you picked "Dr. Amara Okafor". Go with that again.')).toEqual([
    'For "Who would you like to see?", last time you picked "Dr. Amara Okafor".',
    'Go with that again.',
  ]);
  expect(sentencesOf('This will take $12.99 from you. Is that right?')).toEqual(['This will take $12.99 from you.', 'Is that right?']);
  expect(sentencesOf('Step 2 of 3. Click "Next".')).toEqual(['Step 2 of 3.', 'Click "Next".']);
});

test('reads with the warmest voice the browser has, a little slower, and queues the later sentences', async () => {
  const calls: Array<{ text: string; options: Record<string, unknown> }> = [];
  const tts = {
    getVoices: async () => [{ voiceName: 'Microsoft David - English (United States)', lang: 'en-US' }, { voiceName: 'Google US English', lang: 'en-US' }, { voiceName: 'Google français', lang: 'fr-FR' }],
    speak: (text: string, options: Record<string, unknown> = {}) => void calls.push({ text, options }),
    stop: () => undefined,
  };
  await speak(tts, 'No rush. Take your time.');
  expect(calls.map((c) => c.text)).toEqual(['No rush.', 'Take your time.']);
  expect(calls[0]!.options).toMatchObject({ voiceName: 'Google US English', enqueue: false });
  expect(calls[1]!.options).toMatchObject({ voiceName: 'Google US English', enqueue: true });
  expect(Number(calls[0]!.options.rate)).toBeLessThan(1);
});

test('the tone instruction says how to talk, and what never to say', () => {
  expect(TONE).toContain('contractions');
  expect(TONE).toContain('never blame');
});

test("reads at the person's own speed when one is asked for, and ignores a speed that makes no sense", async () => {
  const rates: unknown[] = [];
  const tts = {
    getVoices: async () => [{ voiceName: 'Google US English', lang: 'en-US' }],
    speak: (_text: string, options: Record<string, unknown> = {}) => void rates.push(options.rate),
    stop: () => undefined,
  };
  await speak(tts, 'A slower read.', { rate: 0.7 });
  await speak(tts, 'Nonsense speed.', { rate: 40 });
  await speak(tts, 'No speed given.');
  expect(rates).toEqual([0.7, 0.92, 0.92]);
});
