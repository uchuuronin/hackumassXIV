// The page map on the demo shop and clinic. These pages cover the tracker's list of test pages:
// a form, a checkout, a page with adverts, a calendar, and a page that changes without reloading.
import { expect, test } from '@playwright/test';
import { byLabel, getMap, inject, mayAutoClick, modelSafe, one, open } from './helpers';

test.describe('shop home', () => {
  test('the basket icon: two clues agree (the icon and where it leads), so its name is not a guess', async ({ page }) => {
    const map = await open(page, '/shop/?reset=1');
    const basket = one(map, 'Basket');
    expect(basket.labelSource).toBe('icon');
    expect(basket.labelConfident).toBe(true);
  });

  test('an icon-only button with one clue is named, and the name is marked as a guess', async ({ page }) => {
    const map = await open(page, '/shop/?reset=1');
    const search = map.elements.find((e) => e.kind === 'button' && e.label === 'Search')!;
    expect(search.labelConfident).toBe(false);
    expect(search.protection).toBe('none'); // a search box only looks things up
  });

  test('says which product each repeated button belongs to', async ({ page }) => {
    const map = await open(page, '/shop/?reset=1');
    const adds = byLabel(map, 'Add to basket');
    expect(adds).toHaveLength(6);
    expect(adds.map((a) => a.context)).toContain('Brass reading lamp');
    expect(new Set(adds.map((a) => a.context)).size).toBe(6);
    expect(adds.every((a) => a.protection === 'none')).toBe(true);
  });

  test('lists the advert as a frame from another website, and never clicks into it', async ({ page }) => {
    const map = await open(page, '/shop/?reset=1');
    const ad = map.frames.find((f) => f.title === 'Advertisement')!;
    expect(ad.sameSite).toBe(false);
    expect(ad.visible).toBe(true);
    // Nothing inside the advert is in the map.
    expect(map.elements.some((e) => /download/i.test(e.label))).toBe(false);
    expect((await mayAutoClick(page, '#top-ad')).allowed).toBe(false);
  });

  test('finds prices and knows a crossed-out price is not the price', async ({ page }) => {
    const map = await open(page, '/shop/?reset=1');
    const lamp = map.amounts.filter((a) => a.label === 'Brass reading lamp');
    expect(lamp.map((a) => [a.value, a.struck])).toEqual([
      [34, false],
      [42, true],
    ]);
    // "Free delivery on orders over $60" is a condition, not a delivery charge.
    expect(map.amounts.find((a) => a.value === 60)!.kind).toBe('price');
  });
});

test.describe('shop basket', () => {
  test('three look-alike remove buttons: protected, and each says what it removes', async ({ page }) => {
    const map = await open(page, '/shop/basket.html?reset=1');
    expect(map.stage.kind).toBe('basket');
    const removes = byLabel(map, 'Remove');
    expect(removes).toHaveLength(3);
    expect(removes.map((r) => r.context)).toEqual(['Brass reading lamp', 'Two-cup teapot', 'Large-number kitchen timer']);
    for (const r of removes) {
      expect(r.protection).toBe('delete'); // sure of the name or not, it still needs a real press
      expect(r.labelConfident).toBe(true); // a bin icon on a basket line, beside a price
    }
  });

  test('the safety limit: no dwell click on remove, fine on an ordinary link', async ({ page }) => {
    await open(page, '/shop/basket.html?reset=1');
    const remove = await mayAutoClick(page, '[data-remove="lamp"] svg');
    expect(remove.allowed).toBe(false);
    expect(remove.reason).toContain('real click');
    expect((await mayAutoClick(page, '#keep')).allowed).toBe(true);
    expect((await mayAutoClick(page, '#go-checkout')).allowed).toBe(true);
    expect((await mayAutoClick(page, 'h1')).allowed).toBe(false); // nothing to click
  });

  test('the fake "Continue" picture: leaves the site and has no trustworthy name', async ({ page }) => {
    const map = await open(page, '/shop/basket.html?reset=1');
    const fake = map.elements.find((e) => e.leavesSite && e.visible)!;
    expect(fake.kind).toBe('link');
    expect(fake.labelConfident).toBe(false);
    // The two real buttons are both there, named, and stay on the site.
    expect(one(map, 'Continue shopping').leavesSite).toBe(false);
    expect(one(map, 'Checkout').leavesSite).toBe(false);
  });

  test('a button marked fake is never auto-clicked, and the mark shows in the map', async ({ page }) => {
    await open(page, '/shop/basket.html?reset=1');
    await page.evaluate(() => {
      const fake = document.querySelector('#pic-ad a')!;
      window.__steady.api.mark(fake, 'fake', 'This is an advert, not part of this page.');
    });
    const verdict = await mayAutoClick(page, '#pic-ad img');
    expect(verdict).toMatchObject({ allowed: false, reason: 'This is an advert, not part of this page.' });
    const map = await getMap(page);
    expect(map.elements.find((e) => e.leavesSite)!.marks).toEqual([{ kind: 'fake', reason: 'This is an advert, not part of this page.' }]);
    await page.evaluate(() => window.__steady.api.clearMarks('fake'));
    expect((await mayAutoClick(page, '#pic-ad img')).allowed).toBe(true);
  });

  test('reads the totals', async ({ page }) => {
    const map = await open(page, '/shop/basket.html?reset=1');
    const kinds = Object.fromEntries(map.amounts.filter((a) => a.kind !== 'price').map((a) => [a.kind, a.value]));
    expect(kinds).toEqual({ subtotal: 78.98, tax: 4.94, total: 83.92 });
  });

  test('rebuilds after the page changes in place', async ({ page }) => {
    await open(page, '/shop/basket.html?reset=1');
    const changed = page.evaluate(() => new Promise<string>((resolve) => window.__steady.api.onChange(resolve)));
    await page.click('[data-remove="teapot"]');
    expect(await changed).toBe('content');
    const map = await getMap(page);
    expect(byLabel(map, 'Remove')).toHaveLength(2);
    // Under $60 now, so delivery is no longer free: 59.98 + 5.95 + 3.75.
    expect(map.amounts.find((a) => a.kind === 'total')!.value).toBeCloseTo(69.68, 2);
  });
});

