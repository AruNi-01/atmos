"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@workspace/ui";

export function GroupNamePopoverForm({
  mode,
  initialName = "",
  onSubmit,
  onCancel,
}: {
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => Promise<unknown> | void;
  onCancel: () => void;
}) {
  const t = useTranslations("appShell.groups");
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch {
      setError(mode === "create" ? t("createFailed") : t("renameFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      data-testid="group-name-popover"
    >
      <div className="text-xs font-medium text-foreground">
        {mode === "create" ? t("create") : t("rename")}
      </div>
      <Input
        autoFocus
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(null);
        }}
        placeholder={t("createPlaceholder")}
        className="h-8 text-sm"
        data-testid="group-name-input"
        aria-invalid={error ? true : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {error ? (
        <p className="text-xs text-destructive" data-testid="group-name-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={onCancel}
          disabled={busy}
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          disabled={busy || !name.trim()}
          data-testid="group-name-submit"
        >
          {mode === "create" ? t("create") : t("rename")}
        </button>
      </div>
    </form>
  );
}
