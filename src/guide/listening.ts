// Is Milo in the middle of a conversation where what she types or says is an answer to it?
// (Going through a page with her; asking for the email address of someone she trusts.)
// The panel is told, so her words come to the page first and not to the general helper. Owner: C.

const open = new Set<string>();
let announce: (on: boolean) => void = () => undefined;

/** The page start-up wires this to a message to the panel. */
export function onListening(tell: (on: boolean) => void): void {
  announce = tell;
}

export function listen(who: string, yes: boolean): void {
  const before = open.size > 0;
  if (yes) open.add(who);
  else open.delete(who);
  if (open.size > 0 !== before) announce(open.size > 0);
}

export const isListening = (): boolean => open.size > 0;
