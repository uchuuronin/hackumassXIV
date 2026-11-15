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
import * as timeout from './timeout';
import * as trail from './trail';
import { whereTool } from './trail';
import { onListening } from './listening';
import * as walk from './walk';
import { timeoutTool } from './timeout';
import type { HelperNote, StuckSend, StuckSent } from '@/shared/family';

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
  timeoutTool,
  whereTool,
];

export async function startGuide(ctx: LaneContext): Promise<void> {
  const cleanups: Array<() => void> = [];
  if (!has('store')) provide('store', deviceStore);
  guideTools.forEach(registerTool);
  // Things Steady says without being asked (moving to the next box, checking in after a long pause)
  // go to the panel as B's 'helper/answer' message. B's voice can replace this with provide('speech', …).
  if (!has('speech')) {
    provide('speech', {
      say(said, options, then) {
        // `then` is a second, separate message ("One more thing…"). The panel shows it under the first.
        const note: HelperAnswer & { then?: typeof then } = { type: 'helper/answer', said, options, then };
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
      modelVia(async (prompt, options) => {
        const ask: GeminiAsk = { type: 'gemini/ask', prompt, ...(options?.search ? { search: true } : {}) };
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
    // A note her helper sent back. Only Steady's own panel sends this, when it collects one from the relay.
    // It is deliberately not a tool, so nothing Gemini says can ever make a "note from your helper" appear.
    const note = message as { type?: unknown; note?: HelperNote } | null;
    if (note?.type === 'family/note' && note.note) {
      sendResponse(family.showNote(note.note) as never);
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

  // A page that quietly counts down and then clears itself: notice it, and say so calmly.
  cleanups.push(timeout.watch());

  // "Where was I?": keep a private trail of ordinary boxes on this computer, and pick up after "take me back there".
  cleanups.push(trail.watch());
  const arrived = await trail.arrive();
  if (arrived) need('speech').say(arrived.said, arrived.options);

  // A recording under way carries on across page loads. So does a saved task she is in the middle of.
  await recorder.resume();
  const playing = await player.resume();
  if (playing) need('speech').say(playing.said, playing.options);

  // "What do I click?" as a conversation. While one is on, the panel sends what she types or says here
  // first, so she can answer a question in her own words. A booking that moves to a new page carries on.
  onListening((on) => void browser.runtime.sendMessage({ type: 'guide/listening', on }).catch(() => undefined));
  cleanups.push(() => onListening(() => undefined));
  if (!playing) await walk.resume();

  ctx.onStop(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    stopWatching();
    spotlight.off();
    cleanups.forEach((stop) => stop());
    pageMap.stop();
  });
}
