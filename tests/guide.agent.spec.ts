// "Do it for me": she says what she wants in her own words, and Milo carries it out one small step
// at a time, looking at the page again after each. Gemini chooses each step; Milo decides whether it
// may be taken. These tests play Gemini and the page, so every rule is checked without either.
import { expect, test } from '@playwright/test';
import { Run, agentPrompt, readTurn, type Deps, type Level } from '../src/guide/agent/loop';

const TOOLS = [
  { name: 'click', description: 'Click a button.', parameters: { id: {} } },
  { name: 'fill', description: 'Type into a box.', parameters: { id: {}, value: {} } },
  { name: 'stuck_send', description: 'Email her helper.', parameters: {} },
];

function world(replies: string[], results: Record<string, { ok: boolean; said: string }> = {}) {
  const log: string[] = [];
  const prompts: string[] = [];
  const deps: Deps = {
    async ask(prompt) {
      prompts.push(prompt);
      return replies.shift() ?? null;
    },
    async page() {
      return { map: '[{"id":"s1","label":"New event"},{"id":"s2","label":"Title"},{"id":"s3","label":"Save"}]', words: 'Calendar' };
    },
    async tools() {
      return TOOLS;
    },
    async run(name, args) {
      log.push(`${name} ${JSON.stringify(args)}`);
      return results[`${name}:${String(args.id ?? '')}`] ?? { ok: true, said: `Did ${name}.` };
    },
    point(id) {
      log.push(`point ${id}`);
    },
    progress(said) {
      log.push(`say ${said}`);
    },
    async settle() {
      log.push('settle');
    },
  };
  return { deps, log, prompts };
}
const step = (say: string, tool: string, args: object, done = false) => JSON.stringify({ say, step: { tool, args }, done });
const start = (level: Level, replies: string[], results = {}) => {
  const w = world(replies, results);
  return { ...w, run: new Run('schedule personal time and name it test', level, w.deps) };
};

test('"Do it for me": it takes each step, looks again, and stops when the job is done', async () => {
  const { run, log } = start('for-me', [
    step('Opening a new event.', 'click', { id: 's1' }),
    step('Naming it "test".', 'fill', { id: 's2', value: 'test' }),
    JSON.stringify({ say: 'It is ready. Press Save when you are happy with it.', done: true, point: 's3' }),
  ]);
  const end = await run.next();
  expect(log.filter((l) => /^(click|fill)/.test(l))).toEqual(['click {"id":"s1"}', 'fill {"id":"s2","value":"test"}']);
  expect(log.filter((l) => l === 'settle').length).toBe(2); // the page is read afresh after every step
  expect(end.kind).toBe('done');
  expect(end.said).toBe('It is ready. Press Save when you are happy with it.');
  expect(end.point).toBe('s3');
});

test('each step is said and shown before it is taken', async () => {
  const { run, log } = start('for-me', [step('Opening a new event.', 'click', { id: 's1' }, true)]);
  await run.next();
  expect(log.slice(0, 3)).toEqual(['say Opening a new event.', 'point s1', 'click {"id":"s1"}']);
});

test('a button that pays, sends or saves is never pressed: Milo stops there and hands it to her', async () => {
  const { run, log } = start('for-me', [step('Saving it.', 'click', { id: 's3' })], { 'click:s3': { ok: false, said: '"Save" sends this, so it needs a real press from you.' } });
  const end = await run.next();
  expect(end.kind).toBe('yours');
  expect(end.said).toBe('"Save" sends this, so it needs a real press from you. I\'ve marked it, so you can press it when you\'re ready.');
  expect(end.point).toBe('s3');
  expect(log.filter((l) => l.startsWith('click')).length).toBe(1); // it does not try again, or try another way
});

test('"Do it with me": it asks before every step, and does nothing on a no', async () => {
  const { run, log } = start('with-me', [step('I will open a new event.', 'click', { id: 's1' }), step('I will name it "test".', 'fill', { id: 's2', value: 'test' }, true)]);
  const first = await run.next();
  expect(first.kind).toBe('confirm');
  expect(first.said).toBe('I will open a new event. Shall I do that?');
  expect(first.options).toEqual(['Yes, do it', 'No thanks']);
  expect(log.some((l) => l.startsWith('click'))).toBe(false);
  const second = await run.next('Yes, do it');
  expect(log).toContain('click {"id":"s1"}');
  expect(second.kind).toBe('confirm'); // and asks again for the next one
  const end = await run.next('No thanks');
  expect(end).toMatchObject({ kind: 'stopped', said: 'All right. I will leave it there.' });
  expect(log.some((l) => l.startsWith('fill'))).toBe(false);
});

