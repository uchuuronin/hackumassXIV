// Request matcher: recognises the common requests on the device, without asking Gemini. Owner: B.
export interface Match { tool: string; args: Record<string, unknown> }

const words = (t: string): number => t.trim().split(/\s+/).filter(Boolean).length;

// [pattern, tool, most words allowed]. The first match wins, so the specific ones come first.
const RULES: Array<[RegExp, string, number]> = [
  [/^(stop|cancel|never ?mind|that'?s enough)\b/i, 'fill_stop', 4],
  [/\b(take (that|it) out|that'?s (not right|wrong)|not right)\b|^no[,.! ]/i, 'fill_take_out', 6],
  [/^(yes|yeah|yep|yup|ok|okay|sure|that'?s right|looks (good|right)|i('?ve| have) done (that|it)|done|next)\b/i, 'fill_next', 6],
  [/\b(hide|remove|clear|turn off) (the )?(labels|notes)\b/i, 'hide_choice_labels', 8],
  [/\bwhat (do|can|should) i (click|press)\b|\b(show|explain) (me )?(the )?(labels|buttons)\b/i, 'label_choices', 10],
  [/\b(fill|enter|put)\b.*\b(details|info|information|address|form)\b|\bfill (this|it|the form)\b/i, 'fill_my_details', 12],
];

export function matchRequest(text: string, available: string[]): Match | undefined {
  const t = text.trim();
  for (const [re, tool, maxWords] of RULES) {
    if (!available.includes(tool)) continue;
    if (words(t) > maxWords) continue;
    if (re.test(t)) return { tool, args: {} };
  }
  return undefined;
}
