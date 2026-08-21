"use client";

/**
 * Name field for Account settings.
 * Save sits on the title row (right). Soft limit 32: no permanent helper copy;
 * over-limit uses amber border + inline tip.
 */
import React from "react";
import { useTranslations } from "next-intl";
import { Button, Input, cn } from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { getHubAuthClient } from "@/api/hub-auth-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  SettingsGroupCard,
} from "@/features/settings/components/settings/SettingsGroupCard";

const NAME_MAX = 32;

type HubNameSettingsCardProps = {
  /** Current display name from session (live). */
  value: string;
  onSaved?: (name: string) => void;
};

export function HubNameSettingsCard({
  value,
  onSaved,
}: HubNameSettingsCardProps) {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();
  const [name, setName] = React.useState(value);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(value);
  }, [value]);

  const trimmed = name.trim();
  const overLimit = name.length > NAME_MAX;
  const unchanged = trimmed === (value ?? "").trim();
  const empty = trimmed.length === 0;
  const canSave = !busy && !overLimit && !empty && !unchanged;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const client = getHubAuthClient();
      const { error: updateError } = await client.updateUser({
        name: trimmed,
      });
      if (updateError) {
        throw new Error(updateError.message || t("errors.nameSaveFailed"));
      }
      await client.getSession({
        query: { disableCookieCache: true },
      });
      await qc.invalidateQueries({ queryKey: ["hub"] });
      await qc.refetchQueries({ queryKey: ["hub", "session"] });
      onSaved?.(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.nameSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroupCard
      title={t("nameTitle")}
      description={t("nameDescription")}
      headerEnd={
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t("nameSave")}
        </Button>
      }
    >
      <div className="space-y-2 px-2 py-3">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder={t("namePlaceholder")}
          disabled={busy}
          aria-invalid={overLimit}
          className={cn(
            "bg-background",
            overLimit &&
              "border-amber-500 focus-visible:border-amber-500 focus-visible:ring-amber-500/30",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) {
              e.preventDefault();
              void save();
            }
          }}
        />
        {overLimit ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t("nameTooLong", { max: NAME_MAX })}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </SettingsGroupCard>
  );
}
