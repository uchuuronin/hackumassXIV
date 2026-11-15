// "What do I click?" as a conversation: what this page is, what she's here to do, then one question at a time.
import { expect, test, type Page } from '@playwright/test';
import { html, inject } from './helpers';

const WALKING = ['Show me again', 'Skip this one', 'Stop for now'];
const spoken = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').map((c) => String(c.args[0])));
const lit = (page: Page) => page.evaluate(() => window.__steady.spotlight.lit() && window.__steady.api.get().elements.find((e) => e.id === window.__steady.spotlight.lit())?.label);
const press = (page: Page, words: string) => page.evaluate((w) => window.__steady.answer(w), words);

/** A day the made-up clinic is open: the first weekday it offers. */
const weekday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date(`${(document.querySelector('#day') as HTMLInputElement).min}T12:00:00`);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

async function clinic(page: Page) {
  await page.goto('/clinic/book.html?reset=1');
  await inject(page);
  await page.evaluate(() => window.__steady.walk.setPace({ settleMs: 60 }));
}

test('on a booking page it says what the page is for and asks before doing anything', async ({ page }) => {
  await clinic(page);
  const reply = await press(page, 'What do I click?');
  expect(reply.said).toBe("This looks like a page for booking an appointment. Is that what you're here to do?");
  expect(reply.options).toEqual(['Yes, help me book', 'No, just show me the buttons']);
  expect(await lit(page)).toBeNull();
});

test('"No" gives the notes on the buttons, as before', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  const reply = await press(page, 'No, just show me the buttons');
  expect(reply.said).toContain('Before "Next", there are two things to choose on this page');
});

test('"Yes" starts with the first unanswered question and lights it', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  const reply = await press(page, 'Yes, help me book');
  expect(reply.said).toBe('Let\'s go one question at a time. First, "Reason for your visit". Click the list and pick the one that fits.');
  expect(reply.options).toEqual(WALKING);
  expect(await lit(page)).toBe('Reason for your visit');
});

test('when she answers a question it moves to the next by itself, and reads out the choices the page gives', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  await page.selectOption('#reason', 'Flu shot');
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe(
      'Thank you. Next, "Who would you like to see?". There are three to choose from. Dr. Amara Okafor Family medicine, next free Tuesday. Dr. Luis Herrera Internal medicine, next free Thursday. Dana Whitfield Nurse practitioner, next free tomorrow. Click the one you\'d like.',
    );
  expect(await lit(page)).toBe('Dr. Amara Okafor Family medicine · next free Tuesday');
});

test('when the page has all it needs it shows the button, and never presses it', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatch(/^(Thank you|Got it|Good)\. That's everything this part needs\. When you're ready, click "Next"\.$/);
  expect(await lit(page)).toBe('Next');
  expect(await page.locator('[data-step="who"]').isVisible()).toBe(true); // still on the first step: Steady did not click
});

test('after she clicks the button it carries on with the next part of the same booking', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await expect.poll(async () => (await spoken(page)).at(-1)).toContain('click "Next"');
  await page.click('#next');
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('Here\'s the next part: "Pick a day and a time". First, "Day". Click the box and pick the day.');
  expect(await lit(page)).toBe('Day');
});

test('private boxes are hers to do: Steady says so and never reads them', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="herrera"]');
  await page.click('#next');
  await page.fill('#day', await weekday(page));
  await page.locator('#day').blur();
  await page.selectOption('#time', { index: 1 });
  await page.click('#next');
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('Here\'s the next part: "Your details". First, "First name". Type it in, or press "Help me fill this in" and I\'ll do your name and address with you.');
  await page.fill('#first', 'Rose');
  await page.fill('#last', 'Marsh');
  await page.locator('#last').blur();
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatch(/^(Thank you|Got it|Good)\. Next, "Month"\. This one is private, so it's yours to do\. I never keep it or pass it on\.$/);
});

test('"Skip this one", "Show me again" and "Stop for now"', async ({ page }) => {
  await clinic(page);
  await press(page, 'What do I click?');
  const first = await press(page, 'Yes, help me book');
  expect((await press(page, 'Show me again')).said).toBe(first.said.replace("Let's go one question at a time. ", ''));
  const skipped = await press(page, 'Skip this one');
  expect(skipped.said).toContain('Next, "Who would you like to see?".');
  const stopped = await press(page, 'Stop for now');
  expect(stopped.said).toBe('All right, I\'ve stopped. Press "What do I click?" whenever you want me again.');
  expect(await lit(page)).toBeNull();
  await page.selectOption('#reason', 'Flu shot');
  await page.waitForTimeout(300);
  expect((await spoken(page)).length).toBe(0); // stopped means quiet
});

