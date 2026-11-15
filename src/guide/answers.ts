// One place for every answer button. The panel (or the try-it keys) passes the words on the button
// the person pressed, and they go to whichever conversation is open: the form, a saved task, or "I'm stuck".
// So the panel never has to know which feature offered which answer.

import { need, type FollowUp } from '@/shared/ports';
import { HELPER_KEYS, type HelpLevel, type Tool } from '@/shared/tools';
import * as details from './details';
import * as family from './family';
import { isListening } from './listening';
import * as player from './player';
import { tasks } from './recorder';
import * as signin from './signin';
import { SIGN_IN } from './signin';
import * as timeout from './timeout';
import * as trail from './trail';
import * as walk from './walk';

export interface Answer {
  said: string;
  options?: string[];
  /** A second, separate message to show after this one. */
  then?: FollowUp;
  /** How Steady's face should look while it says this. */
  mood?: 'worried' | 'reassuring' | 'glad';
}

/** The things she can ask for at any time. */
export const STARTERS = { click: 'What do I click?', fill: 'Help me fill this in', stuck: "I'm stuck", where: 'Where was I?' } as const;

/**
 * A reply from "Help me fill this in". If that was the end of the filling and a saved task is under way,
 * the task picks up again: it skips what is now filled in and shows the first step that is still to do.
 */
async function fill(run: () => Promise<Answer> | Answer): Promise<Answer> {
  const was = details.isActive();
  const reply = await run();
  if (!was || details.isActive() || !player.isPlaying()) return reply;
  const next = await player.catchUp();
  if (!next) return reply;
  if (!reply.then) return { ...reply, then: { said: next.said, options: next.options } };
  window.setTimeout(() => need('speech').say(next.said, next.options), 1500); // after the question she was just asked
  return reply;
}

export async function answer(words: string): Promise<Answer> {
  const said = words.trim();

  // Starting something else while Steady is asking who to tell: stop asking, and keep nothing.
  if (family.isAsking() && said !== STARTERS.stuck && (Object.values(STARTERS) as string[]).includes(said)) family.reset();

  // Starting something.
  if (said === STARTERS.click) return walk.start();
  if (said === STARTERS.fill) {
    player.hush(); // a saved task waits quietly while the form is filled in
    return details.start((await need('store').get<HelpLevel>(HELPER_KEYS.level)) ?? 'with-me');
  }
  if (said === STARTERS.stuck || said === 'Ask for help') return family.offer();
  if (said === SIGN_IN) return signin.start();
  if (said === STARTERS.where) return trail.where();

  // "What do I click?" as a conversation: yes or no, then one question at a time.
  if (said === walk.YES_BOOK || said === walk.YES) return walk.yes();
  if (said === walk.NO) return walk.no();
  if (said === walk.READY) return walk.ready();
  if (said === walk.LOOKING) return walk.looking();
  if (walk.isActive()) {
    if (said === 'Show me again') return walk.repeat();
    if (said === 'Skip this one') return walk.skip();
    if (said === 'Stop for now') return walk.stop();
  }

  // "Where was I?": putting back what she typed, or going back to the page.
  if (said === 'Yes, put it back') return trail.restore();
  if (said === 'No, thank you' && trail.offeringWhat()) return trail.decline();
  if (said === 'Yes, take me there' && trail.offeringWhat() === 'go') return trail.goBack();

  // A page that is counting down.
  if (said === 'Yes, keep my place') return timeout.keepPlace();
  if (said === 'I\'ll click it') return timeout.leave();

  // "I'm stuck".
  if (/^Yes, tell /.test(said) || said === 'Try again') return family.send();
  if (said === 'No, not yet') return family.decline();
  if (family.isAsking()) return family.heard(said); // she is typing the address, or the name, of someone she trusts

  // The form.
  if (said === 'Yes, fill them in' || said === 'It looks right') return fill(() => details.keep());
  if (said === 'No, I\'ll type them' || said === 'Take them out') return fill(() => details.undo());
  if (said === 'Yes, remember them' || said === 'Yes, remember it') return details.remember();
  if (said === 'No, thank you') return { said: 'No problem. I won\'t keep them.' };

  // A saved task.
  if (said === 'Yes, take me there') return player.goThere();
  if (said === 'Skip this step') return player.next();
  if (said === 'Show me again') return player.repeat();
  if (/^Carry on from step /.test(said)) return player.carryOn();
  if (said === 'Start again') return player.startAgain();

  // Words that more than one conversation uses.
  const inForm = details.isActive();
  if (said === 'Go on') return inForm ? fill(() => details.keep()) : player.next();
  if (said === 'Carry on') return inForm ? details.repeat() : player.repeat();
  if (said === 'Stop for now') return inForm ? fill(() => details.stop()) : player.stop();

  // The name of a saved task.
  const task = (await tasks()).find((t) => t.name === said);
  if (task) return player.start(task.id);

  // Anything else while a walk is on is her answering in her own words.
  if (walk.isActive()) return walk.tell(said);

  return { said: 'I\'m not sure what to do with that. Try one of the buttons, or ask me a question.' };
}

export const answerTool: Tool = {
  name: 'guide_answer',
  owner: 'guide',
  description:
    'The person pressed one of the answer buttons Steady offered, or one of the three starters: "What do I click?", "Help me fill this in", "I\'m stuck". Pass the exact words on the button. The reply\'s data.options are the next answers to show as buttons.',
  parameters: { words: { type: 'string', description: 'The exact words on the button', required: true } },
  async run(args) {
    const reply = await answer(String(args.words ?? ''));
    return { ok: true, said: reply.said, data: { options: reply.options, then: reply.then, listening: isListening(), mood: reply.mood } };
  },
};
