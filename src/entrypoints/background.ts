// Owner: B (background worker and messages).
import { askRelay } from '@/helper/relay';
import { takePicture } from '@/guide/sight';
import { sendStuck } from '@/guide/family/send';
import type { StuckSend } from '@/shared/family';
import type { GeminiAsk } from '@/shared/tools';
import { speak } from '@/shared/voice';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[Milo] sidePanel behavior', err));

  // Alt+M (M for Milo) opens the panel too, so nobody needs the mouse to reach Milo (guide lane, C).
  browser.commands?.onCommand.addListener((command, tab) => {
    if (command !== 'open-steady') return;
    const open = (windowId: number | undefined) => {
      if (windowId !== undefined) browser.sidePanel.open({ windowId }).catch((err) => console.error('[Milo] could not open the panel', err));
    };
    if (tab?.windowId !== undefined) open(tab.windowId);
    else browser.windows.getCurrent().then((w) => open(w.id), () => undefined);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; text?: string; prompt?: string } | null;

    // Everything that needs Gemini goes through here, so the relay URL lives in one place.
    if (msg?.type === 'gemini/ask') {
      const ask = msg as GeminiAsk;
      askRelay(String(ask.prompt ?? ''), ask.search === true, ask.json === true, typeof ask.image === 'string' ? ask.image : undefined).then(sendResponse);
      return true;
    }

    // A picture of the screen, for "What is this?" (owner: C). The panel has already asked the page whether it is private.
    if (msg?.type === 'screen/look') {
      const windowId = Number((message as { windowId?: unknown }).windowId);
      takePicture((id) => browser.tabs.captureVisibleTab(id, { format: 'jpeg', quality: 80 }), windowId).then(sendResponse);
      return true;
    }

    // "I'm stuck" (owner: C): the one short note to the person who helps goes out through the relay.
    if (msg?.type === 'stuck/send') {
      sendStuck((message as StuckSend).note).then(sendResponse);
      return true;
    }

    // Speaking lives here so the panel redrawing never interrupts the voice.
    if (msg?.type === 'tts/say') {
      // The voice and the pacing are in src/shared/voice.ts (C): the warmest voice the browser has, one sentence at a time.
      // `rate` is optional (A's read aloud sends the person's own speed); a speed that makes no sense is ignored there.
      void speak(browser.tts as never, String(msg.text ?? ''), { rate: Number((msg as { rate?: number }).rate) });
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
