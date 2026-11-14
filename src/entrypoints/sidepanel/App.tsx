// Owner: B (panel). Type or speak a question, get a short answer, answer buttons, and tools that act on the page.
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { MyDetailsCard } from '@/guide/panel/MyDetailsCard';
import { toModelSafe, type PageMapResponse } from '@/shared/pagemap';
import { HELPER_KEYS, type GeminiAnswer, type GeminiAsk, type ToolResult, type ToolResultMsg } from '@/shared/tools';
import { getProfile, setProfile } from '@/helper/profile';
import { matchRequest } from '@/helper/matcher';

/** A string re-asks the helper. An object with a tool runs that tool directly. */
type Option = string | { label: string; tool?: string; args?: Record<string, unknown> };
interface ToolInfo { name: string; description: string; parameters: Record<string, unknown> }
interface Reply {
  quiet?: boolean;
  said: string;
  point?: string;
  options?: Option[];
  tool?: { name: string; args: Record<string, unknown> };
}

const RULES = `You are Steady, a patient helper for an older adult using a web page.
Use plain, short, kind words. At most two sentences. No jargon.
Use only the page data below. If an element has labelConfident false, say it might be that, never state it as fact.
Answer the question directly. Only ask a question back if two different elements could both be right.
To pay or check out, the person usually starts at the basket or cart: point at that element and say so.
If the person asks for something one of the TOOLS does, add a "tool". Never use a tool to pay, send or submit.
Reply with ONLY JSON: {"said": string, "point": id of the one element to point at (leave out if none), "options": up to 3 short choices (only if you must ask which one they mean), "tool": {"name": string, "args": object} (only if a tool fits)}.`;

const labelOf = (o: Option): string => (typeof o === 'string' ? o : o.label);

function toOptions(raw: unknown): Option[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Option[] = [];
  for (const o of raw) {
    if (typeof o === 'string') out.push(o);
    else if (o && typeof o === 'object' && typeof (o as { label?: unknown }).label === 'string') out.push(o as Option);
  }
  return out.length ? out.slice(0, 4) : undefined;
}

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

async function listTools(tabId: number): Promise<ToolInfo[]> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, { type: 'tool/list' })) as { tools?: ToolInfo[] } | undefined;
    return (res?.tools ?? []).filter((t) => t.name !== 'point_at');
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
        const tool =
          j.tool && typeof j.tool.name === 'string'
            ? { name: j.tool.name as string, args: (j.tool.args && typeof j.tool.args === 'object' ? j.tool.args : {}) as Record<string, unknown> }
            : undefined;
        return {
          said: j.said,
          point: typeof j.point === 'string' ? j.point : undefined,
          options: Array.isArray(j.options) ? j.options.filter((o: unknown) => typeof o === 'string').slice(0, 3) : undefined,
          tool,
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

  function say(t: string) {
    if (!voiceRef.current) return;
    browser.runtime.sendMessage({ type: 'tts/say', text: t }).catch(() => undefined);
  }

  useEffect(() => {
    getProfile(HELPER_KEYS.voiceOn, true).then((v) => { voiceRef.current = v; setVoiceOn(v); });
    // Messages the page sends on its own, such as C's "Is this right?" while filling a form.
    const onMessage = (message: unknown) => {
      const m = message as { type?: string; said?: string; options?: unknown } | null;
      if (m?.type !== 'helper/answer' || typeof m.said !== 'string') return undefined;
      setReply({ said: m.said, options: toOptions(m.options) });
      say(m.said);
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined);
    };
  }, []);

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
      const tools = tabId ? await listTools(tabId) : [];
      // Common requests are recognised here, instantly, without asking Gemini.
      const hit = tabId ? matchRequest(q, tools.map((t) => t.name)) : undefined;
      if (hit && tabId) {
        const out = await runTool(tabId, hit.tool, hit.args);
        if (out) {
          const r: Reply = { said: out.said, options: toOptions((out.data as { options?: unknown } | undefined)?.options) };
          setReply(r);
          say(r.said);
          return;
        }
      }
      const page = tabId ? await readPage(tabId) : '';
      const toolText = tools.length
        ? tools.map((t) => `- ${t.name}(${Object.keys(t.parameters).join(', ')}): ${t.description}`).join('\n')
        : '(none)';
      const prompt = `${RULES}\n\nTOOLS:\n${toolText}\n\nPAGE:\n${page || '(could not read this page)'}\n\nPERSON: ${q}`;
      const msg: GeminiAsk = { type: 'gemini/ask', prompt };
      const ans = (await browser.runtime.sendMessage(msg)) as GeminiAnswer | undefined;
      if (!ans?.ok) {
        setReply({ said: "I couldn't reach my helper just now. Please try again.", quiet: true });
        return;
      }
      let final = parse(ans.text);
      if (final.tool && tabId && tools.some((t) => t.name === final.tool!.name)) {
        const out = await runTool(tabId, final.tool.name, final.tool.args);
        if (out) final = { said: out.said || final.said, options: toOptions((out.data as { options?: unknown } | undefined)?.options) ?? final.options };
      }
      setReply(final);
      say(final.said);
      if (final.point && tabId) {
        runTool(tabId, 'point_at', { id: final.point });
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function pick(o: Option) {
    if (typeof o !== 'string' && o.tool) {
      const tabId = await activeTabId();
      if (!tabId) return;
      const out = await runTool(tabId, o.tool, o.args ?? {});
      if (out) {
        const r: Reply = { said: out.said, options: toOptions((out.data as { options?: unknown } | undefined)?.options) };
        setReply(r);
        say(r.said);
      }
      return;
    }
    const label = labelOf(o);
    setText(label);
    ask(label);
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
          <button key={labelOf(o)} className="choice" onClick={() => pick(o)}>{labelOf(o)}</button>
        ))}
      </section>
      <details className="more">
        <summary>My details</summary>
        <MyDetailsCard />
      </details>
      <button type="button" className="choice small" onClick={toggleVoice}>
        {voiceOn ? '🔊 Reading answers aloud: on' : '🔇 Reading answers aloud: off'}
      </button>
    </main>
  );
}
