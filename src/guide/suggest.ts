// So the panel can help without being asked: one quiet line about this page, and the buttons that fit it.
// It never speaks aloud and never does anything. It only notices, from the page map, on this computer.

import type { Tool } from '@/shared/tools';
import { STARTERS } from './answers';
import { pageMap } from './map';
import { tasks } from './recorder';
import * as player from './player';
import { SIGN_IN } from './signin';

export interface Suggestion {
  /** One short sentence, or '' when there is nothing worth saying. */
  said: string;
  /** Buttons to offer, most useful first. */
  options: string[];
}

export async function suggest(): Promise<Suggestion> {
  const at = player.where();
  if (at) return { said: `We are on step ${at.step} of ${at.of} of "${at.task}".`, options: ['Show me again', 'Stop for now', STARTERS.stuck] };

  const map = pageMap.get();
  if (/cookie|privacy|consent|tracking/i.test(map.dialog?.label ?? '')) {
    return { said: 'This page is asking about cookies. I can tell you what each button does.', options: [STARTERS.click] };
  }
  if (map.stage.kind === 'sign-in' || map.stage.kind === 'code') {
    return { said: 'This page is asking you to sign in. I can take you through it.', options: [SIGN_IN, STARTERS.click] };
  }
  const here = (await tasks()).filter((t) => t.steps[0]?.page.origin === location.origin);
  const names = here.slice(0, 2).map((t) => t.name);

  if (map.stage.kind === 'basket') return { said: 'This is your basket. I can show you what each button does.', options: [STARTERS.click, ...names] };
  // Boxes Steady knows how to fill (a name, an address), or a secret box such as a card number: a form worth offering help with.
  const boxes = map.elements.filter((e) => e.visible && e.kind !== 'button' && e.kind !== 'link' && e.kind !== 'search');
  if (boxes.filter((e) => e.fillAs).length >= 2 || boxes.some((e) => e.secret)) {
    return { said: 'This page has boxes to fill in. I can help with those.', options: [STARTERS.fill, STARTERS.click, ...names] };
  }
  if (names.length) return { said: names.length === 1 ? 'There is a saved task for this website.' : 'There are saved tasks for this website.', options: [...names, STARTERS.click] };
  return { said: '', options: [STARTERS.click] };
}

export const suggestTool: Tool = {
  name: 'guide_suggest',
  owner: 'guide',
  description: 'One quiet line about what Steady could help with on this page, and the buttons that fit. For the panel to show when a page opens. Never spoken aloud.',
  parameters: {},
  async run() {
    const s = await suggest();
    return { ok: true, said: s.said, data: { options: s.options } };
  },
};
