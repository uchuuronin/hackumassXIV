// Home Turf: remembers which sites the person has used, on this device only. Owner: B.
import { getOverlay } from '@/hands';
import type { LaneContext } from '@/shared/lanes';
import type { ProfileKey } from '@/shared/tools';
import { getProfile, setProfile } from './profile';
import { lookalikeOf, siteName } from './sitenames';

const SITES_KEY: ProfileKey = 'helper:sites';
type Sites = Record<string, { visits: number; first: number }>;

interface Current { site: string; visits: number; lookalike?: string }
let current: Current = { site: siteName(location.hostname), visits: 0 };

/** Who is being paid: the site's own name if it gives one, plus its address. */
function payeeName(): string {
  const meta = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  const fromTitle = (document.title.split(/[|–—-]/)[0] ?? '').trim();
  const name = (meta || fromTitle || '').slice(0, 40);
  return name && name.toLowerCase() !== current.site ? `${name} (${current.site})` : current.site;
}

/** Plain-words lines for the Pay Pause card. */
export function siteLines(): string[] {
  const out = [`You are paying ${payeeName()}.`];
  if (current.lookalike) {
    out.push(`Careful: this site's name is almost the same as ${current.lookalike}, which you use. Check the address.`);
  } else if (current.visits === 0) {
    out.push('You have not used this site before.');
  } else if (current.visits >= 3) {
    out.push('You have used this site before.');
  }
  return out;
}

export async function startHomeTurf(ctx: LaneContext): Promise<void> {
  if (!/^https?:$/.test(location.protocol)) return;
  const site = siteName(location.hostname);
  const sites = await getProfile<Sites>(SITES_KEY, {});
  const prior = sites[site]?.visits ?? 0;
  const known = Object.entries(sites).filter(([, r]) => r.visits >= 3).map(([s]) => s);
  current = { site, visits: prior, lookalike: lookalikeOf(site, known) };
  sites[site] = { visits: prior + 1, first: sites[site]?.first ?? Date.now() };
  await setProfile(SITES_KEY, sites);

  const label = current.lookalike
    ? `Careful: this site's name is almost the same as ${current.lookalike}.`
    : prior === 0
      ? 'New to you. You have not used this site before.'
      : prior >= 3
        ? 'A site you have used before.'
        : 'You have visited this site a few times.';
  getOverlay().show({ id: 'helper-turf', box: false, where: { x: 12, y: 12, width: 320, height: 40 }, label, tone: current.lookalike ? 'warning' : 'info' });
  const timer = setTimeout(() => getOverlay().hide('helper-turf'), current.lookalike ? 20000 : 6000);
  ctx.onStop(() => { clearTimeout(timer); getOverlay().hide('helper-turf'); });
}
