// Tools, profile keys and message names shared by all lanes. Owner: B.
// Add to this file, don't rename things in it. A and C import from here.

export type LaneName = 'hands' | 'helper' | 'guide';

export interface ToolParam {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolResult {
  ok: boolean;
  /** Plain words for the person, read out or shown as is. */
  said: string;
  /** Optional extra for other lanes, e.g. a rect for the overlay. */
  data?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  owner: LaneName;
  parameters: Record<string, ToolParam>;
  run(args: Record<string, unknown>): Promise<ToolResult>;
  undo?(): Promise<void>;
}

/** Profile keys are prefixed with the lane that owns them, e.g. 'helper:level'. */
export type ProfileKey = `${LaneName}:${string}`;

export const HELPER_KEYS = {
  level: 'helper:level',
  voiceOn: 'helper:voiceOn',
} as const;

export type HelpLevel = 'show' | 'with-me' | 'do-it';

/** Messages between panel, background worker and content script. */
export interface HelperAsk { type: 'helper/ask'; text: string }
export interface HelperAnswer { type: 'helper/answer'; said: string; options?: string[] }
export interface ToolRun { type: 'tool/run'; name: string; args: Record<string, unknown> }
export interface ToolResultMsg { type: 'tool/result'; result: ToolResult }

export type Msg = HelperAsk | HelperAnswer | ToolRun | ToolResultMsg;
