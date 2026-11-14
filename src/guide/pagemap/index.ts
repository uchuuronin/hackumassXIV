// The page map: one function that lists every button, link and field on a page,
// with its label, type, position and whether it is protected.
// Foundation piece, owner C. See src/shared/pagemap.ts for the shape.

import {
  PAGE_MAP_VERSION,
  type AutoClickVerdict,
  type ChoiceOption,
  type MarkKind,
  type PageChange,
  type PageElement,
  type PageForm,
  type PageFrame,
  type PageHeading,
  type PageMap,
  type PageMapApi,
  type PageMapOptions,
  type Rect,
} from '@/shared/pagemap';
import { findAmounts, toPageAmounts, type AmountHit } from './amounts';
import { fillOf, isField, isSearchForm, kindOf, looksLikeCardField, protectionOf, secretOf, type FormFacts } from './classify';
import { actionableFor, clip, collect, inViewport, isCovered, isSteadyUi, isVisible, rectOf, sameSite, textOf, type Candidate } from './dom';
import { groupOf, hintOf, nameOf } from './label';
import { addMark, clearAllMarks, markNear, marksOf, removeMark } from './marks';
import { stageOf } from './stage';
import { PageWatcher } from './watch';

const DEFAULT_MAX = 400;
const MAX_COVER_CHECKS = 400;
const MAX_OPTIONS = 60;
const MAX_HEADINGS = 40;

