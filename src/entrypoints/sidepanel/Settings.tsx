// The settings screen: one big switch per feature. Owner: B.
import { useEffect, useState } from 'react';
import { FEATURES, loadFeatures, setFeature, watchFeatures, type FeatureId, type Features } from '@/helper/features';

export function Settings() {
  const [on, setOn] = useState<Features | null>(null);
  useEffect(() => {
    let alive = true;
    loadFeatures().then((f) => { if (alive) setOn(f); });
    const stop = watchFeatures((f) => { if (alive) setOn(f); });
    return () => { alive = false; stop(); };
  }, []);
  if (!on) return null;
  const flip = (id: FeatureId) => { void setFeature(id, !on[id]); };
  return (
    <section className="card">
      <h2>What Steady does</h2>
      <p>Turn any of these off. Steady only checks and reminds.</p>
      <div className="switches">
        {FEATURES.map((f) => (
          <button key={f.id} type="button" role="switch" aria-checked={on[f.id]} className="switch" onClick={() => flip(f.id)}>
            <span><b>{f.label}</b><small>{f.hint}</small></span>
            <span className="pill">{on[f.id] ? 'On' : 'Off'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
