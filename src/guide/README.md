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
| Choice labels | `choices.show()`, `choices.hide()`, `choices.setPace()` | A plain sentence beside each main button, six at most, shown one at a time and then taken away. Afterwards, resting the pointer on a button for a moment brings its sentence back. Common buttons are worded on the device. The rest go to Gemini by name only, and its answers are checked before they are shown. |
| Spotlight | `spotlight.on(id, text, { dim })`, `spotlight.off()` | Brings a step into view gently and asks A's overlay to dim the rest (`setSpotlight`). `{ dim: false }` gives a ring only, used for boxes in a form so the other boxes stay readable. Says so when the step is hidden or gone. |
| Fill in my details | `details.start(level)` (B's `HelpLevel`), `keep()`, `undo()`, `repeat()`, `remember()`, `stop()`, `setPace()` | Asks first, fills name, address, phone and email in one go, and asks once whether it looks right. Then points at each box that is the person's own and moves on by itself when they finish it. Checks in gently after a long pause. Before the button, points out anything empty or misspelt, and offers to remember what they typed. Never fills secrets, never writes over what is there, never presses the button. |
| Recorder | `recorder.start(name)`, `stop()`, `resume()`, `locate(step)` | Keeps the steps of a task (click, choose, type), never the answers. Finds a step again by several clues, and marks a weak match as a guess. |

| "My details" card | `import { MyDetailsCard } from '@/guide/panel/MyDetailsCard'` | The screen where the details are typed in. A React component for B's panel: `<MyDetailsCard />`. |

**Tools.** When the lane starts it registers eight tools in B's tool list (`registerTool`), each with `owner: 'guide'`. The panel can run any of them with a `tool/run` message.

| Tool | When to run it |
| --- | --- |
| `label_choices`, `hide_choice_labels` | "What do I click?" |
| `fill_my_details` | "Help me fill this in." |
| `fill_next` | Yes, "it looks right", "go on". |
| `fill_take_out` | No. Before filling: leave every box to them. After filling: take it all out. |
| `fill_repeat` | "What was that?", "Carry on". |
| `fill_remember` | Yes to "Shall I remember them for next time?" |
| `fill_stop` | "Stop for now." |

**Answers as buttons.** A fill result carries `data.options`, short answers such as `['It looks right', 'Take them out']`. Show them as buttons so nobody has to type or remember a word.

**Things Steady says without being asked.** When a box is finished Steady moves to the next one by itself, and after a long pause it checks in. Those sentences go through the `speech` port as `say(text, options?)`. Until B provides a `speech` port, the lane sends them to the panel as a `helper/answer` message (`{ said, options }`), so the panel needs to listen for that message from a page as well as returning it as a reply.

**Help level.** `fill_my_details` reads `helper:level` if no level is passed. At `'show'` it fills nothing and only points. At `'with-me'` and `'do-it'` it offers to fill, and fills only after a yes.

**What it remembers.** Only name, address, phone and email, only after a yes, and only on this computer (`guide:details`). What is typed in a card, password, code, ID or date-of-birth box is never read.

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

## The look

`src/shared/theme.ts` holds the one calm look for everything Steady draws: warm paper, dark ink, and colour only as a quiet edge (green for the way forward, blue for "just so you know", clay for anything that pays, sends or removes). A's notes and rings, B's Pay Pause and helper panel, and the "My details" card all read from it. `tests/theme.contrast.spec.ts` checks every pair that carries words.

## Trying it without the helper panel

```
npm run build:try
```

Load `.output/chrome-mv3-dev` in `chrome://extensions` (Load unpacked) and start the demo sites with `npm run sites`. A small black panel appears in the bottom right corner of every page. It stands in for the helper panel:

- **What do I click?** and **Help me fill this in** are always there.
- The answers Steady offers ("Yes, fill them in", "It looks right", "Take them out") appear as yellow buttons.
- Rose's sample details are saved for you the first time, so there is something to fill in.

No keys are needed. These still work if you prefer them:

| Keys | What it does |
| --- | --- |
| Alt+Shift+L | "What do I click?" |
| Alt+Shift+F | "Help me fill this in." |
| Alt+Shift+Y / N / X | Yes or go on / no or take them out / stop. |
| Alt+Shift+S | Save Rose's sample details again. |
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
