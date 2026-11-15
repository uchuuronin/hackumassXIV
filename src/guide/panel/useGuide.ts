// Joins the helper panel to the guide lane. Owner: C.
//   - press(words): the person pressed a button. The words go to the page, which knows what they mean.
//   - Sentences Steady says without being asked (the next box, the next step) arrive here as 'helper/answer'.
//   - hint: one quiet line about the page that is open, so the panel can offer help before being asked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { HELPER_KEY, type Helper } from '@/shared/family';
import type { RecordedTask } from '@/shared/tasks';
import type { HelperAnswer, ToolResult, ToolResultMsg, ToolRun } from '@/shared/tools';
import { feelingOf, type Feeling } from './feeling';

export interface Said {
  said: string;
  options?: string[];
  /** A second, separate message shown under the first ("One more thing…"). */
  then?: { said: string; options?: string[] };
}

const TASKS_KEY = 'guide:tasks';
const RECORDING_KEY = 'guide:recording';
const CANT: Said = { said: 'I can\'t help on this page. Open the website you want, and I\'ll be right here.' };
/** A website is open, but Steady's part of it isn't answering: the page was open before Steady was switched on or updated. */
const LOST: Said = { said: 'I\'ve lost touch with this page. Load it again with the round arrow at the top of the window (or the F5 key), and I\'ll be right here.' };

/** Why the page didn't answer: an ordinary website that needs loading again, or a page Steady can't work on at all. */
async function cantSay(): Promise<Said> {
  try {
    const tabId = await activeTabId();
    const url = tabId ? (await browser.tabs.get(tabId)).url ?? '' : '';
    return /^https?:/.test(url) ? LOST : CANT;
  } catch {
    return CANT;
  }
}

