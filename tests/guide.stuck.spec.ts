// Feature 12, "I'm stuck": one press lets the person who helps her know. Asked first, sent once,
// and it carries the task's name and the step number only. Nothing about the page, and nothing she typed.
import { expect, test, type Page } from '@playwright/test';
import { inject } from './helpers';

const TASK = "Book a doctor's appointment";
const MAYA = { name: 'Maya', email: 'maya@example.com' };

async function ready(page: Page, helper: object | null = MAYA, reply = true, url = '/clinic/book.html?reset=1') {
  await page.goto(url);
  await inject(page);
  await page.evaluate(
    async ([h, r]) => {
      const s = window.__steady;
      s.setFamily(r as never);
      await s.details.save({ givenName: 'Rose', familyName: 'Marchetti', email: 'rose@example.com' });
      if (h) await s.family.saveHelper(h as never);
      else await s.family.clearHelper();
    },
    [helper, reply] as const,
  );
}
const sent = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'family').map((c) => c.args[0]));

/** A recorded task, and Rose part-way through it. */
async function inTask(page: Page) {
  await page.evaluate((n) => window.__steady.recorder.start(n), TASK);
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await page.click('#next');
  await page.waitForTimeout(50);
  const { task } = await page.evaluate(() => window.__steady.recorder.stop());
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await page.evaluate(() => window.__steady.setFamily(true));
  await page.evaluate((id) => window.__steady.player.start(id, { at: 1 }), task.id);
}

test('asks before sending anything, in a way that is easy to say yes or no to', async ({ page }) => {
  await ready(page);
  const offer = await page.evaluate(() => window.__steady.family.offer());
  expect(offer).toMatchObject({ status: 'offer', said: 'Want me to let Maya know you\'d like a hand?', options: ['Yes, tell Maya', 'No, not yet'] });
  expect(await sent(page)).toEqual([]);
});

