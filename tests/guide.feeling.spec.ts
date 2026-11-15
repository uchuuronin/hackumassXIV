// How Steady's face reads her mood from what she types or says. On the computer only: nothing is sent anywhere.
import { expect, test } from '@playwright/test';
import { feelingOf } from '../src/guide/panel/feeling';

test('words that say she is having a hard time', () => {
  for (const words of ["I can't find it", 'this is so confusing', "I don't understand", 'ugh, I give up', "I'm worried I'll break it", 'oh no', 'this is too hard'])
    expect(feelingOf(words), words).toBe('worried');
});

test('words that say it is going well', () => {
  for (const words of ['thank you', 'oh lovely, that worked', 'great', "that's perfect", 'I did it!']) expect(feelingOf(words), words).toBe('glad');
});

test('ordinary questions and answers leave the face as it is', () => {
  for (const words of ['where do I pay?', 'Sunday around 9', 'what does this button do', 'maya@example.com', '']) expect(feelingOf(words), words).toBeNull();
});

test('"not good" is not good news, and "no problem" is not a problem', () => {
  expect(feelingOf("that's not good")).toBe('worried');
  expect(feelingOf('no problem, thanks')).toBe('glad');
});
