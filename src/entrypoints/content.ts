// The start script. Owner: C.
// Runs once on every page and starts each lane. A lane that fails does not stop the others.
//
// To plug in a lane, add ONE import and ONE line to `lanes`. Nothing else goes in this file.

import { startGuide } from '@/guide';
import type { LaneContext, StartLane } from '@/shared/lanes';
// A: import { startHands } from '@/hands';
import { startHelper } from '@/helper';

const lanes: Array<[name: string, start: StartLane]> = [
  ['guide', startGuide],
  // A: ['hands', startHands],
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
    for (const [name, start] of lanes) {
      try {
        await start(lane);
      } catch (err) {
        console.error(`[Steady] the ${name} lane failed to start`, err);
      }
    }
  },
});
