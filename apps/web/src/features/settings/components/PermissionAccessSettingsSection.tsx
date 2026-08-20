"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DesktopUsePermissionsPanel } from "@/features/settings/components/DesktopUsePermissionsPanel";
import {
  SettingsGroupCard,
  SettingsPageStack,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { SettingsToggleRow } from "@/features/settings/components/settings/SettingsToggleRow";

import { useQueryClient } from "@tanstack/react-query";

import {
  permissionAccessApi,
  type PermissionAccessStatus,
} from "@/api/ws/permission-access-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { invalidateTokenUsageQueries } from "@/features/quota-usage/lib/token-usage-query-options";
import { tokenUsageApi } from "@/api/ws/token-usage-api";

export function PermissionAccessSettingsSection() {
  const t = useTranslations("settings.modal.permissionAccessSection");
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const [resources, setResources] = React.useState<PermissionAccessStatus[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [browserCookiesOpen, setBrowserCookiesOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const next = await permissionAccessApi.list();
      setResources(next.resources);
      setError(null);
    } catch {
      setError(t("error"));
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (resource: PermissionAccessStatus, granted: boolean) => {
    setBusyId(resource.id);
    try {
      const next = await permissionAccessApi.setConsent(resource.id, granted);
      setResources(next.resources);
      setError(null);
      invalidateTokenUsageQueries(queryClient, scope);
      if (resource.id === "cursor" && granted) {
        await tokenUsageApi.getOverview({ refresh: true, year: null }).catch(() => undefined);
        invalidateTokenUsageQueries(queryClient, scope);
      }
    } catch {
      setError(t("error"));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        open={browserCookiesOpen}
        onOpenChange={setBrowserCookiesOpen}
        title={t("title")}
        description={t("description")}
      >
        {error ? (
          <p className="px-2 py-3 text-xs text-destructive">{error}</p>
        ) : null}
        {resources.length === 0 && !error ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("empty")}</p>
        ) : null}
        {resources.map((resource) => {
          const canToggle = resource.detected || resource.consent === true;
          const statusLabel = !resource.has_install_fingerprint
            ? t("webSession")
            : resource.detected
              ? t("installed")
              : t("notInstalled");
          return (
            <SettingsToggleRow
              key={resource.id}
              title={resource.label}
              description={statusLabel}
              checked={resource.consent === true}
              disabled={!canToggle || busyId === resource.id}
              onCheckedChange={(value) => {
                void onToggle(resource, value);
              }}
            />
          );
        })}
      </SettingsGroupCard>

      <SettingsGroupCard
        title={t("desktopUse.title")}
        description={t("desktopUse.description")}
      >
        <DesktopUsePermissionsPanel />
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}
