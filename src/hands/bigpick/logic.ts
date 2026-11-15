// The sums behind Big Pick: pages of choices, a month of days, and steps of a number. Owner: A. No page access.

export interface Page {
  /** 0-based. */
  index: number;
  pages: number;
  /** Which of the items are on this page. */
  from: number;
  to: number;
}

/** Split a long list into pages, opening on the page that holds the chosen one. */
export function pageFor(count: number, perPage: number, selected: number): Page {
  const pages = Math.max(1, Math.ceil(count / perPage));
  const index = selected >= 0 ? Math.min(pages - 1, Math.floor(selected / perPage)) : 0;
  return { index, pages, from: index * perPage, to: Math.min(count, (index + 1) * perPage) };
}

export function movePage(page: Page, count: number, perPage: number, delta: number): Page {
  const index = Math.min(page.pages - 1, Math.max(0, page.index + delta));
  return { index, pages: page.pages, from: index * perPage, to: Math.min(count, (index + 1) * perPage) };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (year: number, month: number, day: number): string => `${year}-${pad(month + 1)}-${pad(day)}`;

export function parseIso(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? { year, month, day } : null;
}

export interface Day {
  day: number;
  iso: string;
  disabled: boolean;
}

/** A month as weeks, Sunday first. `null` pads the days of the neighbouring months. */
export function monthGrid(year: number, month: number, min?: string, max?: string): Array<Array<Day | null>> {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<Day | null> = Array.from({ length: first }, () => null);
  for (let day = 1; day <= days; day += 1) {
    const iso = isoDay(year, month, day);
    cells.push({ day, iso, disabled: (!!min && iso < min) || (!!max && iso > max) });
  }
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<Day | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** A month can be shown if it holds at least one day between min and max. */
export function monthHasDays(year: number, month: number, min?: string, max?: string): boolean {
  return monthGrid(year, month, min, max).some((week) => week.some((d) => d && !d.disabled));
}

/** Move a number one step, staying inside its limits and free of floating-point crumbs (0.1 + 0.2). */
export function stepNumber(value: number, direction: 1 | -1, step: number, min?: number, max?: number): number {
  const s = step > 0 ? step : 1;
  const decimals = (String(s).split('.')[1] ?? '').length;
  // Steps count from the minimum, as the browser's own control does. A value between two steps goes to the next one that way.
  const base = min ?? 0;
  const k = (value - base) / s;
  const nextK = direction > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  let next = Number((base + nextK * s).toFixed(decimals));
  if (max !== undefined && next > max) next = max;
  if (min !== undefined && next < min) next = min;
  return next;
}
