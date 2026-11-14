# Tools (A)

## Pointing test: `sites/pointing/`

The standard pointing test (ISO 9241-9): nine circles in a ring, clicked in a criss-cross order, three rounds. It counts missed clicks and time per target.

```
npm run sites
```

Open http://localhost:4173/pointing/?label=steady-off (change `label` to name the condition, for example `steady-on` or `dwell-on`). Options: `n` targets (odd), `w` target size in pixels, `d` ring size, `rounds`.

Run it with Steady off and on, with the same shake level, and write both result lines in the tracker's Proof table.

## Shake script: `tools/shake/shake.js` (macOS)

Shakes the real mouse pointer on top of your own mouse movement. No install needed.

```
osascript -l JavaScript tools/shake/shake.js check
osascript -l JavaScript tools/shake/shake.js mild 60
osascript -l JavaScript tools/shake/shake.js moderate 120
osascript -l JavaScript tools/shake/shake.js strong 120
```

Levels: mild is 2.5 px at 5 Hz, moderate 5 px at 5.5 Hz, strong 9 px at 6 Hz. Stop with Ctrl+C. The first run asks for permission in System Settings > Privacy & Security > Accessibility: switch on Terminal (or Visual Studio Code), then run it again.

The shake is simulated. It is not a clinical test.
