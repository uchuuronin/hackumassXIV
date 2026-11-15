// Shakes the real mouse pointer, on top of whatever you do with the mouse. Owner: A. macOS only.
// Used for the tremor demo and for the pointing-test numbers, so Milo off and on see the same shake.
//
//   osascript -l JavaScript tools/shake/shake.js check              show the pointer position (a permission test)
//   osascript -l JavaScript tools/shake/shake.js mild 60            shake for 60 seconds
//   osascript -l JavaScript tools/shake/shake.js moderate 120
//   osascript -l JavaScript tools/shake/shake.js strong 120
//
// Stop it any time with Ctrl+C in the terminal. The first time, macOS asks for permission:
// System Settings > Privacy & Security > Accessibility > switch on Terminal (or Visual Studio Code).
//
// The shake is SIMULATED. It is not a clinical test. Real tremor is in the range of about 4 to 12 shakes a second.

ObjC.import('Cocoa');
ObjC.import('ApplicationServices');

// Amplitude is how far the pointer moves each way, in pixels.
const LEVELS = {
  mild: { amp: 2.5, hz: 5.0 },
  moderate: { amp: 5, hz: 5.5 },
  strong: { amp: 9, hz: 6.0 },
};
const TICKS_PER_SECOND = 120;

function where() {
  const event = $.CGEventCreate($());
  const p = $.CGEventGetLocation(event);
  return { x: p.x, y: p.y };
}

function moveTo(x, y) {
  const event = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, $.CGPointMake(x, y), $.kCGMouseButtonLeft);
  $.CGEventPost($.kCGHIDEventTap, event);
}

function pause(seconds) {
  $.NSThread.sleepForTimeInterval(seconds);
}

/** The shake at a moment: a wobble that drifts a little in speed and strength, as a real one does. */
function makeShake(level) {
  let phaseX = 0;
  let phaseY = 1.3;
  return function at(t, dt) {
    const hz = level.hz + 0.4 * Math.sin(2 * Math.PI * 0.17 * t);
    phaseX += 2 * Math.PI * hz * dt;
    phaseY += 2 * Math.PI * hz * 0.93 * dt;
    const amp = level.amp * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.3 * t));
    return { x: amp * Math.sin(phaseX), y: 0.7 * amp * Math.sin(phaseY) };
  };
}

function run(argv) {
  const mode = argv[0] || 'check';
  if (mode === 'check') {
    const p = where();
    return 'Pointer is at ' + Math.round(p.x) + ', ' + Math.round(p.y) + '. Next try: mild 10';
  }
  const level = LEVELS[mode];
  if (!level) return 'Unknown level "' + mode + '". Use check, mild, moderate or strong.';
  const seconds = Number(argv[1] || 60);

  const shake = makeShake(level);
  let applied = { x: 0, y: 0 };
  const start = Date.now();
  let last = start;
  while ((Date.now() - start) / 1000 < seconds) {
    const now = Date.now();
    const next = shake((now - start) / 1000, (now - last) / 1000);
    last = now;
    // Move by the CHANGE in the shake, from wherever the pointer is now, so your own movement carries on.
    const p = where();
    moveTo(p.x + next.x - applied.x, p.y + next.y - applied.y);
    applied = next;
    pause(1 / TICKS_PER_SECOND);
  }
  // Take the last bit of shake back out, so the pointer rests where you left it.
  const p = where();
  moveTo(p.x - applied.x, p.y - applied.y);
  return 'Done.';
}
