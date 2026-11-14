// The overlay: the one layer that draws on a page. Owner: A (hands).
// B and C never add their own elements to a page. They call these functions.
//
//   import { getOverlay } from '@/hands';
//   getOverlay().show({ id: 'pay', where: () => pageMap.liveRect(el.id), label: 'Click this to pay' });

import type { Rect } from './pagemap';

/** How the item looks. The words are always in a plain font on a solid label. */
export type OverlayTone =
  | 'info' //    blue: a neutral pointer or label
  | 'step' //    green: the current step of a guided task
  | 'warning'; // amber: a fake button, a check before paying

export interface OverlayItem {
  /** Showing an item with an id that is already up replaces it. */
  id: string;
  /**
   * Where to draw the box, in viewport CSS pixels. Pass a function so the box follows the page
   * when it scrolls or resizes: `() => pageMap.liveRect(id)`. Return null to hide it for now.
   */
  where: Rect | (() => Rect | null);
  /** Plain words shown beside the box. Placed in empty space, never on top of the target. */
  label?: string;
  tone?: OverlayTone;
  /** Set false for a label with no box around anything: a status line. Default true. */
  box?: boolean;
}

export interface CursorPoints {
  /** Where the real pointer is. Drawn as a small dot. Null removes it. */
  raw?: { x: number; y: number } | null;
  /** Where the steadied pointer is. Drawn as a large ring. Null removes it. */
  steady?: { x: number; y: number } | null;
}

export interface Overlay {
  show(item: OverlayItem): void;
  hide(id: string): void;
  clear(): void;
  /** Draw the real and steadied pointer, in viewport pixels. */
  setCursor(points: CursorPoints): void;
  /** A ring that fills around a point, for dwell click. `progress` is 0 to 1. Null removes it. */
  setDwell(progress: number | null, at?: { x: number; y: number }): void;
  /** Dim everything on the page except one box. A function follows the page. Null turns it off. Optional so older stand-ins still fit. */
  setSpotlight?(where: Rect | (() => Rect | null) | null): void;
}
