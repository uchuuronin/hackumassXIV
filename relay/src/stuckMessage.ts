// The one email Steady may send for "I'm stuck". Owner: C.
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

export function stuckMessage(body: StuckBody): { to: string; subject: string; text: string } | null {
  const to = clean(body.to, 120);
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return null;
  const helper = clean(body.helperName, 60) || 'there';
  const from = clean(body.fromName, 60) || 'Someone you help';
  const task = clean(body.task, 120);
  const step = whole(body.step);
  const of = whole(body.of);

  const where = task && step && of && step <= of ? `${from} was on step ${step} of ${of} of "${task}".` : task ? `${from} was doing "${task}".` : '';
  const text = [
    `Hello ${helper},`,
    '',
    `${from} pressed "I'm stuck" in Steady, the helper on their computer, and would like a hand.`,
    ...(where ? [where] : []),
    '',
    'A telephone call is usually the quickest way to help.',
    '',
    'Steady sent only what you see here. It did not send the website, the page, or anything that was typed.',
  ].join('\n');
  return { to, subject: `${from} would like a hand`, text };
}
