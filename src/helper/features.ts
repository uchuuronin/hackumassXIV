// One switch per feature, kept in the browser. Owner: B.
import { browser } from 'wxt/browser';

export const FEATURE_KEY = 'helper:features';
export type FeatureId = 'pause' | 'scam' | 'fake' | 'turf' | 'overask';
export type Features = Record<FeatureId, boolean>;

export const FEATURES: Array<{ id: FeatureId; label: string; hint: string }> = [
  { id: 'pause', label: 'Pay Pause', hint: 'Stops before a payment and asks you first.' },
  { id: 'scam', label: 'Scam warning', hint: 'A longer pause for gift-card codes, wire transfers and remote access.' },
  { id: 'fake', label: 'Fake-button check', hint: 'Marks adverts that pretend to be buttons.' },
  { id: 'turf', label: 'Home Turf badge', hint: 'Tells you if a site is new, or looks like one you know.' },
  { id: 'overask', label: 'ID-number warning', hint: 'Warns when a shop asks for an ID number.' },
];

const ALL_ON: Features = { pause: true, scam: true, fake: true, turf: true, overask: true };
let cache: Features = { ...ALL_ON };

function merge(value: unknown): Features {
  const saved = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out = { ...ALL_ON };
  for (const f of FEATURES) if (typeof saved[f.id] === 'boolean') out[f.id] = saved[f.id] as boolean;
  return out;
}

/** Instant answer from the last value read. Call loadFeatures() once first. */
export const isOn = (id: FeatureId): boolean => cache[id];

export async function loadFeatures(): Promise<Features> {
  const r = await browser.storage.local.get(FEATURE_KEY);
  cache = merge(r[FEATURE_KEY]);
  return { ...cache };
}

export async function setFeature(id: FeatureId, on: boolean): Promise<void> {
  const next = { ...(await loadFeatures()), [id]: on };
  await browser.storage.local.set({ [FEATURE_KEY]: next });
}

/** Calls back whenever a switch changes, from the panel or anywhere else. Returns a stop function. */
export function watchFeatures(cb: (f: Features) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !changes[FEATURE_KEY]) return;
    cache = merge(changes[FEATURE_KEY].newValue);
    cb({ ...cache });
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
