// Two small cards for the "My details" screen of the panel. Owner: C.
//   - "Who helps you": the one person Steady may tell when she presses "I'm stuck".
//   - TeachScreen: for that person, to record a task once so Steady can walk her through it.

import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { deviceStore } from '@/shared/device-store';
import { HELPER_KEY, REPLY_KEY, tidyHelper, type Helper } from '@/shared/family';
import type { RecordedTask } from '@/shared/tasks';
import { getCode, isHelping, isLinked, joinWith, sendLinked, stopHelping, unlinkAll } from '../family/link';
import { findTask, keepTask, sendTask } from '../family/share';
import { runOnPage } from './useGuide';

/** What Steady remembers from doing tasks, and the way to clear it. Sits under "My details". */
export function RememberCard() {
  const [status, setStatus] = useState('');
  const forget = async () => {
    await deviceStore.remove('guide:lastChoices');
    await deviceStore.remove('guide:trail');
    setStatus("Done. I've forgotten all of that.");
  };
  return (
    <section className="card">
      <h2>What I remember</h2>
      <p>When you do a saved task, I remember what you picked last time, like which doctor or which day, so I can mention it next time.</p>
      <p>If you leave a page half filled in, I keep what you typed in the ordinary boxes for a week, so I can put it back if the page clears itself.</p>
      <p>I never remember passwords, card numbers, ID numbers or your date of birth. It all stays on this computer.</p>
      <button type="button" className="btn" onClick={forget}>Forget all of this</button>
      <p className="status" role="status">{status}</p>
    </section>
  );
}

