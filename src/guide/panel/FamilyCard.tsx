// Two small cards for the "My details" screen of the panel. Owner: C.
//   - "Who helps you": the one person Steady may tell when she presses "I'm stuck".
//   - "Teach Steady a task": for that person, to record a task once so Steady can walk her through it.

import { useEffect, useState } from 'react';
import { deviceStore } from '@/shared/device-store';
import { HELPER_KEY, type Helper } from '@/shared/family';
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

export function TeachCard({ recording }: { recording: string | null }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  const start = async () => {
    const result = await runOnPage('record_start', { name });
    setStatus(result ? result.said : 'Open the website where the task starts first, then press this again.');
    if (result?.ok) setName('');
  };
  const stop = async () => {
    const result = await runOnPage('record_stop');
    setStatus(result ? result.said : 'I could not reach the page. Go back to the website and press this again.');
  };

  return (
    <section className="card">
      <h2>Teach Steady a task</h2>
      <p>For the person who helps. Do a task once on the website, such as booking an appointment, and Steady will keep the steps. It keeps where to click and type. It never keeps what you typed or chose.</p>
      {recording ? (
        <>
          <p className="status">I am watching "{recording}". Do the task now, then come back and press Finish.</p>
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
  );
}
