// Owner: B (background worker and messages).
import { askRelay } from '@/helper/relay';
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

    // Speaking lives here so the panel redrawing never interrupts the voice.
    if (msg?.type === 'tts/say') {
      browser.tts.stop();
      browser.tts.speak(String(msg.text ?? ''), { rate: 0.9, lang: 'en-US' });
      return undefined;
    }
    if (msg?.type === 'tts/stop') {
      browser.tts.stop();
      return undefined;
    }
    return undefined;
  });
});
