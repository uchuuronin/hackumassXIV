// What every pop-up Steady puts over a page owes a keyboard or screen-reader user (WCAG 2.4.3, 4.1.2).
// Shared by Pay Pause (B) and Big Pick (A), so both behave the same way. Owner: C.
//
// A pop-up that says it is "modal" has to keep that promise: it is announced by name, Tab goes round
// inside it and never out to the page behind, and when it closes focus goes back to where it was.

const CAN_FOCUS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The things inside `box` that Tab can land on right now. */
function stops(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(CAN_FOCUS)].filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
}

/** Keeps Tab and Shift+Tab inside `box`. Returns the way to let go. Works inside a shadow root, open or closed. */
export function keepFocusInside(box: HTMLElement): () => void {
  const doc = box.ownerDocument;
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = stops(box);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const now = (box.getRootNode() as Document | ShadowRoot).activeElement;
    const inside = !!now && box.contains(now);
    const leaving = event.shiftKey ? now === first : now === last;
    if (inside && !leaving) return; // an ordinary step from one button to the next
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  };
  doc.addEventListener('keydown', onKey, true);
  return () => doc.removeEventListener('keydown', onKey, true);
}

let nextId = 0;

/**
 * Call once the pop-up is on the page. Names it after its heading, ties its first lines to it so they
 * are read out with the name, moves focus in and keeps it there. Returns `close`: call it when the
 * pop-up goes, and focus returns to whatever had it before (the button she pressed).
 */
export function openDialog(box: HTMLElement, parts: { title: Element; about?: Element; first?: HTMLElement | null }): () => void {
  const doc = box.ownerDocument;
  let from: Element | null = doc.activeElement;
  while (from?.shadowRoot?.activeElement) from = from.shadowRoot.activeElement;
  const id = `steady-dialog-${(nextId += 1)}`;
  if (!parts.title.id) parts.title.id = `${id}-title`;
  box.setAttribute('aria-labelledby', parts.title.id);
  box.removeAttribute('aria-label'); // the heading is the name; two names would be read twice
  if (parts.about) {
    if (!parts.about.id) parts.about.id = `${id}-about`;
    box.setAttribute('aria-describedby', parts.about.id);
  }
  (parts.first ?? stops(box)[0])?.focus({ preventScroll: true });
  const release = keepFocusInside(box);
  return () => {
    release();
    if (from instanceof HTMLElement && from.isConnected) from.focus({ preventScroll: true });
  };
}
