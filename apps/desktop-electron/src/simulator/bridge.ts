import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { DesktopCommandError } from "../errors.js";
import { listenersAreLoopback } from "./bind-assert.ts";
import {
  releaseClaim,
  takeOverClaim,
  tryAcquireClaim,
} from "./claims.ts";
import type { CommandRunner } from "./command-runner.ts";
import { SimulatorControlPlane, newToken } from "./control-plane.ts";
import {
  initialDegradeState,
  isCaptureMismatchStderr,
  reduceDegrade,
  type DegradeState,
} from "./degrade.ts";
import {
  encodeSimulatorInput,
  CoordOutOfRangeError,
  type SimulatorInputOp,
} from "./opcode.ts";
import { hideSimulatorAppWindows } from "./hide-windows.ts";
import { hidUsageForChar } from "./hid.ts";
import {
  assertHelperVersion,
  resolveHelperDir,
} from "./helper-resolve.ts";
import {
  assertLoopbackUrl,
  helperStateLogPath,
  helperStateRecordPath,
  parseHelperStateRecord,
} from "./handshake.ts";
import { planOpenInSimulator } from "./open-project.ts";
import {
  auditLogPath,
  claimsJsonPath,
  controlJsonPath,
  lastUsedPath,
} from "./paths.ts";
import { PINNED_HELPER_VERSION } from "./pin.ts";
import { probeSimulator } from "./probe.ts";
import { defaultCommandRunner, runCommand } from "./run-command.ts";
import { selectSimulator } from "./select.ts";
import { buildHelperArgv, stripHelperEnv } from "./spawn-args.ts";
import {
  shouldReleaseIdle,
  shouldThrottle,
  workspacesOverWarmCap,
  THROTTLE_MAX_DIMENSION,
  THROTTLE_MAX_FPS,
} from "./governance.ts";
import type {
  ClaimTable,
  Phase,
  ProbeHost,
  ProbeResult,
  SessionView,
  StreamCodec,
  StreamTransport,
} from "./types.ts";

export type BridgeHooks = {
  emit: (event: string, payload: unknown) => void;
  openExternal?: (url: string) => Promise<void>;
  focusApp?: () => void;
  showAutomationGrant?: () => void;
  now?: () => number;
  instanceId?: string;
  runner?: CommandRunner;
  resourcesPath?: string;
  repoRoot?: string | null;
  tmpdir?: string;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
};

type LiveSession = {
  workspaceId: string;
  runtimeKind: "ios";
  simulatorId: string;
  simulatorName: string;
  runtime: string;
  phase: Phase;
  childPid: number;
  helperPort: number;
  sessionToken: string;
  streamUrl: string;
  wsUrl: string;
  streamSettingsUrl: string;
  transport: StreamTransport;
  codec: StreamCodec;
  visibleSurfaces: number;
  lastVisibleAt: number;
  health: "ok" | "stale" | "dead";
  degrade: DegradeState;
  hideNote?: string;
  inputWs: WebSocket | null;
  suppressExit?: boolean;
};

