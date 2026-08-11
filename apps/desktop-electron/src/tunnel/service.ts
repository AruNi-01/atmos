/**
 * Tunnel connector control for Electron — command surface matches Tauri.
 */

import {
  spawn,
  execFileSync,
  type ChildProcess,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createGatewaySession,
  GATEWAY_URL,
  LocalGateway,
  statusFieldsForSession,
  type GatewaySession,
} from "./gateway.js";

export type ProviderKind = "cloudflare" | "ngrok" | "tailscale";

/** Canonical provider set — keep detect/quit paths in sync. */
export const ALL_PROVIDERS: readonly ProviderKind[] = [
  "cloudflare",
  "ngrok",
  "tailscale",
] as const;

/** Matches Tauri `ProviderStatus` / web `ProviderStatus`. */
export type ProviderStatus = {
  state: "Unavailable" | "Idle" | "Running" | "Error";
  public_url: string | null;
  message: string | null;
  started_at: string | null;
};

/**
 * Matches Tauri `TunnelConnectorStatus` / web hook shape.
 * Header + settings filter on `provider_status.state`.
 */
export type TunnelConnectorStatus = {
  gateway_url: string | null;
  public_url: string | null;
  share_url: string | null;
  provider: ProviderKind | null;
  provider_status: ProviderStatus;
  entry_token: string | null;
  expires_at: string | null;
};

export type ProviderDiagnostics = {
  provider: ProviderKind;
  binary_found: boolean;
  daemon_running: boolean | null;
  logged_in: boolean;
  warnings: string[];
  last_error: string | null;
  logs: { at: string; level: string; message: string }[];
  binary_path?: string | null;
};

type ActiveTunnel = {
  provider: ProviderKind;
  child: ChildProcess;
  publicUrl: string | null;
  targetBaseUrl: string;
  mode: string;
  startedAt: string;
  message: string | null;
  /** True once the child has exited or failed to spawn. */
  exited: boolean;
  /** True when exit/error should surface as Error rather than Idle. */
  exitError: boolean;
  session: GatewaySession;
};

function which(bin: string): string | null {
  try {
    const out = execFileSync("which", [bin], { encoding: "utf8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function statePath(): string {
  const dir = join(homedir(), ".atmos", "credentials", "tunnel-connector");
  mkdirSync(dir, { recursive: true });
  return join(dir, "electron-state.json");
}

function ensureCredentialDir(): string {
  const dir = join(homedir(), ".atmos", "credentials", "tunnel-connector");
  mkdirSync(dir, { recursive: true });
  // Unix: require 0700 on the secrets directory — do not continue if hardening fails.
  if (process.platform !== "win32") {
    chmodSync(dir, 0o700);
  }
  return dir;
}

function credentialPath(provider: ProviderKind): string {
  return join(ensureCredentialDir(), `${provider}.credential`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for child exit; SIGKILL after timeout so quit teardown reaps tunnel children. */
function waitForChildExit(
  child: ChildProcess,
  timeoutMs = 3000,
): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve();
    };
    const onExit = () => finish();
    child.once("exit", onExit);
    // Re-check after attaching listener (exit may have raced the first check).
    if (child.exitCode != null || child.signalCode != null) {
      finish();
      return;
    }
    timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      // Brief grace for SIGKILL, then resolve either way.
      setTimeout(finish, 250);
    }, timeoutMs);
  });
}

export class TunnelService {
  private active = new Map<ProviderKind, ActiveTunnel>();
  private gateway: LocalGateway | null = null;

  private buildStatus(a: ActiveTunnel): TunnelConnectorStatus {
    const publicUrl = a.publicUrl ?? null;
    let state: ProviderStatus["state"] = "Running";
    if (a.exited) {
      state = a.exitError ? "Error" : "Idle";
    }
    const fields = statusFieldsForSession(a.session, publicUrl);
    return {
      gateway_url: fields.gateway_url,
      public_url: publicUrl,
      share_url: fields.share_url ?? publicUrl,
      provider: a.provider,
      provider_status: {
        state,
        public_url: publicUrl,
        message: a.message,
        started_at: a.startedAt,
      },
      entry_token: fields.entry_token,
      expires_at: fields.expires_at,
    };
  }