export function HelperCard() {
  const [helper, setHelper] = useState<Helper>({ name: '', email: '' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    deviceStore.get<Helper>(HELPER_KEY).then((saved) => saved && setHelper(saved));
  }, []);

  const save = async () => {
    // Forgiving: an address typed into the wrong box is moved to the right one, and she is told.
    const tidied = tidyHelper(helper);
    if (!tidied.ok) return setStatus(tidied.said);
    const { name, relation } = tidied.helper;
    await deviceStore.set(HELPER_KEY, tidied.helper);
    setHelper({ ...tidied.helper, relation: relation ?? '' });
    setStatus(`${tidied.moved ? 'I put the email address in its own box. ' : ''}Saved. When you press "I'm stuck", I'll ask before I tell ${relation ? `your ${relation}, ${name}` : name}.`);
  };
  const remove = async () => {
    await deviceStore.remove(HELPER_KEY);
    setHelper({ name: '', email: '' });
    setStatus('Removed. Nobody will be told when you are stuck.');
  };

  // Reply notes: off unless she turns them on.
  const [replies, setReplies] = useState(false);
  // Linking their computer to this one.
  const [linked, setLinked] = useState(false);
  const [code, setCode] = useState<{ words: string; minutes: number } | null>(null);
  const [linkStatus, setLinkStatus] = useState('');
  useEffect(() => {
    const load = async () => {
      setReplies((await deviceStore.get<boolean>(REPLY_KEY)) === true);
      const now = await isLinked();
      setLinked(now);
      if (now) setCode(null);
    };
    void load();
    const onChanged = () => void load();
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, []);
  const flipReplies = async () => {
    await deviceStore.set(REPLY_KEY, !replies);
    setReplies(!replies);
  };
  const makeCode = async () => {
    setLinkStatus('Getting a code…');
    const result = await getCode();
    if (!result.ok) return setLinkStatus(result.said);
    setLinkStatus('');
    setCode({ words: result.code, minutes: result.minutes });
  };
  const unlink = async () => {
    const done = await unlinkAll();
    setLinkStatus(done ? 'Unlinked. Their computer can no longer send anything here.' : "I couldn't reach Steady's server just now, so nothing has changed. Please try again.");
    if (done) setLinked(false);
  };

  return (
    <section className="card">
      <h2>Who helps you</h2>
      <p>One person you trust: a daughter, a son, a friend. If you press "I'm stuck", I'll ask you first, then send them a short note. The note never says what website you were on or what you typed.</p>
      <label htmlFor="helper-name">Their first name</label>
      <input id="helper-name" value={helper.name} autoComplete="off" onChange={(e) => setHelper({ ...helper, name: e.target.value })} />
      <label htmlFor="helper-email">Their email address</label>
      <input id="helper-email" type="email" value={helper.email} autoComplete="off" placeholder="name@example.com" onChange={(e) => setHelper({ ...helper, email: e.target.value })} />
      <label htmlFor="helper-relation">Who are they to you? A daughter, a friend… (you can leave this empty)</label>
      <input id="helper-relation" value={helper.relation ?? ''} autoComplete="off" placeholder="daughter" onChange={(e) => setHelper({ ...helper, relation: e.target.value })} />
      <div className="row">
        <button type="button" className="btn main" onClick={save}>Save</button>
        <button type="button" className="btn" onClick={remove}>Remove</button>
      </div>
      <p className="status" role="status">{status}</p>

      <h3>A note back from them</h3>
      <div className="switches">
        <button type="button" role="switch" aria-checked={replies} className="switch" onClick={flipReplies}>
          <span><b>Let them send me a short note</b><small>When you press "I'm stuck", their email gets a link where they can write one short note. It shows beside the step you're on. They never see the website or what you typed.</small></span>
          <span className="pill">{replies ? 'On' : 'Off'}</span>
        </button>
      </div>

      <h3>Link their computer</h3>
      {linked ? (
        <>
          <p>Their computer is linked to this one. A task they make for you arrives here by itself, and I'll tell you when it does.</p>
          <button type="button" className="btn" onClick={unlink}>Unlink</button>
        </>
      ) : (
        <>
          <p>If they have Steady too, you can link the two computers. Then a task they make for you arrives here by itself.</p>
          <button type="button" className="btn main" onClick={makeCode}>Get a code to read to them</button>
          {code && (
            <div className="words" role="status">
              <p>Read these three words to them:</p>
              <p className="three">{code.words}</p>
              <p>They type them into their Steady, under <strong>For the person who helps</strong>. The words work once, for {code.minutes} minutes. Only give them to someone you know and trust.</p>
            </div>
          )}
        </>
      )}
      <p className="status" role="status">{linkStatus}</p>
    </section>
  );
}

/**
 * The screen for the person who helps. Reached from "My details", so Rose never lands on it by accident.
 * It says the steps in order, shows while Steady is watching, and lists what is saved.
 */
export function TeachScreen({ recording, tasks }: { recording: string | null; tasks: RecordedTask[] }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  const start = async () => {
    if (!name.trim()) return setStatus('Give the task a name first, such as "Order my prescription".');
    const result = await runOnPage('record_start', { name });
    setStatus(result ? result.said : "I can't see a website. Open the page where the task starts, then press this again.");
    if (result?.ok) setName('');
  };
  const stop = async () => {
    const result = await runOnPage('record_stop');
    setStatus(result ? `${result.said} It's now a yellow button on the first screen.` : 'I couldn\'t reach the page. Go back to the website and press this again.');
  };
  // Linked to the person they help: Send goes straight to that computer.
  const [helping, setHelping] = useState(false);
  const [typed, setTyped] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  useEffect(() => {
    void isHelping().then(setHelping);
  }, []);
  const link = async () => {
    setLinkStatus('Linking…');
    const result = await joinWith(typed);
    if (!result.ok) return setLinkStatus(result.said);
    setHelping(true);
    setTyped('');
    setLinkStatus(`${result.fixed.length ? `I took that to be: ${result.fixed.join(', ')}. ` : ''}Linked. From now on, Send puts a task straight onto their computer.`);
  };
  const leave = async () => {
    await stopHelping();
    setHelping(false);
    setLinkStatus('This computer is no longer linked to theirs.');
  };

  const [sent, setSent] = useState<{ name: string; words: string; days: number } | null>(null);
  const send = async (task: RecordedTask) => {
    setSent(null);
    setStatus('Sending the steps…');
    if (helping) {
      const over = await sendLinked(task);
      if (over.ok) return setStatus(`Sent "${task.name}" to their computer. It appears the next time Steady is open there. Only the steps were sent, never anyone's answers.`);
      if (!over.unlinked) return setStatus(over.said);
      setHelping(false); // they unlinked: fall back to three words
      setLinkStatus(over.said);
    }
    const result = await sendTask(task);
    if (!result.ok) return setStatus(result.said);
    setStatus('');
    setSent({ name: task.name, words: result.words, days: result.days });
  };
  const remove = async (task: RecordedTask) => {
    await deviceStore.set('guide:tasks', tasks.filter((t) => t.id !== task.id));
    // What was picked last time for this task goes with it.
    const picked = (await deviceStore.get<Record<string, unknown>>('guide:lastChoices')) ?? {};
    delete picked[task.id];
    await deviceStore.set('guide:lastChoices', picked);
    setStatus(`Removed "${task.name}".`);
  };

  return (
    <>
      <section className="card">
        <h2>Show Steady how to do a task</h2>
        <p>This part is for the person who helps. You do a task once, such as booking an appointment, and Steady learns the way. Later it walks the person you help through the same steps, one at a time.</p>
        <ol className="how">
          <li>Sit at <strong>their</strong> computer. Tasks stay on the computer they were recorded on.</li>
          <li>Open the website, on the page where the task starts.</li>
          <li>Give the task a name they would use, and press <strong>Start watching</strong>.</li>
          <li>Do the task as you normally would, then come back here and press <strong>Finish and save</strong>.</li>
        </ol>
        <p>Steady keeps where you clicked, chose and typed. It never keeps what you typed or which answer you picked, so they make their own choices every time.</p>
        <p>Later, when they do the task themselves, Steady remembers what they picked last time (which doctor, which day) so it can mention it. That stays on this computer, and they can clear it in My details.</p>
        {recording ? (
          <>
            <p className="status">I'm watching "{recording}". Do the task on the website now.</p>
            <button type="button" className="btn main" onClick={stop}>Finish and save</button>
          </>
        ) : (
          <>
            <label htmlFor="task-name">What shall we call it?</label>
            <input id="task-name" value={name} placeholder="Book a doctor's appointment" onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn main" onClick={start}>Start watching</button>
          </>
        )}
        <p className="status" role="status">{status}</p>
      </section>

      <section className="card">
        <h2>Saved tasks</h2>
        {tasks.length === 0 && <p>None yet. A saved task appears as a yellow button on the first screen.</p>}
        <ul className="saved">
          {tasks.map((t) => (
            <li key={t.id}>
              <span><strong>{t.name}</strong><small>{t.steps.length === 1 ? '1 step' : `${t.steps.length} steps`} on {t.site.replace(/^https?:\/\//, '')}{t.shared ? ', from another computer' : ''}</small></span>
              <button type="button" className="btn quiet" onClick={() => send(t)}>Send</button>
              <button type="button" className="btn quiet" onClick={() => remove(t)}>Remove</button>
            </li>
          ))}
        </ul>
        {sent && (
          <div className="words" role="status">
            <p>To put "{sent.name}" on their computer, tell them these three words:</p>
            <p className="three">{sent.words}</p>
            <p>On their computer: <strong>My details</strong>, then <strong>A task someone made for you</strong>. The words work for {sent.days} days. Only the steps were sent, never anyone's answers.</p>
          </div>
        )}
        <p>{helping ? <>This computer is linked to theirs, so <strong>Send</strong> puts a task straight onto their computer.</> : <>Recorded it on your own computer? <strong>Send</strong> gives you three words to read out to them.</>}</p>
      </section>

      <section className="card">
        <h2>Link to the person you help</h2>
        {helping ? (
          <>
            <p>This computer is linked to theirs. A task you send arrives there by itself, and Steady tells them who it's from.</p>
            <button type="button" className="btn" onClick={leave}>Stop being linked</button>
          </>
        ) : (
          <>
            <p>On their computer, open <strong>My details</strong>, find <strong>Who helps you</strong>, and press <strong>Get a code to read to them</strong>. Type the three words here.</p>
            <label htmlFor="link-words">The three words</label>
            <input id="link-words" value={typed} autoComplete="off" placeholder="garden kettle tulip" onChange={(e) => setTyped(e.target.value)} />
            <button type="button" className="btn main" onClick={link}>Link</button>
          </>
        )}
        <p className="status" role="status">{linkStatus}</p>
      </section>
    </>
  );
}

/**
 * The other end: three words in, a task out. On the "My details" screen, because the person themselves
 * may be the one typing, with a helper on the telephone. It asks before adding anything.
 */
export function GetTaskCard() {
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('');
  const [found, setFound] = useState<RecordedTask | null>(null);

  const find = async () => {
    setFound(null);
    setStatus('Looking…');
    const result = await findTask(typed);
    if (!result.ok) return setStatus(result.said);
    setStatus(result.fixed.length ? `I took that to be: ${result.fixed.join(', ')}.` : '');
    setFound(result.task);
  };
  const add = async () => {
    if (!found) return;
    await keepTask(found);
    setStatus(`Added. "${found.name}" is now a yellow button on the first screen.`);
    setFound(null);
    setTyped('');
  };
  const leave = () => {
    setFound(null);
    setStatus("No problem. I haven't added anything.");
  };

  return (
    <section className="card">
      <h2>A task someone made for you</h2>
      <p>If someone who helps you has set up a task for you, they'll give you three words. Type them here. Capitals and commas don't matter.</p>
      <label htmlFor="three-words">The three words</label>
      <input id="three-words" value={typed} autoComplete="off" placeholder="garden kettle tulip" onChange={(e) => setTyped(e.target.value)} />
      <button type="button" className="btn main" onClick={find}>Find it</button>
      {found && (
        <div className="words">
          <p>I found "{found.name}". It's {found.steps.length === 1 ? '1 step' : `${found.steps.length} steps`} on {found.site.replace(/^https?:\/\//, '')}.</p>
          <p><strong>Only add it if someone you know and trust gave you those words.</strong> If a stranger on the phone gave them to you, don't.</p>
          <div className="row">
            <button type="button" className="btn main" onClick={add}>Add it</button>
            <button type="button" className="btn" onClick={leave}>No, leave it</button>
          </div>
        </div>
      )}
      <p className="status" role="status">{status}</p>
    </section>
  );
}
