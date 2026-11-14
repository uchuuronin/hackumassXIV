// Page map: the one picture of a page that every lane reads.
// Owner: C (guide lane). Other lanes read these types; tell C before changing them.
//
// Who uses it:
//   A (hands)  -> `mayAutoClick` before every steadied or dwell click; `amounts` for highlighting;
//                 `liveRect` so labels follow the page.
//   B (helper) -> `toModelSafe(map)` is the ONLY form of the map that may go to Gemini;
//                 `stage`, `amounts`, `frames` and `secret` feed Pay Pause, Over-Ask and the fake-button check.
//   C (guide)  -> choice labels, spotlight, guided steps, recorder and player, Fill in my details.
//
// The code that builds the map is in src/guide/pagemap. Import the API from '@/guide'.

/** Version of this shape. Bump when a field changes meaning, so recorded tasks can be checked. */
export const PAGE_MAP_VERSION = 2 as const;

/** Steady's own elements on a page carry this attribute on their host. The page map skips them. */
export const STEADY_UI_ATTR = 'data-steady-ui';

/** What kind of control an element is, simplified from tag + type + role. */
export type ElementKind =
  | 'button'
  | 'link'
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'date'
  | 'time'
  | 'search'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'range'
  | 'file'
  | 'other';

/**
 * The plan's safety limit: click steadying, dwell click and the helper never press these.
 * They need a real press from the person.
 *   pay    -> pay, place order, buy now, subscribe, donate; or a button that sends card details
 *   delete -> delete, remove, cancel an order or subscription, close an account, clear a form
 *   submit -> sends a form (book, send, apply, sign in). Search boxes are not counted.
 */
export type Protection = 'none' | 'pay' | 'delete' | 'submit';

/**
 * Fields Steady never fills, never keeps in the trail and never reads out.
 * The helper says "type this yourself."
 */
export type SecretKind =
  | 'password'
  | 'card-number'
  | 'card-expiry'
  | 'card-code'
  | 'card-name'
  | 'one-time-code'
  | 'id-number' // Social Security, passport, licence, insurance member ID
  | 'bank-account'
  | 'gift-card'
  | 'date-of-birth';

/** Entries of the "My details" card. The plan: name, address, phone and email. Nothing else. */
export type FillKey =
  | 'name'
  | 'given-name'
  | 'family-name'
  | 'email'
  | 'tel'
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-level2' // city
  | 'address-level1' // state
  | 'postal-code'
  | 'country';

/** Where the element's visible name came from, best first. */
export type LabelSource =
  | 'aria-labelledby'
  | 'aria-label'
  | 'label' // <label for> or a wrapping <label>
  | 'text' // the element's own visible words
  | 'value' // <input type="submit" value="...">
  | 'alt' // a picture inside a button or link
  | 'title'
  | 'placeholder'
  | 'nearby' // words just before an unlabelled field: a guess
  | 'icon' // worked out from an icon or symbol: a guess
  | 'name' // from the name or id attribute: a guess
  | 'none';

/** Marks that other lanes put on buttons. C keeps the list. */
export type MarkKind =
  | 'fake' // B: this looks like an advert dressed up as a button
  | 'current-step'; // C: the step the person is on in a guided task

export interface Mark {
  kind: MarkKind;
  /** Plain words, shown to the person: "This is an advert, not part of this page." */
  reason: string;
}

/** Viewport position in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One option of a dropdown or radio group. */
export interface ChoiceOption {
  value: string;
  label: string;
  selected: boolean;
  disabled: boolean;
}

/** One button, link or field on the page. */
export interface PageElement {
  /** Stable for this page load, e.g. "s12". Use `pageMap.elementFor(id)` to get the DOM element. */
  id: string;
  kind: ElementKind;
  /** ARIA role if set, e.g. "button" on a <div>. */
  role?: string;

  /** The name a person would use: "Add to basket", "Date of birth". Never empty. */
  label: string;
  labelSource: LabelSource;
  /**
   * False when the label is a guess (icon, nearby words, attribute name) or missing.
   * The plan: with no confident label, say so and offer "I'm stuck." Never present a guess as fact.
   */
  labelConfident: boolean;
  /** For repeated labels, what this one belongs to: "Reading lamp" for one of three "Remove" buttons. */
  context?: string;
  /** Question the choice answers, for radios and checkboxes: "Delivery speed". */
  group?: string;
  /** Short hint near the field ("MM/DD/YYYY"), if any. */
  hint?: string;

  /** Current value of an ordinary field. Never present when `secret` is set. */
  value?: string;
  options?: ChoiceOption[];
  checked?: boolean;
  min?: number;
  max?: number;
  step?: number;

