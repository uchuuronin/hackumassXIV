// The order in which the relay tries a question. Kept apart from the server so it can be tested. Owner: C
// (asked for by the guide lane); B's server.ts calls it.
//
// The rule: asking for more can never do worse than asking plainly.
//   - `search`: the main model may look things up on the web. Tried once, first.
//   - `json`: Gemini is told to answer in strict JSON (responseMimeType), so the extension never has to
//     fish an answer out of chatty text. Tried once on the main model.
// Search and strict JSON are never asked for in the same try, because the search tool does not allow it.
// After those, the same prompt is asked in the ordinary way: the main model, then the lighter one.

export interface Try {
  model: string;
  search: boolean;
  json: boolean;
}

export function triesFor(o: { main: string; fallback: string; search?: boolean; json?: boolean }): Try[] {
  const tries: Try[] = [];
  if (o.search && o.main) tries.push({ model: o.main, search: true, json: false });
  if (o.json && o.main) tries.push({ model: o.main, search: false, json: true });
  for (const model of [o.main, o.fallback]) if (model) tries.push({ model, search: false, json: false });
  return tries;
}

/** What to pass to Gemini as `config` for one try, or nothing for a plain question. */
export function configFor(t: Try): Record<string, unknown> | undefined {
  if (t.search) return { tools: [{ googleSearch: {} }] };
  if (t.json) return { responseMimeType: 'application/json' };
  return undefined;
}
