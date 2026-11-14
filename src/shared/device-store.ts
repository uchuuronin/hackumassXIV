// Saved on this device with the browser's own storage. Works in the content script and in the panel.
// B's profile store can replace this; the keys stay the same.

import { browser } from 'wxt/browser';
import type { StorePort } from './ports';

export const deviceStore: StorePort = {
  async get<T>(key: string) {
    return (await browser.storage.local.get(key))[key] as T | undefined;
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await browser.storage.local.remove(key);
  },
};
