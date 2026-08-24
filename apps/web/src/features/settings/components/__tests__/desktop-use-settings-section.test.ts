import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("Desktop Use settings wiring", () => {
  it("registers desktop-use settings under Apps", () => {
    const data = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-data.ts"),
      "utf8",
    );
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(data).toContain("desktop-use");
    expect(sections).toContain('activeGroupTab === \'desktop-use\'');
    expect(data).toContain('apps: mergeTopicItems("integrations", "browser", "desktop-use")');
  });

  it("includes apps in SettingsModalTab enum list", () => {
    const params = readFileSync(
      join(root, "apps/web/src/shared/lib/nuqs/searchParams.ts"),
      "utf8",
    );
    expect(params).toContain('"apps"');
    expect(params).not.toContain('"desktop-use"');
  });

  it("SettingsModalSections renders DesktopUseSettingsSection on Apps", () => {
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(sections).toContain("DesktopUseSettingsSection");
    expect(sections).toContain("case 'apps'");
    expect(sections).not.toContain("case 'desktop-use'");
  });

  it("Desktop Use section sends OS grants to Permission access (not AppShot brand)", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    const access = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/PermissionAccessSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("openPermissionAccessSettings");
    expect(access).toContain("DesktopUsePermissionsPanel");
    expect(section).not.toContain("AppshotPermissionsPanel");
    expect(section.toLowerCase()).not.toContain("cua");
    expect(section.toLowerCase()).not.toContain("trycua");
  });

  it("separates install vs update and keeps grant only in permissions", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    // Install and update are distinct actions
    expect(section).toContain('t("actions.install")');
    expect(section).toContain('t("actions.update")');
    expect(section).toContain("update_available");
    expect(section).toContain("updateAvailable");
    // Engine card does not call grant; Permission access owns OS grants
    expect(section).toContain("openPermissionAccessSettings");
  });

  it("groups engine (stop/uninstall), permissions, and visibility as collapsible cards", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("SettingsGroupCard");
    expect(section).toContain("SettingsGroupRow");
    expect(section).toContain("SettingsExperimentalNotice");
    expect(section).toContain('t("developmentWarning")');
    // Icons per group
    expect(section).toContain("Cpu");
    expect(section).toContain("Shield");
    expect(section).toContain("Scan");
    // Group order: engine → permissions → visibility
    const engineIdx = section.indexOf('t("groups.engine.title")');
    const permsIdx = section.indexOf('t("groups.permissions.title")');
    const visIdx = section.indexOf('t("groups.visibility.title")');
    expect(engineIdx).toBeGreaterThan(-1);
    expect(permsIdx).toBeGreaterThan(engineIdx);
    expect(visIdx).toBeGreaterThan(permsIdx);
    // Runtime status row with Check + Stop/Restart; Uninstall sits next to engine label
    expect(section).toContain('t("engine.runtimeTitle")');
    expect(section).toContain('t("actions.check")');
    expect(section).toContain('t("actions.stop")');
    expect(section).toContain('t("actions.restart")');
    expect(section).toContain('t("actions.uninstall")');
    expect(section).toContain("desktop_use_driver_restart");
    expect(section).toContain("desktop_use_driver_check");
    expect(section).toContain("uninstallButton");
    expect(section).toContain("EngineProgressBar");
    expect(section).toContain("driver?.progress");
    expect(section).not.toContain('t("engine.removeHint")');
    expect(section).toContain("defaultsAppliedRef");
    expect(section).toContain("setEngineOpen");
    expect(section).toContain("setPermissionsOpen");
  });

  it("shows download progress left of install and Check toast for runtime", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("downloadProgressAside");
    expect(section).toContain("toastManager.add");
    expect(section).toContain("restartSuggested");
    expect(section).toContain("checkRuntime");
    expect(section).toContain("engine.check.okTitle");
  });

  it("uninstall requires a confirm dialog that lists feature impact", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("uninstallOpen");
    expect(section).toContain('t("uninstallConfirm.title")');
    expect(section).toContain('t("uninstallConfirm.consequences.appshotHost")');
    expect(section).toContain('t("uninstallConfirm.consequences.agentControl")');
    expect(section).toContain('t("uninstallConfirm.consequences.cli")');
    expect(section).toContain("desktop_use_driver_uninstall");
    // Must not uninstall on first click without opening confirm
    expect(section).toMatch(/onClick=\{\(\)\s*=>\s*setUninstallOpen\(true\)\}/);
  });

  it("exposes operation border toggle via prefs IPC inside visibility group", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain('t("border.title")');
    expect(section).toContain('t("groups.visibility.title")');
    expect(section).toContain("desktop_use_prefs_set");
    expect(section).toContain("operationBorder");
    expect(section).toContain("operation_border_enabled");
  });

  it("DesktopUsePermissionsPanel uses doctor + host grant only", () => {
    const panel = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUsePermissionsPanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("desktop_use_doctor");
    expect(panel).toContain("desktop_use_grant_permissions");
    // Per-permission grant buttons (not one bulk button)
    expect(panel).toContain('t("permissions.grant")');
    expect(panel).toContain("PERMISSION_ICONS");
    expect(panel).toContain("desktop_use_grant_permissions");
    expect(panel).toContain("anchor");
    expect(panel).toContain("openGrant(name, e.currentTarget)");
    // Refresh published to Permissions group header (not per-row).
    expect(panel).toContain("actions.refresh");
    expect(panel).toContain("onHeaderEndChange");
    expect(panel).not.toContain("hostLine");
    expect(panel).not.toContain("dragHint");
    expect(panel).not.toContain("getAppshotStatus");
    expect(panel).not.toContain("openAppshotPermissionTarget");
    expect(panel.toLowerCase()).not.toContain("cua");
    expect(panel).not.toContain("onStatusChange");
  });

  it("Desktop Use settings does not reload engine status from permissions panel", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("openPermissionAccessSettings");
    // Must not wire permissions → parent load callback (infinite refresh)
    expect(section).not.toMatch(/onStatusChange\s*=/);
  });

  it("install/update pokes permissions panel so grant rows appear without re-expand", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    const panel = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUsePermissionsPanel.tsx",
      ),
      "utf8",
    );
    // Parent → panel one-way signal after driver actions (not reverse onStatusChange).
    expect(section).toContain("cliInstalled");
    expect(section).toContain("systemApi.installCli");
    expect(section).toContain("atmos_cli_probe");
    expect(panel).toContain("engineInstalledFromParent");
    expect(panel).toContain("doctorRefreshToken");
    expect(section).toMatch(
      /actionKey === "install"[\s\S]*setPermissionsOpen\(true\)/,
    );
  });

  it("gates Desktop Use on package min CLI version before engine install", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("installOrUpdateCli");
    expect(section).toContain("atmos_cli_probe");
    expect(section).toContain("update_required");
    expect(section).toContain("min_cli_version");
    // Gate is package floor, not R2 latest channel.
    expect(section).not.toContain("checkCliVersion");
    expect(section).not.toContain("Resources/bin/atmos");
    expect(section).not.toContain("ATMOS_CLI_PATH");
  });

  it("permission primary path opens Settings Desktop Use", () => {
    const client = readFileSync(
      join(root, "apps/web/src/features/appshot/lib/appshot-client.ts"),
      "utf8",
    );
    expect(client).toContain("openPermissionAccessSettingsInApp");
    expect(client).toContain("Permission access");
    // No legacy standalone permission window as primary recovery
    expect(client).not.toMatch(
      /appshot_show_permissions_window[\s\S]*openDesktopUseSettingsInApp/,
    );
  });

  it("header Appshots authorize opens Desktop Use settings", () => {
    const popover = readFileSync(
      join(
        root,
        "apps/web/src/features/appshot/components/AppshotsHistoryPopover.tsx",
      ),
      "utf8",
    );
    expect(popover).toContain("useOpenPermissionAccessSettings");
    expect(popover).toContain("openPermissionAccessSettings");
    expect(popover).not.toContain("showAppshotPermissionsWindow");
  });

  it("settings sidebar uses BlocksIcon for apps", () => {
    const sidebar = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/settings-modal-sidebar.tsx",
      ),
      "utf8",
    );
    expect(sidebar).toContain("BlocksIcon");
    expect(sidebar).toContain('sectionId === "apps"');
    expect(sidebar).not.toContain('sectionId === "desktop-use"');
    const icon = readFileSync(
      join(root, "packages/ui/src/components/icons/desktop-use-icon.tsx"),
      "utf8",
    );
    // Combined monitor + notch pointer (hover wiggle on pointer)
    expect(icon).toContain("du-pointer");
    expect(icon).toContain("startAnimation");
    expect(icon).toContain("M13 3H4a2 2 0 0 0-2 2v10");
  });
});
