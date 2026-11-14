// The person's settings, kept in the browser. Keys are prefixed by lane (see ProfileKey).
import { browser } from 'wxt/browser';
import type { ProfileKey } from '@/shared/tools';

export async function getProfile<T>(key: ProfileKey, fallback: T): Promise<T> {
  const r = await browser.storage.local.get(key);
  return (r[key] as T | undefined) ?? fallback;
}

export async function setProfile<T>(key: ProfileKey, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}
