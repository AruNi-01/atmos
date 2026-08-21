"use client";

/**
 * Danger zone: delete Atmos account (user + linked providers + sessions + devices).
 * Aligns with better-auth-ui Delete account card, with typed confirmation phrase.
 * @see https://better-auth-ui.com/docs/shadcn/plugins/delete-user
 */
import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { hubDeleteAccount } from "@/api/hub-auth-client";
import { clearStoredDeviceCredential } from "@/api/hub-client";
import { SettingsSection } from "@/features/settings/components/settings/SettingsGroupCard";

type HubDeleteAccountSectionProps = {
  /** Called after successful delete so parent can clear UI / close settings. */
  onDeleted?: () => void;
};

export function HubDeleteAccountSection({
  onDeleted,
}: HubDeleteAccountSectionProps) {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const phrase = t("deleteConfirmPhrase");
  const canDelete =
    confirmText.trim() === phrase && !busy && confirmText.length > 0;

  const reset = () => {
    setConfirmText("");
    setError(null);
    setBusy(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const deleteAccount = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await hubDeleteAccount();
      try {
        clearStoredDeviceCredential();
      } catch {
        /* ignore */
      }
      try {
        const { clearComputerClientSettingsOnDisk } = await import(
          "@/features/connection/lib/sync-computer-client-settings"
        );
        await clearComputerClientSettingsOnDisk();
      } catch {
        /* optional */
      }
      await qc.invalidateQueries({ queryKey: ["hub"] });
      setOpen(false);
      reset();
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.deleteFailed"));
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title={t("deleteAccount")}
      description={t("deleteAccountDescription")}
      action={
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-8 shrink-0"
          onClick={() => setOpen(true)}
        >
          {t("deleteAccount")}
        </Button>
      }
    >
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="z-[70] sm:max-w-md" overlayClassName="z-[70]">
          <DialogHeader>
            <DialogTitle>{t("deleteAccountDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteAccountDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-1">
            <Label htmlFor="hub-delete-confirm" className="text-sm">
              {t("deleteConfirmPrompt", { phrase })}
            </Label>
            <Input
              id="hub-delete-confirm"
              autoComplete="off"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={phrase}
              className="bg-background"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canDelete) {
                  e.preventDefault();
                  void deleteAccount();
                }
              }}
            />
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              {t("deleteCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canDelete}
              onClick={() => void deleteAccount()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("deleteConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
