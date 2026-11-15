// Reading the guide's switches on a page. Owner: C. Read each time, so a change in Settings takes effect at once.
import { need } from '@/shared/ports';
import { GUIDE_SWITCH_KEY, readSwitches, type GuideSwitchId } from '@/shared/guideSwitches';

export async function isOn(id: GuideSwitchId): Promise<boolean> {
  return readSwitches(await need('store').get<unknown>(GUIDE_SWITCH_KEY))[id];
}
