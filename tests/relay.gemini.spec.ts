// Which ways the relay tries a question, in order. The rule: asking for more (a web search, a strict
// JSON answer) can never do worse than asking plainly, because the plain way is always tried after it.
import { expect, test } from '@playwright/test';
import { configFor, contentsFor, tidyPicture, triesFor } from '../relay/src/geminiTries';

test('a plain question: the main model, then the lighter one', () => {
  expect(triesFor({ main: 'big', fallback: 'small' })).toEqual([
    { model: 'big', search: false, json: false },
    { model: 'small', search: false, json: false },
  ]);
});

test('a JSON answer is asked for first, and the plain way is still there behind it', () => {
  expect(triesFor({ main: 'big', fallback: 'small', json: true })).toEqual([
    { model: 'big', search: false, json: true },
    { model: 'big', search: false, json: false },
    { model: 'small', search: false, json: false },
  ]);
});

test('a search is tried once, never together with strict JSON, and falls back the same way', () => {
  expect(triesFor({ main: 'big', fallback: 'small', search: true })).toEqual([
    { model: 'big', search: true, json: false },
    { model: 'big', search: false, json: false },
    { model: 'small', search: false, json: false },
  ]);
  expect(triesFor({ main: 'big', fallback: 'small', search: true, json: true })[0]).toEqual({ model: 'big', search: true, json: false });
});

test('with no model set there is nothing to try, and with one model it is not tried twice the same way', () => {
  expect(triesFor({ main: '', fallback: '' })).toEqual([]);
  expect(triesFor({ main: 'big', fallback: '' })).toEqual([{ model: 'big', search: false, json: false }]);
});

test('each try asks Gemini for exactly what it says', () => {
  expect(configFor({ model: 'big', search: false, json: false })).toBeUndefined();
  expect(configFor({ model: 'big', search: true, json: false })).toEqual({ tools: [{ googleSearch: {} }] });
  expect(configFor({ model: 'big', search: false, json: true })).toEqual({ responseMimeType: 'application/json' });
});

test('a picture goes to Gemini beside the words, and only when there is one', async () => {
  expect(contentsFor('hello')).toBe('hello');
  expect(contentsFor('what is this?', 'QUJD')).toEqual([{ role: 'user', parts: [{ text: 'what is this?' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }] }]);
});

test('a picture is checked before it is sent: the right characters, and not too big', () => {
  expect(tidyPicture('QUJD+/09==')).toBe('QUJD+/09==');
  expect(tidyPicture('data:image/jpeg;base64,QUJD')).toBe('QUJD');
  expect(tidyPicture('<script>')).toBeNull();
  expect(tidyPicture('A'.repeat(6_000_001))).toBeNull();
  expect(tidyPicture(42)).toBeNull();
  expect(tidyPicture(undefined)).toBeUndefined();
});
