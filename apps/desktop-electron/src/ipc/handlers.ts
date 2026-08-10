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
import type { BrowserWindow } from "electron";
import type { AppState } from "../app-state.js";
import { electronLogPath, appDataDir } from "../runtime/ensure.js";
import type { DesktopCommandHandler, DesktopInvokeArgs } from "../types.js";
import * as cookies from "../cookies/service.js";
import type { ProviderKind } from "../tunnel/service.js";

async function electron() {
  return import("electron");
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

/**
 * Resolve the BrowserWindow that invoked a desktop command (from main.ts inject).
 * Browser bridge uses this so standalone browser windows bind guests to the correct host.
 */
async function hostWindowFromArgs(
  args: DesktopInvokeArgs,
  state: AppState,
): Promise<BrowserWindow | null> {
  const id = args.__electronSenderWebContentsId;
  if (typeof id === "number" && Number.isFinite(id)) {
    try {
      const { BrowserWindow, webContents } = await electron();
      const wc = webContents.fromId(id);
      if (wc && !wc.isDestroyed()) {
        const win = BrowserWindow.fromWebContents(wc);
        if (win && !win.isDestroyed()) return win;
      }
    } catch {
      /* fall through */
    }
  }
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    return state.mainWindow;
  }
  return null;
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
      const { APP_ID, APP_PRODUCT_NAME } = await import("../branding-paths.js");
      let version = process.env.npm_package_version ?? "0.0.0";
      try {
        const { app } = await electron();
        if (typeof app.getVersion === "function") {
          version = app.getVersion() || version;
        }
      } catch {
        /* unit / smoke without app ready */
      }
      // Match Tauri: derive channel from prerelease suffix so About can show
      // stable / rc / beta / alpha versions correctly.
      const lower = version.toLowerCase();
      let version_type = "stable";
      if (lower.includes("-rc.")) version_type = "rc";
      else if (lower.includes("-beta.")) version_type = "beta";
      else if (lower.includes("-alpha.")) version_type = "alpha";
      return {
        version,
        version_type,
        product_name: APP_PRODUCT_NAME,
        app_id: APP_ID,
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
      // Opaque click payload (JSON-serializable). Echoed to the renderer on click
      // so web can jump to the agent pane / automation — same as in-app toast Jump.
      const data =
        args.data && typeof args.data === "object" && !Array.isArray(args.data)
          ? (args.data as Record<string, unknown>)
          : null;
      // Content icon (left on macOS). Prefer PNG data URL from the renderer so we
      // can show the agent brand mark. The OS still attaches the Atmos app icon
      // for identity (right side on macOS banners).
      const iconArg = typeof args.icon === "string" ? args.icon : "";
      const { Notification, nativeImage } = await electron();
      if (!Notification.isSupported()) return null;

      let icon: string | ReturnType<typeof nativeImage.createFromDataURL> | undefined;
      if (iconArg.startsWith("data:image/")) {
        try {
          const image = nativeImage.createFromDataURL(iconArg);
          if (!image.isEmpty()) icon = image;
        } catch {
          /* fall through without content icon */
        }
      } else if (iconArg && existsSync(iconArg)) {
        icon = iconArg;
      }

      const notification = new Notification({
        title,
        body,
        ...(icon ? { icon } : {}),
      });
      notification.on("click", () => {
        void (async () => {
          try {
            const { ensureMacDockVisible } = await import("../windows/mac-dock.js");
            await ensureMacDockVisible();
          } catch {
            /* non-mac / tests */
          }
          const win = state.mainWindow;
          if (!win || win.isDestroyed()) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          try {
            win.webContents.send(
              "atmos:desktop-event:notification-clicked",
              data ?? {},
            );
          } catch {
            /* renderer may not be ready */
          }
        })();
      });
      notification.show();
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
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, [path], { detached: true, stdio: "ignore" });
        child.on("error", (err) => {
          reject(
            new Error(
              `Failed to open editor "${cmd}": ${err.message || String(err)}`,
            ),
          );
        });
        child.on("spawn", () => {
          child.unref();
          resolve();
        });
      });
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

    /**
     * macOS only: move traffic lights at runtime (primary shell ↔ dense browser).
     * Targets the invoking window so main maximize and standalone stay correct.
     */
    async window_set_mac_chrome_variant(args) {
      if (process.platform !== "darwin") return null;
      const variantRaw = str(args.variant);
      const {
        applyMacChromeVariant,
        isMacChromeVariant,
      } = await import("../windows/mac-chrome.js");
      if (!isMacChromeVariant(variantRaw)) {
        throw new Error(
          `Invalid mac chrome variant: ${variantRaw || "(empty)"}`,
        );
      }
      const host = await hostWindowFromArgs(args, state);
      if (!host || host.isDestroyed()) return null;
      applyMacChromeVariant(host, variantRaw);
      return { variant: variantRaw };
    },

    // --- windows / handoff ---
    async open_agent_chat_window(args) {
      const { openAgentChatWindow } = await import("../windows/secondary.js");
      openAgentChatWindow(state, args);
      return null;
    },

    async open_browser_window(args) {
      const { openBrowserWindow } = await import("../windows/secondary.js");
      openBrowserWindow(state, args);
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

    // --- browser bridge (APP-053 webview) ---
    async browser_bridge_open(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const url = str(args.url);
      const host = await hostWindowFromArgs(args, state);
      const config = state.browser?.open(sessionId, url, null, host) ?? null;
      return config;
    },

    async browser_bridge_bind_guest(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const webContentsId = Number(args.webContentsId ?? args.web_contents_id);
      state.browser?.bindGuest(sessionId, webContentsId);
      return null;
    },

    async browser_bridge_set_detached(args) {
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
      const host = await hostWindowFromArgs(args, state);
      state.browser?.setDetached(
        sessionId,
        url,
        {
          x: Number(bounds.x),
          y: Number(bounds.y),
          width: Number(bounds.width),
          height: Number(bounds.height),
          zoom: bounds.zoom != null ? Number(bounds.zoom) : 1,
        },
        detached,
        host,
      );
      return null;
    },

    async browser_bridge_navigate(args) {
      state.browser?.navigate(
        str(args.session_id ?? args.sessionId),
        str(args.url),
      );
      return null;
    },

    async browser_bridge_set_zoom(args) {
      state.browser?.setZoom(
        str(args.session_id ?? args.sessionId),
        Number(args.zoom ?? 1),
      );
      return null;
    },

    async browser_bridge_set_color_scheme(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const raw = str(args.scheme ?? args.colorScheme ?? args.color_scheme);
      const scheme = raw === "light" ? "light" : raw === "dark" ? "dark" : "";
      if (!scheme) return null;
      state.browser?.setPreferredColorScheme(sessionId, scheme);
      return null;
    },

    async browser_bridge_query_element_rects(args) {
      const sessionId = str(args.session_id ?? args.sessionId);
      const raw = args.selectors;
      const selectors = Array.isArray(raw)
        ? raw.map((s) => str(s)).filter(Boolean)
        : [];
      return (
        (await state.browser?.queryElementRects(sessionId, selectors)) ?? []
      );
    },

    async browser_bridge_enter_pick_mode(args) {
      state.browser?.enterPickMode(str(args.session_id ?? args.sessionId));
      return null;
    },

    async browser_bridge_clear_selection(args) {
      // Unlock guest selection only — pick mode stays on when the toolbar is still pressed.
      state.browser?.clearSelection(str(args.session_id ?? args.sessionId));
      return null;
    },

    async browser_bridge_exit_pick_mode(args) {
      state.browser?.exitPickMode(str(args.session_id ?? args.sessionId));
      return null;
    },

    async browser_bridge_clear_annotations(args) {
      state.browser?.clearAnnotations(str(args.session_id ?? args.sessionId));
      return null;
    },

    async browser_bridge_open_devtools(args) {
      state.browser?.openDevtools(str(args.session_id ?? args.sessionId));
      return null;
    },

    async browser_bridge_close(args) {
      state.browser?.close(str(args.session_id ?? args.sessionId));
      return null;
    },

    async browser_bridge_event(args) {
      const payload = args.payload ?? args;
      state.browser?.forwardRuntimeEvent(payload);
      return null;
    },

    /**
     * Lightweight URL shape check (http/https only). No network fetch.
     * Product navigation does not require this; kept for tooling/smoke.
     */
    async browser_bridge_probe_url(args) {
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
      const session = state.browser?.getBrowserSession();
      if (!session) throw { code: "Unknown" };
      return cookies.importBrowserCookies(session, handle);
    },

    async clear_browser_cache() {
      const session = state.browser?.getBrowserSession();
      if (!session) throw { code: "Unknown" };
      return cookies.clearBrowserCache(session);
    },

    async clear_browser_site_data() {
      const session = state.browser?.getBrowserSession();
      if (!session) throw { code: "Unknown" };
      return cookies.clearBrowserSiteData(session);
    },

    // --- appshot ---
    async appshot_status() {
      const appshot = await import("../appshot/service.js");
      return appshot.appshotStatus(state);
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
      // APP-052: primary path is Settings → Desktop Use (not standalone window).
      const { BrowserWindow } = await import("electron");
      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        const url = new URL(win.webContents.getURL());
        url.searchParams.set("settingsModal", "true");
        url.searchParams.set("activeSettingTab", "desktop-use");
        await win.loadURL(url.toString());
        win.show();
        win.focus();
        return null;
      }
      const { openAppshotPermissionsWindow } = await import(
        "../windows/secondary.js"
      );
      openAppshotPermissionsWindow(state, args);
      return null;
    },

    // --- desktop use (APP-052) ---
    async atmos_cli_probe() {
      const client = await import("../desktop-use/client.js");
      // Includes package min_cli_version floor (not global release-channel latest).
      return client.probeAtmosCliWithRequirement();
    },
    async desktop_use_status() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseStatus();
    },
    async desktop_use_driver_ensure(args) {
      const client = await import("../desktop-use/client.js");
      const force = Boolean(args?.force);
      return client.desktopUseDriverEnsure(force);
    },
    async desktop_use_driver_stop() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDriverStop();
    },
    async desktop_use_driver_restart() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDriverRestart();
    },
    async desktop_use_driver_check() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDriverCheck();
    },
    async desktop_use_driver_uninstall() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDriverUninstall();
    },
    async desktop_use_capture() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseCapture();
    },
    async desktop_use_doctor() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDoctor();
    },
    async desktop_use_grant_permissions(args) {
      const client = await import("../desktop-use/client.js");
      const raw =
        typeof args?.target === "string" ? args.target.trim().toLowerCase() : "all";
      const target =
        raw === "accessibility" || raw === "screen_recording" || raw === "all"
          ? raw
          : "all";
      const result = (await client.desktopUseGrantPermissions(target)) as {
        ok?: boolean;
        host_app_path?: string | null;
        host_app_name?: string | null;
        accessibility_pane?: boolean;
        [key: string]: unknown;
      };

      // Re-arm AppShot dual-shift after host grant (inject listens on host AX).
      if (process.platform === "darwin") {
        try {
          const appshot = await import("../appshot/service.js");
          await appshot.appshotStatus(state);
        } catch {
          /* non-fatal */
        }
      }

      // Same drag-to-list fly overlay for Accessibility and Screen Recording
      // (only the System Settings privacy pane differs).
      const wantsDrag =
        target === "accessibility" ||
        target === "screen_recording" ||
        target === "all" ||
        result?.accessibility_pane === true;
      const hostPath =
        typeof result?.host_app_path === "string" ? result.host_app_path : "";
      if (wantsDrag && hostPath && process.platform === "darwin") {
        const { showAccessibilityGrantOverlay } = await import(
          "../desktop-use/grant-overlay.js"
        );
        const locale =
          typeof args?.locale === "string"
            ? args.locale
            : typeof args?.lang === "string"
              ? args.lang
              : undefined;
        const rawAnchor = args?.anchor;
        let anchor:
          | { x: number; y: number; width: number; height: number }
          | undefined;
        if (rawAnchor && typeof rawAnchor === "object") {
          const a = rawAnchor as Record<string, unknown>;
          const x = typeof a.x === "number" ? a.x : Number(a.x);
          const y = typeof a.y === "number" ? a.y : Number(a.y);
          const width =
            typeof a.width === "number" ? a.width : Number(a.width);
          const height =
            typeof a.height === "number" ? a.height : Number(a.height);
          if (
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            Number.isFinite(width) &&
            Number.isFinite(height) &&
            width > 0 &&
            height > 0
          ) {
            anchor = { x, y, width, height };
          }
        }
        // Convert viewport-relative button rect → screen points via host window.
        // Panel is 460×128 (grant-overlay PANEL_WIDTH / PANEL_HEIGHT).
        const PANEL_W = 460;
        const PANEL_H = 128;
        let sourceOrigin: { x: number; y: number } | undefined;
        if (anchor) {
          const host = await hostWindowFromArgs(args, state);
          if (host && !host.isDestroyed()) {
            try {
              const cb = host.getContentBounds();
              sourceOrigin = {
                x: Math.round(
                  cb.x + anchor.x + anchor.width / 2 - PANEL_W / 2,
                ),
                y: Math.round(
                  cb.y + anchor.y + anchor.height / 2 - PANEL_H / 2,
                ),
              };
            } catch {
              /* fall through — overlay picks Atmos window center */
            }
          }
        }
        // "all" ends on Accessibility (screen recording pane is opened first).
        const purpose =
          target === "screen_recording"
            ? "screen_recording"
            : "accessibility";
        const overlay = showAccessibilityGrantOverlay({
          hostAppPath: hostPath,
          hostAppName:
            typeof result?.host_app_name === "string"
              ? result.host_app_name
              : undefined,
          locale,
          purpose,
          sourceOrigin,
        });
        return {
          ...result,
          drag_overlay: overlay,
        };
      }
      return result;
    },
    async desktop_use_drive_verify() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDriveVerify();
    },
    async desktop_use_prefs_get() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUsePrefsGet();
    },
    async desktop_use_prefs_set(args) {
      const client = await import("../desktop-use/client.js");
      const operationBorder =
        typeof args?.operationBorder === "boolean"
          ? args.operationBorder
          : typeof args?.operation_border === "boolean"
            ? args.operation_border
            : typeof args?.operation_border_enabled === "boolean"
              ? args.operation_border_enabled
              : undefined;
      const highlightIdleMsRaw =
        args?.highlightIdleMs ?? args?.highlight_idle_ms;
      const highlightIdleMs =
        typeof highlightIdleMsRaw === "number" && Number.isFinite(highlightIdleMsRaw)
          ? highlightIdleMsRaw
          : undefined;
      return client.desktopUsePrefsSet({ operationBorder, highlightIdleMs });
    },
    async desktop_use_drive_session_end() {
      const client = await import("../desktop-use/client.js");
      return client.desktopUseDriveSessionEnd();
    },
    async desktop_use_close_grant_overlay() {
      const { closeAccessibilityGrantOverlay } = await import(
        "../desktop-use/grant-overlay.js"
      );
      closeAccessibilityGrantOverlay();
      return { ok: true };
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
