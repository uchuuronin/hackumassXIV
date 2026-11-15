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