test('a shop front: says what the page is and what she can do from here, then shows the buttons', async ({ page }) => {
  await page.goto('/shop/?reset=1');
  await inject(page);
  const reply = await press(page, 'What do I click?');
  expect(reply.said).toMatch(/^This is "Useful things for the house"\. From here you can search for something, /);
  expect(reply.said).toContain("I'll show you the");
  expect(reply.options).toBeUndefined();
});

// ---- In her own words (Gemini sees the questions and their choices, never what is in a private box) ----

const gemini = (page: Page, answer: (prompt: string) => unknown) =>
  page.evaluate((fn) => {
    const reply = new Function(`return (${fn})`)() as (prompt: string) => unknown;
    window.__steady.useGemini(async (prompt) => JSON.stringify(reply(prompt)));
  }, answer.toString());
const prompts = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'gemini').map((c) => String(c.args[0])));

test('she says it in her own words: Steady picks the closest choice, says so, and moves on', async ({ page }) => {
  await clinic(page);
  await gemini(page, (prompt) => {
    const id = /"id":"(s\d+)","name":"Reason for your visit"/.exec(prompt)![1];
    return { answers: [{ id, option: 'A new concern' }], keep: [], used: [], say: '' };
  });
  await press(page, 'What do I click?');
  const first = await press(page, 'Yes, help me book');
  expect(first.said).toContain("Or tell me in your own words and I'll find the closest one.");
  const reply = await press(page, "I've been getting migraines a lot more lately");
  expect(reply.said).toBe('I\'ve picked "A new concern" for "Reason for your visit". It was the closest on the list, so change it if it isn\'t right.');
  expect(reply.then?.said).toContain('Next, "Who would you like to see?".');
  expect(await page.inputValue('#reason')).toBe('A new concern');
  const sent = (await prompts(page)).at(-1)!;
  expect(sent).toContain("PERSON: I've been getting migraines a lot more lately");
  expect(sent).toContain('"options":["Annual check-up","Follow-up visit","A new concern","Flu shot","Medication review"]');
});

test('a choice Gemini makes up is thrown away', async ({ page }) => {
  await clinic(page);
  await gemini(page, (prompt) => ({ answers: [{ id: /"id":"(s\d+)","name":"Reason for your visit"/.exec(prompt)![1], option: 'Brain surgery' }], keep: [], used: [] }));
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  const reply = await press(page, 'my head hurts');
  expect(reply.said).toBe("I couldn't match that to anything on this part of the page. You could say it another way, or pick it yourself.");
  expect(await page.inputValue('#reason')).toBe('');
});

