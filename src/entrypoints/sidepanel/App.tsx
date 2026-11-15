// Owner: B (panel). Type or speak a question, get a short answer (read aloud if voice is on), answer buttons, and a pointer on the page.
// Layout and look reworked by C on Saturday afternoon. B's asking, listening and speaking are unchanged.
// What C added: buttons that run the guide lane ("What do I click?", "Help me fill this in", saved tasks,
// "I'm stuck"), Milo's own sentences as she goes along, and the "My details" screen. See src/guide/panel/.
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { toModelSafe, type PageMapResponse, type PageWordsRequest, type PageWordsResponse } from '@/shared/pagemap';
import { HELPER_KEYS, type GeminiAnswer, type GeminiAsk, type HelpLevel, type ToolResult, type ToolResultMsg } from '@/shared/tools';
import { getProfile, setProfile } from '@/helper/profile';
import { theme } from '@/shared/theme';
import { TONE } from '@/shared/voice';
import { Run, STOP, type Earlier, type Outcome } from '@/guide/agent/loop';
import { listen as hear } from '@/shared/hear';
import { Buddy, Field, useRest, type Mood } from '@/guide/panel/Buddy';
import { GetTaskCard, HelperCard, RememberCard, TeachScreen } from '@/guide/panel/FamilyCard';
import { Settings } from './Settings';
import { GuideSwitches } from '@/guide/panel/GuideSwitches';
import { Welcome } from './Welcome';
import { MyDetailsCard } from '@/guide/panel/MyDetailsCard';
import { intent, useGuide } from '@/guide/panel/useGuide';
import { useScreenFocus } from '@/guide/panel/useScreenFocus';
import { useStill } from '@/guide/panel/useStill';

interface Reply { quiet?: boolean; said: string; point?: string; /** A picture of her screen went to Gemini for this answer. */ looked?: boolean; /** From the step-by-step helper: its buttons go back to it. */ agent?: boolean; options?: string[]; /** From the guide lane: its buttons go back to the page, not to Gemini. */ guide?: boolean; /** A second, separate message under the first. */ then?: { said: string; options?: string[] } }

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

/** Keeps what Gemini needs from a big page: what is on screen first, short labels, and whole entries only. */
function compactMap(safe: unknown): string {
  const map = (safe ?? {}) as Record<string, unknown>;
  const list = Array.isArray(map.elements) ? (map.elements as Array<Record<string, unknown>>) : [];
  const rank = (e: Record<string, unknown>) => (e.inViewport === false ? 2 : 0) + (e.covered === true ? 3 : 0) + (e.label ? 0 : 4);
  const ordered = list.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
  const slim = ordered.map((e) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === 'string') out[k] = v.slice(0, 60);
      else if (typeof v === 'number' || typeof v === 'boolean' || k === 'marks') out[k] = v;
      // The choices in a dropdown (guide lane, C): the step-by-step helper has to know them to pick one. Short, and a dozen at most.
      else if (k === 'optionLabels' && Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 12).map((x) => (x as string).slice(0, 40));
    }
    return out;
  });
  let count = Math.min(slim.length, 150);
  let text = JSON.stringify({ ...map, elements: slim.slice(0, count) });
  while (text.length > 12000 && count > 10) {
    count = Math.floor(count * 0.8);
    text = JSON.stringify({ ...map, elements: slim.slice(0, count) });
  }
  return text.slice(0, 14000);
}

async function readPage(tabId: number): Promise<string> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, { type: 'pagemap/get' })) as PageMapResponse;
    return compactMap(toModelSafe(res.map));
  } catch {
    return '';
  }
}

/** The words on the page that Gemini may read (the guide lane decides: src/guide/pagewords.ts). */
async function readWords(tabId: number): Promise<string> {
  try {
    const ask: PageWordsRequest = { type: 'page/words' };
    const res = (await browser.tabs.sendMessage(tabId, ask)) as PageWordsResponse | undefined;
    if (res?.held === 'private') return '(not read: this is a private kind of page)';
    if (res?.held === 'off') return '(not read: the person switched reading off)';
    return res?.words || '(not read)';
  } catch {
    return '(not read)';
  }
}

interface ToolInfo { name: string; description: string; parameters: Record<string, unknown>; owner?: string }

