// The hello a helper gets once, when they are added under "Who helps you". Owner: C.
// The relay holds the wording (relay/src/stuckMessage.ts, helloMessage). Only the address and two first names go.
// Sent once per address. If the relay is old or unreachable, nothing breaks: it simply tries again next time she saves.

import { DETAILS_KEY } from '@/shared/details';
import type { Helper } from '@/shared/family';
import type { StorePort } from '@/shared/ports';
import { browser } from 'wxt/browser';
import { deviceStore } from '@/shared/device-store';

export const HELLO_KEY = 'guide:helloSent';

export interface HelloSend {
  type: 'helper/hello';
  note: { to: string; helperName: string; fromName: string };
}

/** True when an email went out this time. */
export async function sayHello(helper: Helper, store: Pick<StorePort, 'get' | 'set'>, send: (msg: HelloSend) => Promise<boolean>): Promise<boolean> {
  const to = helper.email.trim();
  const said = to.toLowerCase();
  if (!to || (await store.get<string>(HELLO_KEY)) === said) return false;
  const mine = (await store.get<{ givenName?: string }>(DETAILS_KEY)) ?? {};
  const ok = await send({ type: 'helper/hello', note: { to, helperName: helper.name.trim(), fromName: mine.givenName?.trim() || 'Someone you help' } });
  if (ok) await store.set(HELLO_KEY, said);
  return ok;
}

/** From the panel or a page: ask the background worker to send it. Never throws. */
export function helloFromHere(helper: Helper): void {
  void sayHello(helper, deviceStore, async (msg) => {
    try {
      return !!((await browser.runtime.sendMessage(msg)) as { ok?: boolean } | undefined)?.ok;
    } catch {
      return false;
    }
  });
}