test('on yes: tells her helper, and says what happens now', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__steady.family.offer());
  const done = await page.evaluate(() => window.__steady.family.send());
  expect(done).toMatchObject({ status: 'sent', said: 'Don\'t worry. I\'ve told Maya. Nothing\'s lost, and everything on this page stays just as it is. You can wait for them, or keep going if you like.' });
  expect(await sent(page)).toEqual([{ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' }]);
});

test('during a saved task: the message has the task name and the step number, and nothing else', async ({ page }) => {
  await ready(page);
  await inTask(page);
  await page.evaluate(() => ((document.querySelector('#first') as HTMLInputElement).value = 'Marguerite')); // whatever she has typed never leaves the page
  const offer = await page.evaluate(() => window.__steady.family.offer());
  expect(offer.said).toBe(`Want me to let Maya know you'd like a hand with step 2 of "${TASK}"?`);
  await page.evaluate(() => window.__steady.family.send());
  const notes = await sent(page);
  expect(notes).toEqual([{ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose', task: TASK, step: 2, of: 3 }]);
  expect(JSON.stringify(notes)).not.toMatch(/localhost|clinic|Herrera|Flu|Marguerite/i);
});

test('no helper saved yet: asks for the email address of someone she trusts, right there, and sends nothing yet', async ({ page }) => {
  await ready(page, null);
  const offer = await page.evaluate(() => window.__steady.answer("I'm stuck"));
  expect(offer.said).toBe(
    "Oh no. I don't have anyone to ask yet. If you know the email address of someone you trust, type it in the box below. I'll send them a short note to say you'd like a hand.",
  );
  expect(offer.options).toEqual(['No, not yet']);
  expect(offer.mood).toBe('worried');
  expect((await page.evaluate(() => window.__steady.family.send())).status).toBe('no-helper');
  expect(await sent(page)).toEqual([]);
});

test('she types the address, then the name: Steady reads both back and asks before sending', async ({ page }) => {
  await ready(page, null);
  await page.evaluate(() => window.__steady.answer("I'm stuck"));
  const wrong = await page.evaluate(() => window.__steady.answer('maya at example'));
  expect(wrong.said).toBe("That doesn't look like an email address yet. It should look like name@example.com. Have another go, or we can leave it for now.");
  const name = await page.evaluate(() => window.__steady.answer('  Maya@Example.com '));
  expect(name.said).toBe("Thank you. And what's their first name?");
  const confirm = await page.evaluate(() => window.__steady.answer('maya'));
  expect(confirm.said).toBe("I'll send a short note to Maya at maya@example.com. Shall I? I'll remember them for next time, and you can change that in My details.");
  expect(confirm.options).toEqual(['Yes, tell Maya', 'No, not yet']);
  expect(await sent(page)).toEqual([]); // nothing has gone yet
  const done = await page.evaluate(() => window.__steady.answer('Yes, tell Maya'));
  expect(done.said).toContain("Don't worry. I've told Maya.");
  expect(done.mood).toBe('reassuring');
  expect(await sent(page)).toEqual([{ to: 'maya@example.com', helperName: 'Maya', fromName: 'Rose' }]);
  expect(await page.evaluate(() => window.__steady.family.loadHelper())).toEqual({ name: 'Maya', email: 'maya@example.com' });
});

test('she changes her mind while typing the address: nothing is kept and nothing is sent', async ({ page }) => {
  await ready(page, null);
  await page.evaluate(() => window.__steady.answer("I'm stuck"));
  await page.evaluate(() => window.__steady.answer('maya@example.com'));
  const no = await page.evaluate(() => window.__steady.answer('No, not yet'));
  expect(no.said).toBe("That's fine. I'm here if you change your mind.");
  expect(await page.evaluate(() => window.__steady.family.loadHelper())).toBeNull();
  expect(await sent(page)).toEqual([]);
});

test('when she has said who they are to her, the reassurance says so', async ({ page }) => {
  await ready(page, { ...MAYA, relation: 'Daughter' });
  const offer = await page.evaluate(() => window.__steady.answer("I'm stuck"));
  expect(offer.said).toBe("Want me to let your daughter, Maya, know you'd like a hand?");
  expect(offer.mood).toBe('worried');
  const done = await page.evaluate(() => window.__steady.answer('Yes, tell Maya'));
  expect(done.said).toBe("Don't worry. I've told your daughter, Maya. Nothing's lost, and everything on this page stays just as it is. You can wait for them, or keep going if you like.");
});

test('the message could not be sent: says so kindly, and offers to try again', async ({ page }) => {
  await ready(page, MAYA, false);
  await page.evaluate(() => window.__steady.family.offer());
  const failed = await page.evaluate(() => window.__steady.family.send());
  expect(failed).toMatchObject({ status: 'failed', said: 'I couldn\'t reach Maya just now. That\'s not your fault. You could phone them, or I can try again.', options: ['Try again', 'No, not yet'] });
});

test('asked twice in a row: does not send a second message', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__steady.family.offer());
  await page.evaluate(() => window.__steady.family.send());
  const again = await page.evaluate(() => window.__steady.family.offer());
  expect(again).toMatchObject({ status: 'sent', said: 'I told Maya a moment ago. Give them a little time to answer.' });
  expect((await sent(page)).length).toBe(1);
});

test('"No, not yet": nothing is sent, and there is no fuss', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__steady.family.offer());
  expect(await page.evaluate(() => window.__steady.family.decline())).toMatchObject({ status: 'declined', said: 'That\'s fine. I\'m here if you change your mind.' });
  expect(await sent(page)).toEqual([]);
});

test('one place for every answer button: the words go to whichever conversation is open', async ({ page }) => {
  await ready(page, MAYA, true, '/shop/checkout.html?reset=1');
  const a = (words: string) => page.evaluate((w) => window.__steady.answer(w), words);
  expect((await a("I'm stuck")).said).toBe('Want me to let Maya know you\'d like a hand?');
  expect((await a('No, not yet')).said).toBe('That\'s fine. I\'m here if you change your mind.');
  expect((await a('Help me fill this in')).said).toContain('I can fill in your name');
  expect((await a('Yes, fill them in')).said).toContain("I've filled in");
  expect((await a('Stop for now')).said).toBe('Okay, I\'ve stopped. Everything that\'s filled in is still there.');
  expect((await a('Something nobody offered')).said).toBe('I\'m not sure what to do with that. Try one of the buttons, or ask me a question.');
});

test('a typed address is only ever used after a yes: starting something else drops it', async ({ page }) => {
  await ready(page, null);
  await page.evaluate(() => window.__steady.answer("I'm stuck"));
  await page.evaluate(() => window.__steady.answer('maya@example.com'));
  await page.evaluate(() => window.__steady.answer('Where was I?'));
  expect(await page.evaluate(() => window.__steady.family.isAsking())).toBe(false);
  expect(await page.evaluate(() => window.__steady.family.loadHelper())).toBeNull();
  expect(await sent(page)).toEqual([]);
});
