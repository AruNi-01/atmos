"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { isTokenAuthMethodId } from "@/features/agent/lib/custom-agent-registry";

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
  startSession: (opts?: { authMethodId?: string; apiKey?: string }) => void | Promise<void>;
  isConnecting: boolean;
}

export function AgentAuthDialog({
  authRequest,
  clearAuthRequest,
  selectedAuthMethodId,
  setSelectedAuthMethodId,
  startSession,
  isConnecting,
}: AgentAuthDialogProps) {
  const t = useTranslations("Agent.components");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const methods = authRequest?.methods ?? [];
  const selected = useMemo(
    () => methods.find((method) => method.id === selectedAuthMethodId) ?? methods[0],
    [methods, selectedAuthMethodId],
  );
  const needsToken = Boolean(selected && isTokenAuthMethodId(selected.id));

  useEffect(() => {
    if (!authRequest) {
      setApiKey("");
      return;
    }
    if (!selectedAuthMethodId && methods[0]) {
      setSelectedAuthMethodId(methods[0].id);
    }
  }, [authRequest, methods, selectedAuthMethodId, setSelectedAuthMethodId]);

  const canContinue =
    Boolean(selected) && (!needsToken || apiKey.trim()) && !isConnecting && !saving;

  return (
    <Dialog open={!!authRequest} onOpenChange={(open) => !open && clearAuthRequest()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("authDialog.title")}</DialogTitle>
          <DialogDescription>
            {authRequest?.message || t("authDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {methods.length > 1 ? (
          <div className="space-y-2">
            {methods.map((method) => {
              const checked = selected?.id === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedAuthMethodId(method.id)}
                  className={`w-full rounded-md border p-3 text-left ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <p className="text-sm font-medium">{method.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{method.description || method.id}</p>
                </button>
              );
            })}
          </div>
        ) : null}
        {needsToken ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="agent-auth-api-key">
              {t("authDialog.apiKeyLabel")}
            </label>
            <Input
              id="agent-auth-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={t("authDialog.apiKeyPlaceholder")}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => clearAuthRequest()}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (!selected || !canContinue) return;
              const methodId = selected.id;
              const token = apiKey.trim();
              void (async () => {
                setSaving(true);
                try {
                  await startSession({
                    authMethodId: methodId,
                    ...(needsToken ? { apiKey: token } : {}),
                  });
                  clearAuthRequest();
                } catch {
                  // Keep the dialog open so the token can be retried.
                } finally {
                  setSaving(false);
                }
              })();
            }}
            disabled={!canContinue}
          >
            {needsToken ? t("authDialog.saveAndContinue") : t("common.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