async function activeTabId(): Promise<number | undefined> {
  // For trying the panel in an ordinary tab: sidepanel.html?tab=123 talks to that tab.
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  if (forced) return forced;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

/** Run one of the guide lane's tools on the page that is open. Null when the page can't be reached. */
export async function runOnPage(name: string, args: Record<string, unknown> = {}): Promise<ToolResult | null> {
  try {
    const tabId = await activeTabId();
    if (!tabId) return null;
    const run: ToolRun = { type: 'tool/run', name, args };
    return ((await browser.tabs.sendMessage(tabId, run)) as ToolResultMsg | undefined)?.result ?? null;
  } catch {
    return null;
  }
}

const optionsOf = (result: ToolResult): string[] | undefined => {
  const options = (result.data as { options?: unknown } | undefined)?.options;
  return Array.isArray(options) ? options.filter((o): o is string => typeof o === 'string') : undefined;
};
const thenOf = (from: unknown): Said['then'] => {
  const then = (from as { then?: { said?: unknown; options?: unknown } } | undefined)?.then;
  return then && typeof then.said === 'string' ? { said: then.said, options: Array.isArray(then.options) ? then.options.filter((o): o is string => typeof o === 'string') : undefined } : undefined;
};

/**
 * True while Steady is going through a page with her, one question at a time. Then anything she types
 * or says is an answer in her own words, and goes to the page before it goes anywhere else.
 */
let listening = false;

/** How long each look stays before the face settles again. A concerned or reassuring look lingers; a glad one is brief. */
const HOLD_MS: Record<Feeling, number> = { shocked: 6000, worried: 9000, reassuring: 10000, glad: 2500 };
/** "!" is seen for at least this long before the face moves on to what Steady says next. */
const SHOCK_MS = 1100;
/** Set by the hook, so words that pass through `intent` can change the face. */
let feel: (feeling: Feeling) => void = () => undefined;

/** Plain words that mean one of the buttons, so typing or saying them works too. */
export function intent(text: string, tasks: RecordedTask[]): string | null {
  const said = text.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!said) return null;
  const feeling = feelingOf(text); // how she said it, for the face
  if (feeling) feel(feeling);
  const task = tasks.find((t) => said === t.name.toLowerCase() || said.includes(t.name.toLowerCase()));
  if (task) return task.name;
  if (/\bwhere was i\b|\bwhat was i doing\b|\blost my place\b/.test(said)) return 'Where was I?';
  if (/\b(sign|log) ?(me )?in\b|\bmy password\b/.test(said)) return 'Help me sign in';
  if (/\b(i'?m|i am|im) stuck\b|\bask (my |someone|for help)|\bcall my\b|\bneed (some )?help from\b/.test(said)) return "I'm stuck";
  if (/\b(fill|type) (this|it|that|them|these|the form|my (name|address|details))\b|\bfill (this |it )?in\b/.test(said)) return 'Help me fill this in';
  if (/\bwhat (do|should|can) i (click|press)\b|\bwhich button\b|\bwhat do (these|the) buttons do\b/.test(said)) return 'What do I click?';
  if (listening) return text.trim();
  return null;
}

export function useGuide(onSaid: (reply: Said) => void, onNewPage: () => void = () => undefined) {
  const [hint, setHint] = useState<Said>({ said: '' });
  const [tasks, setTasks] = useState<RecordedTask[]>([]);
  const [helper, setHelper] = useState<Helper | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [mood, setMood] = useState<Feeling | null>(null);
  const settle = useRef<number | undefined>(undefined);
  const show = useCallback((feeling: Feeling | null, after = 0) => {
    window.clearTimeout(settle.current);
    const go = () => {
      setMood(feeling);
      if (feeling) settle.current = window.setTimeout(() => setMood(null), HOLD_MS[feeling]);
    };
    if (after > 0) settle.current = window.setTimeout(go, after);
    else go();
  }, []);
  useEffect(() => {
    feel = (feeling) => show(feeling);
    return () => {
      feel = () => undefined;
      window.clearTimeout(settle.current);
    };
  }, [show]);
  const say = useRef(onSaid);
  say.current = onSaid;
  const newPage = useRef(onNewPage);
  newPage.current = onNewPage;

  const refreshHint = useCallback(async () => {
    const result = await runOnPage('guide_suggest');
    setHint(result ? { said: result.said, options: optionsOf(result) } : { said: '' });
  }, []);

  const press = useCallback(
    async (words: string) => {
      setWorking(true);
      const stuck = words === "I'm stuck";
      const pressedAt = Date.now();
      if (stuck) show('shocked'); // seen at once, before Steady has worked out what to say
      try {
        const result = await runOnPage('guide_answer', { words });
        listening = (result?.data as { listening?: unknown } | undefined)?.listening === true;
        const next = (result?.data as { mood?: unknown } | undefined)?.mood;
        const feeling = next === 'worried' || next === 'reassuring' || next === 'glad' ? next : null;
        if (stuck) show(feeling, Math.max(0, SHOCK_MS - (Date.now() - pressedAt)));
        else if (feeling) show(feeling);
        say.current(result ? { said: result.said, options: optionsOf(result), then: thenOf(result.data) } : await cantSay());
      } finally {
        setWorking(false);
        void refreshHint();
      }
    },
    [refreshHint, show],
  );

  // What Steady says as she goes along.
  useEffect(() => {
    const onMessage = (message: unknown, sender: { tab?: unknown }) => {
      const walk = message as { type?: unknown; on?: unknown } | null;
      if (walk?.type === 'guide/listening' && sender.tab) {
        listening = walk.on === true;
        return undefined;
      }
      const note = message as Partial<HelperAnswer> | null;
      if (note?.type !== 'helper/answer' || !sender.tab || typeof note.said !== 'string') return undefined;
      say.current({ said: note.said, options: note.options, then: thenOf(note) });
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  // A quiet look at each page as it opens.
  useEffect(() => {
    void refreshHint();
    const onActivated = () => void refreshHint();
    const onUpdated = (_id: number, change: { status?: string }, tab: { active?: boolean }) => {
      // A new page is opening: what was said about the last one no longer fits.
      if (change.status === 'loading' && tab.active) newPage.current();
      if (change.status === 'complete') window.setTimeout(() => void refreshHint(), 400);
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refreshHint]);

  // Saved tasks and the person who helps, kept on this computer.
  useEffect(() => {
    const load = async () => {
      const kept = await browser.storage.local.get([TASKS_KEY, HELPER_KEY, RECORDING_KEY]);
      setTasks((kept[TASKS_KEY] as RecordedTask[] | undefined) ?? []);
      setHelper((kept[HELPER_KEY] as Helper | undefined) ?? null);
      setRecording((kept[RECORDING_KEY] as RecordedTask | undefined)?.name ?? null);
    };
    void load();
    const onChanged = () => void load();
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, []);

  return { hint, tasks, helper, recording, working, press, refreshHint, mood };
}
