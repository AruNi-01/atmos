import type { PtScene } from "../core/types";
import { createApplyGate } from "./apply-gate";

export type BoardSyncHost = {
  getBoardScene(): PtScene;
  pushToBoard(scene: PtScene): void;
};

export type BoardChangeResult = "echo" | "ignored" | "applied";

/**
 * One truth between the in-memory session and the Excalidraw host.
 * Agent tools run inside `runHeld` so N dispatches become a single `commit`.
 * Extra async `onChange` echoes are ignored until `drain`.
 */
export function createBoardSync(input: {
  getSessionScene: () => PtScene;
  replaceSession: (scene: PtScene) => void;
  fingerprint: (scene: PtScene) => string;
  getHost: () => BoardSyncHost | null;
}) {
  const gate = createApplyGate();
  let hold = 0;
  let committing = false;
  let preCommit: string | null = null;
  let lastCommitted: string | null = null;

  const beginEcho = () => {
    gate.begin();
  };

  const commit = (): boolean => {
    const host = input.getHost();
    if (!host) return false;
    const session = input.getSessionScene();
    const board = host.getBoardScene();
    const boardFp = input.fingerprint(board);
    const sessionFp = input.fingerprint(session);
    if (boardFp === sessionFp) return false;
    preCommit = boardFp;
    lastCommitted = sessionFp;
    beginEcho();
    host.pushToBoard(session);
    return true;
  };

  const onSessionChanged = () => {
    if (hold > 0) return;
    commit();
  };

  const onBoardChange = (boardScene: PtScene): BoardChangeResult => {
    const boardFp = input.fingerprint(boardScene);
    const sessionFp = input.fingerprint(input.getSessionScene());
    if (gate.consume()) return "echo";
    if (hold > 0 || committing) return "ignored";
    if (boardFp === sessionFp) return "ignored";
    if (preCommit && boardFp === preCommit && lastCommitted && sessionFp === lastCommitted) {
      return "ignored";
    }
    input.replaceSession(boardScene);
    lastCommitted = input.fingerprint(boardScene);
    preCommit = null;
    return "applied";
  };

  const runHeld = <T>(fn: () => T): T => {
    hold += 1;
    try {
      return fn();
    } finally {
      hold -= 1;
    }
  };

  const drain = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    gate.reset();
    committing = false;
  };

  return { beginEcho, commit, onSessionChanged, onBoardChange, runHeld, drain };
}

export type BoardSync = ReturnType<typeof createBoardSync>;
