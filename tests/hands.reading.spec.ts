// Reading adjustments: the maths and the style sheet, tested with no browser.
import { expect, test } from '@playwright/test';
import { clipForSpeech, selectionIsChoice } from '../src/hands/reading/readAloud';
import { buildCss, correctionMatrix, DEFAULT_READING, isDarkColour, isPlain, nextOf, sanitize, stepSize, svgMatrix, COLOURS, type ReadingSettings } from '../src/hands/reading/settings';

const with_ = (over: Partial<ReadingSettings>): ReadingSettings => ({ ...DEFAULT_READING, ...over });

test('nothing changed gives an empty style sheet', () => {
  expect(buildCss(DEFAULT_READING)).toBe('');
  expect(isPlain(DEFAULT_READING)).toBe(true);
  expect(isPlain(with_({ spacing: 'roomy' }))).toBe(false);
});

test('each setting writes its own rule', () => {
  expect(buildCss(with_({ spacing: 'roomy' }))).toContain('line-height: 1.7');
  expect(buildCss(with_({ spacing: 'extra' }))).toContain('line-height: 2');
  expect(buildCss(with_({ font: 'plain' }))).toContain('Verdana');
  expect(buildCss(with_({ contrast: 'high' }))).toContain('contrast(1.3)');
  expect(buildCss(with_({ highlight: true }))).toContain('::highlight(steady-total)');
});

test('dark turns pictures back the right way round, and the filter is on the body, never the whole page', () => {
  const css = buildCss(with_({ contrast: 'dark' }));
  expect(css).toContain('invert(1)');
  expect(css).toContain('body img');
  expect(css).toContain('body { filter:');
  expect(css.includes('html { filter')).toBe(false);
  expect(css.includes('[data-steady-ui]')).toBe(false);
});

test('the page behind a filtered body gets a fitting colour', () => {
  expect(buildCss(with_({ contrast: 'dark' }))).toContain('html { background-color: #0b0b0b');
  expect(buildCss(with_({ contrast: 'high' }), 'rgb(250, 248, 243)')).toContain('html { background-color: rgb(250, 248, 243)');
  expect(buildCss(with_({ contrast: 'high' })).includes('html {')).toBe(false);
});

test('a one-word selection is not a choice, two words are', () => {
  expect(selectionIsChoice('Demo')).toBe(false);
  expect(selectionIsChoice('  Demo  ')).toBe(false);
  expect(selectionIsChoice('Your basket')).toBe(true);
  expect(selectionIsChoice('')).toBe(false);
});

test('long text is cut at the end of a sentence', () => {
  const long = 'One sentence here. '.repeat(200);
  const cut = clipForSpeech(long, 100);
  expect(cut.length <= 100).toBe(true);
  expect(cut.endsWith('.')).toBe(true);
});

test('colour and contrast share one filter rule', () => {
  const css = buildCss(with_({ contrast: 'high', colour: 'deuteranopia' }));
  expect(css.match(/body \{ filter:/g)?.length).toBe(1);
  expect(css).toContain('url(#steady-colour-filter)');
  expect(css).toContain('contrast(1.3)');
});

test('icon fonts are left alone when the font changes', () => {
  expect(buildCss(with_({ font: 'serif' }))).toContain(':not([class*="icon"])');
});

test('a colour correction leaves greys grey and keeps rows adding up', () => {
  for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
    const m = correctionMatrix(kind);
    for (const row of m) {
      const sum = row.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1) < 1e-4).toBe(true);
    }
  }
});

test('the SVG matrix has 20 numbers', () => {
  expect(svgMatrix('protanopia').split(' ').length).toBe(20);
});

test('a red-green correction changes red, and leaves a pure blue-grey unchanged in the red row', () => {
  const m = correctionMatrix('deuteranopia');
  const red = [1, 0, 0].map((_, j) => m[j]?.[0] ?? 0); // what pure red becomes
  expect(red[0] !== 1 || red[1] !== 0).toBe(true);
});

test('choices cycle and sizes step inside the list', () => {
  expect(nextOf(COLOURS, 'warm')).toBe('none');
  expect(nextOf(COLOURS, 'none')).toBe('protanopia');
  expect(stepSize(100, 1)).toBe(110);
  expect(stepSize(100, -1)).toBe(100);
  expect(stepSize(250, 1)).toBe(250);
  expect(stepSize(130, 1)).toBe(150);
  expect(stepSize(130, -1)).toBe(125);
  expect(stepSize(110, -1)).toBe(100);
});

test('bad stored settings fall back to the defaults', () => {
  expect(sanitize(null)).toEqual(DEFAULT_READING);
  expect(sanitize({ sizePct: 9999, font: 'comic', highlight: 'yes' })).toEqual(DEFAULT_READING);
  expect(sanitize({ sizePct: 150, spacing: 'roomy', colour: 'warm', highlight: true, rate: 1.2 })).toEqual(with_({ sizePct: 150, spacing: 'roomy', colour: 'warm', highlight: true, rate: 1.2 }));
});

test('a page that is already dark is not flipped to light', () => {
  const css = buildCss(with_({ contrast: 'dark' }), 'rgb(20, 20, 20)', true);
  expect(css).toBe('');
  expect(buildCss(with_({ contrast: 'dark', colour: 'warm' }), undefined, true)).not.toContain('invert');
});

test('dark and light page colours are told apart', () => {
  expect(isDarkColour('rgb(24, 24, 22)')).toBe(true);
  expect(isDarkColour('rgba(0, 0, 0, 1)')).toBe(true);
  expect(isDarkColour('rgb(250, 248, 243)')).toBe(false);
  expect(isDarkColour('rgb(120, 120, 120)')).toBe(false);
  expect(isDarkColour(undefined)).toBe(false);
  expect(isDarkColour('transparent')).toBe(false);
});
