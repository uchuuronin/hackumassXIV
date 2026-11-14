// The calm look must still be easy to read. Every pair of colours that carries words is checked here.
import { expect, test } from '@playwright/test';
import { theme } from '../src/shared/theme';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test('words are at least 7 to 1 against what they sit on', () => {
  const pairs: Array<[string, string, string]> = [
    ['ink on paper', theme.ink, theme.paper],
    ['ink on card', theme.ink, theme.card],
    ['ink on the go note', theme.ink, theme.tones.go.soft],
    ['ink on the info note', theme.ink, theme.tones.info.soft],
    ['ink on the careful note', theme.ink, theme.tones.careful.soft],
    ['quiet ink on paper', theme.inkQuiet, theme.paper],
  ];
  for (const [name, text, ground] of pairs) expect(contrast(text, ground), name).toBeGreaterThanOrEqual(7);
});

test('button words and the coloured edges are clear too', () => {
  expect(contrast(theme.onMain, theme.main), 'words on the main button').toBeGreaterThanOrEqual(4.5);
  for (const tone of Object.values(theme.tones)) {
    // A ring or an edge is a shape, not words: 3 to 1 against the page and against its own note.
    expect(contrast(tone.line, theme.paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(tone.line, tone.soft)).toBeGreaterThanOrEqual(3);
  }
  expect(contrast(theme.focus, theme.paper), 'focus ring').toBeGreaterThanOrEqual(3);
  expect(contrast(theme.edge, theme.card), 'box edges').toBeGreaterThanOrEqual(3);
});
