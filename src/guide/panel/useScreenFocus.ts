// When the panel changes screen, focus follows (WCAG 2.4.3). Owner: C.
// Without this, the button she pressed vanishes with the old screen and focus falls back to the top of
// the page: a keyboard user has to find her place again and a screen reader says nothing at all.
//
// Going in: focus lands on the new screen's title, so its name is read out.
// Going back: focus lands on the button she came through (it has the id `open-<screen>`).

import { useEffect, useRef } from 'react';

export function useScreenFocus(screen: string): void {
  const before = useRef<string | null>(null);
  useEffect(() => {
    const last = before.current;
    before.current = screen;
    if (last === null || last === screen) return; // the first paint: leave focus where the page put it
    const target = document.getElementById(`open-${last}`) ?? document.querySelector<HTMLElement>('h1.where');
    target?.focus();
  }, [screen]);
}
