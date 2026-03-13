"use client";

import React from "react";
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
  return (
    <Dialog open={!!authRequest} onOpenChange={(open) => !open && clearAuthRequest()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agent authentication required</DialogTitle>
          <DialogDescription>
            {authRequest?.message || "This agent requires authentication before creating a session."}
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
                className={`w-full rounded-md border p-3 text-left transition-colors ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
              >
                <p className="text-sm font-medium">{method.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{method.description || method.id}</p>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => clearAuthRequest()}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!selectedAuthMethodId) return;
              clearAuthRequest();
              void startSession({ authMethodId: selectedAuthMethodId });
            }}
            disabled={!selectedAuthMethodId || isConnecting}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
