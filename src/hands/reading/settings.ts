// Reading adjustments: what can be changed, and the style sheet that makes it so. Owner: A. Pure, no page access.
// Approach for colour: the standard colour-vision matrices (Machado, Oliveira and Fernandes, 2009) are the
// "what a colour-blind eye sees" step. Correcting for it means moving what would be lost into channels the
// person can tell apart (the usual "daltonize" method). Written here from the published numbers, not copied.

export type Spacing = 'normal' | 'roomy' | 'extra';
export type FontChoice = 'page' | 'plain' | 'serif';
export type Contrast = 'normal' | 'high' | 'dark';
export type Colour = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'warm';

export interface ReadingSettings {
  /** Page zoom in percent. Done with the browser's own zoom, so layouts reflow properly. */
  sizePct: number;
  spacing: Spacing;
  font: FontChoice;
  contrast: Contrast;
  colour: Colour;
  /** Mark prices, totals and anything that renews. */
  highlight: boolean;
  /** How fast read aloud speaks. 1 is normal. */
  rate: number;
}

export const DEFAULT_READING: ReadingSettings = {
  sizePct: 100,
  spacing: 'normal',
  font: 'page',
  contrast: 'normal',
  colour: 'none',
  highlight: false,
  rate: 0.9,
};

export const SIZE_STEPS = [100, 110, 125, 150, 175, 200, 250] as const;
export const SPACINGS: Spacing[] = ['normal', 'roomy', 'extra'];
export const FONTS: FontChoice[] = ['page', 'plain', 'serif'];
export const CONTRASTS: Contrast[] = ['normal', 'high', 'dark'];
export const COLOURS: Colour[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'warm'];

/** Plain words for each choice, for buttons and for the helper to say. */
export const WORDS = {
  spacing: { normal: 'Normal', roomy: 'More space', extra: 'Most space' },
  font: { page: "Page's own", plain: 'Plain', serif: 'Serif' },
  contrast: { normal: 'Normal', high: 'Stronger', dark: 'Dark' },
  colour: { none: 'Normal', protanopia: 'Red-weak', deuteranopia: 'Green-weak', tritanopia: 'Blue-weak', warm: 'Warm (less blue)' },
} as const;

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/** What a person with each kind of colour blindness sees, at full strength. Rows are the new red, green, blue. */
export const SIMULATE: Record<'protanopia' | 'deuteranopia' | 'tritanopia', Matrix> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

/** Where the lost difference goes: red-green types push it into blue and green; blue-yellow into red and green. */
const SHIFT: Record<'protanopia' | 'deuteranopia' | 'tritanopia', Matrix> = {
  protanopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  deuteranopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  tritanopia: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]],
};

/** The one matrix that does it all: new colour = colour + shift of (colour − what they'd see). */
export function correctionMatrix(kind: 'protanopia' | 'deuteranopia' | 'tritanopia'): number[][] {
  const s = SIMULATE[kind];
  const m = SHIFT[kind];
  const err = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) - (s[i]?.[j] ?? 0)));
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + [0, 1, 2].reduce((sum, k) => sum + (m[i]?.[k] ?? 0) * (err[k]?.[j] ?? 0), 0)));
}

/** The values="" text for an SVG feColorMatrix. */
export function svgMatrix(kind: 'protanopia' | 'deuteranopia' | 'tritanopia'): string {
  return correctionMatrix(kind)
    .map((row) => `${row.map((v) => v.toFixed(5)).join(' ')} 0 0`)
    .join(' ')
    .concat(' 0 0 0 1 0');
}

