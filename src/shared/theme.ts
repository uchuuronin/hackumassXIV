// One look for everything Steady draws: notes on the page, the pause pop-up, the helper panel.
// Proposed by C after the Saturday review. Change a colour here and it changes everywhere.
//
// The idea (from the "Accessible Colors 101" sheet C chose): deep navy words on soft pastel shapes,
// flat and bold, with a navy edge so every shape is clear even to someone who can't tell the colours apart.
//   green = the way forward      blue = just so you know      pink = this pays, sends or removes
// The pastels are "Pastel contrasting palette 2": dark text on each is far above 7 to 1.
// Every pair that carries words is checked in tests/theme.contrast.spec.ts.

export const theme = {
  /** The ground of the panel. */
  paper: '#fbf9f4',
  /** Boxes that sit on the paper: fields, cards, plain buttons. */
  card: '#ffffff',
  /** All words, and the edge of every shape. */
  ink: '#1f2b3a',
  /** Small print only. Never for anything that matters. */
  inkQuiet: '#465261',
  /** The edge of a field. */
  edge: '#6b7683',
  /** A hairline between things. Decoration only. */
  hairline: '#e2dccf',
  /** The one main button on a screen, and the safe choice in a pop-up. Navy, like the words. */
  main: '#1f2b3a',
  onMain: '#ffffff',
  /** Steady's own colour: the little helper in the panel, and small touches of cheer. */
  sun: '#ffd84a',
  teal: '#16808f',
  coral: '#e8605d',
  /** The keyboard focus ring. */
  focus: '#1d5fd0',
  /** Behind a pop-up, and around a spotlit step. */
  veil: 'rgba(31, 43, 58, 0.55)',
  tones: {
    go: { line: '#2f6b2a', soft: '#cfebb6', deep: '#b9e192' },
    info: { line: '#2c4a9e', soft: '#cdd9fa', deep: '#b3c7f7' },
    careful: { line: '#a3245c', soft: '#f8b8d0', deep: '#f194b8' },
  },
  font: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial, sans-serif',
  radius: 12,
  /** A soft shadow for things that float over a page. */
  shadow: '0 8px 24px rgba(31, 43, 58, 0.18), 0 1px 3px rgba(31, 43, 58, 0.14)',
  /** How far a button sits above its base, and sinks when pressed. */
  depth: 4,
  /** Nothing moves suddenly, and nothing takes long. Milliseconds. */
  motion: { appear: 240, press: 110, ease: 'cubic-bezier(.22, 1, .36, 1)' },
} as const;

export type ToneName = keyof typeof theme.tones;

/** A colour with some see-through, for the highlight that sits over a button or a line of words. */
export function wash(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** For any stylesheet: things fade in gently, and stay still for people who have asked their computer for less motion. */
export const gentleCss = `
  @keyframes steady-appear { from { opacity: 0; } to { opacity: 1; } }
  .steady-appear { animation: steady-appear ${theme.motion.appear}ms ${theme.motion.ease} both; }
  @media (prefers-reduced-motion: reduce) { .steady-appear { animation: none; } }
`;
