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

// ---- The hello a helper gets once, when they are added ----
import { helloMessage } from '../relay/src/stuckMessage';

test('the hello says who added them, what "I\'m stuck" sends, and what else they can do', () => {
  const m = helloMessage({ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' })!;
  expect(m.to).toBe('maya@example.com');
  expect(m.subject).toBe('Rose added you as their helper in Milo');
  expect(m.text).toBe(
    [
      'Hi Maya,',
      '',
      "I'm Milo, a helper that sits beside the web browser on Rose's computer. Rose has added you as the person to ask when they're stuck on a website or unsure about a decision.",
      '',
      'When Rose presses "I\'m stuck", I\'ll email you what they were doing and which step they were on. A phone call is usually the quickest way to help. If Rose has switched on notes back, that email also has a link where you can write a short note with what to do next, and it shows up in Milo.',
      '',
      'If you have Milo on your own computer, you can also do a task once while I watch, such as booking an appointment, and send it to Rose. I then walk them through it one step at a time.',
      '',
      "There is nothing to do now. If this wasn't meant for you, you can ignore it.",
      '',
      'Milo',
    ].join('\n'),
  );
});

test('the hello with no first name saved still reads like a person wrote it', () => {
  const m = helloMessage({ to: 'maya@example.com' })!;
  expect(m.subject).toBe('Someone you help added you as their helper in Milo');
  expect(m.text).toContain('Hi there,');
  expect(m.text).toContain("I'm Milo, a helper that sits beside the web browser. Someone you help has added you");
  expect(m.text).toContain('When they press "I\'m stuck"');
  expect(m.text).toContain('If they have switched on notes back');
  expect(m.text).toContain('send it to them.');
});

test('the hello cannot carry an arbitrary message either', () => {
  expect(helloMessage({ to: 'not an address' })).toBeNull();
  expect(helloMessage({ to: 'a@b.com, c@d.com' })).toBeNull();
  const m = helloMessage({ to: 'maya@example.com', helperName: `<b>${'x'.repeat(500)}`, fromName: 'Rose\r\nBcc: all@example.com' })!;
  expect(m.subject).not.toMatch(/[\r\n]/);
  expect(m.text).not.toContain('<b>');
  expect(m.text.length).toBeLessThan(1200);
});
