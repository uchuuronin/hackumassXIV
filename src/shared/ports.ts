// The seams between the lanes, as code. A PROPOSAL from C for the interfaces we said we would agree in writing.
//
// Each lane provides its piece once, at start:
//     provide('overlay', myOverlay);        // A
//     provide('speech', mySpeech);          // B
// and everyone else asks for it at the moment of use:
//     need('overlay').spotlight(id);
//
// Until the owner's piece exists, `need` returns a quiet stand-in, so nothing crashes
// and each lane can be built and tested on its own.

import type { ModelSafeElement, PageStage } from './pagemap';

// ---- Overlay (owner: A). The only thing that draws on a web page. ----

/** go = moves forward; careful = pays, sends or removes; stop = an advert or a trap; info = anything else. */
export type LabelTone = 'go' | 'careful' | 'stop' | 'info';

export interface OverlayLabel {
  /** Page-map id of the element the label points at. The overlay follows it with pageMap.liveRect(id). */
  targetId: string;
  /** One plain sentence. Drawn in a plain font on a solid label, in empty space, covering nothing. */
  text: string;
  tone: LabelTone;
}

export interface OverlayPort {
  /** Show a set of labels. A new call with the same layer replaces the old set. */
  labels(layer: string, labels: OverlayLabel[]): void;
  /** Dim everything except one element, with an optional sentence beside it. Null turns it off. */
  /** `dim: false` asks for a ring only, with the rest of the page left readable (a box in a form). */
  spotlight(target: { targetId: string; text?: string; dim?: boolean } | null): void;
  /** Remove one layer of labels, or everything this lane drew. */
  clear(layer?: string): void;
}

// ---- Speech (owner: B). One voice, one speed, one on/off switch. ----

export interface SpeechPort {
  /**
   * For things Steady says without being asked: moving on to the next box, or checking in after a long pause.
   * Shows the sentence in the panel, and speaks it if the voice is on. `options` are short answers to offer as buttons.
   */
  say(text: string, options?: string[]): void;
}

// ---- Model (owner: B). Gemini, through the relay. ----

export interface ChoiceLabelRequest {
  site: string;
  stage: PageStage;
  /** Names only. Built from toModelSafe, so nothing typed and nothing personal. */
  buttons: Array<Pick<ModelSafeElement, 'id' | 'kind' | 'label' | 'group' | 'protection' | 'leavesSite'>>;
}

export interface ChoiceLabelReply {
  labels: Array<{ id: string; text: string; confident: boolean }>;
}

export interface ModelPort {
  /** One plain sentence per button, starting "Click this to". Unsure? Say so with confident: false. */
  labelChoices(request: ChoiceLabelRequest): Promise<ChoiceLabelReply>;
}

// ---- Store (owner: B). Saved on this device only. Each lane prefixes its own keys. ----

export interface StorePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

// ---- Clicks (owner: A). Only A listens to raw clicks; everyone else subscribes here. ----

export interface ClickPort {
  /** Called once for each click the person really made, with what it landed on. */
  onClick(listener: (target: Element) => void): () => void;
  /** Called when a click landed on nothing and was not steered to a button (for "I'm stuck" after three misses). Added by A. */
  onMiss?(listener: (at: { x: number; y: number }) => void): () => void;
}

// Tools are B's: see Tool and ToolResult in ./tools, and registerTool in src/helper/registry.

// ---- The registry ----

export interface Ports {
  overlay: OverlayPort;
  speech: SpeechPort;
  model: ModelPort | null;
  store: StorePort;
  clicks: ClickPort;
}

const memory = new Map<string, unknown>();

const standIns: Ports = {
  overlay: { labels() {}, spotlight() {}, clear() {} },
  speech: { say() {} },
  model: null, // no Gemini: features fall back to what they can do on the device
  store: {
    async get<T>(key: string) {
      return memory.get(key) as T | undefined;
    },
    async set(key, value) {
      memory.set(key, value);
    },
    async remove(key) {
      memory.delete(key);
    },
  },
  clicks: { onClick: () => () => undefined },
};

const provided: Partial<Ports> = {};

export function provide<K extends keyof Ports>(name: K, piece: Ports[K]): void {
  provided[name] = piece;
}

export function need<K extends keyof Ports>(name: K): Ports[K] {
  return (name in provided ? provided[name] : standIns[name]) as Ports[K];
}

/** True once the owner's real piece is in place. */
export function has(name: keyof Ports): boolean {
  return name in provided;
}
