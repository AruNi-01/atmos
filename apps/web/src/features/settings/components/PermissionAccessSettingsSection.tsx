"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Cookie, Monitor } from "lucide-react";
import { Switch } from "@workspace/ui";
import { DesktopUsePermissionsPanel } from "@/features/settings/components/DesktopUsePermissionsPanel";
import { SettingsGroupCard } from "@/features/settings/components/settings/SettingsGroupCard";

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
    <div className="space-y-4">
      <SettingsGroupCard
        open={browserCookiesOpen}
        onOpenChange={setBrowserCookiesOpen}
        icon={Cookie}
        title={t("title")}
        description={t("description")}
      >
        {error ? (
          <div className="px-2 py-4 text-xs text-destructive">{error}</div>
        ) : null}
        {resources.length === 0 && !error ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">{t("empty")}</div>
        ) : null}
        {resources.map((resource) => {
          const canToggle = resource.detected || resource.consent === true;
          const statusLabel = !resource.has_install_fingerprint
            ? t("webSession")
            : resource.detected
              ? t("installed")
              : t("notInstalled");
          return (
            <div
              key={resource.id}
              className="border-b border-border px-2 py-4 last:border-b-0"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {resource.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={resource.consent === true}
                    disabled={!canToggle || busyId === resource.id}
                    aria-label={t("toggleAria", { name: resource.label })}
                    onCheckedChange={(value) => {
                      void onToggle(resource, !!value);
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </SettingsGroupCard>

      <section className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-start gap-3 px-6 py-5">
          <span className="relative mt-0.5 size-5 shrink-0">
            <Monitor className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-medium text-foreground">{t("desktopUse.title")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("desktopUse.description")}
            </p>
          </div>
        </div>
        <div className="border-t border-border px-4">
          <DesktopUsePermissionsPanel />
        </div>
      </section>
    </div>
  );
}
