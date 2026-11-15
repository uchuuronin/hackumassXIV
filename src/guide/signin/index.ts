// Feature 5, sign-in guidance. Signing in is where people most often give up: two boxes, a password
// nobody remembers, and sometimes a code. Milo says why the page is asking, goes box by box
// (through "Fill in my details", so the same rules hold), and never touches the password.
// The forgotten-password hint lives with the other gentle reminders in ../details.

import { need } from '@/shared/ports';
import { HELPER_KEYS, type HelpLevel } from '@/shared/tools';
import * as details from '../details';
import { pageMap } from '../map';

export const SIGN_IN = 'Help me sign in';

export async function start(): Promise<{ said: string; options?: string[] }> {
  const map = pageMap.get();
  const seen = map.elements.filter((e) => e.visible && !e.disabled);
  const password = seen.find((e) => e.secret === 'password');
  const code = seen.find((e) => e.secret === 'one-time-code');
  if (!password && !code && map.stage.kind !== 'sign-in' && map.stage.kind !== 'sign-up') {
    return { said: 'This doesn\'t look like a sign-in page. I can still tell you what the buttons here do.', options: ['What do I click?'] };
  }

  let lead: string;
  if (code && !password) {
    lead = 'The website has sent you a short code to check it\'s really you. Never read that code out to anyone on the phone, even if they say they\'re from the website.';
  } else {
    const form = map.forms.find((f) => f.fieldIds.includes((password ?? seen[0]!).id));
    const boxes = seen.filter((e) => form?.fieldIds.includes(e.id) && e.kind !== 'checkbox' && e.kind !== 'radio').length;
    const count = boxes === 1 ? 'There is 1 box.' : `There are ${boxes} boxes.`;
    lead =
      map.stage.kind === 'sign-up'
        ? `This page makes a new account for you on this website. ${count}`
        : `This page wants to check it's really you before it shows you your own things. ${count}`;
  }
  const level = (await need('store').get<HelpLevel>(HELPER_KEYS.level)) ?? 'with-me';
  return details.start(level, { lead });
}