function hostFromProcess(): ProbeHost {
  return {
    platform: process.platform,
    arch: process.arch,
  };
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

function writePrivateJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function ephemeralLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForFile(path: string, timeoutMs: number, now: () => number): Promise<string> {
  const start = now();
  while (now() - start < timeoutMs) {
    if (existsSync(path)) {
      try {
        return readFileSync(path, "utf8");
      } catch {
        /* retry */
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`helper state record missing: ${path}`);
}

export class SimulatorBridge {
  private readonly hooks: BridgeHooks;
  private readonly runner: CommandRunner;
  private readonly instanceId: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly sessions = new Map<string, LiveSession>();
  private readonly control = new SimulatorControlPlane();
  private probeCache: { at: number; result: ProbeResult } | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(hooks: BridgeHooks) {
    this.hooks = hooks;
    this.runner = hooks.runner ?? defaultCommandRunner();
    this.instanceId = hooks.instanceId ?? randomUUID();
    this.env = hooks.env ?? process.env;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { port, token } = this.control.start({
      lookupSession: (sessionToken) => {
        for (const session of this.sessions.values()) {
          if (session.sessionToken === sessionToken) {
            return { sessionToken: session.sessionToken, helperPort: session.helperPort };
          }
        }
        return null;
      },
      invoke: (body) => this.handleControlInvoke(body),
    });
    writePrivateJson(controlJsonPath(this.env), {
      protocol: "atmos-simulator/v1",
      base_url: `http://127.0.0.1:${port}`,
      port,
      token,
      updated_at: new Date(this.now()).toISOString(),
    });
    void this.reconcileOrphans();
    this.tick = setInterval(() => this.onTick(), 1_000);
  }

  stop(): void {
    for (const workspaceId of [...this.sessions.keys()]) {
      void this.killSession(workspaceId, { shutdownSimulator: false });
    }
    void this.helperCli(["--kill"]);
    this.control.stop();
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.started = false;
    for (const path of [controlJsonPath(this.env), claimsJsonPath(this.env)]) {
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private now(): number {
    return this.hooks.now?.() ?? Date.now();
  }

  private emit(event: string, payload: unknown): void {
    this.hooks.emit(event, payload);
  }

  private fakeName(): string | null {
    const value = this.env.ATMOS_SIMULATOR_FAKE?.trim();
    return value ? value : null;
  }

  async probe(workspaceId: string, force = false): Promise<ProbeResult> {
    this.emit("simulator://log", {
      workspaceId,
      step: "probe",
      message: "Checking the local simulator environment",
    });
    if (!force && this.probeCache && this.now() - this.probeCache.at < 8_000) {
      this.emitProbe(workspaceId, this.probeCache.result);
      return this.probeCache.result;
    }
    const fake = this.fakeName();
    if (fake) {
      const result = fakeProbeResult(fake);
      this.probeCache = { at: this.now(), result };
      this.emitProbe(workspaceId, result);
      return result;
    }
    const helper = resolveHelperDir({
      env: this.env,
      resourcesPath: this.hooks.resourcesPath ?? process.resourcesPath,
      repoRoot: this.hooks.repoRoot ?? null,
    });
    const result = await probeSimulator({
      runner: this.runner,
      host: hostFromProcess(),
      helperPresent: !("code" in helper),
      helperVersion: "dir" in helper ? helper.version : PINNED_HELPER_VERSION,
    });
    this.probeCache = { at: this.now(), result };
    this.emitProbe(workspaceId, result);
    return result;
  }

  async attach(
    workspaceId: string,
    simulatorId?: string,
    webrtc?: boolean,
  ): Promise<SessionView> {
    const existing = this.sessions.get(workspaceId);
    if (existing) {
      const view = this.toView(existing);
      this.emit("simulator://status", view);
      return view;
    }

    this.emitStatus(workspaceId, "probing");
    const probe = await this.probe(workspaceId, true);
    if (!probe.ok) {
      const view = this.emptyView(workspaceId, "setup_required", {
        code: probe.code ?? "setup_required",
        message: probe.code ?? "setup_required",
      });
      this.emit("simulator://status", view);
      return view;
    }

    const lastUsed = this.readLastUsed(workspaceId);
    const selected = simulatorId
      ? probe.facts.simulators.find((s) => s.id === simulatorId)
      : selectSimulator({
          lastUsedId: lastUsed,
          runtimes: probe.facts.runtimes,
          simulators: probe.facts.simulators,
        });

    const chosen =
      selected && "id" in selected
        ? selected
        : selected && selected.action === "use"
          ? selected.simulator
          : null;
    if (!chosen) {
      const view = this.emptyView(workspaceId, "setup_required", {
        code: "missing_iphone",
        message: "No bootable iPhone is available",
      });
      this.emit("simulator://status", view);
      return view;
    }

    const claims = this.readClaims();
    const acquired = tryAcquireClaim(
      claims,
      chosen.id,
      workspaceId,
      this.instanceId,
      new Date(this.now()).toISOString(),
    );
    if (!acquired.ok) {
      return this.failAttach(
        workspaceId,
        "simulator_in_use",
        `In use by workspace ${acquired.holder.workspaceId}`,
        {
          id: chosen.id,
          name: chosen.name,
          runtime: chosen.runtimeId,
        },
      );
    }
    this.writeClaims(acquired.table);

    if (this.fakeName()) {
      const session = this.createFakeSession(workspaceId, chosen.id, chosen.name, chosen.runtimeId);
      this.sessions.set(workspaceId, session);
      this.trimWarm();
      const view = this.toView(session);
      this.emit("simulator://status", view);
      return view;
    }

    this.emitStatus(workspaceId, "starting", chosen.id);
    await this.bootIfNeeded(workspaceId, chosen.id);
    const hide = await hideSimulatorAppWindows();
    this.hooks.focusApp?.();
    if (!hide.hidden && hide.needsAutomation) {
      this.hooks.showAutomationGrant?.();
    }

    const helper = resolveHelperDir({
      env: this.env,
      resourcesPath: this.hooks.resourcesPath ?? process.resourcesPath,
      repoRoot: this.hooks.repoRoot ?? null,
    });
    if ("code" in helper) {
      this.writeClaims(releaseClaim(this.readClaims(), chosen.id, workspaceId));
      return this.failAttach(workspaceId, "helper_missing", "Reinstall Atmos");
    }
    assertHelperVersion(helper);

    const webrtcOptIn =
      webrtc === true || this.env.ATMOS_SIMULATOR_WEBRTC === "1";
    let degrade = reduceDegrade(initialDegradeState(), {
      type: "start",
      webrtcOptIn,
    });
    let session: LiveSession | undefined;
    try {
      session = await this.spawnHelper({
        workspaceId,
        simulatorId: chosen.id,
        simulatorName: chosen.name,
        runtime: chosen.runtimeId,
        transport: degrade.transport,
        codec: degrade.codec === "mjpeg" ? "mjpeg" : "h264",
        hideNote: hide.hidden ? undefined : hide.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const logPath = helperStateLogPath(chosen.id, this.hooks.tmpdir ?? osTmpdir());
      const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      const stderr = `${message}\n${log}`;
      if (isCaptureMismatchStderr(stderr) && !degrade.mismatchRetryDone) {
        degrade = reduceDegrade(degrade, { type: "mismatch_stderr", stderr });
        if (degrade.codec === "mjpeg" && degrade.phase !== "failed") {
          try {
            session = await this.spawnHelper({
              workspaceId,
              simulatorId: chosen.id,
              simulatorName: chosen.name,
              runtime: chosen.runtimeId,
              transport: "http",
              codec: "mjpeg",
              hideNote: hide.hidden ? undefined : hide.message,
            });
          } catch {
            this.writeClaims(releaseClaim(this.readClaims(), chosen.id, workspaceId));
            return this.failAttach(
              workspaceId,
              "capture_xcode_mismatch",
              stderr.trim() || message,
            );
          }
        } else {
          this.writeClaims(releaseClaim(this.readClaims(), chosen.id, workspaceId));
          return this.failAttach(
            workspaceId,
            degrade.lastError?.code ?? "capture_xcode_mismatch",
            degrade.lastError?.message ?? message,
          );
        }
      } else {
        this.writeClaims(releaseClaim(this.readClaims(), chosen.id, workspaceId));
        const code =
          error instanceof DesktopCommandError ? error.code : "capture_failed";
        return this.failAttach(workspaceId, code, message);
      }
    }
    if (!session) {
      this.writeClaims(releaseClaim(this.readClaims(), chosen.id, workspaceId));
      return this.failAttach(workspaceId, "capture_failed", "Capture helper did not start");
    }
    session.degrade = degrade;
    this.sessions.set(workspaceId, session);
    this.writeLastUsed(workspaceId, chosen.id);
    this.trimWarm();
    const view = this.toView(session);
    this.emit("simulator://status", view);
    return view;
  }

  async disconnect(workspaceId: string): Promise<{ ok: true }> {
    await this.killSession(workspaceId, { shutdownSimulator: false });
    this.emit("simulator://status", this.emptyView(workspaceId, "idle"));
    return { ok: true };
  }

  async shutdown(workspaceId: string): Promise<{ ok: true }> {
    const session = this.sessions.get(workspaceId);
    const simulatorId = session?.simulatorId;
    await this.killSession(workspaceId, { shutdownSimulator: false });
    if (simulatorId) {
      await this.runner("xcrun", ["simctl", "shutdown", simulatorId]);
    }
    this.emit("simulator://status", this.emptyView(workspaceId, "idle"));
    return { ok: true };
  }

  async hideWindows(workspaceId: string): Promise<{ hidden: boolean }> {
    const result = await hideSimulatorAppWindows();
    this.hooks.focusApp?.();
    const session = this.sessions.get(workspaceId);
    if (session && !result.hidden) {
      session.hideNote = result.message;
      this.emit("simulator://status", this.toView(session));
    }
    if (!result.hidden && result.needsAutomation) {
      this.hooks.showAutomationGrant?.();
    }
    return { hidden: result.hidden };
  }

  async setVisibility(workspaceId: string, visible: boolean): Promise<{ ok: true }> {
    const session = this.sessions.get(workspaceId);
    if (!session) return { ok: true };
    const wasVisible = session.visibleSurfaces > 0;
    session.visibleSurfaces = visible ? 1 : 0;
    if (visible || wasVisible) session.lastVisibleAt = this.now();
    return { ok: true };
  }

  async reportStreamEvent(
    workspaceId: string,
    event: string,
  ): Promise<{ ok: true }> {
    const session = this.sessions.get(workspaceId);
    if (!session) return { ok: true };
    if (event === "first_frame") {
      session.degrade = reduceDegrade(session.degrade, { type: "first_frame" });
      session.phase = session.degrade.phase;
      return { ok: true };
    }
    if (event !== "webrtc_unusable" && event !== "h264_unusable") {
      return { ok: true };
    }
    const next = reduceDegrade(session.degrade, { type: event });
    if (next.transport === session.transport && next.codec === session.codec) {
      return { ok: true };
    }
    session.degrade = next;
    session.phase = next.phase;
    this.emit("simulator://status", this.toView(session));
    await this.respawnHelperKeepingToken(session);
    return { ok: true };
  }

  async takeOver(workspaceId: string, simulatorId: string): Promise<SessionView> {
    const claims = this.readClaims();
    const taken = takeOverClaim(
      claims,
      simulatorId,
      workspaceId,
      this.instanceId,
      new Date(this.now()).toISOString(),
    );
    if (taken.previous && taken.previous.workspaceId !== workspaceId) {
      await this.killSession(taken.previous.workspaceId, { shutdownSimulator: false });
      appendFileSync(
        auditLogPath(this.env),
        `${new Date(this.now()).toISOString()} take-over simulator=${simulatorId} from=${taken.previous.workspaceId} to=${workspaceId}\n`,
      );
    }
    this.writeClaims(taken.table);
    return this.attach(workspaceId, simulatorId);
  }

  async setupAction(action: string): Promise<{ ok: true }> {
    switch (action) {
      case "install_clt":
        await this.runner("xcode-select", ["--install"]);
        break;
      case "open_xcode_platforms":
        await this.runner("open", ["-a", "Xcode"]);
        break;
      case "open_xcode_download":
        await this.hooks.openExternal?.("https://developer.apple.com/xcode/");
        break;
      case "create_default_iphone": {
        const probe = await this.probe("setup", true);
        const selected = selectSimulator({
          runtimes: probe.facts.runtimes,
          simulators: probe.facts.simulators,
        });
        if (!selected || selected.action !== "create") break;
        await this.runner("xcrun", [
          "simctl",
          "create",
          "iPhone 16",
          selected.typeId,
          selected.runtimeId,
        ]);
        break;
      }
      default:
        throw new DesktopCommandError(
          "unsupported_setup_action",
          `Unknown setup action: ${action}`,
          "simulator_setup_action",
        );
    }
    return { ok: true };
  }

  async openProject(
    workspaceId: string,
    worktreePath?: string,
  ): Promise<{ ok: true; metroCommand?: string; launchUrl?: string }> {
    const session = this.sessions.get(workspaceId);
    if (!session) {
      throw new DesktopCommandError(
        "no_session",
        "Attach a simulator first",
        "simulator_open_project",
      );
    }
    if (!worktreePath) {
      throw new DesktopCommandError(
        "not_expo_or_rn",
        "Missing worktree path",
        "simulator_open_project",
      );
    }
    const plan = planOpenInSimulator(worktreePath);
    if (!plan.ok) {
      throw new DesktopCommandError(plan.code, plan.message, "simulator_open_project");
    }
    if (plan.launchUrl) {
      await this.runner("xcrun", [
        "simctl",
        "openurl",
        session.simulatorId,
        plan.launchUrl,
      ]);
    }
    return { ok: true, metroCommand: plan.metroCommand, launchUrl: plan.launchUrl };
  }

  async input(
    workspaceId: string,
    input: SimulatorInputOp,
  ): Promise<{ ok: true }> {
    const session = this.sessions.get(workspaceId);
    if (!session) {
      throw new DesktopCommandError("no_session", "No simulator session", "simulator_input");
    }
    const bytes = encodeSimulatorInput(input);
    await this.sendHelperBytes(session, bytes);
    return { ok: true };
  }

  sessionView(workspaceId: string): SessionView | null {
    const session = this.sessions.get(workspaceId);
    return session ? this.toView(session) : null;
  }

  activeSessions(): Array<{ workspaceId: string; simulatorId: string }> {
    return [...this.sessions.values()].map((s) => ({
      workspaceId: s.workspaceId,
      simulatorId: s.simulatorId,
    }));
  }

  async handleControlInvoke(body: unknown): Promise<unknown> {
    const req = (body ?? {}) as {
      op?: string;
      workspaceId?: string;
      args?: Record<string, unknown>;
    };
    const op = req.op ?? "";
    const workspaceId = this.resolveWorkspace(req.workspaceId, op);
    try {
      switch (op) {
        case "list": {
          const probe = await this.probe(workspaceId || "cli", false);
          return {
            ok: true,
            op,
            workspaceId: workspaceId || null,
            probe,
            active: this.activeSessions(),
          };
        }
        case "attach": {
          const view = await this.attach(
            workspaceId,
            typeof req.args?.id === "string" ? req.args.id : undefined,
          );
          if (view.phase === "setup_required" || view.phase === "failed") {
            return {
              ok: false,
              error_code: view.lastError?.code ?? "setup_required",
              error: view.lastError?.message ?? view.phase,
              op,
              workspaceId,
              result: view,
            };
          }
          return { ok: true, op, workspaceId, result: view };
        }
        case "tap": {
          const x = Number(req.args?.x);
          const y = Number(req.args?.y);
          await this.input(workspaceId, { op: "touch", type: "begin", x, y });
          await this.input(workspaceId, { op: "touch", type: "end", x, y });
          return {
            ok: true,
            op,
            workspaceId,
            simulator: this.simMeta(workspaceId),
            result: { x, y },
          };
        }
        case "type": {
          const text = String(req.args?.text ?? "");
          for (const ch of text) {
            const hid = hidUsageForChar(ch);
            if (!hid) continue;
            await this.input(workspaceId, { op: "key", type: "down", usage: hid.usage });
            await this.input(workspaceId, { op: "key", type: "up", usage: hid.usage });
          }
          return { ok: true, op, workspaceId, result: { text } };
        }
        case "gesture": {
          const kind = String(req.args?.kind ?? "swipe");
          const durationMs = Math.max(0, Number(req.args?.durationMs) || 0);
          if (kind === "pinch") {
            await this.input(workspaceId, {
              op: "pinch",
              type: "begin",
              x1: Number(req.args?.x1),
              y1: Number(req.args?.y1),
              x2: Number(req.args?.x2),
              y2: Number(req.args?.y2),
            });
            if (durationMs > 0) await sleep(durationMs);
            await this.input(workspaceId, {
              op: "pinch",
              type: "end",
              x1: Number(req.args?.x1),
              y1: Number(req.args?.y1),
              x2: Number(req.args?.x2),
              y2: Number(req.args?.y2),
            });
          } else {
            const x1 = Number(req.args?.x1);
            const y1 = Number(req.args?.y1);
            const x2 = Number(req.args?.x2);
            const y2 = Number(req.args?.y2);
            await this.input(workspaceId, { op: "touch", type: "begin", x: x1, y: y1 });
            const steps =
              durationMs > 0
                ? Math.max(2, Math.min(24, Math.round(durationMs / 16)))
                : 1;
            const stepDelay = durationMs > 0 ? durationMs / steps : 0;
            for (let i = 1; i <= steps; i++) {
              if (stepDelay > 0) await sleep(stepDelay);
              const t = i / steps;
              await this.input(workspaceId, {
                op: "touch",
                type: i === steps ? "end" : "move",
                x: x1 + (x2 - x1) * t,
                y: y1 + (y2 - y1) * t,
              });
            }
          }
          return { ok: true, op, workspaceId, result: req.args };
        }
        case "button": {
          await this.input(workspaceId, {
            op: "button",
            button: String(req.args?.name ?? "home"),
          });
          return { ok: true, op, workspaceId };
        }
        case "rotate": {
          await this.input(workspaceId, {
            op: "orientation",
            orientation: String(req.args?.orientation ?? "portrait"),
          });
          return { ok: true, op, workspaceId };
        }
        case "screenshot":
        case "ax":
        case "logs": {
          const session = this.sessions.get(workspaceId);
          if (!session) {
            return { ok: false, error_code: "no_session", error: "No simulator session" };
          }
          const path =
            op === "screenshot" ? "/screenshot" : op === "ax" ? "/ax" : "/logs";
          const res = await fetch(`http://127.0.0.1:${session.helperPort}${path}`);
          let result = await res.text();
          if (op === "logs") {
            const tail = Number(req.args?.tail);
            if (Number.isFinite(tail) && tail > 0) {
              result = result.split("\n").slice(-tail).join("\n");
            }
          }
          return { ok: res.ok, op, workspaceId, result };
        }
        case "kill": {
          if (req.args?.shutdownSimulator) await this.shutdown(workspaceId);
          else await this.disconnect(workspaceId);
          return { ok: true, op, workspaceId };
        }
        default:
          return { ok: false, error_code: "unknown_op", error: `Unknown op ${op}` };
      }
    } catch (error) {
      if (error instanceof CoordOutOfRangeError) {
        return { ok: false, error_code: error.code, error: error.message };
      }
      if (error instanceof DesktopCommandError) {
        if (error.code === "workspace_ambiguous") {
          return {
            ok: false,
            error_code: error.code,
            error: error.message,
            candidates: this.activeSessions(),
          };
        }
        return { ok: false, error_code: error.code, error: error.message };
      }
      return {
        ok: false,
        error_code: "invoke_failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveWorkspace(explicit: string | undefined, op: string): string {
    if (explicit) return explicit;
    if (op === "list") return this.sessions.keys().next().value ?? "";
    const ids = [...this.sessions.keys()];
    if (ids.length === 1) return ids[0];
    if (ids.length === 0) {
      throw new DesktopCommandError(
        "no_session",
        "No simulator session is active",
        "simulator_invoke",
      );
    }
    throw new DesktopCommandError(
      "workspace_ambiguous",
      `Multiple workspaces: ${ids.join(", ")}`,
      "simulator_invoke",
    );
  }

  private simMeta(workspaceId: string) {
    const session = this.sessions.get(workspaceId);
    if (!session) return null;
    return {
      id: session.simulatorId,
      name: session.simulatorName,
      runtime: session.runtime,
    };
  }

  private async bootIfNeeded(workspaceId: string, simulatorId: string): Promise<void> {
    this.emit("simulator://log", {
      workspaceId,
      step: "boot",
      message: "Waiting for the simulator to boot",
    });
    const list = await this.runner("xcrun", ["simctl", "list", "-j"]);
    if (!list.stdout.includes(simulatorId) || !/Booted/.test(list.stdout)) {
      await this.runner("xcrun", ["simctl", "boot", simulatorId], { timeoutMs: 90_000 });
    }
    await this.runner("xcrun", ["simctl", "bootstatus", simulatorId, "-b"], {
      timeoutMs: 90_000,
    });
  }

  private async spawnHelper(opts: {
    workspaceId: string;
    simulatorId: string;
    simulatorName: string;
    runtime: string;
    transport: StreamTransport;
    codec: StreamCodec;
    hideNote?: string;
  }): Promise<LiveSession> {
    const helper = resolveHelperDir({
      env: this.env,
      resourcesPath: this.hooks.resourcesPath ?? process.resourcesPath,
      repoRoot: this.hooks.repoRoot ?? null,
    });
    if ("code" in helper) {
      throw new DesktopCommandError("helper_missing", "Reinstall Atmos", "simulator_attach");
    }
    const port = await ephemeralLoopbackPort();
    const argv = buildHelperArgv({
      port,
      simulatorId: opts.simulatorId,
      transport: opts.transport,
      codec: opts.codec === "mjpeg" ? "mjpeg" : "auto",
    });
    const entry = join(helper.dir, "dist", "serve-sim.js");
    const child = spawn(this.hooks.execPath ?? process.execPath, [entry, ...argv], {
      env: stripHelperEnv(this.env),
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    const tmp = this.hooks.tmpdir ?? osTmpdir();
    const recordPath = helperStateRecordPath(opts.simulatorId, tmp);
    let raw: string;
    try {
      raw = await waitForFile(recordPath, 20_000, () => this.now());
    } catch (error) {
      const logPath = helperStateLogPath(opts.simulatorId, tmp);
      const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      throw new DesktopCommandError(
        "capture_failed",
        log.trim() || (error instanceof Error ? error.message : String(error)),
        "simulator_attach",
      );
    }
    const record = parseHelperStateRecord(raw);
    try {
      assertLoopbackUrl(record.streamUrl);
      assertLoopbackUrl(record.wsUrl);
    } catch {
      try {
        if (child.pid) process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      throw new DesktopCommandError(
        "helper_bind_not_loopback",
        "Capture helper published a non-loopback URL",
        "simulator_attach",
      );
    }
    await this.assertHelperHealth(record.port, child.pid ?? record.pid);
    const childPid = child.pid ?? record.pid;
    child.on("exit", () => {
      void this.handleHelperExit(opts.workspaceId, childPid);
    });
    return {
      workspaceId: opts.workspaceId,
      runtimeKind: "ios",
      simulatorId: opts.simulatorId,
      simulatorName: opts.simulatorName,
      runtime: opts.runtime,
      phase: "streaming",
      childPid,
      helperPort: record.port,
      sessionToken: newToken(),
      streamUrl: record.streamUrl,
      wsUrl: record.wsUrl,
      streamSettingsUrl: record.streamSettingsUrl,
      transport: opts.transport,
      codec: opts.codec,
      visibleSurfaces: 0,
      lastVisibleAt: this.now(),
      health: "ok",
      degrade: initialDegradeState(),
      hideNote: opts.hideNote,
      inputWs: null,
    };
  }

  private async assertHelperHealth(port: number, pid: number): Promise<void> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2_000);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: ac.signal });
      if (!res.ok) throw new Error("health not ok");
    } catch {
      throw new DesktopCommandError(
        "capture_failed",
        "Capture helper did not become healthy",
        "simulator_attach",
      );
    } finally {
      clearTimeout(timer);
    }
    const lsof = await runCommand("lsof", ["-nP", `-p${pid}`, "-iTCP"]);
    if (lsof.code === 0 && !listenersAreLoopback(lsof.stdout)) {
      throw new DesktopCommandError(
        "helper_bind_not_loopback",
        "Capture helper bound a non-loopback port",
        "simulator_attach",
      );
    }
  }

  private async sendHelperBytes(session: LiveSession, bytes: Uint8Array): Promise<void> {
    if (this.fakeName()) return;
    const ws = await this.ensureInputSocket(session);
    ws.send(bytes);
  }

  private async ensureInputSocket(session: LiveSession): Promise<WebSocket> {
    if (session.inputWs && session.inputWs.readyState === WebSocket.OPEN) {
      return session.inputWs;
    }
    const ws = new WebSocket(session.wsUrl);
    session.inputWs = ws;
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("helper ws failed")), {
        once: true,
      });
    });
    return ws;
  }

  private async killSession(
    workspaceId: string,
    opts: { shutdownSimulator: boolean },
  ): Promise<void> {
    const session = this.sessions.get(workspaceId);
    if (!session) return;
    session.suppressExit = true;
    try {
      session.inputWs?.close();
    } catch {
      /* ignore */
    }
    if (session.childPid) {
      try {
        process.kill(session.childPid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    this.sessions.delete(workspaceId);
    this.writeClaims(releaseClaim(this.readClaims(), session.simulatorId, workspaceId));
    if (opts.shutdownSimulator) {
      await this.runner("xcrun", ["simctl", "shutdown", session.simulatorId]);
    }
  }

  private trimWarm(): void {
    const extra = workspacesOverWarmCap(
      [...this.sessions.values()].map((s) => ({
        workspaceId: s.workspaceId,
        visibleSurfaces: s.visibleSurfaces,
        lastVisibleAt: s.lastVisibleAt,
      })),
    );
    for (const workspaceId of extra) {
      void this.killSession(workspaceId, { shutdownSimulator: false });
    }
  }

  private onTick(): void {
    const now = this.now();
    for (const session of this.sessions.values()) {
      if (shouldReleaseIdle(session, now)) {
        void this.killSession(session.workspaceId, { shutdownSimulator: false });
        this.emit(
          "simulator://status",
          this.emptyView(session.workspaceId, "idle"),
        );
        continue;
      }
      if (shouldThrottle(session, now)) {
        void fetch(session.streamSettingsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fps: THROTTLE_MAX_FPS,
            maxDimension: THROTTLE_MAX_DIMENSION,
          }),
        }).catch(() => undefined);
      }
    }
  }

  private async helperCli(args: string[]): Promise<void> {
    const helper = resolveHelperDir({
      env: this.env,
      resourcesPath: this.hooks.resourcesPath ?? process.resourcesPath,
      repoRoot: this.hooks.repoRoot ?? null,
    });
    if ("code" in helper) return;
    const entry = join(helper.dir, "dist", "serve-sim.js");
    await runCommand(this.hooks.execPath ?? process.execPath, [entry, ...args], {
      env: stripHelperEnv(this.env),
      timeoutMs: 8_000,
    });
  }

  private async reconcileOrphans(): Promise<void> {
    await this.helperCli(["--kill"]);
  }

  private readClaims(): ClaimTable {
    const path = claimsJsonPath(this.env);
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as ClaimTable;
    } catch {
      return {};
    }
  }

  private writeClaims(table: ClaimTable): void {
    writePrivateJson(claimsJsonPath(this.env), table);
  }

  private readLastUsed(workspaceId: string): string | null {
    const path = lastUsedPath(workspaceId, this.env);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { id?: string };
      return parsed.id ?? null;
    } catch {
      return null;
    }
  }

  private writeLastUsed(workspaceId: string, id: string): void {
    writePrivateJson(lastUsedPath(workspaceId, this.env), { id });
  }

  private createFakeSession(
    workspaceId: string,
    simulatorId: string,
    name: string,
    runtime: string,
  ): LiveSession {
    const token = newToken();
    return {
      workspaceId,
      runtimeKind: "ios",
      simulatorId,
      simulatorName: name,
      runtime,
      phase: "streaming",
      childPid: 0,
      helperPort: 9,
      sessionToken: token,
      streamUrl: `http://127.0.0.1:${this.control.getPort()}/s/${token}/stream.mjpeg`,
      wsUrl: `ws://127.0.0.1:${this.control.getPort()}/s/${token}/ws`,
      streamSettingsUrl: `http://127.0.0.1:${this.control.getPort()}/s/${token}/stream-settings`,
      transport: "http",
      codec: "mjpeg",
      visibleSurfaces: 0,
      lastVisibleAt: this.now(),
      health: "ok",
      degrade: reduceDegrade(initialDegradeState(), { type: "first_frame" }),
      inputWs: null,
    };
  }

  private toView(session: LiveSession): SessionView {
    return {
      phase: session.phase,
      workspaceId: session.workspaceId,
      simulator: {
        id: session.simulatorId,
        name: session.simulatorName,
        runtime: session.runtime,
      },
      streamBaseUrl: `http://127.0.0.1:${this.control.getPort()}/s/${session.sessionToken}`,
      transport: session.transport,
      codec: session.codec,
      size: null,
      lastError: session.degrade.lastError,
    };
  }

  private failAttach(
    workspaceId: string,
    code: string,
    message: string,
    simulator?: { id: string; name: string; runtime: string },
  ): SessionView {
    const view = {
      ...this.emptyView(workspaceId, "setup_required", { code, message }),
      simulator: simulator ?? null,
    };
    this.emit("simulator://status", view);
    return view;
  }

  private async handleHelperExit(workspaceId: string, pid: number): Promise<void> {
    const session = this.sessions.get(workspaceId);
    if (!session || session.suppressExit || session.childPid !== pid) return;
    session.degrade = reduceDegrade(session.degrade, { type: "helper_died" });
    session.phase = session.degrade.phase;
    session.health = session.degrade.phase === "failed" ? "dead" : "stale";
    this.emit("simulator://status", this.toView(session));
    if (session.degrade.phase === "failed") return;
    try {
      const next = await this.spawnHelper({
        workspaceId: session.workspaceId,
        simulatorId: session.simulatorId,
        simulatorName: session.simulatorName,
        runtime: session.runtime,
        transport: session.degrade.transport,
        codec: session.degrade.codec === "mjpeg" ? "mjpeg" : "h264",
        hideNote: session.hideNote,
      });
      next.degrade = reduceDegrade(session.degrade, { type: "reconnect_ok" });
      next.sessionToken = session.sessionToken;
      next.visibleSurfaces = session.visibleSurfaces;
      next.lastVisibleAt = session.lastVisibleAt;
      this.sessions.set(workspaceId, next);
      this.emit("simulator://status", this.toView(next));
    } catch {
      session.degrade = reduceDegrade(session.degrade, { type: "helper_died" });
      session.phase = session.degrade.phase;
      session.health = "dead";
      this.emit("simulator://status", this.toView(session));
    }
  }

  private emptyView(
    workspaceId: string,
    phase: Phase,
    lastError?: { code: string; message: string },
  ): SessionView {
    return {
      phase,
      workspaceId,
      simulator: null,
      streamBaseUrl: null,
      transport: null,
      codec: null,
      size: null,
      lastError: lastError ?? null,
    };
  }

  private emitProbe(workspaceId: string, result: ProbeResult): void {
    this.emit("simulator://probe", { ...result, workspaceId });
  }

  private async respawnHelperKeepingToken(session: LiveSession): Promise<void> {
    session.suppressExit = true;
    try {
      session.inputWs?.close();
    } catch {
      /* ignore */
    }
    session.inputWs = null;
    if (session.childPid) {
      try {
        process.kill(session.childPid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    const token = session.sessionToken;
    if (this.fakeName()) {
      session.transport = session.degrade.transport;
      session.codec = session.degrade.codec === "mjpeg" ? "mjpeg" : "h264";
      session.phase = "streaming";
      session.suppressExit = false;
      this.emit("simulator://status", this.toView(session));
      return;
    }
    try {
      const next = await this.spawnHelper({
        workspaceId: session.workspaceId,
        simulatorId: session.simulatorId,
        simulatorName: session.simulatorName,
        runtime: session.runtime,
        transport: session.degrade.transport,
        codec: session.degrade.codec === "mjpeg" ? "mjpeg" : "h264",
        hideNote: session.hideNote,
      });
      next.degrade = session.degrade;
      next.sessionToken = token;
      next.visibleSurfaces = session.visibleSurfaces;
      next.lastVisibleAt = session.lastVisibleAt;
      this.sessions.set(session.workspaceId, next);
      this.emit("simulator://status", this.toView(next));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sessions.delete(session.workspaceId);
      this.writeClaims(releaseClaim(this.readClaims(), session.simulatorId, session.workspaceId));
      this.failAttach(session.workspaceId, "capture_failed", message);
    }
  }

  private emitStatus(workspaceId: string, phase: Phase, simulatorId?: string): void {
    this.emit("simulator://status", {
      ...this.emptyView(workspaceId, phase),
      simulator: simulatorId
        ? { id: simulatorId, name: "", runtime: "" }
        : null,
    } satisfies SessionView);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeProbeResult(name: string): ProbeResult {
  if (name === "ok" || name === "streaming") {
    return {
      ok: true,
      code: null,
      facts: {
        macosVersion: "15.0",
        arch: "arm64",
        xcodePath: "/Applications/Xcode.app/Contents/Developer",
        xcodeVersion: "Xcode 16.4",
        helperVersion: PINNED_HELPER_VERSION,
        runtimes: [
          {
            identifier: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
            name: "iOS 18.5",
            version: "18.5",
            isAvailable: true,
            platform: "iOS",
          },
        ],
        simulators: [
          {
            id: "FAKE-1",
            name: "iPhone 16",
            runtimeId: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
            runtimeName: "iOS 18.5",
            state: "Booted",
            isAvailable: true,
            typeId: "com.apple.CoreSimulator.SimDeviceType.iPhone-16",
          },
        ],
      },
    };
  }
  const code = name as ProbeResult["code"];
  return {
    ok: false,
    code: code ?? "missing_simctl",
    facts: {
      macosVersion: "15.0",
      arch: "arm64",
      runtimes: [],
      simulators: [],
    },
  };
}
