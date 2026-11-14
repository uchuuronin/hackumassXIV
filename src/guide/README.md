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

## What the lane does so far

| Feature | Import | What it does |
| --- | --- | --- |
| Choice labels | `choices.show()`, `choices.hide()` | A plain sentence beside each main button, six at most. Common buttons are worded on the device. The rest go to Gemini by name only, and its answers are checked before they are shown. |
| Spotlight | `spotlight.on(id, text)`, `spotlight.off()` | Brings a step into view gently and asks the overlay to dim the rest. Says so when the step is hidden or gone. |
| Fill in my details | `details.start(level)` (B's `HelpLevel`), `keep()`, `undo()`, `stop()` | Walks a form one box at a time. Fills name, address, phone and email at "Do it with me". Never fills secrets, never writes over what is there, never presses the button. |
| Recorder | `recorder.start(name)`, `stop()`, `resume()`, `locate(step)` | Keeps the steps of a task (click, choose, type), never the answers. Finds a step again by several clues, and marks a weak match as a guess. |

| "My details" card | `import { MyDetailsCard } from '@/guide/panel/MyDetailsCard'` | The screen where the details are typed in. A React component for B's panel: `<MyDetailsCard />`. |

**Tools.** When the lane starts it registers six tools in B's tool list (`registerTool`), each with `owner: 'guide'`: `label_choices`, `hide_choice_labels`, `fill_my_details`, `fill_next` ("yes" or "I've done that one"), `fill_take_out` ("no, that's not right") and `fill_stop`. The panel can run any of them with a `tool/run` message.

**Help level.** `fill_my_details` reads `helper:level` if no level is passed. At `'show'` it fills nothing and only points. At `'with-me'` and `'do-it'` it fills, and still shows every box before moving on.

**Saved data.** Keys follow B's pattern: `guide:details`, `guide:tasks`, `guide:recording`, `guide:labels:…`.

## The seams with A and B

`src/shared/ports.ts` is C's proposal for how the lanes plug together. Each owner provides their piece once:

```ts
import { provide } from '@/shared/ports';

provide('overlay', { labels, spotlight, clear });   // A: the only thing that draws on a page
provide('clicks', { onClick });                     // A: the only listener for raw clicks
provide('speech', { say });                         // B: one voice
// Gemini is already wired: the guide lane sends B's 'gemini/ask' message to the background worker.
provide('store', { get, set, remove });             // B: saved on this device
```

Until a piece is provided, a quiet stand-in is used, so nothing crashes. In `npm run dev` only, `src/guide/dev/` draws a temporary overlay and shows what the voice would say. Delete that folder when A's overlay and B's voice have landed.

## Trying it without the helper panel

```
npm run build:try
```

Load `.output/chrome-mv3-dev` in `chrome://extensions` (Load unpacked), start the demo sites with `npm run sites`, then use these keys on any page:

| Keys | What it does |
| --- | --- |
| Alt+Shift+L | "What do I click?" Press again to take the notes away. |
| Alt+Shift+D | Save Rose's sample details in "My details". |
| Alt+Shift+F | "Help me fill this in" at "Do it with me". Alt+Shift+G is the same at "Show me". |
| Alt+Shift+Y / N / X | "Yes, that's right" or "I've done that one" / "No, that's not right" / stop. |
| Alt+Shift+R | Start recording a task. Press again to stop; the steps print in the DevTools console. |
| Alt+Shift+M | Print the page map in the DevTools console. |

## Checking a real site

1. `npm run build:try`, load `.output/chrome-mv3-dev`, then open the site.
2. Press **Alt+Shift+M**.
3. Open DevTools (F12), Console. Two tables appear: every visible button, link and field, then every sum of money.

Look for: a wrong `label`, a pay or delete button with `protection: none`, a card or password box without `secret`, a `fillAs` on the wrong field.

## Tests

```
npm test
```

Runs the page map in Chrome against the demo sites and a set of awkward pages. See `tests/`.
