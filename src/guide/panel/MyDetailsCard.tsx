// The "My details" card, for B's helper panel:  <MyDetailsCard />
// Where the person, or a family member setting Milo up, types what Milo may fill in on forms.
// The plan: name, address, phone and email. It stays on the device. There is no box for a card,
// a password or a date of birth, on purpose.
//
// Interface rules kept here: text at least 18px, buttons and boxes at least 48px tall, a light
// background, plain sentences, every box labelled, works by keyboard, nothing is lost by stopping.

import { theme } from '@/shared/theme';
import { useEffect, useState, type FormEvent } from 'react';
import { DETAILS_KEY, type MyDetails } from '@/shared/details';
import { deviceStore } from '@/shared/device-store';
import type { StorePort } from '@/shared/ports';

/** key, label, the browser's autofill hint (so Chrome can help fill this card in), input type */
const BOXES: Array<[keyof MyDetails, string, string, string?]> = [
  ['givenName', 'First name', 'given-name'],
  ['familyName', 'Last name', 'family-name'],
  ['email', 'Email', 'email', 'email'],
  ['phone', 'Phone', 'tel', 'tel'],
  ['addressLine1', 'Street address', 'address-line1'],
  ['addressLine2', 'Apartment or unit (if you have one)', 'address-line2'],
  ['city', 'Town or city', 'address-level2'],
  ['state', 'State', 'address-level1'],
  ['postalCode', 'ZIP code', 'postal-code'],
  ['country', 'Country', 'country-name'],
];

const CSS = `
.sd-card { font: 18px/1.5 ${theme.font}; color: ${theme.ink}; background: ${theme.paper}; padding: 20px; max-width: 520px; }
.sd-card h2 { font-size: 26px; margin: 0 0 8px; }
.sd-card p { font-size: 18px; margin: 0 0 12px; }
.sd-card label { display: block; font-size: 18px; font-weight: 600; margin: 14px 0 4px; }
.sd-card input { display: block; width: 100%; min-height: 48px; padding: 8px 12px; font: inherit; font-size: 20px; color: ${theme.ink}; background: ${theme.card}; border: 2px solid ${theme.edge}; border-radius: ${theme.radius}px; box-sizing: border-box; }
.sd-card button { min-height: 48px; padding: 8px 20px; font: inherit; font-size: 18px; font-weight: 600; border-radius: ${theme.radius}px; cursor: pointer; margin: 18px 12px 0 0; }
.sd-card .sd-main { background: ${theme.main}; color: ${theme.onMain}; border: 2px solid ${theme.main}; }
.sd-card .sd-plain { background: ${theme.card}; color: ${theme.ink}; border: 2px solid ${theme.edge}; }
.sd-card input:focus-visible, .sd-card button:focus-visible { outline: 4px solid ${theme.focus}; outline-offset: 3px; }
.sd-card .sd-status { min-height: 28px; margin-top: 14px; font-weight: 600; }
.sd-card .sd-ask { background: ${theme.tones.careful.soft}; border: 1px solid ${theme.hairline}; border-left: 6px solid ${theme.tones.careful.line}; border-radius: ${theme.radius}px; padding: 12px 16px; margin-top: 18px; }
`;

export function MyDetailsCard({ store = deviceStore }: { store?: StorePort }) {
  const [details, setDetails] = useState<MyDetails>({});
  const [status, setStatus] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let live = true;
    store.get<MyDetails>(DETAILS_KEY).then((saved) => live && saved && setDetails(saved));
    return () => {
      live = false;
    };
  }, [store]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const tidy: MyDetails = {};
    for (const [key] of BOXES) {
      const value = details[key]?.trim();
      if (value) tidy[key] = value;
    }
    await store.set(DETAILS_KEY, tidy);
    setDetails(tidy);
    setStatus('Saved. These stay on this computer.');
  };

  const remove = async () => {
    await store.remove(DETAILS_KEY);
    setDetails({});
    setAsking(false);
    setStatus('Removed. Nothing is saved now.');
  };

  return (
    <section className="sd-card" aria-labelledby="sd-title">
      <style>{CSS}</style>
      <h2 id="sd-title">My details</h2>
      <p>Milo can put these in forms for you. It asks first, and you check them before you go on.</p>
      <p>Fill in only what you want to. These stay on this computer.</p>
      <p>Milo never saves card numbers or passwords.</p>
      <form onSubmit={save} noValidate>
        {BOXES.map(([key, label, hint, type]) => (
          <div key={key}>
            <label htmlFor={`sd-${key}`}>{label}</label>
            <input
              id={`sd-${key}`}
              type={type ?? 'text'}
              autoComplete={hint}
              value={details[key] ?? ''}
              onChange={(e) => {
                setDetails({ ...details, [key]: e.target.value });
                setStatus('');
              }}
            />
          </div>
        ))}
        <button className="sd-main" type="submit">
          Save my details
        </button>
        {!asking && (
          <button className="sd-plain" type="button" onClick={() => setAsking(true)}>
            Remove my details
          </button>
        )}
      </form>
      {asking && (
        <div className="sd-ask">
          <p>Remove everything saved here?</p>
          <button className="sd-plain" type="button" onClick={() => setAsking(false)}>
            No, keep them
          </button>
          <button className="sd-plain" type="button" onClick={remove}>
            Yes, remove them
          </button>
        </div>
      )}
      <p className="sd-status" role="status">
        {status}
      </p>
    </section>
  );
}
