/** Settle delay before forcing idle so a real Stop hook can win the race. */
export const AGENT_HOOK_INTERRUPT_SETTLE_MS = 250;

/** Double-escape window for tools that use Esc as a soft cancel first. */
export const AGENT_HOOK_DOUBLE_ESCAPE_MS = 600;

export type AgentHookInterruptIntent = "ctrl-c" | "plain-escape";

/** Minimal session shape needed for interrupt baseline matching. */
export type AgentHookInterruptSession = {
  session_id: string;
  tool: string;
  state: string;
  timestamp: string;
};

export type AgentHookInterruptBaseline = {
  sessionId: string;
  tool: string;
  timestamp: string;
  state: "running" | "permission_request";
  intent: AgentHookInterruptIntent;
  /** Wall-clock ms when the first Escape was observed (double-escape tools). */
  firstEscapeAt?: number;
};

export type AgentHookInterruptInference = {
  /** Observe raw terminal input bytes/text for interrupt keys. */
  observeInput(data: string): void;
  dispose(): void;
};

type CreateDeps = {
  /** Stable pane id (`{context}:{tmuxWindowName}`) used as hook session_id. */
  getStablePaneId: () => string | null;
  getSession: (sessionId: string) => AgentHookInterruptSession | undefined;
  forceSessionIdle: (sessionId: string) => void | Promise<void>;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

function isActiveHookState(
  state: string
): state is "running" | "permission_request" {
  return state === "running" || state === "permission_request";
}

/** Tools that require a double Escape to cancel a turn. */
function requiresDoubleEscape(tool: string | undefined): boolean {
  return tool === "opencode";
}

export function isCtrlCInput(data: string): boolean {
  return data.includes("\x03");
}

export function isPlainEscapeInput(data: string): boolean {
  // Bare ESC, not CSI sequences (arrow keys etc. start with ESC [).
  if (data === "\x1b") return true;
  // Some terminals deliver ESC alone then more bytes; only treat pure ESC.
  return data.length === 1 && data.charCodeAt(0) === 0x1b;
}

function captureBaseline(
  session: AgentHookInterruptSession,
  intent: AgentHookInterruptIntent
): AgentHookInterruptBaseline | null {
  if (!isActiveHookState(session.state)) {
    return null;
  }
  return {
    sessionId: session.session_id,
    tool: session.tool,
    timestamp: session.timestamp,
    state: session.state,
    intent,
  };
}

/**
 * Watches terminal input for Ctrl+C / Escape and force-idles the matching
 * agent-hook session when the agent never posts a terminal Stop event.
 */
export function createAgentHookInterruptInference({
  getStablePaneId,
  getSession,
  forceSessionIdle,
  now = () => Date.now(),
  setTimer = (cb, ms) => setTimeout(cb, ms),
  clearTimer = (timer) => clearTimeout(timer),
}: CreateDeps): AgentHookInterruptInference {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: AgentHookInterruptBaseline | null = null;
  let doubleEscape: AgentHookInterruptBaseline | null = null;
  let doubleEscapeTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPending = () => {
    if (pendingTimer !== null) {
      clearTimer(pendingTimer);
      pendingTimer = null;
    }
    pending = null;
  };

  const clearDoubleEscape = () => {
    doubleEscape = null;
    if (doubleEscapeTimer !== null) {
      clearTimer(doubleEscapeTimer);
      doubleEscapeTimer = null;
    }
  };

  const dispose = () => {
    clearPending();
    clearDoubleEscape();
  };

  const flush = () => {
    const baseline = pending;
    pendingTimer = null;
    pending = null;
    if (!baseline) return;

    const session = getSession(baseline.sessionId);
    if (!session) return;
    if (!isActiveHookState(session.state)) {
      return;
    }
    // Baseline mismatch means a newer hook update arrived — let hooks win.
    if (
      session.tool !== baseline.tool ||
      session.timestamp !== baseline.timestamp ||
      session.state !== baseline.state
    ) {
      return;
    }

    void forceSessionIdle(baseline.sessionId);
  };

  const scheduleFlush = (baseline: AgentHookInterruptBaseline, settleMs: number) => {
    clearPending();
    pending = baseline;
    pendingTimer = setTimer(flush, settleMs);
  };

  const observeIntent = (intent: AgentHookInterruptIntent) => {
    const paneId = getStablePaneId();
    if (!paneId) {
      dispose();
      return;
    }
    const session = getSession(paneId);
    if (!session) {
      dispose();
      return;
    }

    const baseline = captureBaseline(session, intent);
    if (!baseline) {
      dispose();
      return;
    }

    if (requiresDoubleEscape(session.tool) && intent === "plain-escape") {
      if (
        doubleEscape &&
        doubleEscape.sessionId === baseline.sessionId &&
        doubleEscape.tool === baseline.tool &&
        doubleEscape.timestamp === baseline.timestamp &&
        typeof doubleEscape.firstEscapeAt === "number" &&
        now() - doubleEscape.firstEscapeAt <= AGENT_HOOK_DOUBLE_ESCAPE_MS
      ) {
        // Second Escape within the window — treat as interrupt.
        clearDoubleEscape();
        scheduleFlush(baseline, AGENT_HOOK_INTERRUPT_SETTLE_MS);
        return;
      }
      clearDoubleEscape();
      doubleEscape = { ...baseline, firstEscapeAt: now() };
      doubleEscapeTimer = setTimer(() => {
        doubleEscape = null;
        doubleEscapeTimer = null;
      }, AGENT_HOOK_DOUBLE_ESCAPE_MS);
      return;
    }

    clearDoubleEscape();
    scheduleFlush(baseline, AGENT_HOOK_INTERRUPT_SETTLE_MS);
  };

  return {
    observeInput(data: string) {
      if (!data) return;
      if (isCtrlCInput(data)) {
        observeIntent("ctrl-c");
        return;
      }
      if (isPlainEscapeInput(data)) {
        observeIntent("plain-escape");
      }
    },
    dispose,
  };
}
