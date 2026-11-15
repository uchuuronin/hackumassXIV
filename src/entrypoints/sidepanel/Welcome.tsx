// The first-run welcome: four short steps, shown once. Owner: B.
import { useEffect, useRef, useState } from 'react';

interface Props {
  say: (t: string) => void;
  onMic: () => void;
  onSkip: () => void;
  onDetails: () => void;
  /** The linking step (supplied by the guide lane, C): go to "Who helps you". */
  onHelper: () => void;
  onDone: () => void;
}

const STEPS = [
  { title: 'Hello. I am Steady.', body: 'I am a calm helper for the web. I can find buttons for you, fill in forms, and stop you before you pay. I only check and remind. I never pay or send anything for you.' },
  { title: 'You can talk to me', body: 'Press "Talk to me" and say what you need, instead of typing. I need your OK to use the microphone first.' },
  { title: 'Save your details once', body: 'Add your name and address, and I can fill in forms after asking you first. They stay on this computer.' },
  // The linking step, from the guide lane (C). Nobody is added or linked here: it only takes her to the place where she can do it.
  { title: 'Does someone help you?', body: 'If a daughter, a son or a friend helps you with the computer, you can add them. Then "I\'m stuck" can let them know, and they can set up tasks for you from their own computer. You choose this, and you can undo it at any time.' },
] as const;

export function Welcome({ say, onMic, onSkip, onDetails, onHelper, onDone }: Props) {
  const [step, setStep] = useState(0);
  const s = STEPS[step] ?? STEPS[0];

  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    say(`${s.title} ${s.body}`);
    // After "Next", focus goes to the new step's title, so a screen reader reads it and Tab starts from the top.
    if (!first.current) heading.current?.focus();
    first.current = false;
  }, [step]);

  return (
    <section className="card">
      <p className="count">Step {step + 1} of {STEPS.length}</p>
      <h2 ref={heading} tabIndex={-1}>{s.title}</h2>
      <p>{s.body}</p>
      <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
        {step === 1 && <button type="button" className="btn main" onClick={onMic}>Allow the microphone</button>}
        {step === 2 && <button type="button" className="btn main" onClick={onDetails}>Add my details</button>}
        {step === 3 && <button type="button" className="btn main" onClick={onHelper}>Add the person who helps me</button>}
        {step < STEPS.length - 1
          ? <button type="button" className="btn main" onClick={() => setStep(step + 1)}>Next</button>
          : <button type="button" className="btn quiet" onClick={onDone}>Maybe later</button>}
        <button type="button" className="btn quiet" onClick={onSkip}>Skip this</button>
      </div>
    </section>
  );
}
