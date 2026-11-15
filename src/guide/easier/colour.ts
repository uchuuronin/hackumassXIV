// The sums behind "is this writing dark enough to read?" (WCAG 1.4.3). Owner: C. No page, no browser: only numbers.

export type RGB = [number, number, number];
export interface RGBA { rgb: RGB; a: number }

/** What a browser reports for a colour: "rgb(1, 2, 3)" or "rgba(1, 2, 3, 0.5)". Anything newer or odder: null. */
export function parse(css: string): RGBA | null {
  const m = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Math.max(0, Math.min(1, alpha)) };
}

/** `top`, partly see-through, laid over `under`. */
export const over = (top: RGB, a: number, under: RGB): RGB => [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)) as RGB;

export function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/**
 * The same colour, moved towards black (on a light ground) or white (on a dark one) only as far as it
 * takes to be read easily. A blue link stays blue. Aims for 7 to 1, which is the mark for older eyes.
 */
export function readable(text: RGB, ground: RGB, aim = 7): RGB {
  const towards: RGB = luminance(ground) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const mixed = over(towards, t, text);
    if (ratio(mixed, ground) >= aim) return mixed.map(Math.round) as RGB;
  }
  return towards;
}

export const css = (rgb: RGB): string => `rgb(${rgb.map(Math.round).join(', ')})`;
