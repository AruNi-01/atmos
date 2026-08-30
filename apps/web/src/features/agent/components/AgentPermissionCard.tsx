"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
  ShineBorder,
} from "@workspace/ui";
import { ShieldCheck } from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import type { PendingPermission } from "@/features/agent/lib/chat-helpers";
import {
  permissionDescriptionToRender,
  permissionMarkdownToRender,
  permissionOptionVariant,
  resolvePermissionCommand,
} from "@/features/agent/lib/agent-permission-content";
import { AgentCommandLine } from "./AgentCommandLine";
import { PermissionActionButton } from "./MessageQueueDock";

export function AgentPermissionCard({
  permission,
  markdown,
  onRespond,
}: {
  permission: PendingPermission;
  markdown: string | null;
  onRespond: (optionId: string) => void;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const command = useMemo(
    () =>
      resolvePermissionCommand({
        tool: permission.tool,
        description: permission.description,
        contentMarkdown: markdown,
      }),
    [markdown, permission.description, permission.tool],
  );
  const description = permissionDescriptionToRender(permission.description, command);
  const extraMarkdown = permissionMarkdownToRender(markdown, command);

  return (
    <Confirmation
      approval={{ id: permission.request_id }}
      state="approval-requested"
      data-agent-chat-permission=""
      className="relative min-w-0 max-h-[40vh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border-foreground/20 bg-background"
    >
      <ShineBorder
        duration={7}
        borderWidth={1}
        shineColor={["#d97706", "#b45309"]}
      />
      <ConfirmationRequest>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="font-medium text-amber-500">{t("permissionRequested")}</span>
        </div>
        {description ? (
          <p className="max-w-full text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {command ? (
          <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-muted/20">
            <AgentCommandLine command={command} className="px-3 py-2.5" />
          </div>
        ) : null}
        {extraMarkdown ? (
          <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-muted/20">
            <div className="min-w-0 max-w-full overflow-auto px-3 py-1.5 text-sm">
              <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
                {extraMarkdown}
              </MarkdownRenderer>
            </div>
          </div>
        ) : null}
      </ConfirmationRequest>
      <ConfirmationActions className="mt-1 w-full min-w-0 flex-nowrap justify-start self-stretch overflow-hidden">
        {permission.options.length > 0 ? (
          permission.options.map((opt) => (
            <PermissionActionButton
              key={opt.option_id}
              label={opt.name}
              variant={permissionOptionVariant(opt.kind)}
              onClick={() => onRespond(opt.option_id)}
            />
          ))
        ) : (
          <>
            <PermissionActionButton
              label={t("allow")}
              variant="default"
              onClick={() => onRespond("allow_once")}
            />
            <PermissionActionButton
              label={t("deny")}
              variant="ghost"
              onClick={() => onRespond("reject_once")}
            />
          </>
        )}
      </ConfirmationActions>
    </Confirmation>
  );
}
