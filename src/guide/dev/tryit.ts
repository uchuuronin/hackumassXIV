// TEMPORARY. A way to try the guide lane before the helper panel calls its tools.
// Only in the try-it build. Everything here calls exactly what B's tools call.
//
// No shortcuts are needed: the black bar at the bottom of the page has buttons.
// The keys still work for anyone who prefers them:
//   Alt+Shift+M  print the page map (DevTools console)       Alt+Shift+L  "What do I click?"
//   Alt+Shift+S  save Rose's sample details                  Alt+Shift+F  "Help me fill this in"
//   Alt+Shift+Y  yes / it looks right / go on                Alt+Shift+N  no / take them out
//   Alt+Shift+X  stop                                        Alt+Shift+R  start or stop recording a task

import { need } from '@/shared/ports';
import * as choices from '../choices';
import * as details from '../details';
import { pageMap } from '../map';
import * as recorder from '../recorder';
import { STARTERS } from './standin';

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

const tell = (state: { said: string; options?: string[] }) => need('speech').say(state.said, state.options);

/** What each button in the bar does. The same words B's panel will show. */
const BUTTONS: Record<string, () => unknown> = {
  [STARTERS[0]!]: async () => tell(await choices.show()),
  [STARTERS[1]!]: async () => tell(await details.start('with-me')),
  'Yes, fill them in': async () => tell(await details.keep()),
  'It looks right': async () => tell(await details.keep()),
  'No, I will type them': async () => tell(await details.undo()),
  'Take them out': async () => tell(await details.undo()),
  'Go on': async () => tell(await details.keep()),
  'Carry on': () => tell(details.repeat()),
  'Stop for now': () => tell(details.stop()),
  'Ask for help': () => tell({ said: 'Asking your family for help is not built yet. It comes with "I\'m stuck".' }),
  'Yes, remember them': async () => tell(await details.remember()),
  'Yes, remember it': async () => tell(await details.remember()),
  'No, thank you': () => tell({ said: 'All right. I will not keep them.' }),
};

export function pressButton(words: string): void {
  Promise.resolve(BUTTONS[words]?.()).catch((err) => console.error('[Steady] try-it button failed', err));
}

export function startTryIt(): () => void {
  const keys: Record<string, () => unknown> = {
    KeyM: printMap,
    KeyL: BUTTONS[STARTERS[0]!]!,
    KeyS: async () => {
      await details.save(SAMPLE_DETAILS);
      tell({ said: 'Sample details saved: Rose Marchetti, 12 Orchard Lane.' });
    },
    KeyF: BUTTONS[STARTERS[1]!]!,
    KeyY: async () => tell(await details.keep()),
    KeyN: async () => tell(await details.undo()),
    KeyX: () => tell(details.stop()),
    KeyR: async () => {
      if (recorder.isRecording()) {
        const { task, said } = await recorder.stop();
        tell({ said });
        console.log('[Steady] recorded task', task);
        console.table(task.steps.map((s) => ({ type: s.type, say: s.say, page: s.page.path })));
      } else {
        tell(await recorder.start(`Task recorded at ${new Date().toLocaleTimeString()}`));
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
