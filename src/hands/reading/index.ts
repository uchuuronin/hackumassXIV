// Reading adjustments: size, spacing, font, contrast, colour, mark prices, read aloud, pause and reset. Owner: A.
// The settings live in the profile as `hands:reading`. A change in one tab reaches every tab.
// The helper can use the `reading_*` tools; the bar of large buttons is for the person to use directly.

import type { LaneContext } from '@/shared/lanes';
import type { PageMapApi } from '@/shared/pagemap';
import type { Tool, ToolResult } from '@/shared/tools';
import { registerTool } from '@/helper/registry';
import { getProfile, setProfile } from '@/helper/profile';
import { browser } from 'wxt/browser';
import type { AmountHit } from '@/guide/pagemap/amounts';
import { createReadingBar } from './bar';
import { createReadingEngine } from './engine';
import { readAloud, stopReading } from './readAloud';
import {
  COLOURS, CONTRASTS, DEFAULT_READING, FONTS, SPACINGS, WORDS, nextOf, sanitize, stepSize, type ReadingSettings,
} from './settings';

const KEY = 'hands:reading' as const;

export interface Reading {
  settings(): ReadingSettings;
  set(change: Partial<ReadingSettings>): void;
  readAloud(): string;
  stopReading(): void;
  openBar(): void;
  closeBar(): void;
  toggleBar(): void;
}

type CycleSetting = 'spacing' | 'font' | 'contrast' | 'colour' | 'highlight';

