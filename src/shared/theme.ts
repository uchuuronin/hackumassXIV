// One calm look for everything Steady draws: notes on the page, the pause pop-up, the helper panel.
// Proposed by C after the Saturday review ("a calm, safe space"). Change a colour here and it changes everywhere.
//
// The idea: warm paper, deep ink, and colour only as a quiet edge. No bright filled boxes.
//   green  = the way forward          blue = just so you know          clay = this pays, sends or removes
// Every pair that carries words is checked in tests/theme.contrast.spec.ts.

export const theme = {
  /** The ground of the panel and of notes. */
  paper: '#fbf7ef',
  /** Boxes that sit on the paper: fields, cards, plain buttons. */
  card: '#ffffff',
  /** All words. */
  ink: '#22303a',
  /** Small print only. Never for anything that matters. */
  inkQuiet: '#46545f',
  /** The edge of a field or a plain button. */
  edge: '#77828c',
  /** A hairline around a note or card. Decoration only. */
  hairline: '#ddd5c6',
  /** The one main button on a screen, and the safe choice in a pop-up. */
  main: '#2c6455',
  onMain: '#ffffff',
  /** The keyboard focus ring. */
  focus: '#1f4f8f',
  /** Behind a pop-up, and around a spotlit step. Dark enough to quiet the page, light enough to still read it. */
  veil: 'rgba(34, 48, 58, 0.5)',
  tones: {
    go: { line: '#2c6455', soft: '#e7f1ec' },
    info: { line: '#3d5a80', soft: '#e9eef5' },
    careful: { line: '#8a4b12', soft: '#f8ecdc' },
  },
  font: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  radius: 10,
  shadow: '0 6px 20px rgba(34, 48, 58, 0.16), 0 1px 3px rgba(34, 48, 58, 0.12)',
  /** Nothing moves suddenly, and nothing takes long. Milliseconds. */
  motion: { appear: 240, press: 120, ease: 'cubic-bezier(.22, 1, .36, 1)' },
} as const;

export type ToneName = keyof typeof theme.tones;

/** For any stylesheet: things fade in gently, and stay still for people who have asked their computer for less motion. */
export const gentleCss = `
  @keyframes steady-appear { from { opacity: 0; } to { opacity: 1; } }
  .steady-appear { animation: steady-appear ${theme.motion.appear}ms ${theme.motion.ease} both; }
  @media (prefers-reduced-motion: reduce) { .steady-appear { animation: none; } }
`;
