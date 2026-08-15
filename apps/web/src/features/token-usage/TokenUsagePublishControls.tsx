"use client";

import * as React from "react";
import { Loader2, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthView } from "@daveyplate/better-auth-ui";
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
  cn,
} from "@workspace/ui";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import {
  hubConfigured,
  hubDeleteUsagePage,
  hubGetUsagePage,
  hubMe,
  hubMintUsagePageSecret,
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
  prefix,
  value,
  onChange,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
}: {
  prefix: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <InputGroup className="h-8">
      <InputGroupAddon
        align="inline-start"
        className="h-8 shrink-0 whitespace-nowrap pl-2.5 pr-0 text-[11px] font-normal text-muted-foreground"
      >
        {prefix}
      </InputGroupAddon>
      <InputGroupInput
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-8 min-w-0 pl-0 text-xs"
      />
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
  const [visibility, setVisibility] = React.useState<Visibility>("public");
  const [github, setGithub] = React.useState("");
  const [x, setX] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secretOnce, setSecretOnce] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

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
    if (page.visibility) setVisibility(page.visibility === "off" ? "public" : page.visibility);
    setGithub(page.github_username ?? "");
    setX(page.x_username ?? "");
  }, [page]);

  const claimed = Boolean(page?.handle_claimed && page.handle);
  const live = page?.visibility === "public" || page?.visibility === "unlisted";
  const handleSlug = page?.handle || handle.trim().toLowerCase();
  const shareUrl = !live
    ? null
    : visibility === "unlisted"
      ? secretOnce && handleSlug
        ? `https://atmos.land/tok/@${handleSlug}?k=${encodeURIComponent(secretOnce)}`
        : null
      : (page?.url ??
        (handleSlug ? `https://atmos.land/tok/@${handleSlug}` : null));

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

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

  const rotate = async () => {
    setBusy(true);
    setError(null);
    try {
      const minted = await hubMintUsagePageSecret();
      setSecretOnce(minted.unlisted_secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-3 border-t border-border/70 px-3 py-3">
        {!signedIn ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-muted-foreground">{t("signInHint")}</p>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setSignInDialog(true)}
            >
              <LogIn className="size-3.5" />
              {signInT("signIn")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("title")}</p>
              <p className="text-xs text-muted-foreground">{t("description")}</p>
            </div>

            <div className="space-y-1">
              <PrefixedField
                prefix="atmos.land/tok/@"
                value={handle}
                onChange={setHandle}
                placeholder={t("handlePlaceholder")}
                disabled={claimed || busy}
                aria-label={t("handleLabel")}
              />
              {claimed ? (
                <p className="text-[11px] text-muted-foreground">{t("handleLocked")}</p>
              ) : null}
            </div>

            <div className="flex gap-1">
              {(["public", "unlisted"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "h-7 rounded-full px-2.5 text-[11px]",
                    visibility === id
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                  onClick={() => setVisibility(id)}
                >
                  {t(`visibility.${id}`)}
                </button>
              ))}
            </div>

            <PrefixedField
              prefix="x.com/"
              value={x}
              onChange={setX}
              placeholder={t("xPlaceholder")}
              disabled={busy}
              aria-label={t("xPlaceholder")}
            />
            <PrefixedField
              prefix="github.com/"
              value={github}
              onChange={setGithub}
              placeholder={t("githubPlaceholder")}
              disabled={busy}
              aria-label={t("githubPlaceholder")}
            />

            {shareUrl ? (
              <div className="space-y-1">
                <p className="break-all text-[11px] text-muted-foreground">{shareUrl}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => void copyUrl(shareUrl)}
                >
                  {copied ? t("copied") : t("copyLink")}
                </Button>
              </div>
            ) : visibility === "unlisted" && live ? (
              <p className="text-[11px] text-muted-foreground">
                {t("unlistedNeedsSecret")}
              </p>
            ) : null}

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={disabled || busy || !overview || (!claimed && handle.trim().length < 3)}
                onClick={() => void publish()}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {live ? t("update") : t("publish")}
              </Button>
              {live ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={busy}
                  onClick={() => void turnOff()}
                >
                  {t("turnOff")}
                </Button>
              ) : null}
              {visibility === "unlisted" && live ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={busy}
                  onClick={() => void rotate()}
                >
                  {t("rotateSecret")}
                </Button>
              ) : null}
            </div>
          </div>
        )}
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
