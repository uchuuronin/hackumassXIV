// Recorded tasks: a family member does a task once, and Steady keeps the steps.
// It keeps WHERE to click, choose and type. It never keeps what was typed or chosen.
// Owner: C. Shared because the relay carries tasks to the other computer and the panel lists them.

import type { ElementKind, FillKey, Protection, Region, SecretKind, StageKind } from './pagemap';

/** The plan's three step types. */
export type StepType =
  | 'click' // "click this"
  | 'choose' // "choose yours": a dropdown, a date, a tick box, one of several options
  | 'type'; // "type this yourself"

/** Several ways to find the same element again, so a small change to the site doesn't lose the step. */
export interface StepLocator {
  kind: ElementKind;
  label: string;
  labelConfident: boolean;
  /** For repeated buttons: which item it belonged to. */
  context?: string;
  /** For a set of options: the question they answer. */
  group?: string;
  formLabel?: string;
  protection: Protection;
  secret?: SecretKind;
  fillAs?: FillKey;
  /** It was the button that sends its form. */
  sendsForm: boolean;
  region: Region;
  /** The site's own names for the element. They often survive a change of wording. */
  attrs: { id?: string; name?: string; testId?: string };
  /** Where a link leads, without the site name. */
  hrefPath?: string;
}

export interface TaskStep {
  type: StepType;
  /** The instruction in plain words. */
  say: string;
  locator: StepLocator;
  /** The page the step was on, so "Where was I?" can find the place. */
  page: { origin: string; path: string; stage: StageKind };
}

export interface RecordedTask {
  version: 1;
  id: string;
  /** In the family member's words: "Book a doctor's appointment". */
  name: string;
  site: string;
  recordedAt: number;
  steps: TaskStep[];
  /** Set when the task arrived from another computer, so Steady can always say so. */
  shared?: { at: number; said?: boolean };
}

// ---- A task that arrives from another computer ----

const KINDS = ['button', 'link', 'text', 'email', 'password', 'number', 'tel', 'date', 'time', 'search', 'textarea', 'select', 'checkbox', 'radio', 'range', 'file', 'other'];
const PROTECTIONS = ['none', 'pay', 'delete', 'submit'];

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) || undefined : undefined;

function webOrigin(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check a task that came from somewhere else, and rebuild it from only the parts Steady knows.
 * Anything extra is dropped, so there is nowhere for someone's answers, or anything else, to ride along.
 * Null if it is not a task.
 */
export function checkTask(input: unknown): RecordedTask | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const name = text(raw.name, 80);
  const site = webOrigin(raw.site);
  if (raw.version !== 1 || !name || !site || !Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 80) return null;

  const steps: TaskStep[] = [];
  for (const item of raw.steps as Array<Record<string, unknown>>) {
    const loc = (item?.locator ?? {}) as Record<string, unknown>;
    const page = (item?.page ?? {}) as Record<string, unknown>;
    const attrs = (loc.attrs ?? {}) as Record<string, unknown>;
    const type = item?.type;
    const label = text(loc.label, 200);
    const origin = webOrigin(page.origin);
    const path = text(page.path, 300);
    if ((type !== 'click' && type !== 'choose' && type !== 'type') || !label || !origin || !path?.startsWith('/')) return null;
    if (!KINDS.includes(String(loc.kind)) || !PROTECTIONS.includes(String(loc.protection))) return null;
    steps.push({
      type,
      say: text(item.say, 200) ?? '',
      locator: {
        kind: loc.kind as StepLocator['kind'],
        label,
        labelConfident: loc.labelConfident === true,
        context: text(loc.context, 120),
        group: text(loc.group, 200),
        formLabel: text(loc.formLabel, 120),
        protection: loc.protection as StepLocator['protection'],
        secret: text(loc.secret, 40) as StepLocator['secret'],
        fillAs: text(loc.fillAs, 40) as StepLocator['fillAs'],
        sendsForm: loc.sendsForm === true,
        region: (text(loc.region, 20) ?? 'main') as StepLocator['region'],
        attrs: { id: text(attrs.id, 120), name: text(attrs.name, 120), testId: text(attrs.testId, 120) },
        hrefPath: text(loc.hrefPath, 300),
      },
      page: { origin, path, stage: (text(page.stage, 20) ?? 'other') as TaskStep['page']['stage'] },
    });
  }
  return { version: 1, id: text(raw.id, 40) ?? `t${Date.now().toString(36)}`, name, site, recordedAt: Number(raw.recordedAt) || Date.now(), steps, shared: { at: Date.now() } };
}