test('"Show me": it never acts. It says what to press and points at it', async () => {
  const { run, log } = start('show', [step('Press "New event" to begin.', 'click', { id: 's1' })]);
  const end = await run.next();
  expect(end).toMatchObject({ kind: 'answer', said: 'Press "New event" to begin.', point: 's1' });
  expect(log.some((l) => /^(click|fill)/.test(l))).toBe(false);
});

test('a plain question is still just answered', async () => {
  const { run, log } = start('for-me', [JSON.stringify({ say: 'The blue kettle is the cheapest, at $19.', done: true })]);
  expect(await run.next()).toMatchObject({ kind: 'answer', said: 'The blue kettle is the cheapest, at $19.' });
  expect(log.filter((l) => !l.startsWith('say')).length).toBe(0);
});

test('when something is missing it asks her, and carries on with her answer', async () => {
  const { run, prompts, log } = start('for-me', [
    JSON.stringify({ say: 'Which day?', ask: 'Which day would you like?', options: ['Monday', 'Tuesday'] }),
    step('Opening Tuesday.', 'click', { id: 's1' }, true),
  ]);
  const asked = await run.next();
  expect(asked).toMatchObject({ kind: 'asked', said: 'Which day would you like?', options: ['Monday', 'Tuesday'] });
  const end = await run.next('Tuesday');
  expect(prompts[1]).toContain('Tuesday');
  expect(log).toContain('click {"id":"s1"}');
  expect(end.kind).toBe('done');
});

test('a tool that sends something for her is always asked about first, even in "Do it for me"', async () => {
  const { run, log } = start('for-me', [step('I will tell Maya.', 'stuck_send', {})]);
  const end = await run.next();
  expect(end.kind).toBe('confirm');
  expect(log.some((l) => l.startsWith('stuck_send'))).toBe(false);
});

test("Gemini can't make it use a tool that isn't offered, or press something that isn't on the page", async () => {
  const a = start('for-me', [step('Deleting your account.', 'delete_everything', { id: 's1' })]);
  expect((await a.run.next()).kind).toBe('answer'); // the step is thrown away; only the words are left
  expect(a.log.filter((l) => !l.startsWith('say')).length).toBe(0);
  const b = start('for-me', [step('Pressing it.', 'click', { id: 'made-up' })], { 'click:made-up': { ok: false, said: 'I can no longer find that on the page. It may have changed.' } });
  const end = await b.run.next();
  expect(end.kind).toBe('yours');
});

test('it never goes round in circles: the same step twice, or too many steps, and it stops to check', async () => {
  const same = start('for-me', [step('Opening.', 'click', { id: 's1' }), step('Opening.', 'click', { id: 's1' }), step('Opening.', 'click', { id: 's1' })]);
  const stuck = await same.run.next();
  expect(stuck.kind).toBe('done');
  expect(stuck.said).toBe("I've gone as far as I can with that. Have a look, and tell me what you'd like next.");
  expect(same.log.filter((l) => l.startsWith('click')).length).toBe(1);
  const many = start('for-me', Array.from({ length: 12 }, (_, i) => step(`Step ${i}.`, 'fill', { id: 's2', value: String(i) })));
  const limit = await many.run.next();
  expect(limit.kind).toBe('limit');
  expect(limit.options).toEqual(['Carry on', 'Stop']);
  expect(many.log.filter((l) => l.startsWith('fill')).length).toBe(6);
});

test('"Stop" halts it before the next step', async () => {
  const { run, log, deps } = start('for-me', [step('One.', 'click', { id: 's1' }), step('Two.', 'fill', { id: 's2', value: 'x' })]);
  const settle = deps.settle;
  deps.settle = async () => {
    run.stop();
    await settle();
  };
  const end = await run.next();
  expect(end).toMatchObject({ kind: 'stopped', said: "I've stopped. Nothing else will be pressed." });
  expect(log.some((l) => l.startsWith('fill'))).toBe(false);
});

test('no answer from Gemini, or nonsense, ends honestly and presses nothing', async () => {
  const none = start('for-me', []);
  expect(await none.run.next()).toMatchObject({ kind: 'lost', said: "I couldn't reach my helper just now. Please try again." });
  const odd = start('for-me', ['<html>502 bad gateway</html>']);
  const end = await odd.run.next();
  expect(end.kind).toBe('lost');
  expect(odd.log.filter((l) => !l.startsWith('say')).length).toBe(0);
});