export function startReading(ctx: LaneContext, pageMap: PageMapApi & { amounts?(): AmountHit[] }): Reading {
  let settings = DEFAULT_READING;
  let paused = false;
  let speaking = false;
  const send = (message: unknown) => {
    browser.runtime.sendMessage(message).catch(() => undefined);
  };
  const engine = createReadingEngine(document, {
    send,
    amounts: pageMap.amounts ? () => pageMap.amounts!() : undefined,
    onPageChange: (listener) => pageMap.onChange(listener),
  });

  const paint = () => engine.apply(paused ? DEFAULT_READING : settings);
  const save = () => setProfile(KEY, settings).catch(() => undefined);
  const change = (next: Partial<ReadingSettings>) => {
    settings = sanitize({ ...settings, ...next });
    paused = false; // changing something means the person wants to see it
    paint();
    bar.refresh();
    void save();
  };
  const cycle = (which: CycleSetting) => {
    if (which === 'spacing') change({ spacing: nextOf(SPACINGS, settings.spacing) });
    else if (which === 'font') change({ font: nextOf(FONTS, settings.font) });
    else if (which === 'contrast') {
      // A page that is already dark has no "dark" to go to; from Stronger the next step is back to Normal.
      let next = nextOf(CONTRASTS, settings.contrast);
      if (next === 'dark') next = nextOf(CONTRASTS, next);
      change({ contrast: next });
    }
    else if (which === 'colour') change({ colour: nextOf(COLOURS, settings.colour) });
    else change({ highlight: !settings.highlight });
  };

  const read = (): string => {
    speaking = true;
    return readAloud(document, settings.rate, send);
  };
  const stop = () => {
    speaking = false;
    stopReading(send);
  };

  const bar = createReadingBar(document, {
    settings: () => settings,
    paused: () => paused,
    reading: () => speaking,
    smaller: () => change({ sizePct: stepSize(settings.sizePct, -1) }),
    bigger: () => change({ sizePct: stepSize(settings.sizePct, 1) }),
    cycle,
    readAloud: () => void read(),
    stopReading: stop,
    togglePause: () => {
      paused = !paused;
      paint();
    },
    reset: () => {
      paused = false;
      settings = { ...DEFAULT_READING, rate: settings.rate };
      paint();
      void save();
    },
  });

  getProfile<unknown>(KEY, null).then((raw) => {
    settings = sanitize(raw);
    paint();
  }, () => undefined);
  const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const c = changes[KEY];
    if (area !== 'local' || !c) return;
    settings = sanitize(c.newValue);
    paint();
    bar.refresh();
  };
  browser.storage.onChanged.addListener(onStorage);

  // ---- Tools for the helper ----
  const ok = (said: string): ToolResult => ({ ok: true, said });
  const find = <T extends string>(list: readonly T[], words: Record<T, string>, value: string): T | undefined => {
    const v = value.trim().toLowerCase();
    return list.find((item) => item === v || words[item].toLowerCase() === v);
  };
  const tools: Tool[] = [
    {
      name: 'reading_set',
      owner: 'hands',
      description: 'Change how this page reads: text size, spacing, font, contrast, colours, or marking prices.',
      parameters: {
        setting: { type: 'string', description: 'What to change.', required: true, enum: ['size', 'spacing', 'font', 'contrast', 'colour', 'highlight'] },
        value: { type: 'string', description: 'For size: "bigger", "smaller", or a percent like 150. For spacing: normal, roomy, extra. For font: page, plain, serif. For contrast: normal, high. For colour: none, protanopia, deuteranopia, tritanopia, warm. For highlight: on or off.', required: true },
      },
      async run(args) {
        const setting = String(args.setting ?? '');
        const value = String(args.value ?? '');
        if (setting === 'size') {
          const n = Number(value.replace('%', ''));
          const next = value === 'bigger' ? stepSize(settings.sizePct, 1) : value === 'smaller' ? stepSize(settings.sizePct, -1) : n;
          if (!Number.isFinite(next) || next < 50 || next > 300) return { ok: false, said: 'Say "bigger", "smaller" or a size like 150.' };
          change({ sizePct: next });
          return ok(`Text size is now ${settings.sizePct} percent.`);
        }
        if (setting === 'highlight') {
          change({ highlight: /^(on|yes|true)$/i.test(value) });
          return ok(settings.highlight ? 'Prices and totals are marked.' : 'Marking is off.');
        }
        const lists = { spacing: [SPACINGS, WORDS.spacing], font: [FONTS, WORDS.font], contrast: [CONTRASTS, WORDS.contrast], colour: [COLOURS, WORDS.colour] } as const;
        const entry = lists[setting as keyof typeof lists];
        if (!entry) return { ok: false, said: `I can not change "${setting}".` };
        const hit = find(entry[0] as readonly string[], entry[1] as Record<string, string>, value);
        if (!hit) return { ok: false, said: `"${value}" is not one of the choices for ${setting}.` };
        change({ [setting]: hit } as Partial<ReadingSettings>);
        return ok(`${setting[0]?.toUpperCase()}${setting.slice(1)} is now ${(entry[1] as Record<string, string>)[hit]?.toLowerCase()}.`);
      },
      async undo() {
        /* Reset or the bar puts things back. */
      },
    },
    { name: 'reading_read_aloud', owner: 'hands', description: 'Read the selected words, or this page, out loud.', parameters: {}, run: async () => ok(read()) },
    { name: 'reading_stop', owner: 'hands', description: 'Stop reading out loud.', parameters: {}, run: async () => (stop(), ok('Stopped.')) },
    {
      name: 'reading_reset',
      owner: 'hands',
      description: 'Put the text size, spacing, font, contrast and colours back to how the page was.',
      parameters: {},
      run: async () => {
        settings = { ...DEFAULT_READING, rate: settings.rate };
        paused = false;
        paint();
        bar.refresh();
        void save();
        return ok('Everything is back the way the page was.');
      },
    },
    { name: 'reading_open_bar', owner: 'hands', description: 'Show the bar of large buttons for changing how the page reads.', parameters: {}, run: async () => (bar.show(), ok('Here are the reading buttons.')) },
  ];
  for (const tool of tools) registerTool(tool);

  ctx.onStop(() => {
    browser.storage.onChanged.removeListener(onStorage);
    bar.hide();
    engine.destroy();
  });

  return {
    settings: () => settings,
    set: change,
    readAloud: read,
    stopReading: stop,
    openBar: () => bar.show(),
    closeBar: () => bar.hide(),
    toggleBar: () => bar.toggle(),
  };
}
