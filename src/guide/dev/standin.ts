// TEMPORARY, try-it build only. A small panel in a corner of the page that stands in for B's helper
// panel: it shows what Steady says and offers the answers as buttons, so nothing needs a keyboard shortcut.
// Delete this file when B's panel runs the guide tools and shows 'helper/answer' messages.
// (Notes, rings and dimming are A's overlay now. The stand-in overlay that used to live here has gone.)

import { STEADY_UI_ATTR } from '@/shared/pagemap';
import type { SpeechPort } from '@/shared/ports';
import { gentleCss, theme } from '@/shared/theme';

/** Always in the panel. */
export const STARTERS = ['What do I click?', 'Help me fill this in'];
const CORNERS = ['right:16px;bottom:16px', 'right:16px;top:16px', 'left:16px;bottom:16px', 'left:16px;top:16px'];
const CORNER_KEY = 'steady:tryit-corner';

const CSS = `
  :host { all: initial; }
  .panel { position: fixed; z-index: 2147483646; width: min(360px, 92vw); box-sizing: border-box; padding: 14px 16px 16px;
    background: ${theme.paper}; color: ${theme.ink}; font: 19px/1.45 ${theme.font};
    border: 1px solid ${theme.hairline}; border-top: 6px solid ${theme.main}; border-radius: 14px; box-shadow: ${theme.shadow}; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .name { font-size: 15px; font-weight: 600; color: ${theme.inkQuiet}; }
  .words { margin: 0; }
  .row { display: grid; gap: 8px; margin-top: 12px; }
  button { min-height: 48px; padding: 6px 14px; font: inherit; font-size: 18px; font-weight: 600; text-align: left; cursor: pointer;
    color: ${theme.ink}; background: ${theme.card}; border: 2px solid ${theme.edge}; border-radius: ${theme.radius}px;
    transition: background-color ${theme.motion.press}ms; }
  button:hover { background: ${theme.tones.info.soft}; }
  button.answer { color: ${theme.onMain}; background: ${theme.main}; border-color: ${theme.main}; }
  button.answer:hover { background: ${theme.ink}; border-color: ${theme.ink}; }
  button.move { min-height: 32px; padding: 2px 10px; font-size: 14px; border-width: 1px; }
  button:focus-visible { outline: 4px solid ${theme.focus}; outline-offset: 3px; }
  .starters { margin-top: 12px; padding-top: 12px; border-top: 1px solid ${theme.hairline}; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  ${gentleCss}
`;

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** `onButton` is called with the words on whichever button is pressed. */
export function createStandIns(onButton: (words: string) => void = () => undefined): { speech: SpeechPort; stop(): void } {
  let said = 'Hello. Press a button below and I will help.';
  let answers: string[] = [];
  let corner = 0;
  try {
    corner = Number(sessionStorage.getItem(CORNER_KEY)) || 0;
  } catch {
    // storage is not allowed on this page; the panel starts in the usual corner
  }

  const host = document.createElement('div');
  host.setAttribute(STEADY_UI_ATTR, 'standin');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div class="panel"><div class="top"><span class="name">Steady (try-it panel)</span><button class="move" data-move="1" title="Move this panel to another corner">Move</button></div><div id="live" role="status" aria-live="polite"></div><div class="row starters">${STARTERS.map((a) => `<button data-say="${escape(a)}">${escape(a)}</button>`).join('')}</div></div>`;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  const live = root.getElementById('live')!;

  // Only the sentence and its answers are redrawn. The Move and starter buttons are never rebuilt,
  // so a slow click on them is never lost halfway.
  const draw = () => {
    panel.style.cssText = CORNERS[corner % CORNERS.length]!;
    live.innerHTML = `<p class="words steady-appear">${escape(said)}</p>${answers.length ? `<div class="row">${answers.map((a) => `<button class="answer" data-say="${escape(a)}">${escape(a)}</button>`).join('')}</div>` : ''}`;
  };

  root.addEventListener('click', (e) => {
    const button = (e.target as Element | null)?.closest?.('button');
    if (!button) return;
    if (button.hasAttribute('data-move')) {
      corner += 1;
      try {
        sessionStorage.setItem(CORNER_KEY, String(corner));
      } catch {
        // see above
      }
      panel.style.cssText = CORNERS[corner % CORNERS.length]!;
      return;
    }
    const words = button.getAttribute('data-say');
    if (words) onButton(words);
  });

  draw();
  document.documentElement.appendChild(host);

  return {
    speech: {
      say(text, options) {
        said = text;
        answers = options ?? [];
        draw();
      },
    },
    stop() {
      host.remove();
    },
  };
}
