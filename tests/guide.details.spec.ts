// Feature 6, "Fill in my details", as reviewed by C on Saturday afternoon:
//   - ask first, then fill every matching box in one go, then ONE check ("is that right?");
//   - the boxes that are hers come one at a time and move on by themselves when she has done one;
//   - if she is on one box for a long time, say it again gently, then offer a way out;
//   - before the button, point out anything that looks missing or misspelt;
//   - offer to remember what she typed for next time. It never presses the button.
import { expect, test, type Page } from '@playwright/test';
import { html, inject } from './helpers';

const ROSE = {
  givenName: 'Rose',
  familyName: 'Marchetti',
  email: 'rose@example.com',
  phone: '413-555-0188',
  addressLine1: '12 Orchard Lane',
  addressLine2: 'Apartment 3',
  city: 'Amherst',
  state: 'Massachusetts',
  postalCode: '01002',
  country: 'United States',
};

async function ready(page: Page, url: string, details: object | null = ROSE) {
  await page.goto(url);
  await inject(page);
  await page.evaluate((d) => {
    window.__steady.details.setPace({ advanceMs: 30, nudgeMs: 60_000, offerHelpMs: 120_000 });
    return d ? window.__steady.details.save(d) : window.__steady.details.clear();
  }, details as never);
}
const start = (page: Page, level = 'with-me') => page.evaluate((l) => window.__steady.details.start(l as never), level);
const yes = (page: Page) => page.evaluate(() => window.__steady.details.keep());
const no = (page: Page) => page.evaluate(() => window.__steady.details.undo());
/** Everything the helper has said so far, in order. */
const spoken = (page: Page) => page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').map((c) => String(c.args[0])));
const lastSaid = async (page: Page) => (await spoken(page)).at(-1);
/** Type in a box and leave it, as a person does. */
async function type(page: Page, selector: string, text: string) {
  await page.fill(selector, text);
  await page.locator(selector).blur();
}

test('asks first and fills nothing until she says yes', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  const offer = await start(page);
  expect(offer).toMatchObject({
    status: 'offer',
    said: 'I can fill in your name, email, address and phone from "My details". Shall I?',
    options: ['Yes, fill them in', 'No, I will type them'],
  });
  expect(await page.inputValue('#email')).toBe('');
});

test('on yes: fills every matching box in one go, then asks once', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  const check = await yes(page);
  expect(check).toMatchObject({
    status: 'check',
    said: 'I have filled in 9 boxes with your name, email, address and phone. Please have a look. If one is wrong, change it in the box. Tell me when it looks right.',
    options: ['It looks right', 'Take them out'],
  });
  const values = await page.evaluate(() => ['email', 'fname', 'lname', 'addr1', 'addr2', 'city', 'state', 'zip', 'phone', 'ccnum'].map((id) => (document.getElementById(id) as HTMLInputElement).value));
  expect(values).toEqual(['rose@example.com', 'Rose', 'Marchetti', '12 Orchard Lane', 'Apartment 3', 'Amherst', 'Massachusetts', '01002', '413-555-0188', '']);
});

test('then the boxes that are hers, one at a time, moving on by itself as she finishes each', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  let submitted = false;
  page.on('framenavigated', (f) => (submitted ||= f.url().includes('confirmation')));
  await start(page);
  await yes(page);
  const first = await yes(page); // "It looks right"
  expect(first.said).toBe(
    'Now the ones only you can fill in. This one is your choice: "Delivery speed". At the moment it is set to "Express 2 days · adds $9.99". Change it if you like, or tell me to go on.',
  );
  await page.check('[value="standard"]'); // she changes it: no need to tell Steady
  await expect.poll(() => lastSaid(page)).toBe('"Name on card". Type your name the way it is printed on your card.');
  await type(page, '#ccname', 'Rose Marchetti');
  await expect.poll(() => lastSaid(page)).toBe('"Card number". This is the long number across the front of your card. Please type this one yourself. Steady never fills in card details.');
  await type(page, '#ccnum', '4111 1111 1111 1111');
  await expect.poll(() => lastSaid(page)).toBe('"Expires". This is the date on your card, the month and then the year. Please type this one yourself.');
  await type(page, '#ccexp', '04 / 29');
  await expect.poll(() => lastSaid(page)).toBe('"Security code". This is the three numbers on the back of your card. Please type this one yourself.');
  await type(page, '#cccode', '123');
  await expect
    .poll(() => lastSaid(page))
    .toBe('There is a tick box that is already ticked: "Yes, start my free Pennywhistle Plus trial Free for 30 days, then $12.99 a month until cancelled". Untick it if you do not want it, or tell me to go on.');
  const done = await yes(page);
  expect(done).toMatchObject({
    status: 'done',
    said: 'That is every box. I can\'t see anything missing. When you are happy, click "Place order" yourself. That is the button that pays, so I will never click it for you.',
  });
  expect(submitted).toBe(false);
  expect(JSON.stringify(await spoken(page))).not.toContain('4111'); // what she typed is never said back
});