  required: boolean;
  disabled: boolean;
  /** Has size and is not hidden. */
  visible: boolean;
  /** At least partly inside the current viewport. */
  inViewport: boolean;
  /** Something else is on top of it right now (a pop-up, a cookie banner). Don't point at it. */
  covered: boolean;
  rect: Rect;

  protection: Protection;
  /** Plain words: 'it says "Place order"', "it sends this form". */
  protectionReason?: string;

  /** Set for fields Steady must never fill, keep or read out. */
  secret?: SecretKind;
  /** Which "My details" entry fits this field. Never set together with `secret`. */
  fillAs?: FillKey;
  /** How sure the match is: the site's own autofill hint, the input type, or only the label. */
  fillFrom?: 'autocomplete' | 'type' | 'label';
  /** True if what is typed here is personal: any `secret` or `fillAs` field. */
  sensitive: boolean;

  marks: Mark[];

  /** Id of the PageForm it belongs to, if any. */
  formId?: string;
  /** Link target, for links only. Stays on the device. */
  href?: string;
  /** The link goes to a different website. */
  leavesSite?: boolean;
  opensNewTab?: boolean;
  /** Inside a same-site frame. Frames from other sites can't be read; see `PageMap.frames`. */
  inFrame: boolean;
  /** Inside the pop-up window that is open right now. */
  inDialog: boolean;
  /** Not a real button or link: found only because the page shows a hand cursor on it. */
  inferred?: boolean;
}

/** A form and the fields in it, in reading order. */
export interface PageForm {
  id: string;
  /** Heading above the form, e.g. "Delivery address". */
  label: string;
  fieldIds: string[];
  /** The button that sends it, if found. Steady points at it and stops. */
  submitId?: string;
  /** The form asks for card details. */
  takesPayment: boolean;
  isSearch: boolean;
}

export interface PageHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export type AmountKind = 'total' | 'subtotal' | 'delivery' | 'tax' | 'discount' | 'price';

/** A sum of money written on the page. For key-word highlighting and "Check before you pay." */
export interface PageAmount {
  kind: AmountKind;
  /** Words next to it: "Order total". */
  label: string;
  /** As written: "$42.10". */
  text: string;
  value: number;
  currency: string;
  /** Set when it repeats: "a month", "per year". A renewal. */
  recurring?: string;
  /** Crossed out: an old price, not what is charged. */
  struck: boolean;
  rect: Rect;
}

/** A frame on the page. Adverts usually live in frames from another site. */
export interface PageFrame {
  src: string;
  /** False when the frame comes from another site. Steady can't see inside those. */
  sameSite: boolean;
  title: string;
  visible: boolean;
  rect: Rect;
}

export type StageKind =
  | 'sign-in'
  | 'sign-up'
  | 'code'
  | 'basket'
  | 'checkout'
  | 'payment'
  | 'booking'
  | 'confirmation'
  | 'search'
  | 'form'
  | 'reading';

/** Where the person is, in plain words. */
export interface PageStage {
  kind: StageKind;
  /** "Your basket", "Paying", "Signing in". */
  label: string;
}

/** The whole page map. Stays on the device. For Gemini, use `toModelSafe`. */
export interface PageMap {
  version: typeof PAGE_MAP_VERSION;
  url: string;
  origin: string;
  title: string;
  /** Date.now() when taken. */
  takenAt: number;
  /** How long it took to build, in milliseconds. */
  tookMs: number;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
  stage: PageStage;
  /** The pop-up window that is open, if any. Everything outside it can't be used until it closes. */
  dialog?: { label: string };
  headings: PageHeading[];
  elements: PageElement[];
  forms: PageForm[];
  amounts: PageAmount[];
  frames: PageFrame[];
  /** True if elements were cut at `maxElements`. */
  truncated: boolean;
}

export interface PageMapOptions {
  /** Only elements at least partly on screen. Default false. */
  visibleOnly?: boolean;
  /** Cap on elements, closest to the viewport kept first. Default 400. */
  maxElements?: number;
  /** Include same-site frames. Default true. */
  includeFrames?: boolean;
}

/** Answer to "may Steady click this without a real press?" */
export interface AutoClickVerdict {
  allowed: boolean;
  /** Id of the button or link the click would land on, if there is one. */
  id?: string;
  /** Plain words for the person when the answer is no. */
  reason?: string;
}

