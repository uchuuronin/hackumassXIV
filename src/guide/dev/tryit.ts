// While building only (the try-it build). Keys for trying the guide lane without touching the panel.
// Everything here calls exactly what the panel's buttons call.
//
//   Alt+Shift+M  print the page map (DevTools console)     Alt+Shift+L  "What do I click?"
//   Alt+Shift+F  "Help me fill this in"                    Alt+Shift+K  "I'm stuck"
//   Alt+Shift+Y  the first answer Milo offered           Alt+Shift+N  the second
//   Alt+Shift+S  save Rose's sample details and a helper   Alt+Shift+R  start or stop recording a task

import { need } from '@/shared/ports';
import { answer, STARTERS } from '../answers';
import * as details from '../details';
import * as family from '../family';
import { pageMap } from '../map';
import * as recorder from '../recorder';

export const SAMPLE_DETAILS = {
  givenName: 'Rose',
  familyName: 'Marchetti',
  email: 'rose@example.com',
  phone: '413-555-0188',
  addressLine1: '12 Orchard Lane',
  addressLine2: 'Apartment 3',
  city: 'Amherst',
  state: 'Massachusetts',
  postalCode: '01002',
  country: 'United States',
};

export function startTryIt(): () => void {
  let offered: string[] = [];
  const press = async (words: string) => {
    const reply = await answer(words);
    offered = reply.options ?? [];
    need('speech').say(reply.said, reply.options);
  };

  const keys: Record<string, () => unknown> = {
    KeyM: printMap,
    KeyL: () => press(STARTERS.click),
    KeyF: () => press(STARTERS.fill),
    KeyK: () => press(STARTERS.stuck),
    KeyY: () => offered[0] && press(offered[0]),
    KeyN: () => offered[1] && press(offered[1]),
    KeyS: async () => {
      await details.save(SAMPLE_DETAILS);
      await family.saveHelper({ name: 'Maya', email: 'maya@example.com' });
      need('speech').say('Sample details saved: Rose Marchetti, and Maya as the person who helps.');
    },
    KeyR: async () => {
      if (recorder.isRecording()) {
        const { task, said } = await recorder.stop();
        need('speech').say(said);
        console.table(task.steps.map((s) => ({ type: s.type, say: s.say, page: s.page.path })));
      } else {
        need('speech').say((await recorder.start(`Task recorded at ${new Date().toLocaleTimeString()}`)).said);
      }
    },
  };

  const onKey = (event: KeyboardEvent) => {
    if (!(event.altKey && event.shiftKey) || !keys[event.code]) return;
    event.preventDefault();
    Promise.resolve(keys[event.code]!()).catch((err) => console.error('[Milo] try-it shortcut failed', err));
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

function printMap(): void {
  const map = pageMap.get();
  console.log(`[Milo] page map: ${map.stage.label}, ${map.elements.length} elements, built in ${map.tookMs} ms`, map);
  console.table(
    map.elements
      .filter((e) => e.visible)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.context ? `${e.label} (${e.context})` : e.label,
        from: e.labelSource,
        sure: e.labelConfident,
        protection: e.protection,
        secret: e.secret ?? '',
        fillAs: e.fillAs ?? '',
        region: e.region,
        covered: e.covered,
      })),
  );
  console.table(map.amounts.map((a) => ({ kind: a.kind, label: a.label, text: a.text, renews: a.recurring ?? '', crossedOut: a.struck })));
}
