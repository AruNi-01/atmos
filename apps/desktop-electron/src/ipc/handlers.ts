import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { AppState } from "../app-state.js";
import { electronLogPath, appDataDir } from "../runtime/ensure.js";
import type { DesktopCommandHandler } from "../types.js";
import * as cookies from "../cookies/service.js";
import type { ProviderKind } from "../tunnel/service.js";

async function electron() {
  return import("electron");
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function handoffDir(): string {
  const dir = join(appDataDir(), "agent-chat-handoff");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function createAllHandlers(
  state: AppState,
): Record<string, DesktopCommandHandler> {
  return {
    // --- runtime ---
    async get_api_config() {
      if (state.apiPort == null) throw new Error("API not ready");
      return { host: state.apiHost, port: state.apiPort };
    },

    async get_version_info() {
      return {
        version: process.env.npm_package_version ?? "0.1.0",
        version_type: "electron",
      };
    },

    async list_desktop_releases() {
      try {
        const res = await fetch(
          "https://api.github.com/repos/AruNi-01/atmos/releases?per_page=50",
          { headers: { "User-Agent": "atmos-desktop-electron" } },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as Array<{
          tag_name: string;
          prerelease?: boolean;
          draft?: boolean;
        }>;
        return data
          .filter((r) => !r.draft)
          .map((r) => ({
            tag_name: r.tag_name,
            prerelease: Boolean(r.prerelease),
          }));
      } catch {
        return [];
      }
    },

    async write_log(args) {
      const level = str(args.level || "info");
      const message = str(args.message);
      const logPath = electronLogPath();
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(
        logPath,
        `${new Date().toISOString()} [${level}] ${message}\n`,
        "utf8",
      );
      return null;
    },

    async clear_client_session_cmd() {
      // Server-side session clear is owned by Atmos Server; shell no-op OK.
      return null;
    },

    async get_local_computer_display_name() {
      try {
        const { execFileSync } = await import("node:child_process");
        if (process.platform === "darwin") {
          const name = execFileSync("scutil", ["--get", "ComputerName"], {
            encoding: "utf8",
          }).trim();
          return name || null;
        }
      } catch {
        /* ignore */
      }
      return null;
    },

    // --- system ---
    async send_notification(args) {
      const title = str(args.title);
      const body = str(args.body);
      const { Notification } = await electron();
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
      return null;
    },

    async open_in_external_editor(args) {
      const editor = str(args.editor);
      const path = str(args.path);
      const cmd =
        editor === "vscode"
          ? "code"
          : editor === "cursor"
            ? "cursor"
            : editor === "zed"
              ? "zed"
              : editor === "idea"
                ? "idea"
                : editor === "vim"
                  ? "vim"
                  : null;
      if (!cmd) throw new Error(`Unknown editor: ${editor}`);
      spawn(cmd, [path], { detached: true, stdio: "ignore" }).unref();
      return null;
    },

    async open_path_dialog(args) {
      const directory = Boolean(args.directory ?? true);
      const { dialog } = await electron();
      const result = await dialog.showOpenDialog({
        properties: directory
          ? ["openDirectory", "createDirectory"]
          : ["openFile"],
        defaultPath:
          typeof args.defaultPath === "string" ? args.defaultPath : undefined,
        title: typeof args.title === "string" ? args.title : undefined,
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return result.filePaths[0];
    },

    async open_external_url(args) {
      const url = str(args.url);
      const { shell } = await electron();
      await shell.openExternal(url);
      return null;
    },

    /** Native window fullscreen (mac traffic lights hide/show with this). */
    async window_is_fullscreen() {
      const { BrowserWindow } = await electron();
      const focused =
        BrowserWindow.getFocusedWindow() ?? state.mainWindow ?? null;
      if (!focused || focused.isDestroyed()) return false;
      return focused.isFullScreen();
    },

    async window_set_fullscreen(args) {
      const { BrowserWindow } = await electron();
      const focused =
        BrowserWindow.getFocusedWindow() ?? state.mainWindow ?? null;
      if (!focused || focused.isDestroyed()) return null;
      const next =
        typeof args.fullscreen === "boolean"
          ? args.fullscreen
          : !focused.isFullScreen();
      focused.setFullScreen(next);
      return { fullscreen: next };
    },

    // --- windows / handoff ---
    async open_agent_chat_window(args) {
      const { openAgentChatWindow } = await import("../windows/secondary.js");
      openAgentChatWindow(state, args);
      return null;
    },

    async open_preview_browser_window(args) {
      const { openPreviewBrowserWindow } = await import("../windows/secondary.js");
      openPreviewBrowserWindow(state, args);
      return null;
    },

    async write_agent_chat_handoff(args) {
      const dir = handoffDir();
      // cleanup old
      try {
        for (const name of readdirSync(dir)) {
          if (name.endsWith(".json")) {
            const p = join(dir, name);
            try {
              const st = statSync(p);
              if (Date.now() - st.mtimeMs > 12 * 60 * 60 * 1000) unlinkSync(p);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
      let token = typeof args.token === "string" ? args.token : "";
      if (!token || !/^[a-zA-Z0-9_-]{8,}$/.test(token)) {
        token = randomUUID();
      }
      const snapshot = args.snapshot ?? args;
      const path = join(dir, `${token}.json`);
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(snapshot), "utf8");
      renameSync(tmp, path);
      return token;
    },

    async read_agent_chat_handoff(args) {
      const token = str(args.token);
      if (!/^[a-zA-Z0-9_-]{8,}$/.test(token)) {
        throw new Error("invalid Agent Chat handoff token");
      }
      const path = join(handoffDir(), `${token}.json`);
      if (!existsSync(path)) return null;
      const raw = readFileSync(path, "utf8");
      try {
        unlinkSync(path);
      } catch {
        /* ignore */
      }
      return JSON.parse(raw);
    },

    // --- preview bridge ---
    async preview_bridge_open(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const url = str(args.url);
      const bounds = (args.bounds ?? args) as {
        x: number;
        y: number;
        width: number;
        height: number;
        zoom?: number;
      };
      state.preview?.open(sessionId, url, {
        x: Number(bounds.x),
        y: Number(bounds.y),
        width: Number(bounds.width),
        height: Number(bounds.height),
        zoom: bounds.zoom != null ? Number(bounds.zoom) : 1,
      });
      return null;
    },

    async preview_bridge_update_bounds(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const bounds = args.bounds as {
        x: number;
        y: number;
        width: number;
        height: number;
        zoom?: number;
      };
      state.preview?.updateBounds(sessionId, {
        x: Number(bounds.x),
        y: Number(bounds.y),
        width: Number(bounds.width),
        height: Number(bounds.height),
        zoom: bounds.zoom != null ? Number(bounds.zoom) : 1,
      });
      return null;
    },

    async preview_bridge_set_detached(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const url = str(args.url);
      const detached = Boolean(args.detached);
      const bounds = (args.bounds ?? {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      }) as {
        x: number;
        y: number;
        width: number;
        height: number;
        zoom?: number;
      };
      state.preview?.setDetached(sessionId, url, {
        x: Number(bounds.x),
        y: Number(bounds.y),
        width: Number(bounds.width),
        height: Number(bounds.height),
        zoom: bounds.zoom != null ? Number(bounds.zoom) : 1,
      }, detached);
      return null;
    },

    async preview_bridge_navigate(args) {
      state.preview?.navigate(
        str(args.session_id ?? args.sessionId),
        str(args.url),
      );
      return null;
    },

    async preview_bridge_enter_pick_mode(args) {
      state.preview?.enterPickMode(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_clear_selection(args) {
      state.preview?.clearSelection(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_clear_annotations(args) {
      state.preview?.clearAnnotations(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_open_devtools(args) {
      state.preview?.openDevtools(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_close(args) {
      state.preview?.close(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_show(args) {
      state.preview?.show(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_hide(args) {
      state.preview?.hide(str(args.session_id ?? args.sessionId));
      return null;
    },

    async preview_bridge_event(args) {
      const payload = args.payload ?? args;
      state.preview?.forwardRuntimeEvent(payload);
      return null;
    },

    async preview_bridge_probe_url(args) {
      const url = str(args.url);
      try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }
      return null;
    },

    // --- cookies ---
    async list_importable_browsers() {
      return cookies.listImportableBrowsers();
    },

    async import_browser_cookies(args) {
      const handle = str(args.profile_handle ?? args.profileHandle);
      const session = state.preview?.getPreviewSession();
      if (!session) throw { code: "Unknown" };
      return cookies.importBrowserCookies(session, handle);
    },

    async clear_browser_cache() {
      const session = state.preview?.getPreviewSession();
      if (!session) throw { code: "Unknown" };
      return cookies.clearBrowserCache(session);
    },

    async clear_browser_site_data() {
      const session = state.preview?.getPreviewSession();
      if (!session) throw { code: "Unknown" };
      return cookies.clearBrowserSiteData(session);
    },

    // --- appshot ---
    async appshot_status() {
      const appshot = await import("../appshot/service.js");
      return appshot.appshotStatus();
    },
    async appshot_accept_pending(args) {
      const appshot = await import("../appshot/service.js");
      return appshot.acceptPending(str(args.preview_id ?? args.previewId));
    },
    async appshot_discard_pending(args) {
      const appshot = await import("../appshot/service.js");
      await appshot.discardPending(str(args.preview_id ?? args.previewId));
      return null;
    },
    async appshot_set_pending_auto_accept(args) {
      const appshot = await import("../appshot/service.js");
      await appshot.setPendingAutoAccept(args.req ?? args);
      return null;
    },
    async appshot_list_records() {
      const appshot = await import("../appshot/service.js");
      return appshot.listRecords();
    },
    async appshot_read_records(args) {
      const appshot = await import("../appshot/service.js");
      const req = (args.req ?? args) as { timestamps?: string[] };
      return appshot.readRecords(req.timestamps ?? []);
    },
    async appshot_read_snapshot(args) {
      const appshot = await import("../appshot/service.js");
      return appshot.readSnapshot(str(args.timestamp));
    },
    async appshot_copy_record(args) {
      const appshot = await import("../appshot/service.js");
      return appshot.copyRecord(str(args.timestamp));
    },
    async appshot_delete_record(args) {
      const appshot = await import("../appshot/service.js");
      await appshot.deleteRecord(str(args.timestamp));
      return null;
    },
    async appshot_trigger_capture() {
      const appshot = await import("../appshot/service.js");
      await appshot.triggerCapture(state);
      return null;
    },
    async appshot_open_permissions(args) {
      const appshot = await import("../appshot/service.js");
      const req = (args.req ?? args) as { target?: string };
      await appshot.openPermissions(str(req.target ?? "all"));
      return null;
    },
    async appshot_show_permissions_window(args) {
      const { openAppshotPermissionsWindow } = await import(
        "../windows/secondary.js"
      );
      openAppshotPermissionsWindow(state, args);
      return null;
    },

    // --- tunnel ---
    async tunnel_connector_detect() {
      const providers = await state.tunnel?.detectAll();
      return { providers: providers ?? [] };
    },
    async tunnel_connector_start(args) {
      const req = (args.req ?? args) as {
        provider: ProviderKind;
        mode?: string;
        target_base_url?: string;
        targetBaseUrl?: string;
        ttl_secs?: number;
      };
      if (!state.tunnel) throw new Error("tunnel service unavailable");
      return state.tunnel.start(
        req.provider,
        req.mode ?? "private",
        req.target_base_url ?? req.targetBaseUrl ?? `http://${state.apiHost}:${state.apiPort}`,
        req.ttl_secs ?? 3600,
      );
    },
    async tunnel_connector_stop(args) {
      const req = (args.req ?? args) as { provider: ProviderKind };
      await state.tunnel?.stop(req.provider);
      return null;
    },
    async tunnel_connector_status() {
      return state.tunnel?.statusAll() ?? {};
    },
    async tunnel_connector_renew(args) {
      const req = (args.req ?? args) as {
        provider: ProviderKind;
        ttl_secs?: number;
      };
      if (!state.tunnel) throw new Error("tunnel service unavailable");
      return state.tunnel.renew(req.provider, req.ttl_secs ?? 3600);
    },
    async tunnel_connector_recover() {
      return (await state.tunnel?.recover()) ?? {};
    },
    async tunnel_connector_provider_guide(args) {
      const provider = str(args.provider) as ProviderKind;
      return state.tunnel?.providerGuide(provider) ?? [];
    },
    async tunnel_connector_save_credential(args) {
      const req = (args.req ?? args) as {
        provider: ProviderKind;
        credential: string;
      };
      state.tunnel?.saveCredential(req.provider, req.credential);
      return null;
    },
    async tunnel_connector_clear_credential(args) {
      const provider = (args.provider ??
        (args as { req?: { provider?: ProviderKind } }).req?.provider) as
        | ProviderKind
        | undefined;
      if (provider) state.tunnel?.clearCredential(provider);
      return null;
    },
  };
}
