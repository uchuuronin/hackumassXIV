// Owner: B (panel). Type or speak a question, get a short answer (read aloud if voice is on), answer buttons, and a pointer on the page.
// Layout and look reworked by C on Saturday afternoon. B's asking, listening and speaking are unchanged.
// What C added: buttons that run the guide lane ("What do I click?", "Help me fill this in", saved tasks,
// "I'm stuck"), Steady's own sentences as she goes along, and the "My details" screen. See src/guide/panel/.
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { toModelSafe, type PageMapResponse } from '@/shared/pagemap';
import { HELPER_KEYS, type GeminiAnswer, type GeminiAsk, type HelpLevel, type ToolResult, type ToolResultMsg } from '@/shared/tools';
import { getProfile, setProfile } from '@/helper/profile';
import { theme } from '@/shared/theme';
import { TONE } from '@/shared/voice';
import { Buddy, type Mood } from '@/guide/panel/Buddy';
import { GetTaskCard, HelperCard, RememberCard, TeachScreen } from '@/guide/panel/FamilyCard';
import { Settings } from './Settings';
import { GuideSwitches } from '@/guide/panel/GuideSwitches';
import { Welcome } from './Welcome';
import { MyDetailsCard } from '@/guide/panel/MyDetailsCard';
import { intent, useGuide } from '@/guide/panel/useGuide';

interface Reply { quiet?: boolean; said: string; point?: string; tool?: { name: string; args: Record<string, unknown> }; options?: string[]; /** From the guide lane: its buttons go back to the page, not to Gemini. */ guide?: boolean; /** A second, separate message under the first. */ then?: { said: string; options?: string[] } }

const RULES = `You are Steady, a patient helper for an older adult using a web page.
Use plain, short, kind words. At most two sentences. No jargon.
${TONE}
Answer the question directly. Only ask a question back if two different elements could both be right.
To pay or check out, the person usually starts at the basket or cart: point at that element and say so.
Use only the page data below. If an element has labelConfident false, say it might be that, never state it as fact.
Reply with ONLY JSON: {"said": string, "point": id of the one element to point at (leave out if none), "options": up to 3 short choices (only if you must ask which one they mean), "tool": {"name": string, "args": object} (only if a TOOLS entry clearly fits what was asked; never to pay, send or submit; then say in one short question what you will do, for example: Shall I press the Add to basket button?)}.`;

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

