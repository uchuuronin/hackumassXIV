// Milo in the panel: a small golden dog who leans on the speech bubble. Owner: C.
//
// He follows the conversation, so she can see he heard how she said something as well as what:
// he tilts his head while she talks, hugs a heart when she is having a hard time, holds up the
// letter while a note to her helper is going, and dozes off if nothing happens for a while.
// Each look is one picture (public/buddy). All of them are on the page from the start and fade
// into each other, so a change is never a jump and never waits for a download.
//
// He has no box of his own. He sits in the top of the panel, and that whole band is his field: the
// sky, the sun, the clouds and the hill are the panel's background (see <Field /> and style.css).
//
// A change of look is never a flash. He ducks down behind the speech bubble, and comes back up with
// the new look, so the swap itself happens out of sight. If his look changes again while he is
// moving, he simply carries on from where he is.
//
// What moves by itself: he breathes, and two clouds drift. All of it stops with "Let my face move"
// in Settings, or when the computer asks for less motion; his looks still change, by fading.
//
// He is also a button: press him and he is pleased. It does nothing else.

import { useEffect, useRef, useState } from 'react';

export type Mood =
  | 'idle' | 'thinking' | 'listening' | 'glad' | 'worried' | 'shocked' | 'reassuring'
  | 'sending' | 'idea' | 'pointing' | 'petted' | 'resting' | 'asleep' | 'sad' | 'confused' | 'hello' | 'proud';

/** Which picture goes with which look. */
const FACE: Record<Mood, string> = {
  idle: 'idle',
  thinking: 'thinking',
  listening: 'listening',
  glad: 'encouraging',
  worried: 'supportive', // she is having a hard time: he is on her side
  shocked: 'surprised',
  reassuring: 'sent', // the note has gone, with love
  sending: 'sending',
  idea: 'idea',
  pointing: 'pointing',
  petted: 'laughing',
  resting: 'patient',
  asleep: 'comforting',
  sad: 'sad',
  confused: 'confused',
  hello: 'reassuring', // a wave
  proud: 'proud',
};
const FACES = [...new Set(Object.values(FACE))];

const LOOKS: Record<Mood, string> = {
  idle: 'Milo the dog',
  thinking: 'Milo the dog, thinking',
  listening: 'Milo the dog, listening',
  glad: 'Milo the dog, pleased',
  worried: 'Milo the dog, holding a heart for you',
  shocked: 'Milo the dog, surprised',
  reassuring: 'Milo the dog, with the letter sent',
  sending: 'Milo the dog, sending a letter',
  idea: 'Milo the dog, with an idea',
  pointing: 'Milo the dog, pointing',
  petted: 'Milo the dog, laughing',
  resting: 'Milo the dog, waiting patiently',
  asleep: 'Milo the dog, having a nap',
  sad: 'Milo the dog, sorry',
  confused: 'Milo the dog, puzzled',
  hello: 'Milo the dog, waving',
  proud: 'Milo the dog, proud of you',
};

/** After a quiet while he settles, and later naps. Anything she does in the panel wakes him. */
export function useRest(awake: unknown): 'resting' | 'asleep' | null {
  const [rest, setRest] = useState<'resting' | 'asleep' | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const wake = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      setRest(null);
      timers.current = [window.setTimeout(() => setRest('resting'), 45_000), window.setTimeout(() => setRest('asleep'), 150_000)];
    };
    wake();
    const events = ['pointerdown', 'keydown', 'focusin'] as const;
    events.forEach((e) => window.addEventListener(e, wake, true));
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake, true));
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, [awake]);
  return rest;
}

/** The panel's background: a sky that follows his mood, a sun, two clouds and the hill the page rises over. Decoration only. */
export function Field() {
  return (
    <div className="field" aria-hidden="true">
      <i className="field-sun" />
      <svg className="field-cloud one" viewBox="0 0 60 30" width="60" height="30"><path d="M8 26a7 7 0 0 1 1-14 10 10 0 0 1 19-3 9 9 0 0 1 16 4 7 7 0 0 1 4 13z" /></svg>
      <svg className="field-cloud two" viewBox="0 0 60 30" width="46" height="23"><path d="M8 26a7 7 0 0 1 1-14 10 10 0 0 1 19-3 9 9 0 0 1 16 4 7 7 0 0 1 4 13z" /></svg>
      <i className="field-hill far" />
      <i className="field-hill" />
    </div>
  );
}

const DUCK_MS = 150;
const RISE_MS = 380;

export function Buddy({ mood = 'idle', onPet }: { mood?: Mood; onPet?: () => void }) {
  const face = FACE[mood];
  // The look on show lags the look asked for by one duck: down, swap out of sight, up.
  const [shown, setShown] = useState(face);
  const [phase, setPhase] = useState<'still' | 'duck' | 'rise'>('still');
  const host = useRef<HTMLElement | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (face === shown && phase === 'still') return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !!host.current?.closest('.still');
    if (calm) {
      setShown(face);
      setPhase('still');
      return;
    }
    setPhase('duck');
    timers.current.push(
      window.setTimeout(() => {
        setShown(face);
        setPhase('rise');
        timers.current.push(window.setTimeout(() => setPhase('still'), RISE_MS));
      }, DUCK_MS),
    );
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);

  const dog = (
    <>
      <span className="buddy-dog" aria-hidden="true">
        <span className={`buddy-pose ${phase}`}>
          {FACES.map((name) => (
            <img key={name} className={name === shown ? 'on' : ''} src={`/buddy/${name}.webp`} alt="" width="170" height="140" draggable={false} />
          ))}
        </span>
      </span>
      {/* a heart that rises when the note to her helper has gone */}
      <svg className="buddy-heart" viewBox="0 0 32 30" width="32" height="30" aria-hidden="true"><path d="M16 27C9 21 3 17 3 10a6.5 6.5 0 0 1 13-2 6.5 6.5 0 0 1 13 2c0 7-6 11-13 17z" /></svg>
    </>
  );
  if (!onPet) return <span ref={host} className={`buddy buddy-${mood}`} role="img" aria-label={LOOKS[mood]}>{dog}</span>;
  return (
    <button ref={host as React.RefObject<HTMLButtonElement>} type="button" className={`buddy buddy-${mood}`} aria-label={`${LOOKS[mood]}. Press to pet him.`} onClick={onPet}>
      {dog}
    </button>
  );
}
