"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from "@workspace/ui";
import type { CatalogAuthStartResult } from "@/features/agent/lib/catalog-auth";
import {
  AUTHENTICATED_HOLD_MS,
  catalogAuthMethodKind,
} from "@/features/agent/lib/catalog-auth";

interface AuthMethod {
  id: string;
  name: string;
  description?: string;
}

interface AgentAuthDialogProps {
  authRequest: { message?: string; methods: AuthMethod[] } | null;
  clearAuthRequest: () => void;
  selectedAuthMethodId: string;
  setSelectedAuthMethodId: React.Dispatch<React.SetStateAction<string>>;
  startSession: (opts?: {
    authMethodId?: string;
    apiKey?: string;
  }) => void | Promise<void | CatalogAuthStartResult>;
  refreshSelectedAgentAfterAuth: (refresh: boolean) => void | Promise<void>;
  isConnecting: boolean;
}

type MethodPhase = "idle" | "working" | "authenticated";

export function AgentAuthDialog({
  authRequest,
  clearAuthRequest,
  selectedAuthMethodId,
  setSelectedAuthMethodId,
  startSession,
  refreshSelectedAgentAfterAuth,
  isConnecting,
}: AgentAuthDialogProps) {
  const t = useTranslations("Agent.components");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<MethodPhase>("idle");
  const [activeMethodId, setActiveMethodId] = useState("");
  const runIdRef = useRef(0);
  const methods = authRequest?.methods ?? [];
  const busy = phase === "working" || isConnecting;

  useEffect(() => {
    if (!authRequest) {
      setApiKey("");
      setCopied(false);
      setPhase("idle");
      setActiveMethodId("");
      runIdRef.current += 1;
    }
  }, [authRequest]);

  const selectMethod = (methodId: string) => {
    if (busy) return;
    if (selectedAuthMethodId === methodId) return;
    setSelectedAuthMethodId(methodId);
    setApiKey("");
    setCopied(false);
  };

  const finishAuth = async (methodId: string, key?: string) => {
    const runId = ++runIdRef.current;
    setSelectedAuthMethodId(methodId);
    setActiveMethodId(methodId);
    setPhase("working");
    try {
      const result = await startSession({
        authMethodId: methodId,
        ...(key ? { apiKey: key } : {}),
      });
      if (runId !== runIdRef.current) return;
      if (!result || result.status !== "authenticated") {
        setPhase("idle");
        return;
      }
      setPhase("authenticated");
      await new Promise((resolve) => {
        window.setTimeout(resolve, AUTHENTICATED_HOLD_MS);
      });
      if (runId !== runIdRef.current) return;
      clearAuthRequest();
      await refreshSelectedAgentAfterAuth(result.refresh);
    } catch {
      if (runId !== runIdRef.current) return;
      setPhase("idle");
    }
  };

  return (
    <Dialog open={!!authRequest} onOpenChange={(open) => !open && clearAuthRequest()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("authDialog.title")}</DialogTitle>
          <DialogDescription>
            {authRequest?.message || t("authDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {methods.map((method) => {
            const kind = catalogAuthMethodKind(method.id);
            const expanded = selectedAuthMethodId === method.id;
            const rowWorking = phase === "working" && activeMethodId === method.id;
            const rowDone = phase === "authenticated" && activeMethodId === method.id;
            const cliCommand = kind === "cli" ? method.description?.trim() || "" : "";
            return (
              <div key={method.id} className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy && !rowWorking}
                  aria-expanded={expanded}
                  className="h-auto w-full justify-between px-3 py-2"
                  onClick={() => selectMethod(method.id)}
                >
                  <span className="min-w-0 truncate text-left font-medium">{method.name}</span>
                  <MethodStatus
                    working={rowWorking}
                    authenticated={rowDone}
                    authenticatedLabel={t("authDialog.authenticated")}
                  />
                </Button>
                {expanded && kind === "browser" ? (
                  <div className="space-y-2 px-0.5">
                    <p className="text-xs text-muted-foreground">
                      {t("authDialog.browserHint")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      loading={rowWorking}
                      disabled={busy && !rowWorking}
                      onClick={() => {
                        void finishAuth(method.id);
                      }}
                    >
                      {t("authDialog.openBrowser")}
                    </Button>
                  </div>
                ) : null}
                {expanded && kind === "cli" ? (
                  <div className="space-y-2 px-0.5">
                    {cliCommand ? (
                      <>
                        <p className="text-sm font-medium">{t("authDialog.cliCommandLabel")}</p>
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2 py-1.5 text-xs">
                            {cliCommand}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              void navigator.clipboard.writeText(cliCommand).then(() => {
                                setCopied(true);
                                window.setTimeout(() => setCopied(false), 1500);
                              }).catch(() => undefined);
                            }}
                          >
                            {copied ? t("authDialog.copied") : t("authDialog.copyCommand")}
                          </Button>
                        </div>
                      </>
                    ) : method.description ? (
                      <p className="text-xs text-muted-foreground">{method.description}</p>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      loading={rowWorking}
                      disabled={busy && !rowWorking}
                      onClick={() => {
                        void finishAuth(method.id);
                      }}
                    >
                      {t("authDialog.signedIn")}
                    </Button>
                  </div>
                ) : null}
                {expanded && kind === "token" ? (
                  <div className="space-y-2 px-0.5">
                    <label className="text-sm font-medium" htmlFor={`agent-auth-api-key-${method.id}`}>
                      {t("authDialog.apiKeyLabel")}
                    </label>
                    <Input
                      id={`agent-auth-api-key-${method.id}`}
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      disabled={busy}
                      placeholder={t("authDialog.apiKeyPlaceholder")}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      loading={rowWorking}
                      disabled={!apiKey.trim() || (busy && !rowWorking)}
                      onClick={() => {
                        void finishAuth(method.id, apiKey.trim());
                      }}
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => clearAuthRequest()}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MethodStatus({
  working,
  authenticated,
  authenticatedLabel,
}: {
  working: boolean;
  authenticated: boolean;
  authenticatedLabel: string;
}) {
  if (working) {
    return <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />;
  }
  if (authenticated) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
        <Check className="size-3.5" aria-hidden="true" />
        {authenticatedLabel}
      </span>
    );
  }
  return null;
}
