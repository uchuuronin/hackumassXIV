// Site names and the near-match check. Pure functions, no browser code. Owner: B.

/** "www.shop.example.co.uk" -> "example.co.uk"; "www.paypal.com" -> "paypal.com". */
export function siteName(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const second = labels[labels.length - 2] ?? '';
  const last = labels[labels.length - 1] ?? '';
  const keep = last.length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'].includes(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

const nameOf = (site: string): string => site.split('.')[0] ?? '';
// Tricks used in fake addresses: rn looks like m, vv like w, 0 like o, 1 like l.
const fold = (s: string): string => s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l');

function distance(a: string, b: string): number {
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/** The known site this one is dressed up to look like, if any. */
export function lookalikeOf(site: string, known: string[]): string | undefined {
  const n = nameOf(site);
  if (n.length < 5) return undefined;
  for (const k of known) {
    if (k === site) continue;
    const kn = nameOf(k);
    if (kn.length < 5 || kn === n) continue;
    if (fold(n) === fold(kn)) return k; // paypa1 / paypal
    if (n.length >= 6 && distance(n, kn) === 1) return k; // goggle / google
  }
  return undefined;
}
