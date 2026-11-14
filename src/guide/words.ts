// What Steady says at a field it will not fill. Calm, plain, and never a hurry.
// Used by guided steps and "Fill in my details" (C). The helper (B) can read these aloud as they are.

import type { SecretKind } from '@/shared/pagemap';

const WORDS: Record<SecretKind, string> = {
  password: 'This is your password. Please type this one yourself. Steady never sees or keeps passwords.',
  'card-number': 'This is the long number across the front of your card. Please type this one yourself.',
  'card-expiry': 'This is the date on your card, the month and then the year. Please type this one yourself.',
  'card-code': 'This is the three numbers on the back of your card. Please type this one yourself.',
  'card-name': 'Type your name the way it is printed on your card.',
  'one-time-code': 'Look for a text message on your phone, then type the numbers from it here. There is no rush.',
  'id-number':
    'This asks for an ID number. Please type this one yourself, and only if you are sure this website should have it. It is fine to stop and ask someone first.',
  'bank-account':
    'This asks for your bank details. Please type this one yourself, and only if you are sure this website should have them. It is fine to stop and ask someone first.',
  'gift-card':
    'This asks for a gift card number. Real companies almost never ask to be paid with gift cards. It is a good idea to check with someone you trust before going on.',
  'date-of-birth': 'This is your date of birth. Please choose this one yourself.',
};

/** The sentence for a field Steady leaves to the person. */
export function typeItYourself(secret: SecretKind): string {
  return WORDS[secret];
}
