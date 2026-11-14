// Owner: B (panel). Type a question, get a short answer, answer buttons, and a pointer on the page.
import { useState } from 'react';
import { browser } from 'wxt/browser';
import { toModelSafe, type PageMapResponse } from '@/shared/pagemap';
import type { GeminiAnswer, GeminiAsk, ToolResultMsg } from '@/shared/tools';

interface Reply { said: string; point?: string; options?: string[] }

const RULES = `You are Steady, a patient helper for an older adult using a web page.
Use plain, short, kind words. At most two sentences. No jargon.
Use only the page data below. If an element has labelConfident false, say it might be that, never state it as fact.
Reply with ONLY JSON: {"said": string, "point": id of the one element to point at (leave out if none), "options": up to 3 short choices (only if you must ask which one they mean)}.`;

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function readPage(tabId: number): Promise<string> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, { type: 'pagemap/get' })) as PageMapResponse;
    // The relay accepts 4000 characters for now, so keep the map small.
    return JSON.stringify(toModelSafe(res.map)).slice(0, 2800);
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

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setReply(null);
    const tabId = await activeTabId();
    const page = tabId ? await readPage(tabId) : '';
    const prompt = `${RULES}\n\nPAGE:\n${page || '(could not read this page)'}\n\nPERSON: ${q}`;
    const msg: GeminiAsk = { type: 'gemini/ask', prompt };
    const ans = (await browser.runtime.sendMessage(msg)) as GeminiAnswer | undefined;
    if (!ans?.ok) {
      setReply({ said: "I couldn't reach my helper just now. Please try again." });
    } else {
      const r = parse(ans.text);
      setReply(r);
      if (r.point && tabId) {
        const run = { type: 'tool/run', name: 'point_at', args: { id: r.point } };
        (browser.tabs.sendMessage(tabId, run) as Promise<ToolResultMsg>).catch(() => undefined);
      }
    }
    setBusy(false);
  }

  return (
    <main className="panel">
      <h1>Steady</h1>
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label htmlFor="q">What do you need help with?</label>
        <input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: where do I pay?" autoFocus />
        <button type="submit" disabled={busy}>{busy ? 'Looking…' : 'Help me'}</button>
      </form>
      <section aria-live="polite" className="reply">
        {reply && <p className="said">{reply.said}</p>}
        {reply?.options?.map((o) => (
          <button key={o} className="choice" onClick={() => { setText(o); ask(o); }}>{o}</button>
        ))}
      </section>
    </main>
  );
}