/** What C exports as `pageMap` from '@/guide'. Runs in the content script. */
export interface PageMapApi {
  /** The current map. Cached until the page changes or scrolls. */
  get(options?: PageMapOptions): PageMap;
  /** The DOM element for an id, or null if it has gone. */
  elementFor(id: string): Element | null;
  /** Describe the button, link or field at or around a DOM node (for example a click target). */
  describe(target: Element): PageElement | null;
  /** A's safety limit. Call before every steadied click and every dwell click. */
  mayAutoClick(target: Element): AutoClickVerdict;
  /** Where an element is right now, for labels that follow the page. Null if gone or hidden. */
  liveRect(id: string): Rect | null;
  /** Put a mark on a button. B marks fake buttons; C marks the current step. */
  mark(target: string | Element, kind: MarkKind, reason: string): void;
  unmark(target: string | Element, kind: MarkKind): void;
  clearMarks(kind?: MarkKind): void;
  /** Called (at most a few times a second) when the page changes enough that the map is out of date. */
  onChange(listener: (why: PageChange) => void): () => void;
}

export type PageChange = 'content' | 'address' | 'marks';

// ---- Messages (side panel or background -> content script) ----

export interface PageMapRequest {
  type: 'pagemap/get';
  options?: PageMapOptions;
}

export interface PageMapResponse {
  type: 'pagemap/result';
  map: PageMap;
}

/**
 * Ask a tab to say when its map goes out of date. Off by default, so pages that are not being
 * helped right now never wake the background worker. Send `on: false` when the panel closes.
 */
export interface PageMapWatch {
  type: 'pagemap/watch';
  on: boolean;
}

/** Sent by the content script, only while watched, when the map is out of date. Ask again with `pagemap/get`. */
export interface PageMapChanged {
  type: 'pagemap/changed';
  why: PageChange;
  url: string;
}

// ---- What may go to Gemini ----

/**
 * The plan's privacy list: Gemini gets "the names of buttons and fields on the page.
 * Not what's typed in them." So this has no values, no choices made, no link addresses,
 * no headings, no prices, no page title and no address beyond the site and path.
 */
export interface ModelSafeElement {
  id: string;
  kind: ElementKind;
  role?: string;
  label: string;
  labelConfident: boolean;
  group?: string;
  /** Option names of a dropdown, without which one is chosen. */
  optionLabels?: string[];
  required: boolean;
  disabled: boolean;
  visible: boolean;
  inViewport: boolean;
  covered: boolean;
  protection: Protection;
  secret?: SecretKind;
  fillAs?: FillKey;
  marks: MarkKind[];
  formId?: string;
  leavesSite?: boolean;
  inDialog: boolean;
}

export interface ModelSafeMap {
  version: typeof PAGE_MAP_VERSION;
  site: string;
  path: string;
  stage: PageStage;
  dialogOpen: boolean;
  elements: ModelSafeElement[];
  forms: Array<Pick<PageForm, 'id' | 'fieldIds' | 'submitId' | 'takesPayment' | 'isSearch'>>;
}

/** The only form of the page map that may be sent to Gemini. */
export function toModelSafe(map: PageMap): ModelSafeMap {
  let path = '/';
  try {
    path = new URL(map.url).pathname;
  } catch {
    // keep '/'
  }
  return {
    version: map.version,
    site: map.origin,
    path,
    stage: map.stage,
    dialogOpen: !!map.dialog,
    elements: map.elements.map((el) => ({
      id: el.id,
      kind: el.kind,
      role: el.role,
      label: el.label,
      labelConfident: el.labelConfident,
      group: el.group,
      optionLabels: el.options?.map((o) => o.label),
      required: el.required,
      disabled: el.disabled,
      visible: el.visible,
      inViewport: el.inViewport,
      covered: el.covered,
      protection: el.protection,
      secret: el.secret,
      fillAs: el.fillAs,
      marks: el.marks.map((m) => m.kind),
      formId: el.formId,
      leavesSite: el.leavesSite,
      inDialog: el.inDialog,
    })),
    forms: map.forms.map((f) => ({
      id: f.id,
      fieldIds: f.fieldIds,
      submitId: f.submitId,
      takesPayment: f.takesPayment,
      isSearch: f.isSearch,
    })),
  };
}

// ---- Small helpers every lane can use ----

/** True if Steady must not press this itself. */
export function needsRealPress(el: PageElement): boolean {
  return el.protection !== 'none' || el.marks.some((m) => m.kind === 'fake');
}

/** True if Steady may put a "My details" entry in this field. */
export function mayFill(el: PageElement): boolean {
  return !!el.fillAs && !el.secret && !el.disabled && el.visible;
}

export function findElement(map: PageMap, id: string): PageElement | undefined {
  return map.elements.find((el) => el.id === id);
}

/** The label with its context, for repeated buttons: "Remove (Reading lamp)". */
export function fullLabel(el: PageElement): string {
  return el.context ? `${el.label} (${el.context})` : el.label;
}
