// The awkward things real websites do.
import { expect, test } from '@playwright/test';
import { byLabel, getMap, html, mayAutoClick, one } from './helpers';

test('finds buttons inside shadow DOM and same-site frames, with the right position', async ({ page }) => {
  const map = await html(
    page,
    `<div id="host"></div>
     <iframe id="frame" style="position:absolute;left:200px;top:300px;width:300px;height:100px;border:0"
       srcdoc="<body style='margin:0'><button style='margin:10px;width:120px;height:30px'>Inside the frame</button></body>"></iframe>
     <script>document.getElementById('host').attachShadow({mode:'open'}).innerHTML='<button>Inside the shadow</button>'</script>`,
  );
  expect(one(map, 'Inside the shadow').inFrame).toBe(false);
  const framed = one(map, 'Inside the frame');
  expect(framed.inFrame).toBe(true);
  expect(framed.rect).toMatchObject({ x: 210, y: 310, width: 120, height: 30 });
  expect(map.frames[0]!.sameSite).toBe(true);
});

test('an open pop-up: named, and what is underneath is marked covered', async ({ page }) => {
  const map = await html(
    page,
    `<button id="under" style="position:absolute;left:300px;top:300px">Underneath</button>
     <div role="dialog" aria-modal="true" aria-labelledby="t"
          style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
       <div style="background:#fff;padding:30px"><h2 id="t">We value your privacy</h2><button>Accept all</button><button>×</button></div>
     </div>`,
  );
  expect(map.dialog).toEqual({ label: 'We value your privacy' });
  expect(one(map, 'Underneath')).toMatchObject({ covered: true, inDialog: false });
  expect(one(map, 'Accept all')).toMatchObject({ covered: false, inDialog: true });
  expect(one(map, 'Close')).toMatchObject({ labelSource: 'icon', labelConfident: false });
});

test('clickable things that are not real buttons are found by their hand cursor', async ({ page }) => {
  const map = await html(
    page,
    `<div class="card" style="cursor:pointer;width:200px"><span>Open your statement</span></div>
     <div style="cursor:pointer;width:40px;height:40px"></div>
     <div onclick="void 0"><button>Real button inside</button></div>`,
  );
  expect(one(map, 'Open your statement')).toMatchObject({ kind: 'button', inferred: true });
  // A hand cursor with no words and no picture is noise.
  expect(map.elements.filter((e) => e.inferred)).toHaveLength(1);
  // The wrapper is not a second button.
  expect(map.elements.filter((e) => e.label === 'Real button inside')).toHaveLength(1);
  expect((await mayAutoClick(page, '.card span')).allowed).toBe(true);
});

test('a tick box the site hides and redraws: points at the label the person sees', async ({ page }) => {
  const map = await html(
    page,
    `<style>.real{position:absolute;opacity:0;width:1px;height:1px}</style>
     <label style="display:inline-block;margin:50px;padding:10px;border:1px solid"><input class="real" type="checkbox" checked> Keep me signed in</label>`,
  );
  const box = one(map, 'Keep me signed in');
  expect(box).toMatchObject({ kind: 'checkbox', visible: true, checked: true });
  expect(box.rect.width).toBeGreaterThan(100);
});

test('what counts as pay, delete and submit', async ({ page }) => {
  const map = await html(
    page,
    `<form role="search"><input type="search" aria-label="Search the site"><button>Go</button></form>
     <form action="/contact"><input name="message" aria-label="Message"><button>Send message</button><button type="reset">Start again</button><button type="button">Show more</button></form>
     <form action="/pay"><input autocomplete="cc-number" aria-label="Card number"><input type="submit" value="Continue"></form>
     <button>Buy now</button> <button>Cancel my subscription</button> <button>Cancel</button> <button>Add to cart</button>
     <a href="/account/delete">Delete account</a> <a href="/signin">Sign in</a> <a href="#">Submit</a> <a href="/donate">Donate</a>
     <a href="/checkout">Proceed to checkout</a> <button>Create account</button> <button>Next</button>`,
  );
  const protection = Object.fromEntries(map.elements.filter((e) => e.kind === 'button' || e.kind === 'link').map((e) => [e.label, e.protection]));
  expect(protection).toEqual({
    Go: 'none',
    'Send message': 'submit',
    'Start again': 'delete',
    'Show more': 'none',
    Continue: 'pay', // it sends card details, whatever it is called
    'Buy now': 'pay',
    'Cancel my subscription': 'delete',
    Cancel: 'none',
    'Add to cart': 'none',
    'Delete account': 'delete',
    'Sign in': 'none', // an ordinary link to the sign-in page
    Submit: 'submit',
    Donate: 'pay',
    'Proceed to checkout': 'none',
    'Create account': 'submit',
    Next: 'none',
  });
  expect(one(map, 'Continue').protectionReason).toBe('it sends your card details');
});