/** Tools the page offers. C's are left out: C's own buttons and shortcuts run those. */
async function listTools(tabId: number): Promise<ToolInfo[]> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, { type: 'tool/list' })) as { tools?: ToolInfo[] } | undefined;
    return (res?.tools ?? []).filter((t) => t.name !== 'point_at' && t.owner !== 'guide');
  } catch {
    return [];
  }
}

async function runTool(tabId: number, name: string, args: Record<string, unknown>): Promise<ToolResult | undefined> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, { type: 'tool/run', name, args })) as ToolResultMsg | undefined;
    return res?.result;
  } catch {
    return undefined;
  }
}

export default function App() {
  const [text, setText] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [micProblem, setMicProblem] = useState(false);
  const [micError, setMicError] = useState('');
  const inFlight = useRef(false);
  // The step-by-step helper for what she asks in her own words (guide lane, C: src/guide/agent/loop.ts).
  const agent = useRef<Run | null>(null);
  /** The last few things said, so a follow-up ("no, smaller than that") keeps the thread. Forgotten after ten minutes. */
  const talk = useRef<Array<Earlier & { at: number }>>([]);
  const saidAt = useRef(0);
  const [progress, setProgress] = useState<string | null>(null);
  const lastAsk = useRef(0);
  const voiceRef = useRef(true);
  const [screen, setScreen] = useState<'home' | 'details' | 'teach' | 'settings'>('home');
  const [glad, setGlad] = useState(false);
  const [petted, setPetted] = useState(false);
  const pet = () => {
    setPetted(true);
    window.setTimeout(() => setPetted(false), 1800);
  };
  const [welcome, setWelcome] = useState(false);
  // Guide lane (C): focus follows the screen, and the panel keeps still if she asked for that.
  useScreenFocus(welcome ? 'welcome' : screen);
  const still = useStill();
  // The guide lane: its sentences are shown and read aloud exactly like an answer.
  const guide = useGuide((r) => {
    setReply({ ...r, guide: true });
    say(r.then ? `${r.said} ${r.then.said}` : r.said);
    setGlad(true);
    window.setTimeout(() => setGlad(false), 1600);
  }, () => { if (Date.now() - saidAt.current > 5000) setReply(null); }); // a new tab Milo just opened keeps what Milo just said about it

  useEffect(() => {
    getProfile(HELPER_KEYS.voiceOn, true).then((v) => { voiceRef.current = v; setVoiceOn(v); });
    getProfile('helper:welcomed', false).then((seen) => setWelcome(!seen));
    return () => { browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined); };
  }, []);

  function say(t: string) {
    if (!voiceRef.current) return;
    console.log('[Milo] speak once', t.length, 'characters');
    browser.runtime.sendMessage({ type: 'tts/say', text: t }).catch(() => undefined);
  }

  function toggleVoice() {
    const next = !voiceRef.current;
    voiceRef.current = next;
    setVoiceOn(next);
    setProfile(HELPER_KEYS.voiceOn, next);
    if (!next) browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined);
  }

  // Listening (guide lane, C: src/shared/hear.ts). It starts at once; it used to wait for a download first.
  const hearing = useRef<{ stop(): void } | null>(null);
  function listen() {
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setMicError('not-supported'); return; }
    if (listening) { hearing.current?.stop(); return; }
    setMicProblem(false);
    setMicError('');
    setListening(true);
    browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined);
    hearing.current = hear(SR, {
      lang: 'en-US',
      onWords: (words) => setText(words),
      onDone: (words) => {
        setListening(false);
        hearing.current = null;
        void ask(words);
      },
      onError: (code) => {
        setListening(false);
        hearing.current = null;
        setMicError(code);
        if (code === 'not-allowed' || code === 'service-not-allowed') setMicProblem(true);
      },
    });
  }

  function openMicPage() {
    browser.tabs.create({ url: browser.runtime.getURL('/mic.html' as never) });
  }

  /** Runs the helper until it ends or needs her, and shows how it ended. */
  async function drive(go: () => Promise<Outcome>, tabId?: number, she?: string) {
    inFlight.current = true;
    setBusy(true);
    try {
      const end = await go();
      setReply({ said: end.said, options: end.options, point: end.point, quiet: end.kind === 'lost', agent: true, looked: end.looked });
      if (she) talk.current = [...talk.current, { she, milo: end.said, at: Date.now() }].slice(-3);
      saidAt.current = Date.now();
      if (!end.spoken) say(end.said); // never read the same words out twice
      if (end.point && tabId) {
        const run = { type: 'tool/run', name: 'point_at', args: { id: end.point } };
        (browser.tabs.sendMessage(tabId, run) as Promise<ToolResultMsg>).catch(() => undefined);
      }
      if (!agent.current?.waiting) agent.current = null;
    } finally {
      setProgress(null);
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || inFlight.current || Date.now() - lastAsk.current < 2000) return;
    lastAsk.current = Date.now();
    // C's buttons and shortcuts ("help me fill this in", a saved task's name) work for the voice too.
    const button = intent(q, guide.tasks);
    if (button) { setText(''); guide.press(button); return; }
    const tabId = await activeTabId();
    // She is answering a question the helper asked ("Which day?"), in her own words.
    if (agent.current?.waiting) { setText(''); return drive(() => agent.current!.next(q), tabId, q); }
    setReply(null);
    const saved = await getProfile<HelpLevel>(HELPER_KEYS.level, 'with-me');
    // "What is this?", "What am I looking at?": a picture of her screen goes with the question.
    const look = /\bwhat('?s| is| are) (this|that|these|those)\b|\bwhat am i (looking at|seeing)\b|\b(describe|explain) (this|the) (picture|photo|image|screen|page)\b|\bwhat does (this|that|the) (picture|photo|image|icon|sign|chart|symbol) (show|say|mean)\b/i.test(q);
    const earlier = talk.current.filter((t) => Date.now() - t.at < 10 * 60_000);
    agent.current = new Run(q, saved === 'show' ? 'show' : saved === 'do-it' ? 'for-me' : 'with-me', {
      tone: TONE,
      async ask(prompt, picture) {
        const msg: GeminiAsk = { type: 'gemini/ask', prompt, json: true, ...(picture ? { image: picture } : {}) }; // the rules ask for JSON, so ask Gemini for strict JSON
        const ans = (await browser.runtime.sendMessage(msg).catch(() => undefined)) as GeminiAnswer | undefined;
        if (!ans?.ok) return null;
        // A relay that hasn't been updated drops the picture. Milo must not answer as if it had looked.
        if (picture && !ans.saw) return JSON.stringify({ say: "I can't look at pictures just yet. My helper on the internet needs an update first. I can tell you what the buttons and words on this page say.", done: true });
        return ans.text;
      },
      // Questions about the world: Gemini with Google Search behind it, through the relay.
      async search(question) {
        const msg: GeminiAsk = { type: 'gemini/ask', prompt: `Answer for an older adult, in at most five short plain lines, using what you find on the web today. Name the source if it matters.\n\nQUESTION: ${question}`, search: true };
        const ans = (await browser.runtime.sendMessage(msg).catch(() => undefined)) as GeminiAnswer | undefined;
        return ans?.ok && ans.text.trim() ? ans.text.trim() : null;
      },
      // A picture of the screen: only after the page says it is not a private one.
      async look() {
        if (!tabId) return { held: 'failed' as const };
        const may = (await browser.tabs.sendMessage(tabId, { type: 'page/may-look' }).catch(() => undefined)) as { ok?: boolean; held?: 'private' | 'off' } | undefined;
        if (!may?.ok) return { held: may?.held ?? ('failed' as const) };
        const tab = await browser.tabs.get(tabId).catch(() => undefined);
        if (!tab?.windowId) return { held: 'failed' as const };
        const shot = (await browser.runtime.sendMessage({ type: 'screen/look', windowId: tab.windowId }).catch(() => undefined)) as { ok?: boolean; image?: string } | undefined;
        return shot?.ok && shot.image ? { picture: shot.image } : { held: 'failed' as const };
      },
      // Pictures or a search, in a new tab beside her page, so she doesn't lose her place.
      async open(url) {
        const tab = tabId ? await browser.tabs.get(tabId).catch(() => undefined) : undefined;
        const made = await browser.tabs.create({ url, active: true, ...(tab ? { index: tab.index + 1, windowId: tab.windowId } : {}) }).catch(() => undefined);
        return !!made;
      },
      async page() {
        return tabId ? { map: await readPage(tabId), words: await readWords(tabId) } : { map: '', words: '(not read)' };
      },
      async tools() {
        return tabId ? listTools(tabId) : [];
      },
      async run(name, args) {
        return tabId ? runTool(tabId, name, args) : undefined;
      },
      point(id) {
        if (!tabId) return;
        const run = { type: 'tool/run', name: 'point_at', args: { id } };
        (browser.tabs.sendMessage(tabId, run) as Promise<ToolResultMsg>).catch(() => undefined);
      },
      progress(said, speak) {
        setProgress(said);
        if (speak !== false) say(said);
      },
      // After a step the page may redraw or move to another address. Wait for it, then a moment more for Milo to start there.
      async settle() {
        await new Promise((r) => window.setTimeout(r, 900));
        for (let i = 0; tabId && i < 12; i += 1) {
          const tab = await browser.tabs.get(tabId).catch(() => undefined);
          if (!tab || tab.status === 'complete') break;
          await new Promise((r) => window.setTimeout(r, 500));
        }
        await new Promise((r) => window.setTimeout(r, 400));
      },
    }, { look, earlier });
    return drive(() => agent.current!.next(), tabId, q);
  }

  // The guide's hook knows how the conversation is going (src/guide/panel/useGuide.ts): surprise shows at once, the rest when Milo isn't busy.
  const words = busy || guide.working ? (progress ?? 'Let me look…') : reply?.said || guide.hint.said || 'Hello, I\'m Milo. What are we doing today?';
  // Which of the dog's looks fits this moment (guide lane, C). First what is happening now, then how she seems, then what he has to offer.
  const rest = useRest(words);
  const mood: Mood =
    guide.mood === 'shocked' ? 'shocked'
    : listening ? 'listening'
    : guide.mood === 'sending' ? 'sending'
    : progress ? 'pointing'
    : busy || guide.working ? 'thinking'
    : guide.mood ? guide.mood
    : petted ? 'petted'
    : glad ? 'glad'
    : reply?.quiet ? 'sad'
    : reply?.point ? 'pointing'
    : reply && /^I'm not sure\b/.test(reply.said) ? 'confused'
    : rest ? rest
    : !reply && guide.hint.said ? 'idea'
    : 'idle';
  // Buttons under the bubble: the answers Milo offered, or, before anything is said, what fits this page
  // and is not already one of the big buttons below ("Help me sign in").
  const tiles = ['What do I click?', 'Help me fill this in', "I'm stuck", ...guide.tasks.map((t) => t.name)];
  const offered = reply ? (reply.options ?? []) : (guide.hint.options ?? []).filter((o) => !tiles.includes(o));
  const answers = busy && progress ? [STOP] : busy || guide.working ? [] : offered;
  const then = busy || guide.working ? undefined : reply?.then;
  // Typed words that mean one of the buttons ("help me fill this in", the name of a saved task) press that
  // button. Anything else goes to B's ask(), which is unchanged. (B: spoken words still go straight to ask().
  // Call intent() there too if you want the same shortcut for the voice.)
  const typed = () => {
    const button = intent(text, guide.tasks);
    if (!button) return ask(text);
    setText('');
    return guide.press(button);
  };
  const pressAnswer = async (o: string) => {
    // "Stop", while the helper is part-way through: it finishes nothing more.
    if (o === STOP && busy && agent.current) { agent.current.stop(); return; }
    // A yes, a no, "carry on", or one of the answers it offered.
    if (reply?.agent && agent.current?.waiting) return drive(() => agent.current!.next(o), await activeTabId());
    return !reply || reply.guide ? guide.press(o) : (setText(o), ask(o));
  };
  const vars = {
    '--paper': theme.paper, '--card': theme.card, '--ink': theme.ink, '--ink-quiet': theme.inkQuiet, '--edge': theme.edge, '--hairline': theme.hairline,
    '--sun': theme.sun, '--teal': theme.teal, '--coral': theme.coral, '--focus': theme.focus, '--focus-on-ink': theme.focusOnInk,
    '--go': theme.tones.go.soft, '--go-deep': theme.tones.go.deep, '--info': theme.tones.info.soft, '--info-deep': theme.tones.info.deep,
    '--care': theme.tones.careful.soft, '--care-deep': theme.tones.careful.deep, '--depth': `${theme.depth}px`,
  } as React.CSSProperties;

  const appClass = still ? 'app still' : 'app';

  if (welcome) {
    const finish = (next?: 'details') => {
      setProfile('helper:welcomed', true);
      setWelcome(false);
      if (next) setScreen(next);
    };
    return (
      <div className={appClass} style={vars}>
        <header className="band small hello"><Field /><Dots /><Buddy mood="hello" /><h1 className="where" tabIndex={-1}>Welcome to Milo</h1></header>
        <main className="sheet">
          <Welcome
            say={say}
            onMic={() => { browser.tabs.create({ url: browser.runtime.getURL('/mic.html' as never) }); }}
            onSkip={() => finish()}
            onDetails={() => finish('details')}
            onHelper={() => { finish('details'); window.setTimeout(() => document.getElementById('helper-name')?.scrollIntoView({ block: 'center' }), 400); }}
            onDone={() => finish()}
          />
        </main>
      </div>
    );
  }

  if (screen === 'settings') {
    return (
      <div className={appClass} style={vars}>
        <header className="band small">
          <Field />
          <Dots />
          <button type="button" className="btn back" onClick={() => setScreen('home')}><Icon name="back" /> Back</button>
          <h1 className="where" tabIndex={-1}>Settings</h1>
        </header>
        <main className="sheet">
          <Settings />
          <GuideSwitches />
        </main>
      </div>
    );
  }

  if (screen === 'details') {
    return (
      <div className={appClass} style={vars}>
        <header className="band small">
          <Field />
          <Dots />
          <button type="button" className="btn back" onClick={() => setScreen('home')}><Icon name="back" /> Back</button>
          <h1 className="where" tabIndex={-1}>My details</h1>
        </header>
        <main className="sheet">
          <section className="card"><MyDetailsCard /></section>
          <HelperCard />
          <GetTaskCard />
          <RememberCard />
          <button type="button" id="open-teach" className="btn quiet" onClick={() => setScreen('teach')}>
            <Icon name="steps" /> For the person who helps
          </button>
        </main>
      </div>
    );
  }

  if (screen === 'teach') {
    return (
      <div className={appClass} style={vars}>
        <header className="band small">
          <Field />
          <Dots />
          <button type="button" className="btn back" onClick={() => setScreen('details')}><Icon name="back" /> Back</button>
          <h1 className="where" tabIndex={-1}>For the person who helps</h1>
        </header>
        <main className="sheet">
          <TeachScreen recording={guide.recording} tasks={guide.tasks} />
        </main>
      </div>
    );
  }

  return (
    <div className={appClass} style={vars}>
      <header className={`band sky-${mood}`}>
        <Field />
        <Dots />
        <div className="who">
          <Buddy mood={mood} onPet={pet} />
          <h1>Milo</h1>
        </div>
        <section aria-live="polite" className="talk">
          <p className={`bubble${reply?.quiet ? ' quiet' : ''}`} key={words}>{words}</p>
          {reply?.looked && !busy && (
            <p className="looked"><Icon name="eye" /> I looked at a picture of this page to answer.</p>
          )}
          {answers.length > 0 && (
            <div className="answers">
              {answers.map((o, i) => (
                <button key={o} type="button" className={`btn answer${i === 0 ? ' first' : ''}`} onClick={() => pressAnswer(o)}>{o}</button>
              ))}
            </div>
          )}
          {then && (
            <div className="then">
              <p className="bubble" key={then.said}>{then.said}</p>
              <div className="answers">
                {(then.options ?? []).map((o) => (
                  <button key={o} type="button" className="btn answer" onClick={() => guide.press(o)}>{o}</button>
                ))}
              </div>
            </div>
          )}
        </section>
      </header>
      {guide.recording && (
        <div className="watching" role="status">
          <span>I'm watching: "{guide.recording}". Do the task on the website, then press Finish.</span>
          <button type="button" className="btn main" onClick={() => setScreen('teach')}>Finish</button>
        </div>
      )}

      <main className="sheet">
        <h2>I can help you with</h2>
        <div className="tiles">
          <button type="button" className="tile go" onClick={() => guide.press('What do I click?')}>
            <Icon name="point" /><span>What do I click?<small>I explain the buttons on this page</small></span>
          </button>
          <button type="button" className="tile info" onClick={() => guide.press('Help me fill this in')}>
            <Icon name="pencil" /><span>Help me fill this in<small>Your name and address, box by box</small></span>
          </button>
          <button type="button" className="tile" onClick={() => guide.press('Make this page easier')}>
            <Icon name="eye" /><span>Make this page easier<small>Darker words, named buttons, less movement</small></span>
          </button>
          {guide.tasks.map((t) => (
            <button key={t.id} type="button" className="tile sun" onClick={() => guide.press(t.name)}>
              <Icon name="steps" /><span>{t.name}<small>{t.steps.length === 1 ? '1 step' : `${t.steps.length} steps, one at a time`}{t.shared ? ' · sent to you' : ''}</small></span>
            </button>
          ))}
        </div>

        <form className="ask" onSubmit={(e) => { e.preventDefault(); typed(); }}>
          <label htmlFor="q">Or ask me anything</label>
          <input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: where do I pay?" autoFocus />
          <div className="row">
            <button type="submit" className="btn main" disabled={busy}>{busy ? 'Looking…' : 'Ask'}</button>
            <button type="button" className="btn" onClick={listen} disabled={busy} aria-pressed={listening}>
              <Icon name="mic" /> {listening ? 'Listening… (press to stop)' : 'Talk to me'}
            </button>
          </div>
        </form>
        <p className="sr" role="status">{listening ? "I'm listening." : busy ? 'Looking.' : ''}</p>
        {micError && <p className="note" role="alert">{micWords(micError)}</p>}
        {micProblem && (
          <button type="button" className="btn" onClick={openMicPage}>
            I need your OK to use the microphone. Tap here.
          </button>
        )}

        <button type="button" className="tile care stuck" onClick={() => guide.press("I'm stuck")}>
          <Icon name="hand" /><span>I'm stuck<small>{guide.helper ? `Ask ${guide.helper.name} for help` : 'Ask someone you trust for help'}</small></span>
        </button>

        <footer className="foot">
          <button type="button" className="btn quiet" onClick={toggleVoice}>
            <Icon name={voiceOn ? 'sound' : 'mute'} /> {voiceOn ? 'Voice: on' : 'Voice: off'}
          </button>
          <button type="button" id="open-details" className="btn quiet" onClick={() => setScreen('details')}>
            <Icon name="person" /> My details
          </button>
          <button type="button" id="open-settings" className="btn quiet" onClick={() => setScreen('settings')}>
            <Icon name="steps" /> Settings
          </button>
        </footer>
      </main>
    </div>
  );
}