function parse(text: string): Reply {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (typeof j.said === 'string') {
        return {
          said: j.said,
          point: typeof j.point === 'string' ? j.point : undefined,
          tool: j.tool && typeof j.tool.name === 'string' ? { name: j.tool.name as string, args: (j.tool.args && typeof j.tool.args === 'object' ? j.tool.args : {}) as Record<string, unknown> } : undefined,
          options: Array.isArray(j.options) ? j.options.filter((o: unknown) => typeof o === 'string').slice(0, 3) : undefined,
        };
      }
    } catch { /* fall through */ }
  }
  return { said: text.trim() || "Sorry, I didn't get that." };
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
  const pending = useRef<{ tabId: number; name: string; args: Record<string, unknown> } | null>(null);
  const lastAsk = useRef(0);
  const voiceRef = useRef(true);
  const [screen, setScreen] = useState<'home' | 'details' | 'teach' | 'settings'>('home');
  const [glad, setGlad] = useState(false);
  const [welcome, setWelcome] = useState(false);
  // The guide lane: its sentences are shown and read aloud exactly like an answer.
  const guide = useGuide((r) => {
    setReply({ ...r, guide: true });
    say(r.then ? `${r.said} ${r.then.said}` : r.said);
    setGlad(true);
    window.setTimeout(() => setGlad(false), 1600);
  }, () => setReply(null));

  useEffect(() => {
    getProfile(HELPER_KEYS.voiceOn, true).then((v) => { voiceRef.current = v; setVoiceOn(v); });
    getProfile('helper:welcomed', false).then((seen) => setWelcome(!seen));
    return () => { browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined); };
  }, []);

  function say(t: string) {
    if (!voiceRef.current) return;
    console.log('[Steady] speak once', t.length, 'characters');
    browser.runtime.sendMessage({ type: 'tts/say', text: t }).catch(() => undefined);
  }

  function toggleVoice() {
    const next = !voiceRef.current;
    voiceRef.current = next;
    setVoiceOn(next);
    setProfile(HELPER_KEYS.voiceOn, next);
    if (!next) browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined);
  }

  async function listen() {
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setMicError('not-supported'); return; }
    try {
      const opts = { langs: ['en-US'], processLocally: true };
      if ((await SR.available?.(opts)) !== 'available') await SR.install?.(opts);
    } catch { /* try anyway */ }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.processLocally = true;
    rec.continuous = true;
    rec.interimResults = true;
    let heard = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    rec.onresult = (e: any) => {
      heard = Array.from(e.results).map((r: any) => r[0].transcript).join(' ').trim();
      setText(heard);
      clearTimeout(timer);
      timer = setTimeout(() => { rec.stop(); ask(heard); }, 1800);
    };
    rec.onerror = (e: any) => {
      setMicError(String(e.error));
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicProblem(true);
    };
    rec.onend = () => setListening(false);
    setMicProblem(false);
    setMicError('');
    setListening(true);
    browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined);
    rec.start();
  }

  function openMicPage() {
    browser.tabs.create({ url: browser.runtime.getURL('/mic.html' as never) });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || inFlight.current || Date.now() - lastAsk.current < 2000) return;
    inFlight.current = true;
    lastAsk.current = Date.now();
    setBusy(true);
    setReply(null);
    pending.current = null;
    try {
      // C's buttons and shortcuts ("help me fill this in", a saved task's name) work for the voice too.
      const button = intent(q, guide.tasks);
      if (button) { setText(''); guide.press(button); return; }
      const tabId = await activeTabId();
      const level = await getProfile<HelpLevel>(HELPER_KEYS.level, 'with-me');
      const tools = tabId && level !== 'show' ? await listTools(tabId) : [];
      const page = tabId ? await readPage(tabId) : '';
      const toolText = tools.length ? tools.map((t) => `- ${t.name}(${Object.keys(t.parameters).join(', ')}): ${t.description}`).join('\n') : '(none)';
      const note = level === 'show' ? '\n\nNOTE: The person chose Show me. Only explain and point. Do not offer to click or fill.' : '';
      const prompt = `${RULES}\n\nTOOLS:\n${toolText}\n\nPAGE:\n${page || '(could not read this page)'}${note}\n\nPERSON: ${q}`;
      const msg: GeminiAsk = { type: 'gemini/ask', prompt };
      const ans = (await browser.runtime.sendMessage(msg)) as GeminiAnswer | undefined;
      if (!ans?.ok) {
        setReply({ said: "I couldn't reach my helper just now. Please try again.", quiet: true });
      } else {
        const r = parse(ans.text);
        if (r.tool && tabId && tools.some((t) => t.name === r.tool!.name)) {
          // "Do it with me": nothing runs until the person says yes.
          pending.current = { tabId, name: r.tool.name, args: r.tool.args };
          r.options = ['Yes, do it', 'No thanks'];
          if (!r.said.trim().endsWith('?')) r.said = `${r.said} Shall I do that?`;
        }
        setReply(r);
        say(r.said);
        if (r.point && tabId) {
          const run = { type: 'tool/run', name: 'point_at', args: { id: r.point } };
          (browser.tabs.sendMessage(tabId, run) as Promise<ToolResultMsg>).catch(() => undefined);
        }
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  // The guide's hook knows how the conversation is going (src/guide/panel/useGuide.ts): surprise shows at once, the rest when Steady isn't busy.
  const mood: Mood = guide.mood === 'shocked' ? 'shocked' : listening ? 'listening' : busy || guide.working ? 'thinking' : (guide.mood ?? (glad ? 'glad' : 'idle'));
  const words = busy || guide.working ? 'Let me look…' : reply?.said || guide.hint.said || 'Hello, I\'m Steady. What are we doing today?';
  // Buttons under the bubble: the answers Steady offered, or, before anything is said, what fits this page
  // and is not already one of the big buttons below ("Help me sign in").
  const tiles = ['What do I click?', 'Help me fill this in', "I'm stuck", ...guide.tasks.map((t) => t.name)];
  const offered = reply ? (reply.options ?? []) : (guide.hint.options ?? []).filter((o) => !tiles.includes(o));
  const answers = busy || guide.working ? [] : offered;
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
  const confirmTool = async (p: { tabId: number; name: string; args: Record<string, unknown> }, o: string) => {
    if (o !== 'Yes, do it') { setReply({ said: 'All right. I will leave it.' }); return; }
    const out = await runTool(p.tabId, p.name, p.args);
    const said = out?.said || 'Done.';
    setReply({ said });
    say(said);
  };
  const pressAnswer = (o: string) => {
    const p = pending.current;
    if (p && reply && !reply.guide) { pending.current = null; return confirmTool(p, o); }
    return !reply || reply.guide ? guide.press(o) : (setText(o), ask(o));
  };
  const vars = {
    '--paper': theme.paper, '--card': theme.card, '--ink': theme.ink, '--ink-quiet': theme.inkQuiet, '--edge': theme.edge, '--hairline': theme.hairline,
    '--sun': theme.sun, '--teal': theme.teal, '--coral': theme.coral, '--focus': theme.focus,
    '--go': theme.tones.go.soft, '--go-deep': theme.tones.go.deep, '--info': theme.tones.info.soft, '--info-deep': theme.tones.info.deep,
    '--care': theme.tones.careful.soft, '--care-deep': theme.tones.careful.deep, '--depth': `${theme.depth}px`,
  } as React.CSSProperties;

  if (welcome) {
    const finish = (next?: 'details') => {
      setProfile('helper:welcomed', true);
      setWelcome(false);
      if (next) setScreen(next);
    };
    return (
      <div className="app" style={vars}>
        <header className="band small"><Dots /></header>
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
      <div className="app" style={vars}>
        <header className="band small">
          <Dots />
          <button type="button" className="btn back" onClick={() => setScreen('home')}><Icon name="back" /> Back</button>
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
      <div className="app" style={vars}>
        <header className="band small">
          <Dots />
          <button type="button" className="btn back" onClick={() => setScreen('home')}><Icon name="back" /> Back</button>
        </header>
        <main className="sheet">
          <section className="card"><MyDetailsCard /></section>
          <HelperCard />
          <GetTaskCard />
          <RememberCard />
          <button type="button" className="btn quiet" onClick={() => setScreen('teach')}>
            <Icon name="steps" /> For the person who helps
          </button>
        </main>
      </div>
    );
  }

  if (screen === 'teach') {
    return (
      <div className="app" style={vars}>
        <header className="band small">
          <Dots />
          <button type="button" className="btn back" onClick={() => setScreen('details')}><Icon name="back" /> Back</button>
        </header>
        <main className="sheet">
          <TeachScreen recording={guide.recording} tasks={guide.tasks} />
        </main>
      </div>
    );
  }

  return (
    <div className="app" style={vars}>
      <header className="band">
        <Dots />
        <div className="who">
          <Buddy mood={mood} />
          <h1>Steady</h1>
        </div>
        <section aria-live="polite" className="talk">
          <p className={`bubble${reply?.quiet ? ' quiet' : ''}`} key={words}>{words}</p>
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
            <button type="button" className="btn" onClick={listen} disabled={busy || listening}>
              <Icon name="mic" /> {listening ? 'Listening…' : 'Talk to me'}
            </button>
          </div>
        </form>
        {micError && <p className="note">Microphone problem: {micError}</p>}
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
          <button type="button" className="btn quiet" onClick={() => setScreen('details')}>
            <Icon name="person" /> My details
          </button>
          <button type="button" className="btn quiet" onClick={() => setScreen('settings')}>
            <Icon name="steps" /> Settings
          </button>
        </footer>
      </main>
    </div>
  );
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
};

function Icon({ name }: { name: keyof typeof ICONS | string }) {
  return (
    <svg className="icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
