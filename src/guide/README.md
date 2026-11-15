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
| Player | `player.start(taskId)`, `resume()`, `next()`, `repeat()`, `goThere()`, `stop()`, `where()` | Walks the person through a recorded task one step at a time. She does every step herself; Steady lights it, says it, and moves on when it is done. Keeps its place from page to page and remembers it if she stops. Offers to take her to the right page, says plainly when a step can't be found, and offers help after a long pause or three missed clicks. Never clicks anything. |
| "I'm stuck" | `family.offer()`, `send()`, `decline()`, `saveHelper()` | Asks first, then sends one short note to the person who helps. The note has the task name and step number only (`StuckNote` in `src/shared/family.ts`). Will not send twice within three minutes. |
| "Where was I?" | `trail.watch()`, `where()`, `restore()`, `goBack()`, `forget()` | Keeps a private trail on this computer: the page, how far down it she was, and what she typed into ordinary boxes of a form (200 characters at most, for a week, five pages). Never a password, card, code, ID number or date of birth, and never a box it can't name. "Where was I?" says the step of the task she is in, or offers to put back what she typed on a page that came back empty, or to take her back to a page she had started. Nothing is put back without a yes, and nothing typed since is written over. The timeout warning uses it when a page clears itself. |
| Passing a task to another computer | `sendTask()`, `findTask()`, `keepTask()` in `family/share.ts`; `checkTask()` in `src/shared/tasks.ts` | The helper presses **Send** on a saved task and gets three everyday words ("garden kettle tulip"). On the other computer, typing the words under **My details → A task someone made for you** fetches it. Words, not a code, because they are said over the telephone: capitals, commas and a small slip in the spelling are forgiven. A task that arrives is rebuilt from only the parts Steady knows, is never added without a yes, and is always marked as having come from another computer. Relay: `POST /tasks`, `POST /tasks/find` (`relay/src/tasks.ts`), kept seven days in MongoDB. |
| Timeout warning | `timeout.watch()`, `check()`, `keepPlace()` | Notices a page that says it will reset or sign her out, says so once in plain words with the time left, and lights the way to more time. Presses "stay" only after a yes, and only a button the safety limit allows. If the page has already reset, says it was the website, not her. |
| Sign-in guidance | `signin.start()` | On a sign-in page: says why the page is asking, then goes box by box through "Fill in my details". Never touches the password. If she is a long time on the password, says what "Forgot your password?" does. For a code sent to her phone, says never to read it to anyone. |
| One place for buttons | `answer(words)` | Takes the words on any button Steady offered and passes them to whichever conversation is open. |
| A hint for the panel | `suggest()` | One quiet line about the page that is open, and the buttons that fit it. Never spoken, never acts. |

| "My details" card | `import { MyDetailsCard } from '@/guide/panel/MyDetailsCard'` | The screen where the details are typed in. A React component for B's panel: `<MyDetailsCard />`. |

**Tools.** When the lane starts it registers its tools in B's tool list (`registerTool`), each with `owner: 'guide'`. The panel needs only two of them:

| Tool | What it is for |
| --- | --- |
| `guide_answer { words }` | Every button. Pass the exact words on the button: a starter ("What do I click?", "Help me fill this in", "I'm stuck"), the name of a saved task, or an answer Steady offered. The reply's `data.options` are the next buttons. |
| `guide_suggest` | One quiet line about the page, with `data.options`, for when a page opens. |

The rest are there for the helper's own tool calling: `label_choices`, `hide_choice_labels`, `fill_my_details`, `fill_next`, `fill_take_out`, `fill_repeat`, `fill_remember`, `fill_stop`, `list_tasks`, `play_task`, `play_next`, `play_repeat`, `play_stop`, `im_stuck`, `stuck_send`, `stuck_cancel`, `record_start`, `record_stop`, `check_timeout`, `where_was_i`.

**The panel.** `src/guide/panel/` holds what the helper panel uses from this lane: `useGuide` (presses buttons on the open page, receives what Steady says, fetches the hint), `Buddy` (Steady's face), `MyDetailsCard`, `HelperCard` and `TeachScreen` (the screen for the person who helps: numbered steps, a "watching" notice, and the list of saved tasks).

**"I'm stuck", end to end.** Page → `family` port → background worker (`stuck/send`) → relay `POST /stuck` (`relay/src/stuck.ts`) → one fixed email. The relay needs `EMAIL_USER` and `EMAIL_APP_PASSWORD` in its `.env`; `STUCK_DRY_RUN=1` builds the email without sending it.

**A second message.** A result can carry `data.then` (`{ said, options }`): a separate "One more thing…" shown under the first, so no single message gets long. The remember question after a form uses it.

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

## How Steady talks

`src/shared/voice.ts` has two things. `TONE` is one short instruction for any language model that writes Steady's words (a kind, unhurried person at a shop counter: "I" and "you", contractions, one idea per sentence, never blame). The sentences written by hand in this lane follow the same rules. `speak()` reads aloud with the warmest voice the browser has, one sentence at a time and a little slower than normal; the background worker's `tts/say` uses it.

During a saved task Steady remembers what she picked last time for each choice (`guide:lastChoices`: which doctor, which day) and mentions it: "last time you picked … Go with that again, or pick something else." It points the option out for a moment and never chooses it for her. Never a secret box, never anything typed. It stays on the computer and "My details" has a button to clear it.

## The look

`src/shared/theme.ts` holds the one look for everything Steady draws: navy words on soft pastel shapes with a navy edge (green for the way forward, blue for "just so you know", pink for anything that pays, sends or removes). On the page, the thing itself gets a see-through wash of the same pastel that follows the words line by line (`Rect.parts`), instead of a box around the area. A's notes and rings, B's Pay Pause and helper panel, and the "My details" card all read from it. `tests/theme.contrast.spec.ts` checks every pair that carries words.

## Trying it without the helper panel

```
npm run build:try
```

Load `.output/chrome-mv3-dev` in `chrome://extensions` (Load unpacked), start the demo sites with `npm run sites`, and open the Steady side panel. Everything is on buttons there. The old on-page try-it panel has gone.

These keys also work in the try-it build:

| Keys | What it does |
| --- | --- |
| Alt+Shift+L / F / K | "What do I click?" / "Help me fill this in" / "I'm stuck" |
| Alt+Shift+Y / N | The first / second answer Steady offered |
| Alt+Shift+S | Save Rose's sample details, and Maya as the person who helps |
| Alt+Shift+R | Start recording a task. Press again to stop. |
| Alt+Shift+M | Print the page map in the DevTools console |

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
