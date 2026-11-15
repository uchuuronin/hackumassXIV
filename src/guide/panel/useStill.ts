// True when she has asked for the panel to keep still ("Let my face move" is off). Owner: C.
// The panel adds the class `still`, and the stylesheet stops every loop: the face, the lights, the waves.

import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { deviceStore } from '@/shared/device-store';
import { GUIDE_SWITCH_KEY, readSwitches } from '@/shared/guideSwitches';

export function useStill(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const on = readSwitches(await deviceStore.get<unknown>(GUIDE_SWITCH_KEY).catch(() => undefined));
      if (live) setStill(!on.motion);
    };
    void load();
    const onChanged = (changes: Record<string, unknown>) => GUIDE_SWITCH_KEY in changes && void load();
    browser.storage.local.onChanged.addListener(onChanged);
    return () => {
      live = false;
      browser.storage.local.onChanged.removeListener(onChanged);
    };
  }, []);
  return still;
}