test('what Gemini is told: her words, the page, what has been done, and the rules it must keep', async () => {
  const prompt = agentPrompt({ goal: 'name it test', level: 'for-me', tools: TOOLS, map: '[MAP]', words: 'WORDS', done: [{ tool: 'click', args: { id: 's1' }, ok: true, result: 'Pressed "New event".' }], notes: ['You asked "Which day?" and she said: Tuesday'] });
  for (const part of ['name it test', '[MAP]', 'WORDS', 'Pressed "New event".', 'Tuesday', 'click(id)', 'fill(id, value)']) expect(prompt).toContain(part);
  expect(prompt).toMatch(/never press anything that pays, buys, sends, submits, saves, deletes or signs in/i);
  expect(prompt).toMatch(/never type a password, a card number, a code or an ID number/i);
});

test("Gemini's reply is read forgivingly, and the older shape still works", () => {
  expect(readTurn('Sure! {"say":"Hello.","done":true} hope that helps', ['click'])).toMatchObject({ say: 'Hello.', done: true });
  expect(readTurn('{"said":"Making it bigger.","tool":{"name":"click","args":{"id":"s1"}}}', ['click'])).toMatchObject({ say: 'Making it bigger.', step: { tool: 'click', args: { id: 's1' } } });
  expect(readTurn('{"said":"Here.","point":"s2"}', ['click'])).toMatchObject({ say: 'Here.', point: 's2' });
  expect(readTurn('not json at all', ['click'])).toBeNull();
});

test('what Gemini is told always fits what the relay accepts: on a big page the words give way, never the buttons', async () => {
  const map = JSON.stringify({ elements: Array.from({ length: 150 }, (_, i) => ({ id: `s${i}`, label: 'A button with quite a long name on it '.repeat(2) })) }).slice(0, 14000);
  const words = 'kettle '.repeat(900); // 6,300 characters
  const prompt = agentPrompt({ goal: 'which is cheapest', level: 'for-me', tools: TOOLS, map, words, done: [], notes: [] });
  expect(prompt.length).toBeLessThanOrEqual(19500); // the relay refuses anything over 20,000
  expect(prompt).toContain(map); // the buttons are all still there
  expect(prompt).toContain('kettle kettle'); // and as many of the words as there was room for
  const small = agentPrompt({ goal: 'q', level: 'for-me', tools: TOOLS, map: '[]', words, done: [], notes: [] });
  expect(small).toContain(words.trim()); // on an ordinary page nothing is cut
});

// ---- Looking things up, opening pictures, and seeing the screen ----

function more(replies: string[], extra: Partial<Deps> = {}) {
  const w = world(replies);
  const asked: Array<{ prompt: string; picture?: string }> = [];
  const ask = w.deps.ask;
  w.deps.ask = async (prompt, picture) => {
    asked.push({ prompt, picture });
    return ask(prompt);
  };
  Object.assign(w.deps, extra);
  return { ...w, asked };
}

test('a question about the world is looked up on the live web first, and the answer is used', async () => {
  const searched: string[] = [];
  const w = more(
    [step('Let me look that up.', 'look_up', { question: 'small white dog breeds with big ears' }), JSON.stringify({ say: 'It might be a Papillon, a Chihuahua or a West Highland Terrier.', done: true })],
    { async search(q) { searched.push(q); return 'Papillons are small, often white, with large butterfly ears.'; } },
  );
  const end = await new Run("I'm looking for a dog breed. White, short, really big ears", 'show', w.deps).next();
  expect(searched).toEqual(['small white dog breeds with big ears']);
  expect(w.asked[1]!.prompt).toContain('Papillons are small, often white, with large butterfly ears.');
  expect(end).toMatchObject({ kind: 'done', said: 'It might be a Papillon, a Chihuahua or a West Highland Terrier.' });
});