  private async ensureGateway(targetBaseUrl: string): Promise<LocalGateway> {
    if (this.gateway) return this.gateway;
    const gw = new LocalGateway(targetBaseUrl);
    await gw.start();
    this.gateway = gw;
    return gw;
  }

  private async maybeStopGateway(): Promise<void> {
    if (this.active.size > 0) return;
    if (!this.gateway) return;
    await this.gateway.stop();
    this.gateway = null;
  }

  /** Wire error/exit so status reflects dead processes instead of forever Running. */
  private wireChildLifecycle(entry: ActiveTunnel): void {
    const { child, provider } = entry;
    child.on("error", (err) => {
      const current = this.active.get(provider);
      if (!current || current !== entry) return;
      current.exited = true;
      current.exitError = true;
      current.message = err.message || String(err);
      this.persist();
    });
    child.on("exit", (code, signal) => {
      const current = this.active.get(provider);
      if (!current || current !== entry) return;
      current.exited = true;
      // Intentional stop() kills with SIGTERM — treat as Idle, not Error.
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        current.exitError = false;
        current.message = current.message ?? "stopped";
      } else if (code !== 0 && code !== null) {
        current.exitError = true;
        current.message =
          current.message ??
          `process exited with code ${code}${signal ? ` (${signal})` : ""}`;
      } else {
        current.exitError = false;
        current.message = current.message ?? "exited";
      }
      this.persist();
    });
  }

  private registerActive(
    provider: ProviderKind,
    child: ChildProcess,
    fields: {
      publicUrl: string | null;
      targetBaseUrl: string;
      mode: string;
      startedAt: string;
      message: string | null;
      session: GatewaySession;
    },
  ): ActiveTunnel {
    const entry: ActiveTunnel = {
      provider,
      child,
      publicUrl: fields.publicUrl,
      targetBaseUrl: fields.targetBaseUrl,
      mode: fields.mode,
      startedAt: fields.startedAt,
      message: fields.message,
      exited: false,
      exitError: false,
      session: fields.session,
    };
    this.wireChildLifecycle(entry);
    this.active.set(provider, entry);
    return entry;
  }

  async detectAll(): Promise<ProviderDiagnostics[]> {
    return ALL_PROVIDERS.map((provider) => {
      const bin =
        provider === "cloudflare"
          ? which("cloudflared")
          : provider === "ngrok"
            ? which("ngrok")
            : which("tailscale");
      const loggedIn =
        provider === "ngrok"
          ? existsSync(credentialPath("ngrok")) ||
            Boolean(process.env.NGROK_AUTHTOKEN)
          : Boolean(bin);
      const warnings: string[] = [];
      if (!bin) warnings.push(`${provider} CLI not found on PATH`);
      if (provider === "ngrok" && bin && !loggedIn) {
        warnings.push("ngrok authtoken not configured");
      }
      return {
        provider,
        binary_found: Boolean(bin),
        daemon_running: bin ? true : null,
        logged_in: loggedIn,
        warnings,
        last_error: null,
        logs: [],
        binary_path: bin,
      };
    });
  }

  /** Active providers only — matches Tauri `status_all`. */
  statusAll(): Record<string, TunnelConnectorStatus> {
    const out: Record<string, TunnelConnectorStatus> = {};
    for (const a of this.active.values()) {
      out[a.provider] = this.buildStatus(a);
    }
    return out;
  }

  async start(
    provider: ProviderKind,
    mode: string,
    targetBaseUrl: string,
    ttlSecs: number = 3600,
  ): Promise<TunnelConnectorStatus> {
    await this.stop(provider);

    const startedAt = new Date().toISOString();
    const session = createGatewaySession({
      provider,
      mode,
      ttlSecs: ttlSecs || 3600,
    });
    // Tunnel CLIs point at the shared gateway (Tauri GATEWAY_URL parity).
    const gateway = await this.ensureGateway(targetBaseUrl);
    gateway.registerSession(session);
    const tunnelTarget = GATEWAY_URL;

    if (provider === "cloudflare") {
      const bin = which("cloudflared");
      if (!bin) throw new Error("cloudflared not found on PATH");
      let publicUrl: string | null = null;
      const child = spawn(
        bin,
        ["tunnel", "--url", tunnelTarget, "--no-autoupdate"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const onData = (buf: Buffer) => {
        const text = buf.toString();
        const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) publicUrl = m[0]!;
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      this.registerActive(provider, child, {
        publicUrl,
        targetBaseUrl,
        mode,
        startedAt,
        message: null,
        session,
      });
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const entry = this.active.get(provider);
        if (!entry || entry.exited) break;
        if (entry) {
          entry.publicUrl = publicUrl;
          if (publicUrl) gateway.setPublicUrl(session.entryToken, publicUrl);
        }
        if (publicUrl) break;
      }
      const entry = this.active.get(provider);
      if (!entry) {
        gateway.revokeSession(session.entryToken);
        await this.maybeStopGateway();
        throw new Error("cloudflared tunnel failed to start");
      }
      if (entry.exited && entry.exitError) {
        gateway.revokeSession(session.entryToken);
        await this.maybeStopGateway();
        throw new Error(entry.message ?? "cloudflared tunnel failed");
      }
      if (!publicUrl) entry.message = "waiting for public URL";
      this.persist();
      return this.buildStatus(entry);
    }

    if (provider === "ngrok") {
      const bin = which("ngrok");
      if (!bin) throw new Error("ngrok not found on PATH");
      const token =
        process.env.NGROK_AUTHTOKEN ||
        (existsSync(credentialPath("ngrok"))
          ? readFileSync(credentialPath("ngrok"), "utf8").trim()
          : "");
      if (token) {
        try {
          execFileSync(bin, ["config", "add-authtoken", token], {
            stdio: "ignore",
          });
        } catch {
          /* ignore */
        }
      }
      const u = new URL(tunnelTarget);
      let publicUrl: string | null = null;
      const child = spawn(bin, ["http", u.host, "--log=stdout"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const onData = (buf: Buffer) => {
        const text = buf.toString();
        const m =
          text.match(/url=(https:\/\/[a-z0-9-]+\.ngrok[^\s]+)/i) ||
          text.match(/(https:\/\/[a-z0-9-]+\.ngrok-free\.app)/i) ||
          text.match(/(https:\/\/[a-z0-9-]+\.ngrok\.io)/i);
        if (m) publicUrl = m[1] ?? m[0]!;
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      this.registerActive(provider, child, {
        publicUrl,
        targetBaseUrl,
        mode,
        startedAt,
        message: null,
        session,
      });
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const entry = this.active.get(provider);
        if (!entry || entry.exited) break;
        if (entry) {
          entry.publicUrl = publicUrl;
          if (publicUrl) gateway.setPublicUrl(session.entryToken, publicUrl);
        }
        if (publicUrl) break;
      }
      const entry = this.active.get(provider);
      if (!entry) {
        gateway.revokeSession(session.entryToken);
        await this.maybeStopGateway();
        throw new Error("ngrok tunnel failed to start");
      }
      if (entry.exited && entry.exitError) {
        gateway.revokeSession(session.entryToken);
        await this.maybeStopGateway();
        throw new Error(entry.message ?? "ngrok tunnel failed");
      }
      this.persist();
      return this.buildStatus(entry);
    }

    const bin = which("tailscale");
    if (!bin) throw new Error("tailscale not found on PATH");
    // Tailscale serve can target gateway host for share-tokenized access.
    const u = new URL(tunnelTarget);
    const child = spawn(
      bin,
      ["serve", "--bg", `${u.protocol}//${u.host}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const entry = this.registerActive(provider, child, {
      publicUrl: null,
      targetBaseUrl,
      mode,
      startedAt,
      message: null,
      session,
    });
    this.persist();
    return this.buildStatus(entry);
  }

  async stop(provider: ProviderKind): Promise<void> {
    const a = this.active.get(provider);
    if (!a) return;
    try {
      a.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    // Await child exit (SIGKILL after timeout) so before-quit reaps tunnel CLIs.
    await waitForChildExit(a.child);
    // Parity with Tauri/Rust: both serve + funnel must reset, else surface Error
    // (do not claim "stopped" while Tailscale may still be serving).
    if (provider === "tailscale") {
      const bin = which("tailscale");
      if (!bin) {
        const error = "tailscale not found on PATH during stop";
        a.exited = true;
        a.exitError = true;
        a.message = error;
        this.persist();
        throw new Error(error);
      }
      const failures: string[] = [];
      for (const args of [
        ["serve", "reset"],
        ["funnel", "reset"],
      ] as const) {
        try {
          execFileSync(bin, [...args], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (err) {
          const detail =
            err instanceof Error ? err.message : String(err);
          failures.push(`tailscale ${args.join(" ")} failed: ${detail}`);
        }
      }
      if (failures.length > 0) {
        const error = failures.join("; ");
        a.exited = true;
        a.exitError = true;
        a.message = error;
        this.persist();
        throw new Error(error);
      }
    }
    try {
      this.gateway?.revokeSession(a.session.entryToken);
    } catch {
      /* ignore */
    }
    this.active.delete(provider);
    await this.maybeStopGateway();
    this.persist();
  }

  /** Stop every active provider (used on app quit). */
  async stopAll(): Promise<void> {
    for (const provider of [...this.active.keys()]) {
      try {
        await this.stop(provider);
      } catch {
        /* continue other providers */
      }
    }
    if (this.gateway) {
      await this.gateway.stop();
      this.gateway = null;
    }
  }

  async renew(
    provider: ProviderKind,
    ttlSecs: number,
  ): Promise<TunnelConnectorStatus> {
    const a = this.active.get(provider);
    if (!a) throw new Error(`tunnel not running: ${provider}`);
    return this.start(provider, a.mode, a.targetBaseUrl, ttlSecs);
  }

  async recover(): Promise<Record<string, TunnelConnectorStatus>> {
    try {
      const raw = readFileSync(statePath(), "utf8");
      const saved = JSON.parse(raw) as {
        tunnels?: Array<{
          provider: ProviderKind;
          targetBaseUrl: string;
          mode: string;
        }>;
      };
      for (const t of saved.tunnels ?? []) {
        try {
          await this.start(t.provider, t.mode, t.targetBaseUrl, 3600);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* no state */
    }
    return this.statusAll();
  }

  providerGuide(provider: ProviderKind): string[] {
    if (provider === "cloudflare") {
      return [
        "Install cloudflared: brew install cloudflared",
        "Start a quick tunnel from Atmos Tunnel settings",
      ];
    }
    if (provider === "ngrok") {
      return [
        "Install ngrok: brew install ngrok",
        "Save your authtoken in Atmos Tunnel settings",
      ];
    }
    return [
      "Install Tailscale and sign in",
      "Use Tailscale Serve from Atmos Tunnel settings",
    ];
  }

  saveCredential(provider: ProviderKind, credential: string): void {
    const path = credentialPath(provider);
    writeFileSync(path, credential.trim(), "utf8");
    // Unix: require 0600 — do not silently leave world-readable secrets.
    if (process.platform !== "win32") {
      chmodSync(path, 0o600);
    }
  }

  clearCredential(provider: ProviderKind): void {
    try {
      unlinkSync(credentialPath(provider));
    } catch {
      /* ignore */
    }
  }

  private persist() {
    // Only persist still-live tunnels for recover()
    const tunnels = [...this.active.values()]
      .filter((a) => !a.exited)
      .map((a) => ({
        provider: a.provider,
        targetBaseUrl: a.targetBaseUrl,
        mode: a.mode,
        publicUrl: a.publicUrl,
      }));
    writeFileSync(statePath(), JSON.stringify({ tunnels }, null, 2), "utf8");
  }
}
