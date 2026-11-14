// Owner: B (background worker and messages).
import { askRelay } from '@/helper/relay';
import type { GeminiAsk } from '@/shared/tools';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[Steady] sidePanel behavior', err));

  // Everything that needs Gemini goes through here, so the relay URL lives in one place.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as Partial<GeminiAsk> | null;
    if (msg?.type !== 'gemini/ask') return undefined;
    askRelay(String(msg.prompt ?? '')).then(sendResponse);
    return true;
  });
});
