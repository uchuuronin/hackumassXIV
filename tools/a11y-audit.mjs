// The accessibility sweep: every screen of the panel and every part Milo draws on a page.
// Checks WCAG 2.0 to 2.2 (A and AA) with axe-core, plus our own rules: no words under 18 px, no button
// under 48 px, a visible focus ring on every Tab stop, Tab stays inside pop-ups, and the panel still
// fits when narrow or with wider text spacing. Owner: C.
//
// It needs a build whose on-page parts can be looked into. Shadow roots are closed in the real build,
// so make a scratch copy and open them there (never commit that change):
//
//   npm i --no-save axe-core
//   (copy the repo without node_modules to ../steady-audit, link node_modules, and in that copy replace
//    attachShadow({ mode: 'closed' }) with attachShadow({ mode: 'open' }) in src/hands, then npx wxt build)
//   node sites/serve.mjs            (in another window)
//   node tools/a11y-audit.mjs ../steady-audit/.output/chrome-mv3 [folder for screenshots]
//
// The last line is "TOTAL FINDINGS: n". It should be 0.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const ext = process.argv[2];
const SHOTS = process.argv[3] || '';
const ctx = await chromium.launchPersistentContext('', { executablePath: process.env.STEADY_CHROME || undefined, headless: false, viewport: { width: 1280, height: 800 },
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = sw.url().split('/')[2];
let fails = 0;
const say = (s) => console.log(s);

// Runs in the page. Looks at everything Milo drew (whole document for the panel; [data-steady-ui] hosts on a page).
const PROBE = async ({ scope }) => {
  const roots = scope === 'doc' ? [document] : [...document.querySelectorAll('[data-steady-ui]')].map((h) => h.shadowRoot).filter(Boolean);
  const all = (sel) => roots.flatMap((r) => [...r.querySelectorAll(sel)]);
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const out = { small: [], targets: [], names: [], clipped: [] };
  // every piece of text
  for (const r of roots) {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim(); const p = n.parentElement; if (!t || !p || !vis(p) || p.closest('svg, style, script')) continue;
      const px = parseFloat(getComputedStyle(p).fontSize);
      if (px < 18) out.small.push(`${px}px "${t.slice(0, 34)}"`);
    }
  }
  for (const e of all('button, input, select, textarea, a[href], [role=button], [role=radio], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"])').filter(vis)) {
    const r = e.getBoundingClientRect();
    const name = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 26);
    if (r.height < 47.5 || r.width < 47.5) out.targets.push(`${Math.round(r.width)}x${Math.round(r.height)} "${name || e.tagName}"`);
    const labelled = name || e.labels?.length || e.getAttribute('aria-labelledby') || e.getAttribute('title');
    if (!labelled) out.names.push(e.outerHTML.slice(0, 80));
  }
  out.small = [...new Set(out.small)]; out.targets = [...new Set(out.targets)];
  out.hscroll = scope === 'doc' ? document.documentElement.scrollWidth > innerWidth + 1 : false;
  out.live = all('[aria-live], [role=status], [role=alert]').length;
  out.h1 = all('h1').filter(vis).length;
  out.dialogs = all('[role=dialog], [role=alertdialog]').map((d) => `${d.getAttribute('role')} name=${d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') ? 'by:' + d.getAttribute('aria-labelledby') : 'NONE')}`);
  // axe
  const ctxs = scope === 'doc' ? [document] : [...document.querySelectorAll('[data-steady-ui]')].filter((h) => h.shadowRoot);
  out.axe = [];
  for (const c of ctxs) {
    try { const res = await window.axe.run(c, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
      for (const v of res.violations) { if (scope !== 'doc' && /^(landmark|region|page-has|document-title|html-)/.test(v.id)) continue; out.axe.push(`[${v.impact}] ${v.id} x${v.nodes.length}: ${v.help} | ${v.nodes[0]?.html?.slice(0, 90)}`); } } catch (e) { out.axe.push('axe could not run: ' + String(e).slice(0, 80)); }
  }
  return out;
};
async function probe(p, name, scope = 'doc') {
  await p.evaluate(axeSource).catch(() => {});
  const r = await p.evaluate(PROBE, { scope });
  const bad = r.axe.length + r.small.length + r.targets.length + r.names.length + (r.hscroll ? 1 : 0) + r.dialogs.filter((d) => d.includes('NONE')).length;
  fails += bad;
  say(`\n## ${name}: ${bad ? bad + ' finding(s)' : 'clean'}  (live regions ${r.live}, h1 ${r.h1}${r.dialogs.length ? ', ' + r.dialogs.join('; ') : ''})`);
  for (const a of r.axe) say('  axe  ' + a);
  if (r.small.length) say('  text under 18px: ' + r.small.slice(0, 12).join(' | '));
  if (r.targets.length) say('  under 48px: ' + r.targets.slice(0, 12).join(' | '));
  if (r.names.length) say('  no name: ' + r.names.join(' | '));
  if (r.hscroll) say('  scrolls sideways');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: scope === 'doc' }).catch(() => {});
  return r;
}
async function keyboard(p, name, max = 60, onlySteady = false) {
  const stops = []; let noRing = [];
  await p.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  for (let i = 0; i < max; i++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => { let e = document.activeElement; const host = e; while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement; if (!e || e === document.body) return null; const mine = host.hasAttribute?.('data-steady-ui'); const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      return { t: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.id || e.tagName).trim().slice(0, 20), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, mine, key: e.outerHTML.slice(0, 120) + r.top }; });
    if (!f) break; if (stops.find((s) => s.key === f.key)) break; if (onlySteady && !f.mine) continue; stops.push(f); if (!f.ring) noRing.push(f.t); }
  if (noRing.length) { fails += noRing.length; }
  say(`  keyboard (${name}): ${stops.length} stops, ${noRing.length ? 'NO RING on: ' + noRing.join(', ') : 'every one shows a focus ring'}`);
  return stops;
}
const runTool = (tabId, name, args = {}) => sw.evaluate(([t, n, a]) => chrome.tabs.sendMessage(t, { type: 'tool/run', name: n, args: a }).catch((e) => String(e)), [tabId, name, args]);