test('"take them out": every box is emptied again, and Steady goes through them with her', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  await yes(page);
  const after = await no(page);
  expect(await page.inputValue('#fname')).toBe('');
  expect(await page.inputValue('#state')).toBe('');
  expect(after.said).toBe('I have taken them out again. We can go through the boxes together. This box is for your email: "Email for your receipt".');
});

test('"no, I will type them": fills nothing and points at each box in turn', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  const first = await no(page);
  expect(first.said).toBe('That is fine. We can go through the boxes together. This box is for your email: "Email for your receipt".');
  await type(page, '#email', 'rose@example.com');
  await expect.poll(() => lastSaid(page)).toBe('This box is for your first name: "First name".');
  expect(await page.inputValue('#fname')).toBe('');
});

test('never writes over something she already typed', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await page.fill('#fname', 'Rosie');
  await start(page);
  const check = await yes(page);
  expect(await page.inputValue('#fname')).toBe('Rosie');
  expect(check.said).toContain('8 boxes');
});

test('if she skips ahead to a later box, Steady keeps up', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  await yes(page);
  await yes(page); // now on "Delivery speed"
  await type(page, '#ccnum', '4111 1111 1111 1111'); // she goes straight to the card number
  await expect.poll(() => lastSaid(page)).toContain('"Expires".');
});

test('a long time on one box: says it again gently, then offers a way out', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await page.evaluate(() => window.__steady.details.setPace({ nudgeMs: 120, offerHelpMs: 300 }));
  await start(page, 'show');
  await expect
    .poll(() => spoken(page))
    .toEqual([
      'There is no rush. This box is for your email: "Email for your receipt".',
      'Would you like to carry on, stop here for now, or ask someone for help? Everything you have typed stays where it is.',
    ]);
  const options = await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').at(-1)!.args[1]);
  expect(options).toEqual(['Carry on', 'Stop for now', 'Ask for help']);
  await page.waitForTimeout(400);
  expect((await spoken(page)).filter((s) => s.startsWith('Would you like')).length).toBe(1); // asked once, not nagged
});

test('before the button: points out a likely misspelling, a box left empty, and an email with no @', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  await yes(page);
  await page.fill('#lname', 'Marcheti');
  await page.fill('#city', '');
  await page.fill('#email', 'rose.example.com');
  await page.fill('#ccname', 'R');
  await page.fill('#ccnum', '1');
  await page.fill('#ccexp', '1');
  await page.fill('#cccode', '1');
  let state = await yes(page);
  while (state.status === 'step') state = await yes(page);
  expect(state.said).toBe(
    'That is every box. Before you go on, a few things to check. "City" is still empty. "Email for your receipt" needs an @ sign to be an email address. "Last name" says "Marcheti", and I have "Marchetti" saved. Please check which is right. When you are happy, click "Place order" yourself. That is the button that pays, so I will never click it for you.',
  );
});

