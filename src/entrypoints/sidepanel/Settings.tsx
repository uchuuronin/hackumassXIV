// The settings screen: how much Milo does, and one big switch per feature. Owner: B.
import { useEffect, useState } from 'react';
import { FEATURES, loadFeatures, setFeature, watchFeatures, type FeatureId, type Features } from '@/helper/features';
import { getProfile, setProfile } from '@/helper/profile';
import { HELPER_KEYS, type HelpLevel } from '@/shared/tools';

const LEVELS: Array<{ id: HelpLevel; label: string; hint: string }> = [
  { id: 'show', label: 'Show me', hint: 'You do the clicking. I explain and point.' },
  { id: 'with-me', label: 'Do it with me', hint: 'I do each step, but I ask you first.' },
  // The guide lane's step-by-step helper (src/guide/agent/loop.ts) is what acts on this.
  { id: 'do-it', label: 'Do it for me', hint: 'I do ordinary steps by myself and say each one. I still stop before anything that pays, sends or saves.' },
];

export function Settings() {
  const [on, setOn] = useState<Features | null>(null);
  const [level, setLevel] = useState<HelpLevel>('with-me');

  useEffect(() => {
    let alive = true;
    loadFeatures().then((f) => { if (alive) setOn(f); });
    getProfile<HelpLevel>(HELPER_KEYS.level, 'with-me').then((l) => { if (alive) setLevel(l === 'show' || l === 'do-it' ? l : 'with-me'); });
    const stop = watchFeatures((f) => { if (alive) setOn(f); });
    return () => { alive = false; stop(); };
  }, []);

  if (!on) return null;
  const flip = (id: FeatureId) => { void setFeature(id, !on[id]); };
  const pick = (l: HelpLevel) => { setLevel(l); void setProfile(HELPER_KEYS.level, l); };

  return (
    <>
      <section className="card">
        <h2>How much should I do?</h2>
        <div className="switches" role="radiogroup" aria-label="How much should I do?">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={level === l.id} className="switch" onClick={() => pick(l.id)}>
              <span><b>{l.label}</b><small>{l.hint}</small></span>
              {level === l.id && <span className="pill">Chosen</span>}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>What Milo does</h2>
        <p>Turn any of these off. Milo only checks and reminds.</p>
        <div className="switches">
          {FEATURES.map((f) => (
            <button key={f.id} type="button" role="switch" aria-checked={on[f.id]} className="switch" onClick={() => flip(f.id)}>
              <span><b>{f.label}</b><small>{f.hint}</small></span>
              <span className="pill">{on[f.id] ? 'On' : 'Off'}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
