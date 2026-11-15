// The guide's switches, for the settings screen. Owner: C. It uses the settings screen's own switch
// styles, so it looks like one list with B's. Protection switches are B's and are not touched here.

import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { deviceStore } from '@/shared/device-store';
import { ALL_ON, GUIDE_SWITCHES, GUIDE_SWITCH_KEY, LIGHT, readSwitches, type GuideSwitchId, type GuideSwitches as Switches } from '@/shared/guideSwitches';

const same = (a: Switches, b: Switches) => GUIDE_SWITCHES.every((s) => a[s.id] === b[s.id]);

export function GuideSwitches() {
  const [on, setOn] = useState<Switches | null>(null);

  useEffect(() => {
    const load = async () => setOn(readSwitches(await deviceStore.get<unknown>(GUIDE_SWITCH_KEY)));
    void load();
    const onChanged = (changes: Record<string, unknown>) => GUIDE_SWITCH_KEY in changes && void load();
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, []);

  if (!on) return null;
  const save = async (next: Switches) => {
    setOn(next);
    await deviceStore.set(GUIDE_SWITCH_KEY, next);
    // Off means forgotten, not only "not used": what was kept for these goes too.
    if (!next.trail) await Promise.all([deviceStore.remove('guide:trail'), deviceStore.remove('guide:trail-arriving')]);
    if (!next.lastTime) await deviceStore.remove('guide:lastChoices');
  };
  const flip = (id: GuideSwitchId) => void save({ ...on, [id]: !on[id] });
  // "Keep it light" and "Everything on" change how much Steady says. What is remembered stays as she set it.
  const light = same(on, { ...LIGHT, trail: on.trail, lastTime: on.lastTime, timeout: on.timeout });

  return (
    <section className="card">
      <h2>How much Steady says</h2>
      <p>Some people want every step talked through. Others want Steady there when asked and quiet otherwise. Either is fine, and the warnings about adverts and payments stay on both ways.</p>
      <div className="switches" role="radiogroup" aria-label="How much Steady says">
        <button type="button" role="radio" aria-checked={!light && on.walk && on.hints && on.nudges} className="switch" onClick={() => void save({ ...on, walk: true, hints: true, nudges: true })}>
          <span><b>Talk me through it</b><small>I suggest things, go one question at a time, and check in if you seem stuck.</small></span>
          {!light && on.walk && on.hints && on.nudges && <span className="pill">Chosen</span>}
        </button>
        <button type="button" role="radio" aria-checked={light} className="switch" onClick={() => void save({ ...on, walk: false, hints: false, nudges: false })}>
          <span><b>Keep it light</b><small>I wait until you ask, and then say what the buttons do. Adverts and payments are still pointed out.</small></span>
          {light && <span className="pill">Chosen</span>}
        </button>
      </div>
      <p>Or choose one by one:</p>
      <div className="switches">
        {GUIDE_SWITCHES.map((s) => (
          <button key={s.id} type="button" role="switch" aria-checked={on[s.id]} className="switch" onClick={() => flip(s.id)}>
            <span><b>{s.label}</b><small>{s.hint}</small></span>
            <span className="pill">{on[s.id] ? 'On' : 'Off'}</span>
          </button>
        ))}
      </div>
      {same(on, ALL_ON) ? null : <button type="button" className="btn" onClick={() => void save({ ...ALL_ON })}>Turn all of these back on</button>}
    </section>
  );
}
