// Over-Ask Alert: warns when a shop page asks for an ID number. Only a label; nothing is blocked. Owner: B.
import { pageMap } from '@/guide';
import { getOverlay } from '@/hands';
import type { LaneContext } from '@/shared/lanes';
import type { StageKind } from '@/shared/pagemap';

const SHOP: StageKind[] = ['basket', 'checkout', 'payment'];
const LABEL = 'This asks for an ID number. A shop does not need it to sell you something. Leave it empty.';

export function startOverAsk(ctx: LaneContext): void {
  const shown = new Set<string>();
  const hide = (id: string) => { getOverlay().hide(`helper-overask-${id}`); shown.delete(id); };

  const scan = () => {
    const map = pageMap.get();
    const now = new Set<string>();
    if (SHOP.includes(map.stage.kind)) {
      for (const el of map.elements) {
        if (el.secret !== 'id-number' || !el.visible) continue;
        now.add(el.id);
        if (shown.has(el.id)) continue;
        shown.add(el.id);
        getOverlay().show({ id: `helper-overask-${el.id}`, where: () => pageMap.liveRect(el.id), label: LABEL, tone: 'warning' });
      }
    }
    for (const id of [...shown]) if (!now.has(id)) hide(id);
  };

  scan();
  const timer = window.setInterval(scan, 1500);
  ctx.onStop(() => {
    window.clearInterval(timer);
    for (const id of [...shown]) hide(id);
  });
}
