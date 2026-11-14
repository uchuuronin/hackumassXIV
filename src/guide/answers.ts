// One place for every answer button. The panel (or the try-it keys) passes the words on the button
// the person pressed, and they go to whichever conversation is open: the form, a saved task, or "I'm stuck".
// So the panel never has to know which feature offered which answer.

import { need, type FollowUp } from '@/shared/ports';
import { HELPER_KEYS, type HelpLevel, type Tool } from '@/shared/tools';
import * as choices from './choices';
import * as details from './details';
import * as family from './family';
import * as player from './player';
import { tasks } from './recorder';
import * as signin from './signin';
import { SIGN_IN } from './signin';
import * as timeout from './timeout';

export interface Answer {
  said: string;
  options?: string[];
  /** A second, separate message to show after this one. */
  then?: FollowUp;
}

/** The things she can ask for at any time. */
export const STARTERS = { click: 'What do I click?', fill: 'Help me fill this in', stuck: "I'm stuck" } as const;

export async function answer(words: string): Promise<Answer> {
  const said = words.trim();

  // Starting something.
  if (said === STARTERS.click) return choices.show();
  if (said === STARTERS.fill) return details.start((await need('store').get<HelpLevel>(HELPER_KEYS.level)) ?? 'with-me');
  if (said === STARTERS.stuck || said === 'Ask for help') return family.offer();
  if (said === SIGN_IN) return signin.start();

  // A page that is counting down.
  if (said === 'Yes, keep my place') return timeout.keepPlace();
  if (said === 'I will click it') return timeout.leave();

  // "I'm stuck".
  if (/^Yes, tell /.test(said) || said === 'Try again') return family.send();
  if (said === 'No, not yet') return family.decline();

  // The form.
  if (said === 'Yes, fill them in' || said === 'It looks right') return details.keep();
  if (said === 'No, I will type them' || said === 'Take them out') return details.undo();
  if (said === 'Yes, remember them' || said === 'Yes, remember it') return details.remember();
  if (said === 'No, thank you') return { said: 'All right. I will not keep them.' };

  // A saved task.
  if (said === 'Yes, take me there') return player.goThere();
  if (said === 'Skip this step') return player.next();
  if (said === 'Show me again') return player.repeat();
  if (/^Carry on from step /.test(said)) return player.carryOn();
  if (said === 'Start again') return player.startAgain();

  // Words that more than one conversation uses.
  const inForm = details.isActive();
  if (said === 'Go on') return inForm ? details.keep() : player.next();
  if (said === 'Carry on') return inForm ? details.repeat() : player.repeat();
  if (said === 'Stop for now') return inForm ? details.stop() : player.stop();

  // The name of a saved task.
  const task = (await tasks()).find((t) => t.name === said);
  if (task) return player.start(task.id);

  return { said: 'I am not sure what to do with that. Try one of the buttons, or ask me a question.' };
}

export const answerTool: Tool = {
  name: 'guide_answer',
  owner: 'guide',
  description:
    'The person pressed one of the answer buttons Steady offered, or one of the three starters: "What do I click?", "Help me fill this in", "I\'m stuck". Pass the exact words on the button. The reply\'s data.options are the next answers to show as buttons.',
  parameters: { words: { type: 'string', description: 'The exact words on the button', required: true } },
  async run(args) {
    const reply = await answer(String(args.words ?? ''));
    return { ok: true, said: reply.said, data: { options: reply.options, then: reply.then } };
  },
};