const page = await ctx.newPage(); page.setDefaultTimeout(7000);
await page.goto('http://localhost:4173/clinic/book.html?reset=1'); await page.waitForTimeout(1800);
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:4173/*' }))[0].id);
const panel = await ctx.newPage(); panel.setDefaultTimeout(7000);
await panel.setViewportSize({ width: 400, height: 900 });
await panel.goto(`chrome-extension://${id}/sidepanel.html?tab=${tabId}`); await panel.waitForTimeout(900);
const press = async (re) => { const b = panel.getByRole('button', { name: re }).first(); if (await b.count() && await b.isVisible().catch(() => false)) { await b.click(); await panel.waitForTimeout(350); return true; } return false; };

say('# PANEL');
for (let step = 1; step <= 5; step++) { await probe(panel, `Welcome step ${step}`); if (step === 1) await keyboard(panel, 'welcome'); if (!(await press(/^(Next|Skip this|Maybe later|Not now|No|Start)/))) break; if (await panel.getByRole('button', { name: /What do I click/ }).count()) break; }
for (let i = 0; i < 6; i++) { if (await panel.getByRole('button', { name: /What do I click/ }).count()) break; await press(/^(Next|Skip this|Maybe later|Not now|No)/); }
await probe(panel, 'Home'); await keyboard(panel, 'home');
await press(/What do I click/); await panel.waitForTimeout(1500);
await probe(panel, 'Home after What do I click (answer buttons)'); await keyboard(panel, 'answers');
await press(/I'm stuck/); await panel.waitForTimeout(1200);
await probe(panel, 'I am stuck (asks for a helper)');
await press(/^(No|Not now|Never mind|Cancel)/);
await press(/My details/); await panel.waitForTimeout(500);
await probe(panel, 'My details'); await keyboard(panel, 'details', 80);
await press(/For the person who helps/); await panel.waitForTimeout(400);
await probe(panel, 'For the person who helps'); await keyboard(panel, 'helper', 80);
await press(/Back/); await press(/Back/);
await press(/Settings/); await panel.waitForTimeout(500);
await probe(panel, 'Settings'); await keyboard(panel, 'settings', 80);
await press(/Back/);
// narrow and zoomed
for (const w of [320, 200]) { await panel.setViewportSize({ width: w, height: 900 }); await panel.waitForTimeout(250); const r = await panel.evaluate(() => ({ h: document.documentElement.scrollWidth > innerWidth + 1, cut: [...document.querySelectorAll('button, .bubble, label, h1, h2')].filter((e) => e.scrollWidth > e.clientWidth + 2 && e.getBoundingClientRect().width > 0).map((e) => e.textContent.trim().slice(0, 20)) })); if (r.h || r.cut.length) fails++; say(`\n## Panel at ${w}px wide: ${r.h ? 'SCROLLS SIDEWAYS' : 'no sideways scroll'}${r.cut.length ? '; cut off: ' + r.cut.join(', ') : ''}`); if (SHOTS) await panel.screenshot({ path: `${SHOTS}/panel-${w}.png`, fullPage: true }); }
await panel.setViewportSize({ width: 400, height: 900 });
// text spacing (WCAG 1.4.12)
await panel.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' }); await panel.waitForTimeout(200);
const sp = await panel.evaluate(() => ({ h: document.documentElement.scrollWidth > innerWidth + 1, cut: [...document.querySelectorAll('button, .bubble, label, h1, h2, small, p')].filter((e) => { const s = getComputedStyle(e); return e.getBoundingClientRect().width > 0 && (e.scrollWidth > e.clientWidth + 2 || (s.overflow !== 'visible' && e.scrollHeight > e.clientHeight + 2)); }).map((e) => e.textContent.trim().slice(0, 22)) }));
if (sp.h || sp.cut.length) fails++; say(`\n## Panel with wider text spacing: ${sp.h ? 'SCROLLS SIDEWAYS' : 'fits'}${sp.cut.length ? '; cut off: ' + sp.cut.slice(0, 8).join(', ') : ''}`);

say('\n# ON THE PAGE');
await page.bringToFront();
await panel.reload(); await panel.waitForTimeout(700); await press(/What do I click/); await panel.waitForTimeout(1500); await press(/^Yes/); await panel.waitForTimeout(1500);
await page.bringToFront(); await page.waitForTimeout(600);
await probe(page, 'Notes and spotlight during a walk', 'page');
say('  label_choices: ' + JSON.stringify(await runTool(tabId, 'label_choices')).slice(0, 80)); await page.waitForTimeout(900);
await probe(page, 'Labels on the choices', 'page');
await runTool(tabId, 'hide_choice_labels');
say('  reading_open_bar: ' + JSON.stringify(await runTool(tabId, 'reading_open_bar')).slice(0, 80)); await page.waitForTimeout(600);
await probe(page, 'Reading bar', 'page'); await keyboard(page, 'reading bar', 80, true);
// Big Pick: a date and a list
for (const sel of ['input[type=date]', 'select']) { const el = page.locator(sel).first(); if (await el.count()) { await el.click({ force: true }).catch(() => {}); await page.waitForTimeout(700); const r = await probe(page, `Big Pick opened from ${sel}`, 'page'); if (!r.dialogs.length) { say('  (Big Pick did not open from this control on this page, so nothing to check)'); continue; } const trail = []; for (let i = 0; i < 50; i++) { await page.keyboard.press('Tab'); trail.push(await page.evaluate(() => { const h = [...document.querySelectorAll('[data-steady-ui]')].find((x) => x.shadowRoot?.activeElement); return h ? 'in' : 'OUT:' + (document.activeElement?.tagName || ''); })); } const out = trail.filter((t) => t.startsWith('OUT')).length; if (out) fails++; say(`  Tab x50 inside Big Pick: ${out ? out + ' presses landed OUTSIDE the dialog' : 'focus stays inside'}`); await page.keyboard.press('Escape'); await page.waitForTimeout(400); const closed = await page.evaluate(() => ![...document.querySelectorAll('[data-steady-ui]')].some((h) => h.shadowRoot?.querySelector('[role=dialog]'))); say(`  Escape ${closed ? 'closes it' : 'DOES NOT close it'}`); if (!closed) fails++; } }
await page.goto('http://localhost:4173/shop/checkout.html?reset=1'); await page.waitForTimeout(1800);
await page.getByRole('button', { name: 'Place order' }).click(); await page.waitForTimeout(1000);
await probe(page, 'Pay Pause card', 'page');
const trail = []; for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); trail.push(await page.evaluate(() => { const h = [...document.querySelectorAll('[data-steady-ui]')].find((x) => x.shadowRoot?.activeElement); return h ? h.shadowRoot.activeElement.textContent.slice(0, 10) : 'OUT'; })); }
const out = trail.filter((t) => t === 'OUT').length; if (out) fails++;
const moved = new Set(trail.filter((t) => t !== 'OUT')).size; if (moved < 2) { fails++; say('  Tab does not move between the buttons: STUCK'); }
say(`  Tab x8 inside Pay Pause: ${trail.join(' > ')}`);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
const gone = await page.evaluate(() => ![...document.querySelectorAll('[data-steady-ui]')].some((h) => h.shadowRoot?.querySelector('[role=alertdialog]')));
say(`  Escape ${gone ? 'closes it (as "Not yet")' : 'does not close it'}`);
say(`\n# TOTAL FINDINGS: ${fails}`);
await ctx.close();