export const FILTER_ID = 'steady-colour-filter';
const SKIP_FONT = ':not(i):not(svg):not(svg *):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"]):not([class*="material"])';
const FONT_STACK: Record<Exclude<FontChoice, 'page'>, string> = {
  plain: 'Verdana, "Segoe UI", system-ui, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};
const SPACE: Record<Exclude<Spacing, 'normal'>, string> = {
  roomy: 'line-height: 1.7 !important; letter-spacing: 0.03em !important; word-spacing: 0.08em !important;',
  extra: 'line-height: 2 !important; letter-spacing: 0.07em !important; word-spacing: 0.16em !important;',
};

/** True when nothing differs from the page as it was. */
export function isPlain(s: ReadingSettings): boolean {
  return s.sizePct === DEFAULT_READING.sizePct && s.spacing === 'normal' && s.font === 'page' && s.contrast === 'normal' && s.colour === 'none' && !s.highlight;
}

/** The page's own background colour, so the area behind the page body matches what the filter does to the body. */
const DARK_CANVAS = '#0b0b0b';

/**
 * The style sheet for these settings. Size is not here: it is the browser's zoom.
 * The filter goes on the page body, not the whole page: a filter on the root makes it the anchor for every fixed
 * element, which threw Milo's own bar and labels off screen. Milo's pop-ups sit outside the body, so they
 * keep their own colours and their place. `canvas` is the body's background colour, when it has one.
 */
export function buildCss(s: ReadingSettings, canvas?: string, alreadyDark = false): string {
  const rules: string[] = [];
  // A page that is already dark has nothing to turn dark: flipping it would make it light.
  const invert = s.contrast === 'dark' && !alreadyDark;
  if (s.spacing !== 'normal') rules.push(`body, body * { ${SPACE[s.spacing]} }`);
  if (s.font !== 'page') rules.push(`body, body *${SKIP_FONT} { font-family: ${FONT_STACK[s.font]} !important; }`);

  const filters: string[] = [];
  if (s.contrast === 'high') filters.push('contrast(1.3)');
  if (invert) filters.push('invert(1) hue-rotate(180deg)');
  if (s.colour === 'warm') filters.push('sepia(0.25) saturate(0.95) brightness(0.97)');
  else if (s.colour !== 'none') filters.push(`url(#${FILTER_ID})`);
  if (filters.length) {
    // With the filter on the body, the page behind it needs a colour that fits: dark for dark, the body's own otherwise.
    const behind = invert ? DARK_CANVAS : canvas;
    if (behind) rules.push(`html { background-color: ${behind} !important; }`);
    rules.push(`body { filter: ${filters.join(' ')} !important; }`);
  }
  // Put pictures back the right way round.
  if (invert) rules.push('body img, body picture, body video, body canvas, body svg image { filter: invert(1) hue-rotate(180deg) !important; }');
  if (s.highlight) {
    rules.push(
      '::highlight(steady-total) { background-color: #ffe066; color: #1f2b3a; }',
      '::highlight(steady-renews) { background-color: #ffb86b; color: #1f2b3a; }',
      '::highlight(steady-amount) { background-color: #fff1a8; color: #1f2b3a; }',
    );
  }
  return rules.join('\n');
}

/** Move to the next choice in a list, wrapping round. */
export function nextOf<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length] as T;
}

/** The size step above or below. Stays inside the list. */
export function stepSize(current: number, direction: 1 | -1): number {
  const steps = SIZE_STEPS as readonly number[];
  if (direction > 0) return steps.find((v) => v > current) ?? (steps[steps.length - 1] as number);
  return [...steps].reverse().find((v) => v < current) ?? (steps[0] as number);
}

/** Settings read back from storage can be anything. Keep what makes sense, and the default for the rest. */
export function sanitize(raw: unknown): ReadingSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
  const size = typeof r.sizePct === 'number' && r.sizePct >= 50 && r.sizePct <= 300 ? Math.round(r.sizePct) : DEFAULT_READING.sizePct;
  const rate = typeof r.rate === 'number' && r.rate >= 0.5 && r.rate <= 2 ? r.rate : DEFAULT_READING.rate;
  return {
    sizePct: size,
    spacing: pick(SPACINGS, r.spacing, 'normal'),
    font: pick(FONTS, r.font, 'page'),
    contrast: pick(CONTRASTS, r.contrast, 'normal'),
    colour: pick(COLOURS, r.colour, 'none'),
    highlight: r.highlight === true,
    rate,
  };
}

/** Is this CSS colour (rgb or rgba) a dark one? Anything that cannot be read counts as light. */
export function isDarkColour(css: string | undefined): boolean {
  const m = css?.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) return false;
  const r = Number(m[1]) / 255;
  const g = Number(m[2]) / 255;
  const b = Number(m[3]) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}
