// The start script. Owner: C.
// Runs once on every page and starts each lane. A lane that fails does not stop the others.
//
// To plug in a lane, add ONE import and ONE line to `lanes`.

import { startGuide } from '@/guide';
import { adaptOverlay } from '@/guide/adapters';
import type { LaneContext, StartLane } from '@/shared/lanes';
import { provide } from '@/shared/ports';
import { getOverlay, startHands } from '@/hands';
import { startHelper } from '@/helper';

const lanes: Array<[name: string, start: StartLane]> = [
  ['guide', startGuide],
  ['hands', startHands],
  ['helper', startHelper],
];

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main(ctx) {
    const lane: LaneContext = {
      onStop: (cleanup) => ctx.onInvalidated(cleanup),
      dev: import.meta.env.DEV,
    };
    // Joins between lanes are made here, so no lane has to import another lane's insides.
    // The guide lane's labels and spotlight are drawn by A's overlay.
    // (Keep this inside main: code at the top of this file also runs while the extension is being built.)
    provide('overlay', adaptOverlay(getOverlay));

    for (const [name, start] of lanes) {
      try {
        await start(lane);
      } catch (err) {
        console.error(`[Steady] the ${name} lane failed to start`, err);
      }
    }
  },
});