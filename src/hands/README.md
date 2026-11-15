# Hands lane (A)

Everything that helps a shaky hand or tired eyes use the page: a steadier pointer, clicks that land, large buttons for small controls, and reading adjustments. Code is in `src/hands/`; the page map it relies on is C's (`src/guide`).

## What it does

| Feature | What the person gets | Where |
| --- | --- | --- |
| Tremor filter | The pointer is smoothed. A notch filter removes the person's own shake frequency, then a One Euro filter removes what is left without making quick moves laggy. | `filter/`, `pointer.ts` |
| Click steadying | A click that lands near a button goes to the button, within a reach set by the fitting. Pay, delete and submit buttons are never steered. | `steady/` |
| Slip protection | Pressing and drifting a few pixels no longer starts a link drag that swallows the click. | `steady/clickSteadying.ts` |
| Dwell click | Hold still over a button and a ring fills, then it clicks once. Off until turned on. | `dwell/` |
| Double-key guard | A key hit twice within a few milliseconds is typed once. Typing boxes only. | `keys/` |
| Big Pick | Dropdowns, date fields and number boxes open as large buttons. | `bigpick/` |
| Steady scrolling | The page glides, one jolt is capped, small flicks back the other way are ignored, and a crooked movement does not drift sideways. Off until turned on. | `scroll/` |
| Reading adjustments | Text size (the browser's own zoom), spacing, font, stronger contrast, colour-vision correction, warm colours, marking prices and totals, read aloud, pause and reset. | `reading/` |
| Fitting | "Follow the dot" measures how fast the hand shakes and how far a click strays, then sets the filter and the click reach. | `fitting/` |
| Overlay | Labels, boxes and a pointer drawn on the page, placed in empty space with leader lines. Every lane draws through it. | `overlay.ts`, `layout.ts` |

## For the other lanes

```ts
import { getOverlay, startFitting, getReading } from '@/hands';

getOverlay().show({ id: 'x', where: () => pageMap.liveRect(id), label: 'Click this' });
startFitting();          // runs the follow-the-dot fitting on this page
getReading()?.toggleBar();
```

Every click, steadied or dwell, goes onto one feed: `need('clicks')` gives `onClick(target)` and optional `onMiss(at)`.

Tools the helper can call (registered with `registerTool`):

| Tool | Does |
| --- | --- |
| `click` | Clicks a page-map id, only if the page map says it may. Never pay, delete, submit, fake or disabled. |
| `fill` | Fills a page-map id. Never a secret field (password, card, ID number, one-time code, date of birth), a read-only one, a file chooser or another site's frame. |
| `reading_set` | `{ setting, value }` for size, spacing, font, contrast, colour or highlight. |
| `reading_read_aloud`, `reading_stop` | Read the selection (two words or more) or the page, and stop. |
| `reading_reset` | Back to how the page was. |
| `reading_open_bar` | Shows the bar of large buttons. |

## Settings (profile keys)

| Key | Meaning |
| --- | --- |
| `hands:tremorHz` | Shake frequency from the fitting. Only saved when it was clear. |
| `hands:reach` | How far from a button a click still counts. |
| `hands:fitting` | When the fitting last ran and what it found. |
| `hands:dwell` | `{ enabled, ms }`. Off by default, 1000 ms. |
| `hands:slipPx` | Drift allowed between press and release before the click is treated as a slip. Default 14. |
| `hands:keyGuardMs` | Shortest gap between two hits of one key. 0 is off. |
| `hands:bigPick` | Big Pick on or off. On by default. |
| `hands:scroll` | Steady scrolling on or off. Off by default. |
| `hands:reading` | Size, spacing, font, contrast, colour, highlight and voice speed. Synced across tabs. |

## Developing

`npm run dev` rebuilds the extension on save. `npm run sites` serves the demo shop and clinic at http://localhost:4173/shop/ and /clinic/.

Hotkeys in dev builds (Option+Shift):

| Key | Does |
| --- | --- |
| O | Labels the first four buttons on the page |
| T | Tuning: red dot is the raw pointer, blue ring is the steadied one. `[ ]`, `; '`, `- =` and `N` change the filter. |
| D | Dwell click on or off |
| G | Runs the fitting |
| K | Double-key guard on (120 ms) or off |
| B | Big Pick on or off |
| W | Steady scrolling on or off |
| R | Shows or hides the reading bar |

## Measuring it

The pointing test is the standard ISO 9241-9 task: nine circles in a ring, clicked in criss-cross order. It counts missed clicks and time per target.

1. `npm run sites`, then open http://localhost:4173/pointing/?label=off-strong&rounds=6 (`label` names the run; `n`, `w`, `d` and `rounds` change the targets).
2. Shake the real pointer on top of your own movement with the script: `osascript -l JavaScript tools/shake/shake.js strong 180` (macOS; levels `mild`, `moderate`, `strong`; the first run needs Accessibility permission for Terminal).
3. Do one run with Steady switched off at `chrome://extensions` and one with it on, at the same shake level and pace.

The shake is simulated. It is not a clinical test, and it is not a person with tremor.

## Known limits

- Nothing steadies clicks inside another website's frame.
- Some sites ignore synthetic clicks (the ones dwell click makes), and a dwell click that opens a new tab can be blocked as a pop-up.
- Pay, delete and submit buttons get no highlight, no steering and no dwell, on purpose.
- Reading filters sit on the page body so Steady's own bar keeps its place. A site's own fixed elements then scroll with the page.
- There is no dark contrast mode: the first version turned pages that were already dark light.
- The page map's ids go stale when a page redraws.
- Tested by simulated shake and by hand, not yet with older adults.
