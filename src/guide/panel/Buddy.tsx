// Steady's face in the panel: a small sun-coloured friend who breathes, blinks and listens.
// Flat shapes only, in the shared colours. Owner: C. It stays still for people who have asked for less motion.

import { theme } from '@/shared/theme';

export type Mood = 'idle' | 'thinking' | 'listening' | 'glad';

export function Buddy({ mood = 'idle', size = 72 }: { mood?: Mood; size?: number }) {
  return (
    <svg className={`buddy buddy-${mood}`} width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Steady">
      {/* a soft shadow on the ground */}
      <ellipse className="buddy-ground" cx="48" cy="88" rx="26" ry="5" fill="#0f1822" />
      <g className="buddy-body">
        {/* sound waves, only while listening */}
        <g className="buddy-waves" fill="none" stroke={theme.tones.info.deep} strokeWidth="4" strokeLinecap="round">
          <path d="M10 40 Q4 48 10 56" />
          <path d="M86 40 Q92 48 86 56" />
        </g>
        <path d="M48 10 C72 10 86 26 86 48 C86 70 72 84 48 84 C24 84 10 70 10 48 C10 26 24 10 48 10 Z" fill={theme.sun} stroke={theme.ink} strokeWidth="4" />
        {/* cheeks */}
        <circle cx="27" cy="56" r="6" fill={theme.tones.careful.deep} />
        <circle cx="69" cy="56" r="6" fill={theme.tones.careful.deep} />
        {/* eyes */}
        <g className="buddy-eyes" fill={theme.ink}>
          <ellipse cx="36" cy="44" rx="5" ry="7" />
          <ellipse cx="60" cy="44" rx="5" ry="7" />
        </g>
        {/* mouth: a small smile, a wide one when glad, a little "o" while thinking */}
        <path className="buddy-smile" d="M38 60 Q48 68 58 60" fill="none" stroke={theme.ink} strokeWidth="4" strokeLinecap="round" />
        <path className="buddy-grin" d="M34 58 Q48 74 62 58 Z" fill={theme.ink} />
        <circle className="buddy-oh" cx="48" cy="63" r="4" fill={theme.ink} />
      </g>
    </svg>
  );
}
