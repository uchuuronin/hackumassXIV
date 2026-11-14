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
}

export interface Overlay {
  show(item: OverlayItem): void;
  hide(id: string): void;
  clear(): void;
}