/** What went wrong with the microphone, in words a person can act on. */
function micWords(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') return "I can't hear you yet. The microphone isn't allowed. Press the button below and say yes.";
  if (error === 'no-speech') return "I didn't hear anything. Press \"Talk to me\" and try again, or type instead.";
  if (error === 'audio-capture') return "I can't find a microphone on this computer. You can type instead.";
  if (error === 'not-supported') return "Talking isn't available in this browser. You can type instead.";
  return "The microphone didn't work this time. You can try again, or type instead.";
}

/** The row of small squares from the top of the sheet, twinkling slowly. Decoration only. */
function Dots() {
  const colours = ['var(--coral)', 'var(--teal)', 'var(--sun)', '#8794a3'];
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => (
        <i key={i} style={{ background: colours[(i + Math.floor(i / 12)) % colours.length], animationDelay: `${(i * 37) % 23 / 4}s` }} />
      ))}
    </div>
  );
}

const ICONS: Record<string, string> = {
  point: 'M9 11V4.5a1.5 1.5 0 0 1 3 0V10m0 0V8.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5c0 3.6-2.4 6-6 6-2.6 0-4.2-1.2-5.6-3.4L4.5 14a1.5 1.5 0 0 1 2.4-1.8L9 14.5',
  pencil: 'M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5 4 20zm10.5-13.5l3 3',
  steps: 'M5 6h2m4 0h8M5 12h2m4 0h8M5 18h2m4 0h8',
  hand: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5v.5m-2.5-7a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8',
  mic: 'M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zm-6 7a6 6 0 0 0 12 0m-6 6v3',
  sound: 'M4 10v4h3l5 4V6L7 10H4zm12-1a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12',
  mute: 'M4 10v4h3l5 4V6L7 10H4zm12 0l4 4m0-4l-4 4',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  back: 'M14 6l-6 6 6 6',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};

function Icon({ name }: { name: keyof typeof ICONS | string }) {
  return (
    <svg className="icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
