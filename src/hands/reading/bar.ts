// The reading bar: one row of large buttons to change how the page reads. Owner: A.
// Each press moves to the next choice. Colours come from C's theme.

import { STEADY_UI_ATTR } from '@/shared/pagemap';
import { theme } from '@/shared/theme';
import { willReadSelection } from './readAloud';
import { WORDS, type ReadingSettings } from './settings';

export interface BarActions {
  settings(): ReadingSettings;
  paused(): boolean;
  reading(): boolean;
  smaller(): void;
  bigger(): void;
  cycle(setting: 'spacing' | 'font' | 'contrast' | 'colour' | 'highlight'): void;
  readAloud(): void;
  stopReading(): void;
  togglePause(): void;
  reset(): void;
}

export interface ReadingBar {
  show(): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Redraw the buttons after something changed. */
  refresh(): void;
}

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483645; width: min(1040px, 96vw); background: ${theme.paper}; border: 3px solid ${theme.ink}; border-radius: 16px; padding: 12px; box-shadow: ${theme.shadow}; font-family: ${theme.font}; color: ${theme.ink}; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .group { display: flex; gap: 8px; align-items: center; }
  .size { font-weight: 700; font-size: 20px; min-width: 4.2ch; text-align: center; }
  button { font: 600 18px/1.15 ${theme.font}; color: ${theme.ink}; min-height: 56px; padding: 6px 14px; border: 3px solid ${theme.ink}; border-radius: ${theme.radius}px; background: ${theme.card}; cursor: pointer; box-shadow: 0 ${theme.depth}px 0 ${theme.ink}; transition: transform ${theme.motion.press}ms ${theme.motion.ease}, box-shadow ${theme.motion.press}ms ${theme.motion.ease}; text-align: left; }
  button:active { transform: translateY(${theme.depth}px); box-shadow: 0 0 0 ${theme.ink}; }
  button:focus-visible { outline: 4px solid ${theme.focus}; outline-offset: 3px; }
  button small { display: block; font-weight: 500; font-size: 14px; color: ${theme.inkQuiet}; }
  button.on { background: ${theme.tones.go.soft}; border-color: ${theme.tones.go.line}; }
  button.round { min-width: 56px; text-align: center; font-size: 28px; padding: 0 10px; }
  button.quiet { margin-left: auto; text-align: center; }
`;

export function createReadingBar(doc: Document, actions: BarActions): ReadingBar {
  const host = doc.createElement('div');
  host.setAttribute(STEADY_UI_ATTR, '');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Reading');
  root.append(style, bar);
  let open = false;

  const btn = (label: string, press: () => void, opts: { small?: string; className?: string; aria?: string } = {}): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (opts.small) {
      const s = doc.createElement('small');
      s.textContent = opts.small;
      b.append(s);
    }
    if (opts.className) b.className = opts.className;
    if (opts.aria) b.setAttribute('aria-label', opts.aria);
    b.addEventListener('click', (event) => {
      event.preventDefault();
      press();
      refresh();
    });
    return b;
  };

  const refresh = () => {
    const s = actions.settings();
    bar.replaceChildren();
    const size = doc.createElement('div');
    size.className = 'group';
    const pct = doc.createElement('div');
    pct.className = 'size';
    pct.textContent = `${s.sizePct}%`;
    size.append(btn('−', actions.smaller, { className: 'round', aria: 'Smaller text' }), pct, btn('+', actions.bigger, { className: 'round', aria: 'Bigger text' }));
    bar.append(
      size,
      btn('Spacing', () => actions.cycle('spacing'), { small: WORDS.spacing[s.spacing] }),
      btn('Font', () => actions.cycle('font'), { small: WORDS.font[s.font] }),
      btn('Contrast', () => actions.cycle('contrast'), { small: WORDS.contrast[s.contrast] }),
      btn('Colours', () => actions.cycle('colour'), { small: WORDS.colour[s.colour] }),
      btn('Mark prices', () => actions.cycle('highlight'), { small: s.highlight ? 'On' : 'Off', className: s.highlight ? 'on' : '' }),
      actions.reading() ? btn('Stop reading', actions.stopReading, { className: 'on' }) : btn('Read aloud', actions.readAloud, { small: willReadSelection(doc) ? 'What you selected' : 'This page' }),
      btn(actions.paused() ? 'Resume' : 'Pause', actions.togglePause, { small: actions.paused() ? 'Changes are off' : 'See the page as it was', className: actions.paused() ? 'on' : '' }),
      btn('Reset', actions.reset),
      btn('Close', () => api.hide(), { className: 'quiet' }),
    );
  };

  const api: ReadingBar = {
    show() {
      if (open) return refresh();
      open = true;
      refresh();
      doc.documentElement.append(host);
    },
    hide() {
      open = false;
      host.remove();
    },
    toggle() {
      if (open) api.hide();
      else api.show();
    },
    isOpen: () => open,
    refresh: () => {
      if (open) refresh();
    },
  };
  return api;
}
