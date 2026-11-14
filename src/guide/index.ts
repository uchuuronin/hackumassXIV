// Guide lane (C). Other lanes import from here:
//
//   import { pageMap, guideTools } from '@/guide';
//   const verdict = pageMap.mayAutoClick(event.target);

import { browser } from 'wxt/browser';
import type { LaneContext } from '@/shared/lanes';
import type { PageMapChanged, PageMapRequest, PageMapResponse, PageMapWatch } from '@/shared/pagemap';
import { deviceStore } from '@/shared/device-store';
import { has, need, provide } from '@/shared/ports';
import type { GeminiAnswer, GeminiAsk, HelperAnswer, Tool } from '@/shared/tools';
import { registerTool } from '@/helper/registry';
import { hideChoicesTool, labelChoicesTool } from './choices';
import { modelVia } from './choices/prompt';
import { fillDetailsTool, fillNextTool, fillRememberTool, fillRepeatTool, fillStopTool, fillTakeOutTool } from './details';
import { createClickSource } from './clicks';
import { pageMap } from './map';
import { answerTool } from './answers';
import * as family from './family';
import { stuckCancelTool, stuckSendTool, stuckTool } from './family';
import * as player from './player';
import { listTasksTool, playNextTool, playRepeatTool, playStopTool, playTaskTool } from './player';
import * as recorder from './recorder';
import { recordStartTool, recordStopTool } from './recorder';
import * as spotlight from './spotlight';
import { suggestTool } from './suggest';
import type { StuckSend, StuckSent } from '@/shared/family';

export type { AmountHit } from './pagemap/amounts';
export { typeItYourself } from './words';
export { family, pageMap, player, recorder, spotlight };
export { answer } from './answers';
export * as choices from './choices';
export * as details from './details';

/** The guide lane's tools. Registered in B's tool list when the lane starts. */
export const guideTools: Tool[] = [
  // The two the panel needs most: one for every button, one for a quiet hint about the page.
  answerTool,
  suggestTool,
  labelChoicesTool,
  hideChoicesTool,
  fillDetailsTool,
  fillNextTool,
  fillTakeOutTool,
  fillRepeatTool,
  fillRememberTool,
  fillStopTool,
  listTasksTool,
  playTaskTool,
  playNextTool,
  playRepeatTool,
  playStopTool,
  stuckTool,
  stuckSendTool,
  stuckCancelTool,
  recordStartTool,
  recordStopTool,
];

export async function startGuide(ctx: LaneContext): Promise<void> {
  const cleanups: Array<() => void> = [];
  if (!has('store')) provide('store', deviceStore);
  guideTools.forEach(registerTool);
  // Things Steady says without being asked (moving to the next box, checking in after a long pause)
  // go to the panel as B's 'helper/answer' message. B's voice can replace this with provide('speech', …).
  if (!has('speech')) {
    provide('speech', {
      say(said, options) {
        const note: HelperAnswer = { type: 'helper/answer', said, options };
        browser.runtime.sendMessage(note).catch(() => undefined);
      },
    });
  }
  // The recorder needs to hear clicks, including ones A's click steadying steered. See ./clicks.
  if (!has('clicks')) {
    const clicks = createClickSource();
    provide('clicks', clicks);
    cleanups.push(clicks.stop);
  }
  // Gemini, for buttons Steady has no words of its own for. B's background worker holds the relay address.
  if (!has('model')) {
    provide(
      'model',
      modelVia(async (prompt) => {
        const ask: GeminiAsk = { type: 'gemini/ask', prompt };
        const answer = (await browser.runtime.sendMessage(ask)) as GeminiAnswer | undefined;
        if (!answer?.ok) throw new Error('the relay did not answer');
        return answer.text;
      }),
    );
  }

  // While building, and only until A and B provide the real pieces: something to look at.
  // Written as import.meta.env.DEV so none of it is in the build that ships.
  if (import.meta.env.DEV && ctx.dev) {
    const { startTryIt } = await import('./dev/tryit');
    cleanups.push(startTryIt());
  }

  // "I'm stuck": the note goes to the background worker, which hands it to the relay.
  provide('family', {
    async tellHelper(note) {
      const send: StuckSend = { type: 'stuck/send', note };
      const sent = (await browser.runtime.sendMessage(send)) as StuckSent | undefined;
      return !!sent?.ok;
    },
  });

  // The side panel and the background worker ask for the map with a message.
  let watched = false;
  const onMessage = (message: unknown, _sender: unknown, sendResponse: (response: PageMapResponse | { ok: true }) => void) => {
    const request = message as Partial<PageMapRequest | PageMapWatch> | null;
    if (request?.type === 'pagemap/get') {
      sendResponse({ type: 'pagemap/result', map: pageMap.get(request.options) });
      return true;
    }
    if (request?.type === 'pagemap/watch') {
      watched = request.on === true;
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(onMessage);

  // Tell them when it goes out of date, but only a tab that is being watched and is in front.
  const stopWatching = pageMap.onChange((why) => {
    if (!watched || document.visibilityState !== 'visible') return;
    const note: PageMapChanged = { type: 'pagemap/changed', why, url: location.href };
    browser.runtime.sendMessage(note).catch(() => undefined);
  });

  // A recording under way carries on across page loads. So does a saved task she is in the middle of.
  await recorder.resume();
  const playing = await player.resume();
  if (playing) need('speech').say(playing.said, playing.options);

  ctx.onStop(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    stopWatching();
    spotlight.off();
    cleanups.forEach((stop) => stop());
    pageMap.stop();
  });
}