test.describe('shop checkout', () => {
  test('matches "My details" fields, with and without autofill hints', async ({ page }) => {
    const map = await open(page, '/shop/checkout.html?reset=1');
    const fill = Object.fromEntries(map.elements.filter((e) => e.fillAs).map((e) => [e.label, `${e.fillAs} (${e.fillFrom})`]));
    expect(fill).toEqual({
      'Email for your receipt': 'email (autocomplete)',
      'First name': 'given-name (autocomplete)',
      'Last name': 'family-name (autocomplete)',
      'Street address': 'address-line1 (label)',
      'Apartment, suite, etc. (optional)': 'address-line2 (label)',
      City: 'address-level2 (label)',
      State: 'address-level1 (label)',
      ZIP: 'postal-code (label)',
      'Phone, in case the driver needs you': 'tel (type)',
    });
  });

  test('card fields are secrets: never fillable, and their values never enter the map', async ({ page }) => {
    await page.goto('/shop/checkout.html?reset=1');
    await page.fill('#ccnum', '4111 1111 1111 1111');
    await page.fill('#cccode', '987');
    await page.fill('#fname', 'Rose');
    const map = await getMap(page);
    expect(one(map, 'Card number')).toMatchObject({ secret: 'card-number', sensitive: true });
    expect(one(map, 'Expires').secret).toBe('card-expiry');
    expect(one(map, 'Security code').secret).toBe('card-code');
    expect(one(map, 'Name on card').secret).toBe('card-name');
    for (const e of map.elements.filter((x) => x.secret)) {
      expect(e.fillAs).toBeUndefined();
      expect(e.value).toBeUndefined();
    }
    expect(JSON.stringify(map)).not.toContain('4111');
    expect(JSON.stringify(map)).not.toContain('987');
    expect(one(map, 'First name').value).toBe('Rose'); // ordinary fields are kept, on the device
  });

  test('what goes to Gemini has names only: nothing typed, no prices, no headings, no link addresses', async ({ page }) => {
    await page.goto('/shop/checkout.html?reset=1');
    await page.fill('#fname', 'Rose');
    await page.fill('#addr1', '12 Orchard Lane');
    await page.selectOption('#state', 'Vermont');
    const safe = JSON.stringify(await modelSafe(page));
    // Typed text, the total, link addresses, the query string and the page heading all stay behind.
    for (const kept of ['Rose', 'Orchard', '93.91', '78.98', 'basket.html', 'reset=1', '"headings"', '"amounts"', '"href"', '"title"']) {
      expect(safe).not.toContain(kept);
    }
    expect(safe).toContain('"Street address"');
    expect(safe).toContain('"Place order"');
    expect(safe).not.toContain('"value"');
    expect(safe).not.toContain('"selected"');
    expect(safe).not.toContain('"checked"');
  });

  test('"Place order" pays, so it needs a real press', async ({ page }) => {
    const map = await open(page, '/shop/checkout.html?reset=1');
    expect(map.stage).toEqual({ kind: 'payment', label: 'Paying' });
    const place = one(map, 'Place order');
    expect(place.protection).toBe('pay');
    const form = map.forms.find((f) => f.takesPayment)!;
    expect(form.submitId).toBe(place.id);
    expect((await mayAutoClick(page, '#place-order')).allowed).toBe(false);
  });

  test('sees the pre-ticked trial and that it renews', async ({ page }) => {
    const map = await open(page, '/shop/checkout.html?reset=1');
    const trial = one(map, /free Pennywhistle Plus trial/);
    expect(trial).toMatchObject({ kind: 'checkbox', checked: true });
    expect(map.amounts.find((a) => a.value === 12.99)!.recurring).toBe('a month');
    // Express delivery was chosen for her.
    const express = one(map, /^Express/);
    expect(express).toMatchObject({ kind: 'radio', checked: true, group: 'Delivery speed' });
  });

  test('tricky mode: a shop asking for a Social Security number', async ({ page }) => {
    const map = await open(page, '/shop/checkout.html?reset=1&tricky=1');
    expect(one(map, /Social Security number/).secret).toBe('id-number');
    expect(one(map, "Mother's maiden name").secret).toBe('password');
  });

  test('the redesigned shop: new wording and ids, same meaning', async ({ page }) => {
    const map = await open(page, '/shop/checkout.html?reset=1&look=2');
    expect(one(map, 'Complete purchase').protection).toBe('pay');
    expect(one(map, 'Street address').fillAs).toBe('address-line1');
  });
});

