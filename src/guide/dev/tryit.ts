// TEMPORARY. Keyboard shortcuts for trying the guide lane before the helper panel exists.
// Only in `npm run dev`. Each one calls exactly what B's tools will call.
//
//   Alt+Shift+M  print the page map (in the DevTools console)
//   Alt+Shift+L  "What do I click?": labels on, press again for off
//   Alt+Shift+D  save Rose's sample details in "My details"
//   Alt+Shift+F  "Help me fill this in" (Do it with me)      Alt+Shift+G  the same at the "Show me" level
//   Alt+Shift+Y  "Yes, that's right" / "I've done that one"  Alt+Shift+N  "No, that's not right"
//   Alt+Shift+X  stop filling
//   Alt+Shift+R  start recording a task; press again to stop and print it

import * as choices from '../choices';
import * as details from '../details';
import { pageMap } from '../map';
import * as recorder from '../recorder';
import { need } from '@/shared/ports';

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
  let labelsOn = false;
  const say = (text: string) => need('speech').say(text);

  const keys: Record<string, () => unknown> = {
    KeyM: printMap,
    KeyL: async () => {
      labelsOn = !labelsOn;
      if (labelsOn) say((await choices.show()).said);
      else {
        choices.hide();
        say('I have taken the notes away.');
      }
    },
    KeyD: async () => {
      await details.save(SAMPLE_DETAILS);
      say('Sample details saved: Rose Marchetti, 12 Orchard Lane.');
    },
    KeyF: () => details.start('with-me'),
    KeyG: () => details.start('show'),
    KeyY: () => details.keep(),
    KeyN: () => details.undo(),
    KeyX: () => details.stop(),
    KeyR: async () => {
      if (recorder.isRecording()) {
        const { task, said } = await recorder.stop();
        say(said);
        console.log('[Steady] recorded task', task);
        console.table(task.steps.map((s) => ({ type: s.type, say: s.say, page: s.page.path })));
      } else {
        say((await recorder.start(`Task recorded at ${new Date().toLocaleTimeString()}`)).said);
      }
    },
  };

  const onKey = (event: KeyboardEvent) => {
    if (!(event.altKey && event.shiftKey) || !keys[event.code]) return;
    event.preventDefault();
    Promise.resolve(keys[event.code]!()).catch((err) => console.error('[Steady] try-it shortcut failed', err));
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

function printMap(): void {
  const map = pageMap.get();
  console.log(`[Steady] page map: ${map.stage.label}, ${map.elements.length} elements, built in ${map.tookMs} ms`, map);
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