export function createPageMap(doc: Document = document): PageMapApi & { stop(): void; amounts(): AmountHit[] } {
  const win = doc.defaultView!;
  const ids = new WeakMap<Element, string>();
  const byId = new Map<string, WeakRef<Element>>();
  const offsets = new WeakMap<Element, { x: number; y: number; inFrame: boolean; inferred: boolean }>();
  let nextId = 1;
  const watcher = new PageWatcher(doc);
  watcher.start();

  let cache: { key: string; map: PageMap } | null = null;
  let formFacts = new WeakMap<Element, FormFacts>();

  const idFor = (el: Element): string => {
    let id = ids.get(el);
    if (!id) {
      id = `s${nextId++}`;
      ids.set(el, id);
      byId.set(id, new WeakRef(el));
    }
    return id;
  };

  const elementFor = (id: string): Element | null => {
    const el = byId.get(id)?.deref();
    if (!el || !el.isConnected) return null;
    return el;
  };

  const factsFor = (el: Element): FormFacts | null => {
    const form = (el as HTMLInputElement).form ?? el.closest('form');
    if (!form) return null;
    let facts = formFacts.get(form);
    if (!facts) {
      facts = {
        isSearch: isSearchForm(form),
        takesPayment: [...form.querySelectorAll('input,select')].some(looksLikeCardField),
      };
      formFacts.set(form, facts);
    }
    return facts;
  };

  /** Everything about one element. Used for the full map and for single look-ups. */
  const describeOne = (el: Element, c: Pick<Candidate, 'offsetX' | 'offsetY' | 'inFrame' | 'inferred'>): PageElement => {
    const kind = kindOf(el);
    const name = nameOf(el);
    const facts = factsFor(el);
    const input = el as HTMLInputElement;

    let visible = isVisible(el);
    let rectSource: Element = el;
    // Sites often hide the real tick box and draw their own on the <label>. Point at what the person sees.
    if (!visible && (kind === 'checkbox' || kind === 'radio') && input.labels?.length) {
      const seen = [...input.labels].find(isVisible);
      if (seen) {
        visible = true;
        rectSource = seen;
      }
    }
    const rect = rectOf(rectSource, c.offsetX, c.offsetY);
    const onScreen = visible && inViewport(rect, win);

    const secret = secretOf(el, kind, name.label, !!facts?.takesPayment);
    const fill = secret ? undefined : fillOf(el, kind, name.label, name.confident);
    const guard = protectionOf(el, kind, name.label, facts);
    const disabled =
      input.disabled === true || el.getAttribute('aria-disabled') === 'true' || !!el.closest('[inert],fieldset[disabled]');

    const out: PageElement = {
      id: idFor(el),
      kind,
      role: el.getAttribute('role') ?? undefined,
      label: name.label,
      labelSource: name.source,
      labelConfident: name.confident,
      required: input.required === true || el.getAttribute('aria-required') === 'true',
      disabled,
      visible,
      inViewport: onScreen,
      covered: false,
      rect,
      protection: guard.protection,
      protectionReason: guard.reason,
      secret,
      fillAs: fill?.fillAs,
      fillFrom: fill?.fillFrom,
      sensitive: !!secret || !!fill,
      marks: marksOf(el),
      inFrame: c.inFrame,
      inDialog: !!el.closest('dialog[open],[role="dialog"],[role="alertdialog"]'),
    };
    if (c.inferred) out.inferred = true;

    if (isField(kind) || kind === 'checkbox' || kind === 'radio' || kind === 'range') {
      out.hint = hintOf(el, name);
      // "Month" means little without "Date of birth" above it.
      const group = groupOf(el);
      if (group && group.toLowerCase() !== name.label.toLowerCase()) out.group = group;
    }
    if (kind === 'checkbox' || kind === 'radio') {
      const aria = el.getAttribute('aria-checked');
      out.checked = aria ? aria === 'true' : input.checked === true;
    }
    if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      const options: ChoiceOption[] = [];
      for (const o of select.options) {
        if (options.length >= MAX_OPTIONS) break;
        options.push({ value: o.value, label: clip(o.label || o.text, 80), selected: o.selected, disabled: o.disabled });
      }
      out.options = options;
      if (!secret) out.value = clip(select.selectedOptions[0]?.label ?? '', 80);
    } else if (!secret && isField(kind)) {
      const value = 'value' in input && typeof input.value === 'string' ? input.value : (el.textContent ?? '');
      if (value) out.value = clip(value, 200);
    }
    if (kind === 'range' || kind === 'number' || kind === 'date' || kind === 'time') {
      const num = (attr: string) => {
        const n = parseFloat(el.getAttribute(attr) ?? el.getAttribute(`aria-value${attr}`) ?? '');
        return isFinite(n) ? n : undefined;
      };
      out.min = num('min');
      out.max = num('max');
      out.step = num('step');
    }
    if (el.tagName === 'A') {
      const a = el as HTMLAnchorElement;
      const raw = a.getAttribute('href') ?? '';
      if (raw && !raw.startsWith('#') && !/^javascript:/i.test(raw)) {
        out.href = a.href;
        if (/^https?:/i.test(a.href)) out.leavesSite = !sameSite(a.href, doc.location.href);
      }
      if (a.target === '_blank') out.opensNewTab = true;
    }
    return out;
  };

  const build = (options: PageMapOptions): PageMap => {
    const started = win.performance.now();
    formFacts = new WeakMap();
    const max = options.maxElements ?? DEFAULT_MAX;
    const { candidates, frames } = collect(doc, options.includeFrames !== false);

    let described: Array<{ el: Element; data: PageElement }> = [];
    for (const c of candidates) {
      offsets.set(c.el, { x: c.offsetX, y: c.offsetY, inFrame: c.inFrame, inferred: c.inferred });
      const data = describeOne(c.el, c);
      // Hand-cursor guesses with no words and no picture are noise, not buttons.
      if (c.inferred && data.labelSource === 'none') continue;
      if (options.visibleOnly && !data.inViewport) continue;
      described.push({ el: c.el, data });
    }

    let truncated = false;
    if (described.length > max) {
      truncated = true;
      const order = new Map(described.map((d, i) => [d, i]));
      const distance = (d: { data: PageElement }) =>
        !d.data.visible ? 1e9 : d.data.inViewport ? 0 : Math.min(Math.abs(d.data.rect.y), Math.abs(d.data.rect.y - win.innerHeight)) + 1;
      described = [...described].sort((a, b) => distance(a) - distance(b)).slice(0, max);
      described.sort((a, b) => order.get(a)! - order.get(b)!);
    }

    // Is anything on top? Only worth asking for what is on screen.
    let checks = 0;
    for (const d of described) {
      if (!d.data.inViewport || d.data.inFrame || checks >= MAX_COVER_CHECKS) continue;
      checks++;
      d.data.covered = isCovered(d.el);
    }

    addContext(described);
    const forms = buildForms(described);
    const headings = readHeadings();
    const amountHits = findAmounts(doc);
    lastAmounts = amountHits;
    const amounts = toPageAmounts(amountHits);
    const elements = described.map((d) => d.data);
    const dialog = openDialog();

    return {
      version: PAGE_MAP_VERSION,
      url: doc.location.href,
      origin: doc.location.origin,
      title: clip(doc.title, 120),
      takenAt: Date.now(),
      tookMs: Math.round((win.performance.now() - started) * 10) / 10,
      viewport: { width: win.innerWidth, height: win.innerHeight, scrollX: Math.round(win.scrollX), scrollY: Math.round(win.scrollY) },
      stage: stageOf(doc.location.href, doc.title, headings, elements, amounts),
      dialog,
      headings,
      elements,
      forms,
      amounts,
      frames: frames.map(
        (f): PageFrame => ({
          src: f.el.src || '',
          sameSite: f.sameSite,
          title: clip(f.el.title || f.el.getAttribute('aria-label') || f.el.name || '', 80),
          visible: isVisible(f.el),
          rect: rectOf(f.el, f.offsetX, f.offsetY),
        }),
      ),
      truncated,
    };
  };

  let lastAmounts: AmountHit[] = [];

  /** Three "Remove" buttons are useless without saying which item each one removes. */
  const addContext = (described: Array<{ el: Element; data: PageElement }>) => {
    const groups = new Map<string, Array<{ el: Element; data: PageElement }>>();
    for (const d of described) {
      if (!d.data.visible || (d.data.kind !== 'button' && d.data.kind !== 'link')) continue;
      const key = d.data.label.toLowerCase();
      const group = groups.get(key);
      if (group) group.push(d);
      else groups.set(key, [d]);
    }
    for (const group of groups.values()) {
      if (group.length < 2 || group.length > 40) continue;
      for (const d of group) {
        let box: Element = d.el;
        let up = d.el.parentElement;
        let hops = 0;
        while (up && up !== doc.body && hops++ < 8 && !group.some((o) => o !== d && up!.contains(o.el))) {
          box = up;
          up = up.parentElement;
        }
        if (box === d.el) continue;
        // A box holding half the page says nothing about this one button.
        let inside = 0;
        for (const o of described) if (box.contains(o.el) && ++inside > 8) break;
        if (inside > 8) continue;
        const title =
          textOf(box.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"],th[scope="row"],.title,.name,[class*="title"],[class*="name"]'), 60) ||
          clip(box.getAttribute('aria-label'), 60) ||
          clip(box.querySelector('img[alt]')?.getAttribute('alt'), 60);
        const isRow = box.matches('li,tr,article,[role="listitem"],[role="row"],[class*="item"],[class*="card"],[class*="product"],[class*="line"]');
        const context =
          title && title.toLowerCase() !== d.data.label.toLowerCase() ? title : isRow ? firstWordsExcept(box, d.data.label) : undefined;
        if (context) d.data.context = context;
      }
    }
  };

  const firstWordsExcept = (box: Element, label: string): string | undefined => {
    const text = textOf(box, 120).replace(label, '').trim();
    return text.length >= 3 ? clip(text, 50) : undefined;
  };

  const buildForms = (described: Array<{ el: Element; data: PageElement }>): PageForm[] => {
    const forms = new Map<Element | 'page', PageForm>();
    const loose: PageForm = { id: 'f0', label: '', fieldIds: [], takesPayment: false, isSearch: false };
    let n = 1;
    for (const d of described) {
      const isControl = d.data.kind !== 'link';
      if (!isControl) continue;
      // Only what the person can see now. Later steps of a form appear when the page changes.
      if (!d.data.visible) continue;
      const formEl = (d.el as HTMLInputElement).form ?? d.el.closest('form');
      if (!formEl) {
        if (d.data.kind !== 'button') loose.fieldIds.push(d.data.id);
        continue;
      }
      let form = forms.get(formEl);
      if (!form) {
        const facts = factsFor(d.el)!;
        form = { id: `f${n++}`, label: formLabel(formEl), fieldIds: [], takesPayment: facts.takesPayment, isSearch: facts.isSearch };
        forms.set(formEl, form);
      }
      d.data.formId = form.id;
      if (d.data.kind === 'button') {
        const isSender = d.data.protection === 'submit' || d.data.protection === 'pay' || (form.isSearch && (d.el as HTMLButtonElement).type === 'submit');
        if (isSender && !form.submitId) form.submitId = d.data.id;
      } else {
        form.fieldIds.push(d.data.id);
      }
    }
    const out = [...forms.values()];
    // Pages built without <form> tags still have fields to walk through.
    if (loose.fieldIds.length >= 2) {
      loose.label = clip(textOf(doc.querySelector('h1')), 80) || 'This page';
      for (const d of described) if (loose.fieldIds.includes(d.data.id)) d.data.formId = 'f0';
      out.push(loose);
    }
    return out;
  };

  const formLabel = (form: Element): string => {
    const aria = clip(form.getAttribute('aria-label'), 80);
    if (aria) return aria;
    const legend = textOf(form.querySelector('legend'), 80);
    const inside = textOf(form.querySelector('h1,h2,h3,h4'), 80);
    if (inside) return inside;
    // The nearest heading above the form.
    let at: Element | null = form;
    let hops = 0;
    while (at && hops++ < 6) {
      let prev = at.previousElementSibling;
      let steps = 0;
      while (prev && steps++ < 4) {
        const h = prev.matches('h1,h2,h3,h4,h5,h6') ? prev : prev.querySelector('h1,h2,h3,h4,h5,h6');
        const text = textOf(h, 80);
        if (text) return text;
        prev = prev.previousElementSibling;
      }
      at = at.parentElement;
    }
    return legend || 'Form';
  };

  const readHeadings = (): PageHeading[] => {
    const out: PageHeading[] = [];
    for (const h of doc.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
      if (out.length >= MAX_HEADINGS) break;
      if (h.closest('[data-steady-ui]') || !isVisible(h)) continue;
      const text = textOf(h, 120);
      if (!text) continue;
      const level = /^H[1-6]$/.test(h.tagName) ? Number(h.tagName[1]) : Number(h.getAttribute('aria-level') ?? 2);
      out.push({ level: Math.min(6, Math.max(1, level)) as PageHeading['level'], text });
    }
    return out;
  };

  const openDialog = (): { label: string } | undefined => {
    for (const d of doc.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"],[role="alertdialog"]')) {
      if (isSteadyUi(d) || !isVisible(d)) continue;
      const modal = d.tagName !== 'DIALOG' || d.matches(':modal');
      if (!modal) continue;
      const by = d.getAttribute('aria-labelledby');
      const label =
        clip(d.getAttribute('aria-label'), 80) ||
        (by ? clip(by.split(/\s+/).map((id) => textOf(doc.getElementById(id))).join(' '), 80) : '') ||
        textOf(d.querySelector('h1,h2,h3,[role="heading"]'), 80) ||
        'Pop-up window';
      return { label };
    }
    return undefined;
  };

  // ---- The API ----

  const get = (options: PageMapOptions = {}): PageMap => {
    const key = [
      watcher.generation,
      doc.location.href,
      Math.round(win.scrollX),
      Math.round(win.scrollY),
      win.innerWidth,
      win.innerHeight,
      options.visibleOnly ? 1 : 0,
      options.maxElements ?? DEFAULT_MAX,
      options.includeFrames === false ? 0 : 1,
    ].join('|');
    if (cache && cache.key === key) return cache.map;
    const map = build(options);
    cache = { key, map };
    return map;
  };

  const describe = (target: Element): PageElement | null => {
    const el = actionableFor(target);
    if (!el) return null;
    const known = offsets.get(el);
    const data = describeOne(el, { offsetX: known?.x ?? 0, offsetY: known?.y ?? 0, inFrame: known?.inFrame ?? false, inferred: known?.inferred ?? false });
    if (data.inViewport) data.covered = isCovered(el);
    return data;
  };

  const mayAutoClick = (target: Element): AutoClickVerdict => {
    // An advert frame from another site: Steady can't see inside it, so it never presses it.
    if (target.tagName === 'IFRAME') return { allowed: false, reason: 'This part of the page comes from another website.' };
    const fake = markNear(target, 'fake');
    if (fake) return { allowed: false, reason: fake.reason };
    const el = actionableFor(target);
    if (!el) return { allowed: false, reason: 'There is nothing to click here.' };
    const fakeButton = markNear(el, 'fake');
    const data = describe(el);
    if (!data) return { allowed: false, reason: 'There is nothing to click here.' };
    if (fakeButton) return { allowed: false, id: data.id, reason: fakeButton.reason };
    if (data.disabled) return { allowed: false, id: data.id, reason: 'This button is switched off by the page for now.' };
    if (data.protection !== 'none') {
      const what = data.protection === 'pay' ? 'pays' : data.protection === 'delete' ? 'removes something' : 'sends something';
      return {
        allowed: false,
        id: data.id,
        reason: `This button ${what}, so it needs a real click from you. Take your time.`,
      };
    }
    return { allowed: true, id: data.id };
  };

  const liveRect = (id: string): Rect | null => {
    const el = elementFor(id);
    if (!el) return null;
    let source = el;
    if (!isVisible(el)) {
      const seen = [...((el as HTMLInputElement).labels ?? [])].find(isVisible);
      if (!seen) return null;
      source = seen;
    }
    const off = offsets.get(el);
    let x = 0;
    let y = 0;
    if (off?.inFrame) {
      // Frame offsets move when the page scrolls, so work them out again.
      let frame = el.ownerDocument.defaultView?.frameElement ?? null;
      while (frame) {
        const r = frame.getBoundingClientRect();
        x += r.left + frame.clientLeft;
        y += r.top + frame.clientTop;
        frame = frame.ownerDocument.defaultView?.frameElement ?? null;
      }
    }
    return rectOf(source, x, y);
  };

  const resolve = (target: string | Element): Element | null => (typeof target === 'string' ? elementFor(target) : target);

  const mark = (target: string | Element, kind: MarkKind, reason: string) => {
    const el = resolve(target);
    if (!el) return;
    addMark(el, kind, reason);
    watcher.bump('marks');
  };
  const unmark = (target: string | Element, kind: MarkKind) => {
    const el = resolve(target);
    if (!el) return;
    removeMark(el, kind);
    watcher.bump('marks');
  };
  const clearMarks = (kind?: MarkKind) => {
    clearAllMarks(kind);
    watcher.bump('marks');
  };

  const onChange = (listener: (why: PageChange) => void) => watcher.onChange(listener);

  return {
    get,
    elementFor,
    describe,
    mayAutoClick,
    liveRect,
    mark,
    unmark,
    clearMarks,
    onChange,
    /** For A's key-word highlighting: the amounts with the exact place each is written. */
    amounts: () => {
      get();
      return lastAmounts;
    },
    stop: () => watcher.stop(),
  };
}