test('secrets are recognised however the site spells them', async ({ page }) => {
  const map = await html(
    page,
    `<label>SSN <input name="a"></label>
     <label>Verification code <input name="b"></label>
     <label>Gift card number <input name="c"></label>
     <label>Card PIN <input name="d"></label>
     <label>Routing number <input name="e"></label>
     <label>Date of birth <input type="date" name="f"></label>
     <input name="cardNumber" placeholder="1234 5678 9012 3456">
     <input name="cvv" placeholder="123">
     <label>PIN code <input name="pincode"></label>
     <label>Passport number <input name="g"></label>
     <label>Driver's license <input name="h"></label>
     <label>Company name <input name="i"></label>
     <label>Emergency contact phone <input type="tel" name="j"></label>
     <label>Friend's email <input type="email" name="k"></label>
     <label>Username <input name="l"></label>
     <label>Your name <input name="m"></label>`,
  );
  const what = Object.fromEntries(map.elements.map((e) => [e.label, e.secret ?? e.fillAs ?? '-']));
  expect(what).toEqual({
    SSN: 'id-number',
    'Verification code': 'one-time-code',
    'Gift card number': 'gift-card',
    'Card PIN': 'password',
    'Routing number': 'bank-account',
    'Date of birth': 'date-of-birth',
    '1234 5678 9012 3456': 'card-number',
    '123': 'card-code',
    'PIN code': 'postal-code',
    'Passport number': 'id-number',
    "Driver's license": 'id-number',
    'Company name': '-', // not the person's own name
    'Emergency contact phone': '-', // not the person's own phone
    "Friend's email": '-',
    Username: '-',
    'Your name': 'name',
  });
});

test('unlabelled fields: a guess is flagged, and a guess is never enough to fill', async ({ page }) => {
  const map = await html(
    page,
    `<table><tr><td>City</td><td><input name="x1"></td></tr></table>
     <div><input name="shipping_postcode"></div>
     <div><input name="x3"></div>`,
  );
  const [city, post, unknown] = map.elements;
  expect(city).toMatchObject({ label: 'City', labelSource: 'nearby', labelConfident: false });
  expect(city!.fillAs).toBeUndefined(); // only the nearby words say "City"
  expect(post).toMatchObject({ label: 'Shipping postcode', labelSource: 'name', fillAs: 'postal-code' }); // the site's own field name agrees
  expect(unknown).toMatchObject({ labelSource: 'none', labelConfident: false });
});

test('prices written in pieces, in tables, and with a renewal', async ({ page }) => {
  const map = await html(
    page,
    `<div class="p"><span>$</span><span>12</span><sup>99</sup></div>
     <table><tr><th>Shipping</th><td>£4.50</td></tr><tr><th>Total</th><td>£54.49</td></tr></table>
     <p>Premium plan: €9.99 per month, billed until cancelled.</p>
     <p>1,299.00 USD</p>`,
  );
  const got = map.amounts.map((a) => [a.kind, a.value, a.currency, a.recurring ?? '']);
  expect(got).toEqual([
    ['price', 12.99, 'USD', ''],
    ['delivery', 4.5, 'GBP', ''],
    ['total', 54.49, 'GBP', ''],
    ['price', 9.99, 'EUR', 'per month'],
    ['price', 1299, 'USD', ''],
  ]);
});

test("Steady's own overlay is never in the map", async ({ page }) => {
  const map = await html(page, `<div data-steady-ui><button>Steady's own button</button><span>$5.00</span></div><button>Site button</button>`);
  expect(map.elements.map((e) => e.label)).toEqual(['Site button']);
  expect(map.amounts).toHaveLength(0);
});

