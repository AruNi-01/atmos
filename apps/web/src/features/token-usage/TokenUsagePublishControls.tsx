"use client";

import * as React from "react";
import { AuthView, GitHubIcon } from "@daveyplate/better-auth-ui";
import { ExternalLink, Loader2, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Switch,
  XIcon,
  cn,
} from "@workspace/ui";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import {
  hubConfigured,
  hubDeleteUsagePage,
  hubGetUsagePage,
  hubMe,
  hubPutUsagePage,
  type HubUsagePage,
} from "@/api/hub-client";
import { hubGetSession } from "@/api/hub-auth-client";
import { HubAuthUIProvider } from "@/features/settings/components/HubAuthUIProvider";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";
import { mapOverviewToSharePayload } from "@/features/token-usage/token-usage-share-payload";

type Visibility = "off" | "public" | "unlisted";

export function TokenUsagePublishControls({
  overview,
  disabled,
  onDialogOpenChange,
}: {
  overview: TokenUsageOverviewResponse | null;
  disabled?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
}) {
  if (!hubConfigured()) return null;
  return (
    <HubAuthUIProvider>
      <PublishBody
        overview={overview}
        disabled={disabled}
        onDialogOpenChange={onDialogOpenChange}
      />
    </HubAuthUIProvider>
  );
}

function PrefixedField({
  icon,
  prefix,
  value,
  onChange,
  placeholder,
  disabled,
  flushPrefix,
  trailing,
  "aria-label": ariaLabel,
}: {
  icon?: React.ReactNode;
  prefix: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  disabled?: boolean;
  flushPrefix?: boolean;
  trailing?: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <InputGroup className="h-8">
      <InputGroupAddon
        align="inline-start"
        className="h-8 shrink-0 gap-1 whitespace-nowrap pl-2 pr-0 text-[11px] font-normal text-muted-foreground"
      >
        {icon ? (
          <span className="flex size-3 shrink-0 items-center justify-center">
            {icon}
          </span>
        ) : null}
        <span>{prefix}</span>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-8 min-w-0 text-xs",
          flushPrefix ? "!pl-0" : "pl-1.5",
        )}
      />
      {trailing}
    </InputGroup>
  );
}

