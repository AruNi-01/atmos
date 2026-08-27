import type { TerminalGridHandle } from "@/features/terminal/lib/terminal-grid-utils";
import {
  getMdLiveTerminalGrid,
  requestMdLiveTerminalGridMount,
  waitForMdLiveTerminalGrid,
} from "./md-live-terminal-bridge";

/** Resolve a background TerminalGrid without activating or focusing Terminal. Never locks. */
export async function resolveMdLiveRunGrid(options?: {
  getGrid?: () => TerminalGridHandle | null;
  waitForGrid?: () => Promise<TerminalGridHandle | null>;
  ensureGrid?: () => void;
}): Promise<TerminalGridHandle | null> {
  const get = options?.getGrid ?? getMdLiveTerminalGrid;
  const existing = get();
  if (existing) return existing;
  (options?.ensureGrid ?? requestMdLiveTerminalGridMount)();
  const wait = options?.waitForGrid ?? waitForMdLiveTerminalGrid;
  return wait();
}
