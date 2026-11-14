# Steady

A Chrome extension that makes the web steadier and easier for older adults and people with tremor.

Built at HackUMass XIV.

## Run it

```
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `.output/chrome-mv3`.

Use `npm run dev` while working: it rebuilds on save.

The extension ID is fixed at **ifacloijdkldongodjgeccgmlodnogeg** by the `key` in `wxt.config.ts`.

## Layout

| Folder | What lives there | Owner |
| --- | --- | --- |
| `src/entrypoints/` | Background worker, content script, side panel | B (background, panel), shared (content) |
| `src/hands/` | Tremor filter, click steadying, Big Pick, reading adjustments | A |
| `src/helper/` | Tool list, Gemini, voice, protect features | B |
| `src/guide/` | Page map, guided steps, recorder, family | C |
| `src/shared/` | Shared types and messages | Each owner edits their own part |
| `relay/` | Node server on Vultr | B |
| `sites/` | Demo shop and clinic | C |
