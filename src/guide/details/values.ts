// Which of the person's details goes in which box, and in what form the box wants it.

import type { MyDetails } from '@/shared/details';
import type { FillKey } from '@/shared/pagemap';

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const COUNTRIES: Record<string, string[]> = {
  'united states': ['us', 'usa', 'united states of america', 'u.s.', 'u.s.a.', 'america'],
  'united kingdom': ['uk', 'gb', 'great britain', 'u.k.'],
  canada: ['ca'],
};

/** What "My details" holds for this kind of box, or '' if nothing is saved for it. */
export function valueFor(key: FillKey, d: MyDetails, form: { hasSecondAddressLine: boolean }): string {
  const join = (...parts: Array<string | undefined>) => parts.map((p) => p?.trim()).filter(Boolean).join(' ');
  switch (key) {
    case 'name':
      return join(d.givenName, d.familyName);
    case 'given-name':
      return d.givenName?.trim() ?? '';
    case 'family-name':
      return d.familyName?.trim() ?? '';
    case 'email':
      return d.email?.trim() ?? '';
    case 'tel':
      return d.phone?.trim() ?? '';
    case 'street-address':
    case 'address-line1': {
      const one = d.addressLine1?.trim() ?? '';
      const two = d.addressLine2?.trim() ?? '';
      // A form with one address box gets both lines, so the flat number is not lost.
      return one && two && !form.hasSecondAddressLine ? `${one}, ${two}` : one;
    }
    case 'address-line2':
      return d.addressLine2?.trim() ?? '';
    case 'address-level2':
      return d.city?.trim() ?? '';
    case 'address-level1':
      return d.state?.trim() ?? '';
    case 'postal-code':
      return d.postalCode?.trim() ?? '';
    case 'country':
      return d.country?.trim() ?? '';
  }
}

/** Other ways a form might write the same thing: "Massachusetts" and "MA". */
function sameAs(value: string): string[] {
  const v = value.trim().toLowerCase();
  const out = [v];
  if (STATES[v]) out.push(STATES[v].toLowerCase());
  const fullState = Object.keys(STATES).find((name) => STATES[name]!.toLowerCase() === v);
  if (fullState) out.push(fullState);
  for (const [name, others] of Object.entries(COUNTRIES)) {
    if (v === name || others.includes(v)) out.push(name, ...others);
  }
  return out;
}

/** The option of a dropdown that means the same as the saved value, or null. Never a near miss. */
export function matchOption(select: HTMLSelectElement, value: string): HTMLOptionElement | null {
  const wanted = sameAs(value);
  for (const want of wanted) {
    for (const option of select.options) {
      if (option.disabled) continue;
      if (option.value.trim().toLowerCase() === want || option.label.trim().toLowerCase() === want) return option;
    }
  }
  return null;
}

/** Plain words for what a box wants, for the "Show me" level. */
export const WANTS: Record<FillKey, string> = {
  name: 'your name',
  'given-name': 'your first name',
  'family-name': 'your last name',
  email: 'your email',
  tel: 'your phone number',
  'street-address': 'your street address',
  'address-line1': 'the first line of your address',
  'address-line2': 'the second line of your address, such as an apartment number',
  'address-level2': 'your town or city',
  'address-level1': 'your state',
  'postal-code': 'your ZIP or postal code',
  country: 'your country',
};
