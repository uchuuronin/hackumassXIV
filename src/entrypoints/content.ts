// Runs on every page. Lanes plug in from src/hands, src/helper and src/guide.
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    console.debug('[Steady] content script loaded on', location.href);
  },
});