function PublishBody({
  overview,
  disabled,
  onDialogOpenChange,
}: {
  overview: TokenUsageOverviewResponse | null;
  disabled?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.publish");
  const signInT = useTranslations("settings.accountSection");
  const qc = useQueryClient();
  const desktop =
    isDesktopRuntime() ||
    process.env.NEXT_PUBLIC_BUILD_TARGET === "desktop";

  const sessionQuery = useQuery({
    queryKey: ["hub", "session"],
    queryFn: () => hubGetSession(),
    staleTime: 15_000,
    retry: false,
  });
  const meQuery = useQuery({
    queryKey: ["hub", "me"],
    queryFn: () => hubMe(),
    staleTime: 15_000,
    retry: false,
  });
  const pageQuery = useQuery({
    queryKey: ["hub", "usage-page"],
    queryFn: () => hubGetUsagePage(),
    staleTime: 15_000,
    retry: false,
    enabled: Boolean(sessionQuery.data?.user || meQuery.data?.user_id),
  });

  const signedIn = Boolean(sessionQuery.data?.user?.id || meQuery.data?.user_id);
  const page: HubUsagePage | null = pageQuery.data ?? null;

  const [signInOpen, setSignInOpen] = React.useState(false);
  const [handle, setHandle] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("unlisted");
  const [github, setGithub] = React.useState("");
  const [x, setX] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secretOnce, setSecretOnce] = React.useState<string | null>(null);

  const setSignInDialog = React.useCallback(
    (open: boolean) => {
      setSignInOpen(open);
      onDialogOpenChange?.(open);
    },
    [onDialogOpenChange],
  );

  React.useEffect(() => {
    if (!page) return;
    if (page.handle) setHandle(page.handle);
    setVisibility(page.visibility === "public" ? "public" : "unlisted");
    setGithub(page.github_username ?? "");
    setX(page.x_username ?? "");
  }, [page]);

  const claimed = Boolean(page?.handle_claimed && page.handle);
  const live = page?.visibility === "public" || page?.visibility === "unlisted";
  const dirty =
    x.trim() !== (page?.x_username ?? "") ||
    github.trim() !== (page?.github_username ?? "") ||
    visibility !== (page?.visibility === "public" ? "public" : "unlisted") ||
    (!claimed && handle.trim().length > 0);
  const updateDisabled =
    disabled ||
    busy ||
    !overview ||
    (!claimed && handle.trim().length < 3) ||
    (live && !dirty);
  const handleSlug = page?.handle || handle.trim().toLowerCase();
  const pageUrl = !handleSlug
    ? null
    : visibility === "unlisted" && secretOnce
      ? `https://atmos.land/tok/@${handleSlug}?k=${encodeURIComponent(secretOnce)}`
      : (page?.url ?? `https://atmos.land/tok/@${handleSlug}`);

  const publish = async () => {
    if (!overview) return;
    setBusy(true);
    setError(null);
    try {
      const snapshot = mapOverviewToSharePayload(overview, { includeCost: true });
      const result = await hubPutUsagePage({
        handle: claimed ? undefined : handle,
        visibility,
        include_cost: true,
        github_username: github,
        x_username: x,
        snapshot,
      });
      if (result.unlisted_secret) setSecretOnce(result.unlisted_secret);
      await qc.invalidateQueries({ queryKey: ["hub", "usage-page"] });
      await qc.invalidateQueries({ queryKey: ["hub", "me"] });
    } catch (e) {
      setError(mapPublishError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      await hubDeleteUsagePage();
      setSecretOnce(null);
      await qc.invalidateQueries({ queryKey: ["hub", "usage-page"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-3 px-2.5 pb-2.5 pt-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t("handleLabel")}</p>
          <PrefixedField
            prefix="atmos.land/tok/ @"
            flushPrefix
            value={handle}
            onChange={(next) => setHandle(next.replace(/^@+/, ""))}
            placeholder={t("handlePlaceholder")}
            disabled={!signedIn || claimed || busy}
            aria-label={t("handleLabel")}
            trailing={
              claimed && pageUrl ? (
                <InputGroupAddon
                  align="inline-end"
                  className="pr-1.5 has-[>button]:mr-0"
                >
                  <button
                    type="button"
                    aria-label={t("openPage")}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      window.open(pageUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    <ExternalLink className="size-3" />
                  </button>
                </InputGroupAddon>
              ) : null
            }
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t("linkLabel")}</p>
          <PrefixedField
            icon={<XIcon className="size-3" size={12} aria-hidden />}
            prefix="x.com/"
            value={x}
            onChange={setX}
            placeholder={t("xPlaceholder")}
            disabled={!signedIn || busy}
            aria-label={t("xPlaceholder")}
          />
          <PrefixedField
            icon={<GitHubIcon className="size-3 shrink-0" />}
            prefix="github.com/"
            value={github}
            onChange={setGithub}
            placeholder={t("githubPlaceholder")}
            disabled={!signedIn || busy}
            aria-label={t("githubPlaceholder")}
          />
        </div>

        <div className="flex h-8 items-center justify-between gap-3">
          <p className="text-xs font-medium">{t("visibility.public")}</p>
          <Switch
            checked={visibility === "public"}
            onCheckedChange={(checked) =>
              setVisibility(checked ? "public" : "unlisted")
            }
            disabled={!signedIn || busy}
            aria-label={t("visibility.public")}
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant={live && updateDisabled ? "secondary" : "ghost"}
            className="h-8"
            disabled={!signedIn || busy || !live}
            onClick={() => void turnOff()}
          >
            {t("turnOff")}
          </Button>
          {signedIn ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={updateDisabled}
              onClick={() => void publish()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {live ? t("update") : t("publish")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setSignInDialog(true)}
            >
              <LogIn className="size-3.5" />
              {signInT("signIn")}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={signInOpen} onOpenChange={setSignInDialog}>
        <DialogContent
          className="z-[70] w-full max-w-sm gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none sm:max-w-sm"
          overlayClassName="z-[70]"
          showCloseButton
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{signInT("signInDialogTitle")}</DialogTitle>
            <DialogDescription>
              {desktop
                ? signInT("signInDialogDescriptionDesktop")
                : signInT("signInDialogDescriptionWeb")}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-lg">
            <AuthView
              view="SIGN_IN"
              socialLayout="vertical"
              className="w-full max-w-none"
              redirectTo={
                typeof window !== "undefined" ? window.location.origin : "/"
              }
              localization={{
                SIGN_IN: signInT("signInDialogTitle"),
                DISABLED_CREDENTIALS_DESCRIPTION: desktop
                  ? signInT("signInDialogDescriptionDesktop")
                  : signInT("signInDialogDescriptionWeb"),
              }}
              classNames={{
                base: "w-full max-w-none border-0 shadow-none rounded-none bg-transparent",
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function mapPublishError(
  error: unknown,
  t: (key: string) => string,
): string {
  const msg = error instanceof Error ? error.message : "";
  if (msg === "username_taken") return t("errors.usernameTaken");
  if (msg === "handle_immutable") return t("errors.handleLocked");
  if (msg === "reserved_handle" || msg === "invalid_handle") {
    return t("errors.invalidHandle");
  }
  if (msg === "invalid_social_username") return t("errors.invalidSocial");
  return msg || t("errors.generic");
}
