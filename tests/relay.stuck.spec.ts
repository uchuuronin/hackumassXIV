// The "I'm stuck" email, checked without the relay running.
import { expect, test } from '@playwright/test';
import { stuckMessage } from '../relay/src/stuckMessage';

test('says who, which task and which step, and nothing else', () => {
  const m = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose', task: "Book a doctor's appointment", step: 2, of: 3 })!;
  expect(m.to).toBe('maya@example.com');
  expect(m.subject).toBe('Rose would like a hand');
  expect(m.text).toBe(
    [
      'Hello Maya,',
      '',
      'Rose pressed "I\'m stuck" in Milo, the helper on their computer, and would like a hand.',
      'Rose was on step 2 of 3 of "Book a doctor\'s appointment".',
      '',
      'A telephone call is usually the quickest way to help.',
      '',
      'Milo sent only what you see here. It did not send the website, the page, or anything that was typed.',
    ].join('\n'),
  );
});

test('with no task: just that she would like a hand', () => {
  const m = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' })!;
  expect(m.text).not.toContain('step');
});

test('cannot be used to send someone an arbitrary message', () => {
  expect(stuckMessage({ to: 'not an address', fromName: 'Rose' })).toBeNull();
  expect(stuckMessage({ to: 'a@b.com, c@d.com', fromName: 'Rose' })).toBeNull(); // one person only
  const m = stuckMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose\r\nBcc: everyone@example.com', task: `<a href="http://bad.example">${'click '.repeat(80)}</a>`, step: 2, of: 3 })!;
  expect(m.subject).not.toMatch(/[\r\n]/);
  expect(m.text).not.toContain('<a');
  expect(m.text.length).toBeLessThan(700);
});
