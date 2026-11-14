// Two small cards for the "My details" screen of the panel. Owner: C.
//   - "Who helps you": the one person Steady may tell when she presses "I'm stuck".
//   - TeachScreen: for that person, to record a task once so Steady can walk her through it.

import { useEffect, useState } from 'react';
import { deviceStore } from '@/shared/device-store';
import { HELPER_KEY, type Helper } from '@/shared/family';
import type { RecordedTask } from '@/shared/tasks';
import { runOnPage } from './useGuide';

export function HelperCard() {
  const [helper, setHelper] = useState<Helper>({ name: '', email: '' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    deviceStore.get<Helper>(HELPER_KEY).then((saved) => saved && setHelper(saved));
  }, []);

  const save = async () => {
    const name = helper.name.trim();
    const email = helper.email.trim();
    if (!name) return setStatus('Please type their first name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setStatus('That email address does not look finished. It needs an @ sign.');
    await deviceStore.set(HELPER_KEY, { name, email });
    setStatus(`Saved. When you press "I'm stuck", I will ask before I tell ${name}.`);
  };
  const remove = async () => {
    await deviceStore.remove(HELPER_KEY);
    setHelper({ name: '', email: '' });
    setStatus('Removed. Nobody will be told when you are stuck.');
  };

  return (
    <section className="card">
      <h2>Who helps you</h2>
      <p>One person you trust: a daughter, a son, a friend. If you press "I'm stuck", I will ask you first, and then send them a short note. The note never says what website you were on or what you typed.</p>
      <label htmlFor="helper-name">Their first name</label>
      <input id="helper-name" value={helper.name} autoComplete="off" onChange={(e) => setHelper({ ...helper, name: e.target.value })} />
      <label htmlFor="helper-email">Their email address</label>
      <input id="helper-email" type="email" value={helper.email} autoComplete="off" onChange={(e) => setHelper({ ...helper, email: e.target.value })} />
      <div className="row">
        <button type="button" className="btn main" onClick={save}>Save</button>
        <button type="button" className="btn" onClick={remove}>Remove</button>
      </div>
      <p className="status" role="status">{status}</p>
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
    setStatus(result ? `${result.said} It is now a yellow button on the first screen.` : 'I could not reach the page. Go back to the website and press this again.');
  };
  const remove = async (task: RecordedTask) => {
    await deviceStore.set('guide:tasks', tasks.filter((t) => t.id !== task.id));
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
        {recording ? (
          <>
            <p className="status">I am watching "{recording}". Do the task on the website now.</p>
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
              <span><strong>{t.name}</strong><small>{t.steps.length === 1 ? '1 step' : `${t.steps.length} steps`} on {t.site.replace(/^https?:\/\//, '')}</small></span>
              <button type="button" className="btn quiet" onClick={() => remove(t)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
