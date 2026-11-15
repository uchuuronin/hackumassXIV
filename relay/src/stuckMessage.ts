// The one email Milo may send for "I'm stuck". Owner: C.
// Kept apart from the server so it can be checked without the server, and so the wording lives in one place.
// The wording is fixed. The only things that vary are two first names, a task name and two numbers,
// and each is cleaned and cut short, so this can't be used to send someone an arbitrary message.

export interface StuckBody {
  to?: unknown;
  helperName?: unknown;
  fromName?: unknown;
  task?: unknown;
  step?: unknown;
  of?: unknown;
}

const clean = (value: unknown, max: number): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const whole = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
};

/** `replyUrl` is only given when she has switched reply notes on: the link to the small page where the helper can write one. */
export function stuckMessage(body: StuckBody, replyUrl?: string): { to: string; subject: string; text: string } | null {
  const to = clean(body.to, 120);
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return null;
  const helper = clean(body.helperName, 60) || 'there';
  const from = clean(body.fromName, 60) || 'Someone you help';
  // With no first name saved, say it once and then "they" and "them", as a person writing the email would.
  const named = from !== 'Someone you help';
  const they = named ? from : 'They';
  const them = named ? from : 'them';
  const task = clean(body.task, 120);
  const step = whole(body.step);
  const of = whole(body.of);

  const was = named ? 'was' : 'were';
  const where = task && step && of && step <= of ? `${they} ${was} on step ${step} of ${of} of "${task}".` : task ? `${they} ${was} doing "${task}".` : '';
  const text = [
    `Hello ${helper},`,
    '',
    `${from} pressed "I'm stuck" in Milo, the helper on their computer, and would like a hand.`,
    ...(where ? [where] : []),
    '',
    'A telephone call is usually the quickest way to help.',
    ...(replyUrl ? ['', `To send ${them} a short note that appears in Milo, open this link:`, replyUrl, 'It works for 2 days.'] : []),
    '',
    'Milo sent only what you see here. It did not send the website, the page, or anything that was typed.',
  ].join('\n');
  return { to, subject: `${from} would like a hand`, text };
}

/**
 * The hello a helper gets once, when they are added under "Who helps you". Owner: C.
 * Fixed wording, like the note above: only two cleaned first names vary.
 */
export function helloMessage(body: Pick<StuckBody, 'to' | 'helperName' | 'fromName'>): { to: string; subject: string; text: string } | null {
  const to = clean(body.to, 120);
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return null;
  const helper = clean(body.helperName, 60) || 'there';
  const from = clean(body.fromName, 60) || 'Someone you help';
  const named = from !== 'Someone you help';
  const they = named ? from : 'they';
  const them = named ? from : 'them';
  const has = named ? 'has' : 'have';
  const text = [
    `Hi ${helper},`,
    '',
    named
      ? `I'm Milo, a helper that sits beside the web browser on ${from}'s computer. ${from} has added you as the person to ask when they're stuck on a website or unsure about a decision.`
      : "I'm Milo, a helper that sits beside the web browser. Someone you help has added you as the person to ask when they're stuck on a website or unsure about a decision.",
    '',
    `When ${they} ${named ? 'presses' : 'press'} "I'm stuck", I'll email you what they were doing and which step they were on. A phone call is usually the quickest way to help. If ${they} ${has} switched on notes back, that email also has a link where you can write a short note with what to do next, and it shows up in Milo.`,
    '',
    `If you have Milo on your own computer, you can also do a task once while I watch, such as booking an appointment, and send it to ${them}. I then walk them through it one step at a time.`,
    '',
    "There is nothing to do now. If this wasn't meant for you, you can ignore it.",
    '',
    'Milo',
  ].join('\n');
  return { to, subject: `${from} added you as their helper in Milo`, text };
}
