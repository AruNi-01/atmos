"use client";

/**
 * Shared landing chrome for OAuth return tabs (Hub GitHub/Google, Linear, etc.).
 * Auth-frame border (extended lines + corner crosses), not a filled card.
 */
import type { ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button, cn } from "@workspace/ui";
import {
  oauthCallbackActionHref,
  type OAuthReturnContext,
} from "@/shared/lib/oauth-callback-return";
import LogoSvg from "@workspace/ui/components/logo-svg";
import { LinearIcon } from "@workspace/ui/components/icons/linear-icon";
import { DecorIcon } from "@workspace/ui/components/ui/decor-icon";

export type OAuthCallbackProvider =
  | "github"
  | "google"
  | "linear"
  | "generic";

export type OAuthCallbackStatus = "working" | "ok" | "error";

const PROVIDER_LABEL: Record<OAuthCallbackProvider, string> = {
  github: "GitHub",
  google: "Google",
  linear: "Linear",
  generic: "Account",
};

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.22.7.82.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

/** Official multicolor Google “G”. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

function ProviderMark({
  provider,
  className,
}: {
  provider: Exclude<OAuthCallbackProvider, "generic">;
  className?: string;
}) {
  switch (provider) {
    case "github":
      return <GithubMark className={className} />;
    case "google":
      return <GoogleMark className={className} />;
    case "linear":
      return <LinearIcon className={className} size={28} />;
  }
}

function LogoTile({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {children}
    </div>
  );
}

function LinkStatus({ status }: { status: OAuthCallbackStatus }) {
  if (status === "working") {
    return (
      <Loader2
        className="size-4 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
    );
  }
  if (status === "ok") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <Check className="size-3" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
      <X className="size-3" strokeWidth={2.5} aria-hidden />
    </span>
  );
}

export function parseOAuthCallbackProvider(
  raw: string | null | undefined,
): OAuthCallbackProvider {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "github" || value === "google" || value === "linear") {
    return value;
  }
  return "generic";
}

type OAuthCallbackShellProps = {
  provider?: OAuthCallbackProvider;
  status: OAuthCallbackStatus;
  title: string;
  message: ReactNode;
  /** Extra lines under the primary message (hints, error codes). */
  children?: ReactNode;
  className?: string;
};

export function OAuthCallbackReturnFooter({
  ctx,
  closeHint,
  backLabel,
  showAction,
}: {
  ctx: OAuthReturnContext;
  closeHint: string;
  backLabel: string;
  showAction: boolean;
}) {
  const href = oauthCallbackActionHref(ctx);
  return (
    <>
      <p className="text-xs text-muted-foreground">{closeHint}</p>
      {showAction ? (
        <Button className="mt-4 w-full" render={<a href={href} />}>
          {backLabel}
        </Button>
      ) : null}
    </>
  );
}

/**
 * Full-viewport OAuth finish screen: auth-frame borders, provider ↔ Atmos logos.
 */
export function OAuthCallbackShell({
  provider = "generic",
  status,
  title,
  message,
  children,
  className,
}: OAuthCallbackShellProps) {
  const showProvider = provider !== "generic";

  const messageClass =
    status === "error"
      ? "text-destructive"
      : status === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";

  return (
    <main
      className={cn(
        "relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-6 py-12 text-foreground md:px-8",
        className,
      )}
    >
      <section
        className="relative flex w-full max-w-sm flex-col p-6 md:p-8"
        aria-live="polite"
      >
        {/* Extended hairline frame (AuthPage / CTA1 pattern) */}
        <div
          className="pointer-events-none absolute -inset-y-6 -left-px w-px bg-border"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -inset-y-6 -right-px w-px bg-border"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -inset-x-6 -top-px h-px bg-border"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -inset-x-6 -bottom-px h-px bg-border"
          aria-hidden
        />
        <DecorIcon position="top-left" />
        <DecorIcon position="bottom-right" />

        <div className="flex w-full flex-col items-center text-center">
          <div className="mb-8 flex items-center gap-3">
            {showProvider ? (
              <>
                <LogoTile label={PROVIDER_LABEL[provider]}>
                  <ProviderMark
                    provider={provider}
                    className="size-7 text-foreground"
                  />
                </LogoTile>
                <div
                  className="flex items-center gap-1.5 text-muted-foreground/60"
                  aria-hidden
                >
                  <span className="h-px w-3.5 bg-border" />
                  <LinkStatus status={status} />
                  <span className="h-px w-3.5 bg-border" />
                </div>
              </>
            ) : null}
            <LogoTile
              label="Atmos"
              className={cn(!showProvider && "size-16 rounded-2xl")}
            >
              <LogoSvg
                className="text-foreground"
                width={showProvider ? 28 : 36}
                height={showProvider ? 28 : 36}
                aria-hidden
              />
            </LogoTile>
          </div>

          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <div
            className={cn(
              "mt-2 max-w-sm text-sm leading-relaxed",
              messageClass,
            )}
          >
            {message}
          </div>

          {children ? (
            <div className="mt-4 flex w-full flex-col items-center gap-2">
              {children}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
