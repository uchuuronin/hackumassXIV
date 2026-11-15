// Owner: B (background worker and messages).
import { askRelay } from '@/helper/relay';
import { sendStuck } from '@/guide/family/send';
import type { StuckSend } from '@/shared/family';
import type { GeminiAsk } from '@/shared/tools';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[Steady] sidePanel behavior', err));

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; text?: string; prompt?: string } | null;

    // Everything that needs Gemini goes through here, so the relay URL lives in one place.
    if (msg?.type === 'gemini/ask') {
      askRelay(String((msg as GeminiAsk).prompt ?? '')).then(sendResponse);
      return true;
    }

    // "I'm stuck" (owner: C): the one short note to the person who helps goes out through the relay.
    if (msg?.type === 'stuck/send') {
      sendStuck((message as StuckSend).note).then(sendResponse);
      return true;
    }

    // Speaking lives here so the panel redrawing never interrupts the voice.
    if (msg?.type === 'tts/say') {
      browser.tts.stop();
      // `rate` is optional (A's read aloud sends the person's own speed).
      const rate = Number((msg as { rate?: number }).rate);
      browser.tts.speak(String(msg.text ?? ''), { rate: rate >= 0.5 && rate <= 2 ? rate : 0.9, lang: 'en-US' });
      return undefined;
    }
    // Text size (owner: A): the browser's own zoom, so layouts reflow properly.
    if (msg?.type === 'reading/zoom') {
      const tabId = _sender.tab?.id;
      const factor = Number((msg as { factor?: number }).factor);
      if (tabId !== undefined && factor >= 0.5 && factor <= 3) browser.tabs.setZoom(tabId, factor).catch(() => undefined);
      return undefined;
    }
    if (msg?.type === 'tts/stop') {
      browser.tts.stop();
      return undefined;
    }
    return undefined;
  });
});
