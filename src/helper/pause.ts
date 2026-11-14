// Pay Pause: stops a click on a pay or delete button and asks first, in plain words. Owner: B.
import { gentleCss, theme } from '@/shared/theme';
import { browser } from 'wxt/browser';
import { pageMap } from '@/guide';
import { STEADY_UI_ATTR, fullLabel, type PageElement } from '@/shared/pagemap';
import type { LaneContext } from '@/shared/lanes';
import { HELPER_KEYS } from '@/shared/tools';
import { getProfile } from './profile';
import { siteLines } from './sites';

let bypass = false;
let open: HTMLElement | null = null;

function closePause() {
  open?.remove();
  open = null;
  browser.runtime.sendMessage({ type: 'tts/stop' }).catch(() => undefined);
}

function describeRisk(el: PageElement): { title: string; lines: string[]; go: string } {
  const fake = el.marks.find((m) => m.kind === 'fake');
  if (fake) return { title: 'Careful. This is an advert.', lines: [fake.reason], go: 'Open it anyway' };
  const pay = el.protection === 'pay';
  const map = pageMap.get();
  const total = map.amounts.find((a) => a.kind === 'total' && !a.struck);
  const lines: string[] = pay ? siteLines() : [];
  if (el.labelConfident) lines.push(`You are about to press "${fullLabel(el)}".`);
  lines.push(pay
    ? total ? `This will take ${total.text} from you.` : 'This will take money from you.'
    : 'This will remove something, and you may not be able to get it back.');
  for (const a of map.amounts.filter((x) => x.recurring && !x.struck)) {
    lines.push(`Careful: this repeats (${String(a.recurring)}): ${a.text}.`);
  }
  return {
    title: pay ? 'Wait. This is a payment.' : 'Wait. This cannot be undone.',
    lines,
    go: pay ? 'Yes, pay' : 'Yes, remove it',
  };
}

function showPause(el: PageElement, target: Element) {
  closePause();
  const risk = describeRisk(el);

  const host = document.createElement('div');
  host.setAttribute(STEADY_UI_ATTR, '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  // The calm look, shared by all three lanes (src/shared/theme.ts). "Not yet" is the safe choice, so it is the main button.
  style.textContent = `
    .back { position: fixed; inset: 0; background: ${theme.veil}; display: grid; place-items: center; font-family: ${theme.font}; }
    .box { background: ${theme.paper}; color: ${theme.ink}; border: 1px solid ${theme.hairline}; border-top: 8px solid ${theme.tones.careful.line}; border-radius: 16px; padding: 28px; width: min(560px, 90vw); font-size: 24px; line-height: 1.45; box-shadow: ${theme.shadow}; }
    h2 { margin: 0 0 12px; font-size: 30px; font-weight: 650; }
    p { margin: 0 0 12px; }
    button { display: block; width: 100%; min-height: 64px; margin-top: 14px; font: inherit; font-weight: 600; color: ${theme.ink}; border: 2px solid ${theme.edge}; border-radius: 12px; cursor: pointer; background: ${theme.card}; transition: background-color ${theme.motion.press}ms; }
    button:hover { background: ${theme.tones.info.soft}; }
    .stop { background: ${theme.main}; border-color: ${theme.main}; color: ${theme.onMain}; }
    .stop:hover { background: ${theme.ink}; border-color: ${theme.ink}; }
    button:focus-visible { outline: 4px solid ${theme.focus}; outline-offset: 3px; }
    ${gentleCss}
  `;

  const back = document.createElement('div');
  back.className = 'back';
  const box = document.createElement('div');
  box.className = 'box steady-appear';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  const h = document.createElement('h2');
  h.textContent = risk.title;
  box.append(h);
  for (const line of risk.lines) {
    const p = document.createElement('p');
    p.textContent = line;
    box.append(p);
  }
  const stop = document.createElement('button');
  stop.className = 'stop';
  stop.textContent = 'Not yet';
  stop.onclick = closePause;
  const go = document.createElement('button');
  go.textContent = risk.go;
  go.onclick = () => {
    closePause();
    bypass = true;
    (target as HTMLElement).click();
    bypass = false;
  };
  box.append(stop, go);
  back.append(box);
  root.append(style, back);
  document.documentElement.append(host);
  open = host;
  stop.focus();

  getProfile(HELPER_KEYS.voiceOn, true).then((on) => {
    if (on) browser.runtime.sendMessage({ type: 'tts/say', text: `${risk.title} ${risk.lines.join(' ')}` }).catch(() => undefined);
  });
}

export function startPause(ctx: LaneContext): void {
  const onClick = (e: MouseEvent) => {
    if (bypass) return;
    const target = e.target as Element | null;
    if (!target || target.closest(`[${STEADY_UI_ATTR}]`)) return;
    const el = pageMap.describe(target);
    if (!el || (!el.marks.some((m) => m.kind === 'fake') && el.protection !== 'pay' && el.protection !== 'delete')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showPause(el, target);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) closePause(); };
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  ctx.onStop(() => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    closePause();
  });
}
