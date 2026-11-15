// The guide lane's own switches: the things it does without being asked. Owner: C.
// Each lane lists its own switches (the tracker's "pieces that had no owner"); B's settings screen shows them.
//
// These are about how much Steady says and remembers, never about protection. Turning every one of
// them off leaves the advert check, Pay Pause and the other warnings exactly as they were.

export const GUIDE_SWITCH_KEY = 'guide:switches';

export type GuideSwitchId = 'walk' | 'hints' | 'nudges' | 'calm' | 'trail' | 'lastTime' | 'timeout' | 'motion';
export type GuideSwitches = Record<GuideSwitchId, boolean>;

export const GUIDE_SWITCHES: Array<{ id: GuideSwitchId; label: string; hint: string }> = [
  { id: 'walk', label: 'Go through pages with me', hint: 'When you press "What do I click?", I ask what you\'re here for and take it one question at a time. Off: I only say what the buttons do.' },
  { id: 'hints', label: 'Suggest things as I browse', hint: 'A short line when a page opens, such as "I can help you fill this in". Off: I say nothing until you ask.' },
  { id: 'nudges', label: 'Check in if I seem stuck', hint: 'During a saved task, I say the step again after a while, and offer help if clicks keep missing. Off: I wait for you.' },
  { id: 'calm', label: 'Calm the page during a task', hint: 'While I take you through something, adverts and pop-ups are dimmed and videos that started by themselves are paused. Everything is put back afterwards.' },
  { id: 'trail', label: 'Remember my place', hint: 'I keep ordinary boxes you filled in, on this computer, so "Where was I?" can put them back. Off: nothing is kept, and what I had is forgotten.' },
  { id: 'lastTime', label: 'Mention what I picked last time', hint: 'In a saved task, such as which doctor and which day. Off: nothing is kept, and what I had is forgotten.' },
  { id: 'timeout', label: 'Warn me before a page times out', hint: 'Some pages log you out if you take a while. I say so when I see the warning.' },
  // Anything that keeps moving by itself needs a way to stop it (WCAG 2.2.2). This is that way, for the panel.
  { id: 'motion', label: 'Let my face move', hint: 'My face breathes and blinks, and the little lights along the top twinkle. Off: everything in this panel keeps still. My face still changes, without moving.' },
];

export const ALL_ON: GuideSwitches = { walk: true, hints: true, nudges: true, calm: true, trail: true, lastTime: true, timeout: true, motion: true };
/**
 * "Keep it light": for someone who wants Steady there when asked and quiet otherwise. It stops the talking,
 * not the remembering or the warnings.
 */
export const LIGHT: GuideSwitches = { ...ALL_ON, walk: false, hints: false, nudges: false };

/** Whatever was saved, made whole: anything missing or odd counts as on. */
export function readSwitches(saved: unknown): GuideSwitches {
  const kept = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const out = { ...ALL_ON };
  for (const s of GUIDE_SWITCHES) if (typeof kept[s.id] === 'boolean') out[s.id] = kept[s.id] as boolean;
  return out;
}
