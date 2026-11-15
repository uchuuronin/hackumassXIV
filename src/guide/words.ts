// What Steady says at a field it will not fill. Calm, plain, and never a hurry.
// Used by guided steps and "Fill in my details" (C). The helper (B) can read these aloud as they are.

import type { SecretKind } from '@/shared/pagemap';

const WORDS: Record<SecretKind, string> = {
  password: "That's your password, so you type this one. I never see passwords and I never keep them.",
  'card-number': "That's the long number across the front of your card. You type this one. I never touch card details.",
  'card-expiry': "That's the date on your card. Month first, then the year.",
  'card-code': "Those are the three numbers on the back of your card.",
  'card-name': 'Type your name just as it\'s printed on your card.',
  'one-time-code': 'Check your phone for a text message, then type the numbers from it here. No rush.',
  'id-number':
    'This is asking for an ID number. Only type it if you\'re sure this website should have it. It\'s fine to stop and ask someone first.',
  'bank-account':
    'This is asking for your bank details. Only type them if you\'re sure this website should have them. It\'s fine to stop and ask someone first.',
  'gift-card':
    'This is asking for a gift card number. Real companies almost never ask to be paid that way. I\'d check with someone you trust before going any further.',
  'date-of-birth': "That's your date of birth. You pick this one.",
};

/** The sentence for a field Steady leaves to the person. */
export function typeItYourself(secret: SecretKind): string {
  return WORDS[secret];
}
