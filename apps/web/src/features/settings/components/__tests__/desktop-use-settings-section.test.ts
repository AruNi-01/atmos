import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("Desktop Use settings wiring", () => {
  it("registers desktop-use settings section and group", () => {
    const data = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-data.ts"),
      "utf8",
    );
    expect(data).toContain('"desktop-use"');
    expect(data).toContain("sections.desktopUse");
  });

  it("includes desktop-use in SettingsModalTab enum list", () => {
    const params = readFileSync(
      join(root, "apps/web/src/shared/lib/nuqs/searchParams.ts"),
      "utf8",
    );
    expect(params).toContain('"desktop-use"');
  });

  it("SettingsModalSections renders DesktopUseSettingsSection", () => {
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(sections).toContain("DesktopUseSettingsSection");
    expect(sections).toContain("case 'desktop-use'");
  });

  it("Desktop Use section owns DesktopUsePermissionsPanel (not AppShot brand)", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("DesktopUsePermissionsPanel");
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
    // Engine card does not call grant; permissions panel owns it
    expect(section).toContain("DesktopUsePermissionsPanel");
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
    // Stop / Uninstall live under the engine group (not standalone cards)
    expect(section).toContain('t("actions.stop")');
    expect(section).toContain('t("actions.uninstall")');
    expect(section).toContain('t("engine.stopHint")');
    expect(section).toContain('t("engine.removeHint")');
    // Default collapse: installed engine (no update) → collapse; all perms → collapse
    expect(section).toContain("defaultsAppliedRef");
    expect(section).toContain("setEngineOpen");
    expect(section).toContain("setPermissionsOpen");
    expect(section).toContain("desktop_use_doctor");
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
    expect(panel).toContain('desktopInvoke("desktop_use_grant_permissions", { target');
    expect(panel).toContain("openGrant(name)");
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
    expect(section).toContain("DesktopUsePermissionsPanel");
    // Must not wire permissions → parent load callback (infinite refresh)
    expect(section).not.toMatch(/onStatusChange\s*=/);
  });

  it("permission primary path opens Settings Desktop Use", () => {
    const client = readFileSync(
      join(root, "apps/web/src/features/appshot/lib/appshot-client.ts"),
      "utf8",
    );
    expect(client).toContain("openDesktopUseSettingsInApp");
    expect(client).toContain("Desktop Use");
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
    expect(popover).toContain("useOpenDesktopUseSettings");
    expect(popover).toContain("openDesktopUseSettings");
    expect(popover).not.toContain("showAppshotPermissionsWindow");
  });

  it("settings sidebar uses DesktopUseIcon for desktop-use", () => {
    const sidebar = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/settings-modal-sidebar.tsx",
      ),
      "utf8",
    );
    expect(sidebar).toContain("DesktopUseIcon");
    expect(sidebar).toContain('sectionId === "desktop-use"');
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
