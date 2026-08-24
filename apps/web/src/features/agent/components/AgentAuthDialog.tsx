"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from "@workspace/ui";

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
  startSession: (opts?: { authMethodId?: string }) => void;
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
  return (
    <Dialog open={!!authRequest} onOpenChange={(open) => !open && clearAuthRequest()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("authDialog.title")}</DialogTitle>
          <DialogDescription>
            {authRequest?.message || t("authDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {authRequest?.methods.map((method) => {
            const checked = selectedAuthMethodId === method.id;
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
        <DialogFooter>
          <Button variant="outline" onClick={() => clearAuthRequest()}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (!selectedAuthMethodId) return;
              clearAuthRequest();
              void startSession({ authMethodId: selectedAuthMethodId });
            }}
            disabled={!selectedAuthMethodId || isConnecting}
          >
            {t("common.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