test('hidden, disabled and off-screen elements', async ({ page }) => {
  const map = await html(
    page,
    `<button style="display:none">Gone</button><button style="visibility:hidden">Invisible</button>
     <button style="position:absolute;left:-9999px">Parked</button><button disabled>Greyed out</button>
     <fieldset disabled><button>In a disabled group</button></fieldset>
     <div style="height:3000px"></div><button>Far below</button>`,
  );
  const state = Object.fromEntries(map.elements.map((e) => [e.label, `${e.visible ? 'visible' : 'hidden'}${e.inViewport ? ' on-screen' : ''}${e.disabled ? ' disabled' : ''}`]));
  expect(state).toEqual({
    Gone: 'hidden',
    Invisible: 'hidden',
    Parked: 'hidden',
    'Greyed out': 'visible on-screen disabled',
    'In a disabled group': 'visible on-screen disabled',
    'Far below': 'visible',
  });
  expect((await mayAutoClick(page, 'button[disabled]')).allowed).toBe(false);
});

test('look-ups by id, live positions while scrolling, and elements that go away', async ({ page }) => {
  const map = await html(page, `<div style="height:400px"></div><button id="b">Target</button><div style="height:3000px"></div>`);
  const id = one(map, 'Target').id;
  const before = await page.evaluate((i) => window.__steady.api.liveRect(i), id);
  await page.evaluate(() => window.scrollTo(0, 150));
  const after = await page.evaluate((i) => window.__steady.api.liveRect(i), id);
  expect(after!.y).toBe(before!.y - 150);
  expect(await page.evaluate((i) => window.__steady.api.elementFor(i)?.id, id)).toBe('b');
  expect(one(await getMap(page), 'Target').id).toBe(id); // the same button keeps its id
  await page.evaluate(() => document.getElementById('b')!.remove());
  expect(await page.evaluate((i) => window.__steady.api.liveRect(i), id)).toBeNull();
  expect(byLabel(await getMap(page), 'Target')).toHaveLength(0);
});

test('a very large page: fast, and cut down to what is nearest', async ({ page }) => {
  const links = Array.from({ length: 3000 }, (_, i) => `<p><a href="/item/${i}">Item number ${i}</a> <span>$${i}.00</span></p>`).join('');
  const map = await html(page, links);
  expect(map.truncated).toBe(true);
  expect(map.elements).toHaveLength(400);
  expect(map.elements[0]!.label).toBe('Item number 0'); // what is on screen is kept
  expect(map.tookMs).toBeLessThan(400);
  const again = await page.evaluate(() => {
    const t = performance.now();
    window.__steady.api.get();
    return performance.now() - t;
  });
  expect(again).toBeLessThan(5); // nothing changed, so the map is reused
});

test('a page that animates constantly does not flood listeners', async ({ page }) => {
  await html(page, `<div id="spin">0</div><button>Stay</button>`);
  const calls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        window.__steady.api.onChange(() => n++);
        let i = 0;
        const timer = setInterval(() => (document.getElementById('spin')!.textContent = String(i++)), 10);
        setTimeout(() => {
          clearInterval(timer);
          resolve(n);
        }, 3000);
      }),
  );
  expect(calls).toBeGreaterThanOrEqual(1);
  expect(calls).toBeLessThanOrEqual(3);
});

test('icon-only buttons: a name is trusted only when a second clue agrees with the icon', async ({ page }) => {
  const icon = (cls: string) => `<svg class="${cls}" width="20" height="20"><path d="M0 0h20v20z"/></svg>`;
  const map = await html(
    page,
    `<a id="a" href="/cart">${icon('icon-cart')}</a>
     <button id="b">${icon('icon-bag')}<span class="badge">3</span></button>
     <button id="c">${icon('icon-cart')}</button>
     <a id="d" href="/promo/summer">${icon('icon-cart')}</a>
     <button id="e">${icon('icon-heart')}<span>12</span></button>
     <a id="f" href="/account/orders">${icon('icon-user')}</a>
     <button id="g">${icon('icon-trash')}<span>2</span></button>`,
  );
  const got = await page.evaluate(
    (m) => Object.fromEntries(m.elements.map((e) => [window.__steady.api.elementFor(e.id)!.id, `${e.label}${e.labelConfident ? '' : '?'}`])),
    map,
  );
  expect(got).toEqual({
    a: 'Basket', // a basket icon that leads to /cart
    b: 'Basket', // a basket icon with a count on it
    c: 'Basket?', // only the icon's name to go on
    d: 'Basket?', // the icon says basket but the link goes somewhere else
    e: 'Save for later?', // a count beside a heart proves nothing
    f: 'Account', // an account icon that leads to /account
    g: 'Remove?', // never sure about a button that deletes
  });
});
