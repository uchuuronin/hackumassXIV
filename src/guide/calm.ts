// Calming the page during guided steps. Owner: C. The calming itself is the helper lane's (quiet_page and
// unquiet_page, in src/helper): it dims adverts and sales pop-ups and pauses videos that started by themselves.
// Nothing is removed, everything stays clickable, and it is all put back when the guided steps end.
// The plan: "Quiet. On request, or during guided steps."

import { getTool } from '@/helper/registry';
import { isOn } from './switches';

/** True while the page is calm because the guide asked, so only that is undone afterwards. */
let calmed = false;

export async function calmPage(): Promise<void> {
  if (calmed || !(await isOn('calm'))) return;
  const tool = getTool('quiet_page');
  if (!tool) return;
  calmed = true;
  try {
    await tool.run({});
  } catch {
    // a page that can't be calmed is still a page she can be guided through
  }
}

export async function restorePage(): Promise<void> {
  if (!calmed) return;
  calmed = false;
  try {
    await getTool('unquiet_page')?.run({});
  } catch {
    // nothing to put back
  }
}
