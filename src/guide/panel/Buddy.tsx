// Steady's face in the panel: a small sun-coloured friend who breathes, blinks and listens.
// Flat shapes only, in the shared colours. Owner: C.
//
// The face follows the conversation, so she can see it heard how she said something as well as what:
//   glad        things are going well: a wide smile and a little hop
//   worried     she seems to be having a hard time: the colour cools, the brows lift, the smile goes
//   shocked     she pressed "I'm stuck": wide eyes and an exclamation mark, for a moment
//   reassuring  help is on its way: warm again, eyes closed in a smile, one slow nod
// Every face is there all the time and they fade between each other, so a change is never a jump.
// People who have asked for less motion get the colours and the faces without the movement.

import { theme } from '@/shared/theme';

export type Mood = 'idle' | 'thinking' | 'listening' | 'glad' | 'worried' | 'shocked' | 'reassuring';

const LOOKS: Record<Mood, string> = {
  idle: 'Steady',
  thinking: 'Steady, thinking',
  listening: 'Steady, listening',
  glad: 'Steady, pleased',
  worried: 'Steady, concerned',
  shocked: 'Steady, surprised',
  reassuring: 'Steady, reassuring',
};

export function Buddy({ mood = 'idle', size = 72 }: { mood?: Mood; size?: number }) {
  return (
    <svg className={`buddy buddy-${mood}`} width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={LOOKS[mood]}>
      {/* a soft shadow on the ground */}
      <ellipse className="buddy-ground" cx="48" cy="88" rx="26" ry="5" fill="#0f1822" />
      <g className="buddy-body">
        {/* sound waves, only while listening */}
        <g className="buddy-waves" fill="none" stroke={theme.tones.info.deep} strokeWidth="4" strokeLinecap="round">
          <path d="M10 40 Q4 48 10 56" />
          <path d="M86 40 Q92 48 86 56" />
        </g>
        <path className="buddy-face" d="M48 10 C72 10 86 26 86 48 C86 70 72 84 48 84 C24 84 10 70 10 48 C10 26 24 10 48 10 Z" fill={theme.sun} stroke={theme.ink} strokeWidth="4" />
        {/* cheeks */}
        <g className="buddy-cheeks" fill={theme.tones.careful.deep}>
          <circle cx="27" cy="56" r="6" />
          <circle cx="69" cy="56" r="6" />
        </g>
        {/* brows, only when concerned: the inner ends lift */}
        <g className="buddy-brows buddy-part" fill="none" stroke={theme.ink} strokeWidth="3.5" strokeLinecap="round">
          <path d="M28 34 L41 30" />
          <path d="M55 30 L68 34" />
        </g>
        {/* eyes: open (they blink, and widen when surprised), or closed in a smile */}
        <g className="buddy-eyes" fill={theme.ink}>
          <g className="buddy-open buddy-part">
            <ellipse cx="36" cy="44" rx="5" ry="7" />
            <ellipse cx="60" cy="44" rx="5" ry="7" />
          </g>
        </g>
        <g className="buddy-closed buddy-part" fill="none" stroke={theme.ink} strokeWidth="4" strokeLinecap="round">
          <path d="M30 46 Q36 39 42 46" />
          <path d="M54 46 Q60 39 66 46" />
        </g>
        {/* mouths: a small smile, a wide one when glad, a little "o" while thinking or surprised, a flat line when concerned */}
        <path className="buddy-smile buddy-part" d="M38 60 Q48 68 58 60" fill="none" stroke={theme.ink} strokeWidth="4" strokeLinecap="round" />
        <path className="buddy-grin buddy-part" d="M34 58 Q48 74 62 58 Z" fill={theme.ink} />
        <circle className="buddy-oh buddy-part" cx="48" cy="63" r="4" fill={theme.ink} />
        <path className="buddy-flat buddy-part" d="M40 65 Q48 61 56 65" fill="none" stroke={theme.ink} strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* "!" when she says she's stuck. Outside the body, so it doesn't breathe with it, and drawn last so it sits on top. */}
      <g className="buddy-bang" fill={theme.coral} stroke={theme.ink} strokeWidth="3" strokeLinejoin="round">
        <path d="M84 -4 h11 l-2 20 h-7 Z" />
        <circle cx="89.5" cy="24" r="4.6" />
      </g>
    </svg>
  );
}
