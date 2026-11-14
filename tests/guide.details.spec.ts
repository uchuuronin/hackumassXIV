// Feature 6, "Fill in my details": one field at a time, shown before moving on, and it never presses Submit.
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
  await page.evaluate((d) => (d ? window.__steady.details.save(d) : window.__steady.details.clear()), details as never);
}
const start = (page: Page, level = 'with-me') => page.evaluate((l) => window.__steady.details.start(l as never), level);
const keep = (page: Page) => page.evaluate(() => window.__steady.details.keep());
const undo = (page: Page) => page.evaluate(() => window.__steady.details.undo());

/** Keep saying yes until the helper has nothing left, and return what it said along the way. */
async function walk(page: Page, first: Awaited<ReturnType<typeof start>>) {
  const said = [first.said];
  let state = first;
  while (state.status === 'step') {
    state = await keep(page);
    said.push(state.said);
  }
  return { said, last: state };
}

test('the shop checkout: fills name and address one at a time, leaves the card to her, and never presses the button', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  let submitted = false;
  page.on('framenavigated', (f) => (submitted ||= f.url().includes('confirmation')));
  const first = await start(page);
  expect(first).toMatchObject({ status: 'step', step: { kind: 'filled', label: 'Email for your receipt', value: 'rose@example.com' } });
  expect(first.said).toBe('I have put "rose@example.com" in "Email for your receipt". Is that right?');
  // Only the first field is filled so far. One at a time.
  expect(await page.inputValue('#email')).toBe('rose@example.com');
  expect(await page.inputValue('#fname')).toBe('');

  const { said, last } = await walk(page, first);
  expect(said).toEqual([
    'I have put "rose@example.com" in "Email for your receipt". Is that right?',
    'I have put "Rose" in "First name". Is that right?',
    'I have put "Marchetti" in "Last name". Is that right?',
    'I have put "12 Orchard Lane" in "Street address". Is that right?',
    'I have put "Apartment 3" in "Apartment, suite, etc. (optional)". Is that right?',
    'I have put "Amherst" in "City". Is that right?',
    'I have chosen "Massachusetts" for "State". Is that right?',
    'I have put "01002" in "ZIP". Is that right?',
    'I have put "413-555-0188" in "Phone, in case the driver needs you". Is that right?',
    'This one is your choice: "Delivery speed". At the moment it is set to "Express 2 days · adds $9.99". Change it if you like, then tell me to go on.',
    '"Name on card". Type your name the way it is printed on your card. Tell me when you are ready to go on.',
    '"Card number". This is the long number across the front of your card. Please type this one yourself. Steady never fills in card details. Tell me when you are ready to go on.',
    '"Expires". This is the date on your card, the month and then the year. Please type this one yourself. Tell me when you are ready to go on.',
    '"Security code". This is the three numbers on the back of your card. Please type this one yourself. Tell me when you are ready to go on.',
    'There is a tick box that is already ticked: "Yes, start my free Pennywhistle Plus trial Free for 30 days, then $12.99 a month until cancelled". Untick it if you do not want it, then tell me to go on.',
    'That is every box. Please check your answers. When you are happy, click "Place order" yourself. That is the button that pays, so I will never click it for you.',
  ]);
  expect(last.status).toBe('done');
  expect(await page.inputValue('#state')).toBe('Massachusetts');
  expect(await page.inputValue('#ccnum')).toBe('');
  expect(submitted).toBe(false);
  // The last thing lit is the button she presses herself.
  const lit = await page.evaluate(() => {
    const calls = window.__steady.calls.filter((c) => c.port === 'overlay' && c.method === 'spotlight');
    const last = calls.at(-1)!.args[0] as { targetId: string };
    return window.__steady.api.get().elements.find((e) => e.id === last.targetId)!.label;
  });
  expect(lit).toBe('Place order');
  // Everything it said also went to the voice.
  expect(await page.evaluate(() => window.__steady.calls.filter((c) => c.port === 'speech').length)).toBe(said.length);
});

test('"that is not right": the value is taken out again and the box is left to her', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  await keep(page); // email kept, now on first name
  const undone = await undo(page);
  expect(await page.inputValue('#fname')).toBe('');
  expect(undone).toMatchObject({ status: 'step', step: { kind: 'yours', label: 'First name' } });
  expect(undone.said).toBe('I have taken it out. Type what you want in "First name", then tell me when you are ready to go on.');
  expect((await keep(page)).step!.label).toBe('Last name');
});

test('never writes over something she already typed', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await page.fill('#fname', 'Rosie');
  const { said } = await walk(page, await start(page));
  expect(await page.inputValue('#fname')).toBe('Rosie');
  expect(said.some((s) => s.includes('"First name"'))).toBe(false);
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
  expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toEqual(['input', 'change']);
});

test('the "show" level: points at each box and fills nothing', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  const first = await start(page, 'show');
  expect(first.said).toBe('This box is for your email: "Email for your receipt". Type it in, then tell me when you are ready to go on.');
  await walk(page, first);
  expect(await page.inputValue('#email')).toBe('');
  expect(await page.inputValue('#city')).toBe('');
});

test('no details saved yet: asks for them and touches nothing', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1', null);
  const state = await start(page);
  expect(state).toEqual({
    status: 'needs-details',
    said: 'I do not have your details yet. Open "My details" and add your name and address. Then ask me again and I will fill them in for you.',
  });
  expect(await page.inputValue('#email')).toBe('');
});

test('the clinic: date of birth and the insurance number are hers to enter', async ({ page }) => {
  await ready(page, '/clinic/book.html?reset=1');
  await page.evaluate(() => {
    for (const s of document.querySelectorAll<HTMLElement>('[data-step]')) s.hidden = s.dataset.step !== 'you';
  });
  const { said } = await walk(page, await start(page));
  expect(said.slice(0, 4)).toEqual([
    'I have put "Rose" in "First name". Is that right?',
    'I have put "Marchetti" in "Last name". Is that right?',
    '"Date of birth". This is your date of birth. Please choose this one yourself. Tell me when you are ready to go on.',
    'I have put "413-555-0188" in "Mobile phone". Is that right?',
  ]);
  expect(said).toContain(
    '"Insurance member ID (optional)". This asks for an ID number. Please type this one yourself, and only if you are sure this website should have it. It is fine to stop and ask someone first. Tell me when you are ready to go on.',
  );
  expect(await page.inputValue('[name="dob_year"]')).toBe('');
  // This form ends on "Next", which is safe, so the ending is plain.
  expect(said.at(-1)).toBe('That is every box. Please check your answers. When you are happy, click "Next" yourself.');
});

test('a page with nothing to fill: says so', async ({ page }) => {
  await ready(page, '/shop/?reset=1');
  expect(await start(page)).toEqual({ status: 'no-form', said: 'I can\'t see any boxes on this page that I can help you fill in.' });
});

test('stopping part-way keeps what she has and says so', async ({ page }) => {
  await ready(page, '/shop/checkout.html?reset=1');
  await start(page);
  await keep(page);
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
  await walk(page, await start(page));
  expect(await page.inputValue('#n')).toBe('Rose Marchetti');
  expect(await page.inputValue('#s')).toBe('MA');
  expect(await page.inputValue('#a')).toBe('12 Orchard Lane, Apartment 3'); // no second address box on this form
});