test.describe('clinic', () => {
  test('sign in, then the code step, without the page reloading', async ({ page }) => {
    let map = await open(page, '/clinic/signin.html?reset=1');
    expect(map.stage.kind).toBe('sign-in');
    expect(one(map, 'Password')).toMatchObject({ secret: 'password', sensitive: true });
    expect(one(map, 'Email address').fillAs).toBe('email');
    expect(one(map, 'Sign in').protection).toBe('submit');

    await page.fill('#email', 'rose@example.com');
    await page.fill('#password', 'hunter2');
    expect(JSON.stringify(await getMap(page))).not.toContain('hunter2');

    const changed = page.evaluate(() => new Promise<string>((resolve) => window.__steady.api.onChange(resolve)));
    await page.click('#signin button');
    expect(await changed).toBe('address'); // pushState: the address changed with no reload
    map = await getMap(page);
    expect(map.stage.kind).toBe('code');
    expect(one(map, '6-digit code').secret).toBe('one-time-code');
    expect(byLabel(map, 'Password')).toHaveLength(0);
  });

  test('booking: a "choose yours" step, then standard date and time controls', async ({ page }) => {
    let map = await open(page, '/clinic/book.html?reset=1');
    expect(map.stage.kind).toBe('booking');
    const doctors = map.elements.filter((e) => e.kind === 'radio' && e.visible);
    expect(doctors).toHaveLength(3);
    expect(doctors.every((d) => d.group === 'Who would you like to see?')).toBe(true);
    expect(one(map, 'Reason for your visit').options!.map((o) => o.label)).toContain('Flu shot');
    expect(one(map, 'Next').protection).toBe('none');
    expect(byLabel(map, 'Confirm appointment')).toHaveLength(0); // hidden until the last step

    await page.selectOption('#reason', 'Flu shot');
    await page.check('[value="okafor"]');
    await page.click('#next');
    map = await getMap(page);
    expect(one(map, 'Day').kind).toBe('date');
    expect(one(map, 'Time').kind).toBe('select');
    expect(map.headings[0]!.text).toBe('Pick a day and a time');
  });

  test('booking details: date of birth and insurance ID are never filled or kept', async ({ page }) => {
    await page.goto('/clinic/book.html?reset=1');
    await page.evaluate(() => {
      for (const s of document.querySelectorAll<HTMLElement>('[data-step]')) s.hidden = s.dataset.step !== 'you';
    });
    await page.selectOption('[name="dob_year"]', '1948');
    await page.fill('#member', 'XJ-204-881');
    const map = await getMap(page);
    for (const part of ['Month', 'Day', 'Year']) {
      expect(one(map, part)).toMatchObject({ secret: 'date-of-birth', group: 'Date of birth' });
    }
    expect(one(map, 'Insurance member ID (optional)').secret).toBe('id-number');
    expect(JSON.stringify(map.elements.map((e) => e.value))).not.toContain('1948');
    expect(JSON.stringify(map)).not.toContain('XJ-204');
    expect(one(map, 'Mobile phone').fillAs).toBe('tel');
    expect(one(map, 'First name').fillAs).toBe('given-name');
  });

  test('confirming the appointment needs a real press', async ({ page }) => {
    await page.goto('/clinic/book.html?reset=1');
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('#confirm')!.hidden = false;
    });
    const map = await getMap(page);
    expect(one(map, 'Confirm appointment').protection).toBe('submit');
    expect((await mayAutoClick(page, '#confirm')).allowed).toBe(false);
  });

  test("the redesigned clinic's own calendar: days are named, closed days are off", async ({ page }) => {
    await page.goto('/clinic/book.html?reset=1&look=2');
    await page.selectOption('#reason', 'Flu shot');
    await page.check('[value="okafor"]');
    await page.click('#next');
    await inject(page);
    await page.click('.cal-grid button:not([disabled])');
    const map = await getMap(page);
    expect(map.stage.kind).toBe('booking');
    const days = map.elements.filter((e) => e.visible && /^\d{1,2}$/.test(e.label));
    expect(days.length).toBeGreaterThan(27);
    expect(days.some((d) => d.disabled)).toBe(true);
    expect(days.every((d) => d.labelConfident)).toBe(true);
    expect(byLabel(map, '9:30 am')).toHaveLength(1);
    // The month arrows are symbols. Their names are guesses.
    expect(map.elements.filter((e) => e.labelSource === 'icon' && e.visible).map((e) => e.label)).toEqual(['Back', 'Next']);
  });
});
