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
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderKind = "cloudflare" | "ngrok" | "tailscale";

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
  const dir = join(homedir(), ".atmos", "tunnel-connector");
  mkdirSync(dir, { recursive: true });
  return join(dir, "electron-state.json");
}

function credentialPath(provider: ProviderKind): string {
  const dir = join(homedir(), ".atmos", "tunnel-connector");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${provider}.credential`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class TunnelService {
  private active = new Map<ProviderKind, ActiveTunnel>();

  private buildStatus(a: ActiveTunnel): TunnelConnectorStatus {
    const publicUrl = a.publicUrl ?? null;
    return {
      gateway_url: null,
      public_url: publicUrl,
      share_url: publicUrl,
      provider: a.provider,
      provider_status: {
        state: "Running",
        public_url: publicUrl,
        message: a.message,
        started_at: a.startedAt,
      },
      entry_token: null,
      expires_at: null,
    };
  }

  async detectAll(): Promise<ProviderDiagnostics[]> {
    const providers: ProviderKind[] = ["cloudflare", "ngrok", "tailscale"];
    return providers.map((provider) => {
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
    _ttlSecs: number,
  ): Promise<TunnelConnectorStatus> {
    await this.stop(provider);

    const startedAt = new Date().toISOString();

    if (provider === "cloudflare") {
      const bin = which("cloudflared");
      if (!bin) throw new Error("cloudflared not found on PATH");
      let publicUrl: string | null = null;
      const child = spawn(
        bin,
        ["tunnel", "--url", targetBaseUrl, "--no-autoupdate"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const onData = (buf: Buffer) => {
        const text = buf.toString();
        const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) publicUrl = m[0]!;
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      this.active.set(provider, {
        provider,
        child,
        publicUrl,
        targetBaseUrl,
        mode,
        startedAt,
        message: null,
      });
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const entry = this.active.get(provider);
        if (entry) entry.publicUrl = publicUrl;
        if (publicUrl) break;
      }
      const entry = this.active.get(provider)!;
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
      const u = new URL(targetBaseUrl);
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
      this.active.set(provider, {
        provider,
        child,
        publicUrl,
        targetBaseUrl,
        mode,
        startedAt,
        message: null,
      });
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const entry = this.active.get(provider);
        if (entry) entry.publicUrl = publicUrl;
        if (publicUrl) break;
      }
      const entry = this.active.get(provider)!;
      this.persist();
      return this.buildStatus(entry);
    }

    const bin = which("tailscale");
    if (!bin) throw new Error("tailscale not found on PATH");
    const u = new URL(targetBaseUrl);
    const child = spawn(
      bin,
      ["serve", "--bg", `${u.protocol}//${u.host}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const entry: ActiveTunnel = {
      provider,
      child,
      publicUrl: null,
      targetBaseUrl,
      mode,
      startedAt,
      message: null,
    };
    this.active.set(provider, entry);
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
    this.active.delete(provider);
    this.persist();
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
    writeFileSync(credentialPath(provider), credential.trim(), "utf8");
  }

  clearCredential(provider: ProviderKind): void {
    try {
      unlinkSync(credentialPath(provider));
    } catch {
      /* ignore */
    }
  }

  private persist() {
    const tunnels = [...this.active.values()].map((a) => ({
      provider: a.provider,
      targetBaseUrl: a.targetBaseUrl,
      mode: a.mode,
      publicUrl: a.publicUrl,
    }));
    writeFileSync(statePath(), JSON.stringify({ tunnels }, null, 2), "utf8");
  }
}