test('getting to know her: with nothing saved, it walks her through, then offers to remember what she typed', async ({ page }) => {
  await ready(page, '/clinic/book.html?reset=1', null);
  await page.evaluate(() => {
    for (const s of document.querySelectorAll<HTMLElement>('[data-step]')) s.hidden = s.dataset.step !== 'you';
  });
  const first = await start(page);
  expect(first.said).toBe('I do not have your details saved yet, so we will go through the boxes together this time. This box is for your first name: "First name".');
  await type(page, '#first', 'Rose');
  await type(page, '#last', 'Marchetti');
  await page.selectOption('[name="dob_year"]', '1948');
  await type(page, '#phone', '413-555-0188');
  await type(page, '#member', 'XJ-204-881');
  await page.waitForTimeout(150); // let it move on by itself first
  let state = await yes(page);
  while (state.status === 'step') state = await yes(page);
  expect(state.said).toBe(
    'That is every box. Before you go on, one thing to check. "Date of birth" is not finished yet. When you are happy, click "Next" yourself.',
  );
  // The question about remembering is a second, separate message, so the first one stays short.
  expect(state.then).toEqual({
    said: 'One more thing. You typed your name and phone, which I did not have saved. Shall I remember them for next time? They stay on this computer.',
    options: ['Yes, remember them', 'No, thank you'],
  });
  expect(state.options).toBeUndefined();
  const kept = await page.evaluate(() => window.__steady.details.remember());
  expect(kept.said).toBe('I will remember them for next time.');
  // Name and phone are kept. The date of birth and the insurance number never are.
  expect(await page.evaluate(() => window.__steady.details.load())).toEqual({ givenName: 'Rose', familyName: 'Marchetti', phone: '413-555-0188' });
});

test('the "show" level: no offer, fills nothing, points at each box', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  const first = await start(page, 'show');
  expect(first).toMatchObject({ status: 'step', said: 'This box is for your email: "Email for your receipt".' });
  expect(await page.inputValue('#email')).toBe('');
});

test('the site hears the change, as if she had typed it', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await page.evaluate(() => {
    (window as unknown as { __events: string[] }).__events = [];
    for (const type of ['input', 'change']) {
      document.querySelector('#email')!.addEventListener(type, () => (window as unknown as { __events: string[] }).__events.push(type));
    }
  });
  await start(page);
  await yes(page);
  expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toEqual(['input', 'change']);
});

test('a page with nothing to fill: says so', async ({ page }) => {
  await ready(page, '/shop/?reset=1');
  expect(await start(page)).toMatchObject({ status: 'no-form', said: 'I can\'t see any boxes on this page that I can help you fill in.' });
});

test('stopping part-way keeps what is there and says so', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  await yes(page);
  const stopped = await page.evaluate(() => window.__steady.details.stop());
  expect(stopped.said).toBe('I have stopped. Everything already filled in is still there.');
  expect(await page.inputValue('#email')).toBe('rose@example.com');
});

test('state written as a short code, and a full name in one box', async ({ page }) => {
  await html(
    page,
    `<form><label>Full name <input id="n" autocomplete="name"></label>
     <label>State <select id="s" autocomplete="address-level1"><option value="">Pick</option><option value="CT">CT</option><option value="MA">MA</option></select></label>
     <label>Address <input id="a" autocomplete="street-address"></label><button>Send</button></form>`,
  );
  await page.evaluate((d) => window.__steady.details.save(d), ROSE);
  await start(page);
  const check = await yes(page);
  expect(check.said).toContain('3 boxes with your name and address');
  expect(await page.inputValue('#n')).toBe('Rose Marchetti');
  expect(await page.inputValue('#s')).toBe('MA');
  expect(await page.inputValue('#a')).toBe('12 Orchard Lane, Apartment 3'); // no second address box on this form
});

test('every step offers a "Go on" button, so nothing needs a key or a typed word', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  const first = await start(page, 'show');
  expect(first.options).toEqual(['Go on']);
  await type(page, '#email', 'rose@example.com');
  await expect.poll(() => lastSaid(page)).toBe('This box is for your first name: "First name".');
  const options = await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').at(-1)!.args[1]);
  expect(options).toEqual(['Go on']);
});

test('she has typed in the box but not left it: the gentle reminder says how to move on', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await page.evaluate(() => window.__steady.details.setPace({ nudgeMs: 150, offerHelpMs: 60_000 }));
  await start(page, 'show');
  await page.locator('#email').pressSequentially('rose@example.com'); // typed, still in the box
  await expect.poll(() => lastSaid(page)).toBe('There is no rush. When you have finished this box, tell me to go on and I will show you the next one.');
  expect(await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').at(-1)!.args[1])).toEqual(['Go on']);
});

test('a box in a form gets a ring, not a dimmed page: she still needs to read the other boxes', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page, 'show');
  const lit = await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight' && c.args[0]).at(-1)!.args[0]);
  expect(lit).toMatchObject({ dim: false });
});