test('something she says early is remembered and used when its question comes', async ({ page }) => {
  await clinic(page);
  await gemini(page, (prompt) => {
    const time = /"id":"(s\d+)","name":"Time","kind":"select","options":\[("[^\]]+)\]/.exec(prompt);
    if (time && /NOTES: \["Sunday around 9"\]/.test(prompt)) return { answers: [{ id: time[1], option: JSON.parse(`[${time[2]}]`)[1] }], keep: [], used: [0] };
    if (/PERSON: I'm free Sunday/.test(prompt)) return { answers: [], keep: ['Sunday around 9'], used: [] };
    return { answers: [], keep: [], used: [] };
  });
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  const kept = await press(page, "I'm free Sunday, thinking around 9");
  expect(kept.said).toBe('I\'ll remember "Sunday around 9" for when we get to it.');
  await page.selectOption('#reason', 'Flu shot');
  await page.check('[value="okafor"]');
  await page.click('#next');
  await page.fill('#day', await weekday(page));
  await page.locator('#day').blur();
  await expect.poll(async () => (await spoken(page)).join(' | ')).toContain('You told me "Sunday around 9", so I\'ve picked');
  expect(await page.inputValue('#time')).not.toBe('');
});

test('a question about the choices gets a short answer from what the page says, and the walk carries on', async ({ page }) => {
  await clinic(page);
  await gemini(page, () => ({ answers: [], keep: [], used: [], say: 'Dana Whitfield is free soonest. The page says tomorrow.' }));
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  await press(page, 'Skip this one');
  const reply = await press(page, 'who can see me soonest?');
  expect(reply.said).toBe('Dana Whitfield is free soonest. The page says tomorrow.');
  expect(reply.options).toEqual(WALKING);
});

test('private boxes are never put in front of Gemini', async ({ page }) => {
  await page.goto('/shop/checkout.html?reset=1');
  await inject(page);
  await gemini(page, () => ({ answers: [], keep: [], used: [] }));
  await press(page, 'What do I click?');
  await press(page, 'Yes, go through it with me');
  await press(page, 'send it the fast way');
  const sent = (await prompts(page)).at(-1)!;
  expect(sent).toContain('"name":"State"');
  expect(sent).not.toMatch(/Card number|Security code|Expires|Name on card/);
});

test('a question may be looked up on the web; a plain answer never is', async ({ page }) => {
  await clinic(page);
  await gemini(page, () => ({ answers: [], keep: [], used: [], say: 'I can\'t tell from this page.' }));
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  await press(page, 'Which of these doctors is best for migraines?');
  await press(page, 'the flu one please');
  const asked = await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'gemini').map((c) => (c.args[1] as { search?: boolean } | undefined)?.search === true));
  expect(asked).toEqual([true, false]);
  const sent = (await prompts(page))[0]!;
  expect(sent).toContain('You may search the web');
  expect(sent).toContain('localhost'); // which website she is on, so the search is about this place
});

test('"Show me" level: Steady says which choice is closest and leaves the picking to her', async ({ page }) => {
  await clinic(page);
  await page.evaluate(() => window.__steady.store.set('helper:level', 'show'));
  await gemini(page, (prompt) => ({ answers: [{ id: /"id":"(s\d+)","name":"Reason for your visit"/.exec(prompt)![1], option: 'A new concern' }], keep: [], used: [] }));
  await press(page, 'What do I click?');
  await press(page, 'Yes, help me book');
  const reply = await press(page, "I've been getting migraines a lot more lately");
  expect(reply.said).toBe('The closest on the list is "A new concern" for "Reason for your visit". I\'ve left it for you to pick.');
  expect(reply.options).toEqual(WALKING);
  expect(await page.inputValue('#reason')).toBe(''); // nothing was chosen for her
});

// ---- The basket: it knows where she is, and asks what she wants to do next ----

async function basket(page: Page) {
  await page.goto('/shop/basket.html?reset=1');
  await inject(page);
  await page.evaluate(() => window.__steady.walk.setPace({ settleMs: 60 }));
}

test('in the basket it says what is in it and what it comes to, and asks whether she is ready to pay', async ({ page }) => {
  await basket(page);
  const reply = await press(page, 'What do I click?');
  expect(reply.said).toBe('This is your basket. There are three things in it, and the total comes to $83.92. Are you ready to pay, or still looking?');
  expect(reply.options).toEqual(["I'm ready to pay", "I'm still looking", 'No, just show me the buttons']);
});

test('"I\'m ready to pay": lights the real way on, warns about the advert dressed up as a button, and clicks nothing', async ({ page }) => {
  await basket(page);
  // The helper lane has flagged the advert (it does this by itself in the real extension).
  await page.evaluate(() => {
    const s = window.__steady;
    const advert = s.api.get().elements.find((e) => e.kind === 'link' && e.label === 'Link') ?? s.api.get().elements.find((e) => /continue/i.test(e.label) && !/shopping/i.test(e.label));
    if (advert) s.api.mark(s.api.elementFor(advert.id)!, 'fake', 'This is an advert, not part of this page.');
  });
  await press(page, 'What do I click?');
  const reply = await press(page, "I'm ready to pay");
  expect(reply.said).toBe(
    'Then "Checkout" is the one to click. It takes you to the page for your address and payment, and nothing is paid until the very end. There\'s an advert on this page dressed up as a button. Leave that one alone.',
  );
  expect(await lit(page)).toBe('Checkout');
  expect(page.url()).toContain('basket.html'); // still here: the click is hers
});

test('"I\'m still looking": no rush, and the notes on the buttons', async ({ page }) => {
  await basket(page);
  await press(page, 'What do I click?');
  const reply = await press(page, "I'm still looking");
  expect(reply.said).toMatch(/^No rush\. You can change how many of each, or take something out\. I'll show you the \d+ main buttons/);
});

test('after she clicks through to the checkout, Steady carries on there', async ({ page }) => {
  await basket(page);
  await press(page, 'What do I click?');
  await press(page, "I'm ready to pay");
  await page.click('#go-checkout');
  await page.waitForURL('**/checkout.html');
  await inject(page);
  await page.evaluate(() => window.__steady.walk.setPace({ settleMs: 60 }));
  await page.evaluate(() => window.__steady.walk.resume());
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe(
    'Here\'s the next part: "Checkout". First, "Email for your receipt". Type it in, or press "Help me fill this in" and I\'ll do your name and address with you.',
  );
});

test('a shop front does not offer to open the basket she can already see, and names the shop\'s own sections', async ({ page }) => {
  await page.goto('/shop/?reset=1');
  await inject(page);
  const reply = await press(page, 'What do I click?');
  expect(reply.said).toContain('From here you can search for something, look at Kitchen, Living room or Garden, or open your basket.');
});

// ---- A page the rules don't recognise: Gemini says what it is and what she can do, from button names only ----

const GARDEN = `<header><a href="/">Greenfinger Garden Club</a></header>
  <main><h1>Members' corner</h1>
    <p>Private text about a member that must never leave the computer.</p>
    <a href="/events" id="events">See this month's events</a>
    <a href="/renew" id="renew">Renew my membership</a>
    <a href="/newsletter" id="news">Read the newsletter</a>
    <button id="pay">Pay now</button>
  </main>`;
const idOf = (page: Page, label: string) => page.evaluate((l) => window.__steady.api.get().elements.find((e) => e.label === l)!.id, label);

test('an unfamiliar page: says what the page is, in Gemini\'s words, and offers things she can do as buttons', async ({ page }) => {
  await html(page, GARDEN);
  await inject(page);
  const events = await idOf(page, "See this month's events");
  const renew = await idOf(page, 'Renew my membership');
  await page.evaluate(([e, r]) => window.__steady.useGemini(async () => JSON.stringify({ page: "This is the members' page of a garden club.", can: [{ id: e, say: "See what's on this month" }, { id: r, say: 'Renew your membership' }] })), [events, renew]);
  const reply = await press(page, 'What do I click?');
  expect(reply.said).toBe("This is the members' page of a garden club. Here are a few things you can do from here.");
  expect(reply.options).toEqual(["See what's on this month", 'Renew your membership', 'No, just show me the buttons']);

  const picked = await press(page, 'Renew your membership');
  expect(picked.said).toBe('That\'s this one: "Renew my membership". I\'ve lit it up. Click it when you\'re ready.');
  expect(await lit(page)).toBe('Renew my membership');
  expect(page.url()).not.toContain('renew'); // nothing was clicked
});

test('Gemini is shown the names of buttons and links, and never the words on the page', async ({ page }) => {
  await html(page, GARDEN);
  await inject(page);
  await gemini(page, () => ({ page: 'A club page.', can: [] }));
  await press(page, 'What do I click?');
  const sent = (await prompts(page)).at(-1)!;
  expect(sent).toContain('Renew my membership');
  expect(sent).not.toContain('Private text about a member');
  expect(sent).not.toContain("Members' corner"); // not even the heading: the plan keeps headings on the computer
});

test('a suggestion that pays, or points at something that is not on the page, is dropped', async ({ page }) => {
  await html(page, GARDEN);
  await inject(page);
  const pay = await idOf(page, 'Pay now');
  const news = await idOf(page, 'Read the newsletter');
  await page.evaluate(([p, n]) => window.__steady.useGemini(async () => JSON.stringify({ page: 'A club page.', can: [{ id: p, say: 'Pay your fees' }, { id: 's999', say: 'Win a prize' }, { id: n, say: 'Read the newsletter' }, { id: n, say: 'Go to http://evil.example' }] })), [pay, news]);
  const reply = await press(page, 'What do I click?');
  expect(reply.options).toEqual(['Read the newsletter', 'No, just show me the buttons']);
});

test('if Gemini is slow, wrong or not there, Steady answers the way it always has', async ({ page }) => {
  await html(page, GARDEN);
  await inject(page);
  await page.evaluate(() => window.__steady.walk.setPace({ understandMs: 150 }));
  await page.evaluate(() => window.__steady.useGemini(() => new Promise((r) => setTimeout(() => r('{"page":"Too late."}'), 1500))));
  const slow = await press(page, 'What do I click?');
  expect(slow.said).toContain('This is "Members\' corner".');
  await gemini(page, () => 'not json at all');
  expect((await press(page, 'What do I click?')).said).toContain('This is "Members\' corner".');
});

test('the same page asked about twice only costs one question to Gemini', async ({ page }) => {
  await html(page, GARDEN);
  await inject(page);
  await gemini(page, () => ({ page: 'A club page.', can: [] }));
  await press(page, 'What do I click?');
  await press(page, 'What do I click?');
  expect((await prompts(page)).length).toBe(1);
});
