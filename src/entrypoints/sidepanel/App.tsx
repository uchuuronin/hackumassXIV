// Owner: B (panel). Type or speak a question, get a short answer (read aloud if voice is on), answer buttons, and a pointer on the page.
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { toModelSafe, type PageMapResponse } from '@/shared/pagemap';
import { HELPER_KEYS, type GeminiAnswer, type GeminiAsk, type ToolResultMsg } from '@/shared/tools';
import { getProfile, setProfile } from '@/helper/profile';

interface Reply { quiet?: boolean; said: string; point?: string; options?: string[] }

const RULES = `You are Steady, a patient helper for an older adult using a web page.
Use plain, short, kind words. At most two sentences. No jargon.
Answer the question directly. Only ask a question back if two different elements could both be right.
To pay or check out, the person usually starts at the basket or cart: point at that element and say so.
Use only the page data below. If an element has labelConfident false, say it might be that, never state it as fact.
Reply with ONLY JSON: {"said": string, "point": id of the one element to point at (leave out if none), "options": up to 3 short choices (only if you must ask which one they mean)}.`;

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function readPage(tabId: number): Promise<string> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, { type: 'pagemap/get' })) as PageMapResponse;
    return JSON.stringify(toModelSafe(res.map)).slice(0, 8000);
  } catch {
    return '';
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
  const lastAsk = useRef(0);
  const voiceRef = useRef(true);

  useEffect(() => {
    getProfile(HELPER_KEYS.voiceOn, true).then((v) => { voiceRef.current = v; setVoiceOn(v); });
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
    try {
      const tabId = await activeTabId();
      const page = tabId ? await readPage(tabId) : '';
      const prompt = `${RULES}\n\nPAGE:\n${page || '(could not read this page)'}\n\nPERSON: ${q}`;
      const msg: GeminiAsk = { type: 'gemini/ask', prompt };
      const ans = (await browser.runtime.sendMessage(msg)) as GeminiAnswer | undefined;
      if (!ans?.ok) {
        setReply({ said: "I couldn't reach my helper just now. Please try again.", quiet: true });
      } else {
        const r = parse(ans.text);
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

  return (
    <main className="panel">
      <h1>Steady</h1>
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label htmlFor="q">What do you need help with?</label>
        <input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: where do I pay?" autoFocus />
        <button type="submit" disabled={busy}>{busy ? 'Looking…' : 'Help me'}</button>
        <button type="button" className="choice" onClick={listen} disabled={busy || listening}>
          {listening ? 'Listening… speak now' : '🎤 Talk to me'}
        </button>
      </form>
      {micError && <p className="said">Microphone problem: {micError}</p>}
      {micProblem && (
        <button type="button" className="choice" onClick={openMicPage}>
          I need your OK to use the microphone. Tap here.
        </button>
      )}
      <section aria-live="polite" className="reply">
        {reply && <p className="said">{reply.said}</p>}
        {reply?.options?.map((o) => (
          <button key={o} className="choice" onClick={() => { setText(o); ask(o); }}>{o}</button>
        ))}
      </section>
      <button type="button" className="choice small" onClick={toggleVoice}>
        {voiceOn ? '🔊 Reading answers aloud: on' : '🔇 Reading answers aloud: off'}
      </button>
    </main>
  );
}
