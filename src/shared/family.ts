// Feature 12, "I'm stuck": the person who helps, and the one short message Steady may send them.
// Owner: C. Shared because the background worker sends it and the relay turns it into an email.

export const HELPER_KEY = 'guide:helper';

/** The person she would ring if she got stuck. Kept on this computer. */
export interface Helper {
  name: string;
  email: string;
  /** Who they are to her, in her word: "daughter", "neighbour". Optional. Never sent anywhere. */
  relation?: string;
}

/**
 * Everything that leaves the computer when she presses "I'm stuck". There is deliberately no field
 * for the website, the page, or anything she typed: the task's name and the step number only.
 */
export interface StuckNote {
  to: string;
  helperName: string;
  fromName: string;
  task?: string;
  step?: number;
  of?: number;
  /**
   * Only when she has switched reply notes on: the secret of her Steady's inbox, so the relay can put a
   * link in the email and bring a short note back. It says nothing about her, the page or what she typed.
   */
  replyInbox?: string;
}

// ---- Linking a helper's computer, and notes that come back ----

/** Her Steady's own secret. Made on this computer; the relay keeps only a fingerprint of it. */
export const INBOX_KEY = 'guide:inbox';
/** On her computer: whether a helper's computer is linked. */
export const LINK_KEY = 'guide:link';
/** On the helper's computer: the token that lets Send put a task on her computer. */
export const HELPS_KEY = 'guide:helps';
/** On her computer: reply notes switched on. Off unless she ticks it. */
export const REPLY_KEY = 'guide:reply-notes';

/** A note from her helper, as it arrives. Plain text. */
export interface HelperNote {
  text: string;
  from: string;
  task?: string;
  step?: number;
}

/** A secret for this computer's inbox: 16 random bytes, written as 32 letters and digits. */
export function newSecret(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Page or panel to the background worker. */
export interface StuckSend {
  type: 'stuck/send';
  note: StuckNote;
}
export interface StuckSent {
  type: 'stuck/sent';
  ok: boolean;
}