test('pictures open in a new tab only after she says yes, at every level, and that ends the turn', async () => {
  for (const level of ['show', 'with-me', 'for-me'] as const) {
    const opened: string[] = [];
    const w = more([step('Shall I open some pictures of Papillons?', 'show_pictures', { what: 'Papillon dog' })], { async open(url) { opened.push(url); return true; } });
    const run = new Run('show me', level, w.deps);
    const first = await run.next();
    expect(first, level).toMatchObject({ kind: 'confirm', said: 'Shall I open some pictures of Papillons?' });
    expect(opened).toEqual([]);
    const end = await run.next('Yes, do it');
    expect(opened).toEqual(['https://www.google.com/search?q=Papillon%20dog&udm=2']);
    expect(end).toMatchObject({ kind: 'done', said: 'I\'ve opened pictures of "Papillon dog" in a new tab, next to your page.' });
  }
});

test('a web search can be opened the same way, and "no" opens nothing', async () => {
  const opened: string[] = [];
  const w = more([step('Shall I search for that?', 'search_web', { what: 'bakery opening hours Amherst' })], { async open(url) { opened.push(url); return true; } });
  const run = new Run('q', 'for-me', w.deps);
  await run.next();
  expect(await run.next('No thanks')).toMatchObject({ kind: 'stopped' });
  expect(opened).toEqual([]);
});

test('"What is this?" sends a picture of her screen with the question', async () => {
  const w = more([JSON.stringify({ say: 'It is a photo of a brass reading lamp.', done: true })], { async look() { return { picture: 'JPEGDATA' }; } });
  const end = await new Run('what is this picture?', 'for-me', w.deps, { look: true }).next();
  expect(w.asked[0]!.picture).toBe('JPEGDATA');
  expect(w.asked[0]!.prompt).toContain('A PICTURE OF HER SCREEN IS ATTACHED');
  expect(end.said).toBe('It is a photo of a brass reading lamp.');
});

test('Gemini can ask to look at the screen itself, and gets the picture on its next turn', async () => {
  const w = more([step('Let me look.', 'look_at_screen', {}), JSON.stringify({ say: 'Those three icons are search, your basket and your account.', done: true })], { async look() { return { picture: 'JPEGDATA' }; } });
  const end = await new Run('what are those little pictures at the top?', 'for-me', w.deps).next();
  expect(w.asked[0]!.picture).toBeUndefined();
  expect(w.asked[1]!.picture).toBe('JPEGDATA');
  expect(end.said).toBe('Those three icons are search, your basket and your account.');
});

test('it never looks at a private page, and says so plainly instead of guessing', async () => {
  const w = more([], { async look() { return { held: 'private' as const }; } });
  const end = await new Run('what am I looking at?', 'for-me', w.deps, { look: true }).next();
  expect(end).toMatchObject({ kind: 'answer', said: "I don't look at pages for signing in, paying, your bank or your health. I can tell you what the buttons say instead." });
  expect(w.asked.length).toBe(0); // nothing went to Gemini
  const off = more([], { async look() { return { held: 'off' as const }; } });
  expect((await new Run('what is this?', 'for-me', off.deps, { look: true }).next()).said).toBe('Looking at the screen is switched off in Settings.');
});

test('after a step changes the page, the old picture is not sent again', async () => {
  const w = more([step('Opening it.', 'click', { id: 's1' }), JSON.stringify({ say: 'Done.', done: true })], { async look() { return { picture: 'OLD' }; } });
  await new Run('what is this? open it', 'for-me', w.deps, { look: true }).next();
  expect(w.asked[0]!.picture).toBe('OLD');
  expect(w.asked[1]!.picture).toBeUndefined();
});

test('what was said a moment ago is remembered, so "no, smaller than that" keeps the thread', async () => {
  const w = more([JSON.stringify({ say: 'Then perhaps a Chihuahua.', done: true })]);
  await new Run('no, smaller than that', 'for-me', w.deps, { earlier: [{ she: 'a white dog with big ears', milo: 'It might be a Papillon.' }] }).next();
  expect(w.asked[0]!.prompt).toContain('She said: "a white dog with big ears". You said: "It might be a Papillon."');
});

test('the built-in tools are offered only when Milo can do them', async () => {
  const w = more([JSON.stringify({ say: 'Hi.', done: true })]);
  await new Run('hi', 'for-me', w.deps).next();
  expect(w.asked[0]!.prompt).not.toContain('look_up(');
  const v = more([JSON.stringify({ say: 'Hi.', done: true })], { async search() { return ''; }, async open() { return true; }, async look() { return {}; } });
  await new Run('hi', 'for-me', v.deps).next();
  for (const tool of ['look_up(question)', 'show_pictures(what)', 'search_web(what)', 'look_at_screen()']) expect(v.asked[0]!.prompt).toContain(tool);
});
