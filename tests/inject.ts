// Bundled and injected into pages by the tests, so the page map can be checked
// in a real browser without loading the whole extension.
import { createPageMap } from '@/guide/pagemap';
import { toModelSafe } from '@/shared/pagemap';

declare global {
  interface Window {
    __steady: { api: ReturnType<typeof createPageMap>; toModelSafe: typeof toModelSafe };
  }
}

window.__steady = { api: createPageMap(document), toModelSafe };
