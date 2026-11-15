// "Do it for me": she says what she wants, and Milo carries it out one small step at a time. Owner: C.
//
// Gemini chooses each step from the tools Milo has (press this, type that). Milo decides whether
// the step may be taken, takes it, lets the page settle, shows Gemini the page again, and asks for the
// next one. So it is an agent, but one with brakes:
//
//   - The tools themselves refuse anything that pays, sends, saves, deletes or signs in, and anything
//     private (src/hands/tools.ts, with the page map's safety limit). When a press is refused, Milo
//     stops, marks the button, and tells her that press is hers. It does not look for another way.
//   - How much it does alone is her choice (Settings):
//       "Show me"       it never acts: it says what to press and points.
//       "Do it with me" it asks before every step.
//       "Do it for me"  it takes ordinary steps by itself. A tool that sends something for her
//                       (a note to her helper) is still asked about first.
//   - It only uses tools it was offered. A tool Gemini makes up is thrown away.
//   - It stops to check after six steps, and at once if it finds itself repeating a step.
//   - She can stop it at any moment.
//
// This file is only the rules. It never touches the page or the network itself: the panel passes in
// how to ask Gemini, read the page and run a tool, which is also how the tests can play both.

export type Level = 'show' | 'with-me' | 'for-me';

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Deps {
  /** One question to Gemini. Null when it can't be reached. */
  ask(prompt: string): Promise<string | null>;
  /** The page as Gemini may see it right now: the stripped map, and the words she can read. */
  page(): Promise<{ map: string; words: string }>;
  tools(): Promise<ToolInfo[]>;
  /** Run one tool on the page. Undefined when the page can't be reached. */
  run(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; said?: string } | undefined>;
  /** Mark something on the page so she can see what is about to be pressed, or what is hers to press. */
  point(id: string): void;
  /** Say what is happening now, while it is working. */
  progress(said: string): void;
  /** Wait for the page to finish changing after a step. */
  settle(): Promise<void>;
  /** How Milo speaks (src/shared/voice.ts), added to what Gemini is told. */
  tone?: string;
}

export interface Step {
  tool: string;
  args: Record<string, unknown>;
}

export interface Turn {
  say: string;
  step?: Step;
  point?: string;
  done: boolean;
  ask?: string;
  options?: string[];
}

export interface Done extends Step {
  ok: boolean;
  result: string;
}

export interface Outcome {
  /**
   * answer   nothing was done: a plain answer, or (in "Show me") what to press
   * done     it finished, or went as far as it could
   * yours    the next press is one only she may make; it is marked
   * confirm  it wants a yes before the step in `said`
   * asked    it needs something from her to go on
   * limit    it has done several steps and is checking before doing more
   * stopped  she said stop, or said no
   * lost     Gemini or the page could not be reached
   */
  kind: 'answer' | 'done' | 'yours' | 'confirm' | 'asked' | 'limit' | 'stopped' | 'lost';
  said: string;
  options?: string[];
  point?: string;
}

export const YES = 'Yes, do it';
export const NO = 'No thanks';
export const CARRY_ON = 'Carry on';
export const STOP = 'Stop';

/** Steps between checks with her. */
const STEPS_AT_A_TIME = 6;
/** Tools that only change what she is looking at. In "Do it for me" these need no yes. Anything else is asked about. */
const NEEDS_NO_YES = new Set(['click', 'fill', 'reading_set', 'reading_open_bar', 'reading_read_aloud', 'reading_stop', 'quiet_page', 'unquiet_page', 'label_choices', 'hide_choice_labels']);

const LOST = "I couldn't reach my helper just now. Please try again.";
/** The longest prompt sent. The relay's own limit is 20,000 characters. */
const MOST = 19500;

