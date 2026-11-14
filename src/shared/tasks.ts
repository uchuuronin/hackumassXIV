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
}
