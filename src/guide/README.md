# Guide lane (C)

## The page map

One picture of the page that every lane reads: each button, link and field with its name, kind, position and whether Steady may press or fill it. It only reads the page. It never clicks, types or changes anything.

```ts
import { pageMap } from '@/guide';

const map = pageMap.get();                 // cached until the page changes or scrolls
map.stage;                                 // { kind: 'payment', label: 'Paying' }
map.elements;                              // buttons, links and fields, in reading order
map.forms; map.amounts; map.frames; map.dialog;
```

The shape is in `src/shared/pagemap.ts`. Read the comments there once.

### For A (hands)

```ts
// Before EVERY steadied click and EVERY dwell click:
const verdict = pageMap.mayAutoClick(event.target as Element);
if (!verdict.allowed) { /* show verdict.reason, do not click */ }

pageMap.describe(element);     // what is under the pointer: label, protection, marks
pageMap.liveRect(id);          // where it is right now, so a label can follow the page
pageMap.amounts();             // prices and totals with a Range each, for the Highlight API
```

`mayAutoClick` says no for pay, delete and submit buttons, anything marked fake, disabled buttons, and frames from other websites.
Put `data-steady-ui` on the overlay's host element, so the map never lists Steady's own buttons.

### For B (helper and protect)

```ts
import { toModelSafe } from '@/shared/pagemap';

// The ONLY form of the map that may go to Gemini: names, no values, no prices, no addresses.
const forGemini = toModelSafe(pageMap.get());

pageMap.mark(elementOrId, 'fake', 'This is an advert, not part of this page.');
pageMap.clearMarks('fake');
```

From the side panel or the background worker, ask with a message:

```ts
const { map } = await browser.tabs.sendMessage(tabId, { type: 'pagemap/get' });
await browser.tabs.sendMessage(tabId, { type: 'pagemap/watch', on: true });   // then listen for 'pagemap/changed'
```

Useful fields: `stage.kind === 'payment'`, `amounts` (with `recurring` for renewals and `struck` for old prices), `frames` (`sameSite: false` is how adverts usually arrive), `leavesSite` on links, and `secret` on fields (`'id-number'` at a shop is an Over-Ask; `'gift-card'` is a risky request).

### Labels can be guesses

`labelConfident: false` means the name was worked out from an icon, nearby words or an attribute. The plan says a wrong label is worse than no label, so say "I think this is…" or offer "I'm stuck." Never present a guess as fact.

## Checking a real site

1. `npm run dev`, then open the site.
2. Press **Alt+Shift+M**.
3. Open DevTools (F12), Console. Two tables appear: every visible button, link and field, then every sum of money.

Look for: a wrong `label`, a pay or delete button with `protection: none`, a card or password box without `secret`, a `fillAs` on the wrong field.

## Tests

```
npm test
```

Runs the page map in Chrome against the demo sites and a set of awkward pages. See `tests/`.
