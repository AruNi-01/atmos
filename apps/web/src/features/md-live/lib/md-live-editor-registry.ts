export type {
  MdLiveAiActionKind,
  MdLiveBlockAction,
  MdLiveEditorHandle as MdLiveEditorApi,
} from "@atmos/md-live/ui";
import type { MdLiveAiActionKind, MdLiveEditorHandle as MdLiveEditorApi } from "@atmos/md-live/ui";

export type MdLiveEditorEvent =
  | { type: "stream-aborted" }
  | { type: "stream-ended" }
  | { type: "ai-action"; kind: MdLiveAiActionKind; selection: string };

type Listener = (event: MdLiveEditorEvent) => void;

const apis = new Map<string, MdLiveEditorApi>();
const listeners = new Map<string, Set<Listener>>();
const readyWaiters = new Map<string, Set<(api: MdLiveEditorApi) => void>>();

export function registerMdLiveEditor(path: string, api: MdLiveEditorApi): void {
  apis.set(path, api);
  const waiters = readyWaiters.get(path);
  if (!waiters) return;
  readyWaiters.delete(path);
  for (const waiter of waiters) waiter(api);
}

export function unregisterMdLiveEditor(path: string, api?: MdLiveEditorApi): void {
  if (api && apis.get(path) !== api) return;
  apis.delete(path);
}

export function getMdLiveEditor(path: string): MdLiveEditorApi | null {
  return apis.get(path) ?? null;
}

export function waitForMdLiveEditor(
  path: string,
  timeoutMs = 4000,
): Promise<MdLiveEditorApi | null> {
  const existing = apis.get(path);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (api: MdLiveEditorApi | null) => {
      if (settled) return;
      settled = true;
      resolve(api);
    };
    const timer = setTimeout(() => {
      const waiters = readyWaiters.get(path);
      if (waiters) {
        waiters.delete(onReady);
        if (waiters.size === 0) readyWaiters.delete(path);
      }
      finish(apis.get(path) ?? null);
    }, timeoutMs);
    const onReady = (api: MdLiveEditorApi) => {
      clearTimeout(timer);
      finish(api);
    };
    const waiters = readyWaiters.get(path) ?? new Set<(api: MdLiveEditorApi) => void>();
    waiters.add(onReady);
    readyWaiters.set(path, waiters);
  });
}

export function emitMdLiveEditorEvent(path: string, event: MdLiveEditorEvent): void {
  const set = listeners.get(path);
  if (!set) return;
  for (const listener of set) listener(event);
}

export function subscribeMdLiveEditorEvents(
  path: string,
  listener: Listener,
): () => void {
  const set = listeners.get(path) ?? new Set();
  set.add(listener);
  listeners.set(path, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(path);
  };
}