export function agentPrompt(o: { goal: string; level: Level; tools: ToolInfo[]; map: string; words: string; done: Done[]; notes: string[]; tone?: string }): string {
  const tools = o.tools.map((t) => `- ${t.name}(${Object.keys(t.parameters).join(', ')}): ${t.description}`).join('\n') || '(none)';
  const done = o.done.map((d, i) => `${i + 1}. ${d.tool} ${JSON.stringify(d.args)} -> ${d.ok ? '' : 'REFUSED: '}${d.result}`).join('\n') || '(nothing yet)';
  const build = (words: string) => [
    'You are Milo, a patient helper for an older adult using a web page. You can answer her, and you can do things on the page for her, one small step at a time.',
    'Use plain, short, kind words. No jargon. Speak as "I".',
    o.tone ?? '',
    '',
    'Reply with ONLY JSON:',
    '{"say": one or two short sentences: the answer, or what you are doing now, or what you need,',
    ' "step": {"tool": a name from TOOLS, "args": {...}} (leave out if there is nothing to do),',
    ' "point": id of one element to point at (only when you are not taking a step),',
    ' "ask": a question for her (only if you cannot go on without it), "options": up to 3 short answers,',
    ' "done": true when the job is finished or you can go no further, otherwise false}',
    '',
    'Rules:',
    '- One step per reply. After each step you are shown the page again, with what happened under DONE SO FAR.',
    '- Use only ids that appear in PAGE. Never invent one. Use only tools listed in TOOLS.',
    '- Never press anything that pays, buys, sends, submits, saves, deletes or signs in. When that is the next thing, stop: set "done" true, "point" at that button, and tell her it is hers to press.',
    '- Never type a password, a card number, a code or an ID number.',
    '- If she has not told you something the page needs (which day, what time, which one), ask. Do not guess.',
    '- If she asked a question, answer it from PAGE WORDS and PAGE, with no step.',
    '- If a step was REFUSED, do not try another way round it. Stop and tell her.',
    '- If an element has labelConfident false, say it might be that, never state it as fact.',
    '- To pay or check out she usually starts at the basket or cart: point at it and say so.',
    o.level === 'show' ? '- She chose "Show me": she does the pressing. Give the next step as usual; it will be explained to her, not taken.' : '',
    '',
    `TOOLS:\n${tools}`,
    '',
    `PAGE:\n${o.map || '(could not read this page)'}`,
    '',
    `PAGE WORDS:\n${words || '(not read)'}`,
    '',
    `DONE SO FAR:\n${done}`,
    o.notes.length ? `\nWHAT SHE HAS TOLD YOU:\n${o.notes.map((n) => `- ${n}`).join('\n')}` : '',
    '',
    `SHE ASKED: ${o.goal}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
  // The relay refuses a prompt over 20,000 characters. On a big page the words give way; the buttons never do.
  const room = MOST - build('').length;
  const words = o.words.length <= room ? o.words : room > 300 ? o.words.slice(0, room).replace(/\s+\S*$/, '') : '';
  return build(words);
}

/** Gemini's reply, read forgivingly. Null when there is nothing usable in it. A tool that was not offered is dropped. */
export function readTurn(text: string, tools: string[]): Turn | null {
  const found = text.match(/\{[\s\S]*\}/)?.[0];
  if (!found) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(found) as Record<string, unknown>;
  } catch {
    return null;
  }
  const say = typeof j.say === 'string' ? j.say : typeof j.said === 'string' ? j.said : '';
  const ask = typeof j.ask === 'string' && j.ask.trim() ? j.ask.trim() : undefined;
  if (!say.trim() && !ask) return null;
  // The newer shape is "step": {tool, args}. The older one, still understood, is "tool": {name, args}.
  const raw = (j.step ?? j.tool) as { tool?: unknown; name?: unknown; args?: unknown } | undefined;
  const name = raw && typeof raw === 'object' ? (typeof raw.tool === 'string' ? raw.tool : typeof raw.name === 'string' ? raw.name : '') : '';
  const step = name && tools.includes(name) ? { tool: name, args: (raw!.args && typeof raw!.args === 'object' ? raw!.args : {}) as Record<string, unknown> } : undefined;
  return {
    say: say.trim() || ask || '',
    step,
    point: typeof j.point === 'string' ? j.point : undefined,
    done: j.done === true,
    ask,
    options: Array.isArray(j.options) ? j.options.filter((o): o is string => typeof o === 'string').slice(0, 3) : undefined,
  };
}

const same = (a: Step, b: Step) => a.tool === b.tool && JSON.stringify(a.args) === JSON.stringify(b.args);
const asQuestion = (said: string) => (said.trim().endsWith('?') ? said.trim() : `${said.trim()} Shall I do that?`);

export class Run {
  private done: Done[] = [];
  private notes: string[] = [];
  private pending: Turn | null = null;
  private asked: string | null = null;
  private halted = false;
  private since = 0;

  constructor(private goal: string, private level: Level, private deps: Deps) {}

  /** True while it is waiting for her: a yes or no, an answer to its question, or "carry on". */
  get waiting(): boolean {
    return !!this.pending || !!this.asked || this.since >= STEPS_AT_A_TIME;
  }

  stop(): void {
    this.halted = true;
  }

  /** Start, or go on with what she just said or pressed. */
  async next(answer?: string): Promise<Outcome> {
    this.halted = false;
    if (this.pending) {
      const turn = this.pending;
      this.pending = null;
      if (answer !== YES) return { kind: 'stopped', said: 'All right. I will leave it there.' };
      const end = await this.take(turn);
      if (end) return end;
    } else if (this.asked) {
      this.notes.push(`You asked "${this.asked}" and she said: ${answer ?? ''}`);
      this.asked = null;
    } else if (this.since >= STEPS_AT_A_TIME) {
      if (answer !== CARRY_ON) return { kind: 'stopped', said: "I've stopped. Nothing else will be pressed." };
      this.since = 0;
    }
    return this.loop();
  }

  private async loop(): Promise<Outcome> {
    for (;;) {
      if (this.halted) return { kind: 'stopped', said: "I've stopped. Nothing else will be pressed." };
      if (this.since >= STEPS_AT_A_TIME) {
        return { kind: 'limit', said: `I've done ${this.since} things so far. Shall I carry on?`, options: [CARRY_ON, STOP] };
      }
      const [page, tools] = await Promise.all([this.deps.page(), this.deps.tools()]);
      const text = await this.deps.ask(agentPrompt({ goal: this.goal, level: this.level, tools, map: page.map, words: page.words, done: this.done, notes: this.notes, tone: this.deps.tone }));
      const turn = text === null ? null : readTurn(text, tools.map((t) => t.name));
      if (!turn) return { kind: 'lost', said: LOST };
      if (this.halted) return { kind: 'stopped', said: "I've stopped. Nothing else will be pressed." };

      if (turn.ask) {
        this.asked = turn.ask;
        return { kind: 'asked', said: turn.ask, options: turn.options };
      }
      if (!turn.step) return { kind: this.done.length ? 'done' : 'answer', said: turn.say, point: turn.point, options: turn.options };

      const id = typeof turn.step.args.id === 'string' ? turn.step.args.id : undefined;
      // "Show me": she does the pressing. Say it and point; never act.
      if (this.level === 'show') return { kind: 'answer', said: turn.say, point: id };
      // Going round in circles: the same step it has just taken.
      const last = this.done[this.done.length - 1];
      if (last && same(last, turn.step)) return { kind: 'done', said: "I've gone as far as I can with that. Have a look, and tell me what you'd like next." };
      if (this.level === 'with-me' || !NEEDS_NO_YES.has(turn.step.tool)) {
        this.pending = turn;
        if (id) this.deps.point(id);
        return { kind: 'confirm', said: asQuestion(turn.say), options: [YES, NO] };
      }
      const end = await this.take(turn);
      if (end) return end;
    }
  }

  /** Takes one step. Returns how it ended if that was the end, otherwise nothing and the loop goes on. */
  private async take(turn: Turn): Promise<Outcome | null> {
    const step = turn.step!;
    const id = typeof step.args.id === 'string' ? step.args.id : undefined;
    this.deps.progress(turn.say);
    if (id) this.deps.point(id);
    const result = await this.deps.run(step.tool, step.args);
    if (!result) return { kind: 'lost', said: "I can't reach this page just now. Try refreshing it, then ask me again." };
    this.done.push({ ...step, ok: result.ok, result: result.said ?? (result.ok ? 'Done.' : 'It did not work.') });
    this.since += 1;
    if (!result.ok) {
      // Refused: a button only she may press, a private box, or something that has gone. It stops here, with the thing marked.
      const why = result.said ?? 'That one needs a real press from you.';
      return { kind: 'yours', said: `${why} I've marked it, so you can press it when you're ready.`, point: id };
    }
    if (turn.done) return { kind: 'done', said: result.said && step.tool !== 'click' && step.tool !== 'fill' ? result.said : turn.say };
    await this.deps.settle();
    return null;
  }
}
