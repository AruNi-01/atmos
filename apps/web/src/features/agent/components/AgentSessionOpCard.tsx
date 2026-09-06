"use client";

import { useTranslations } from "next-intl";
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationRequest,
  ShineBorder,
} from "@workspace/ui";
import { GitFork, RotateCcw } from "lucide-react";
import type { PendingSessionOp } from "@/features/agent/lib/chat-helpers";
import { PermissionActionButton } from "./MessageQueueDock";

function sessionOpOptionVariant(kind: string): "default" | "ghost" {
  const normalized = kind.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized.includes("cancel")
    || normalized.includes("reject")
    || normalized.includes("deny")
  ) {
    return "ghost";
  }
  return "default";
}

export function AgentSessionOpCard({
  request,
  onRespond,
}: {
  request: PendingSessionOp;
  onRespond: (optionId: string) => void;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const Icon = request.kind === "fork" ? GitFork : RotateCcw;
  const heading = request.title.trim()
    || t(request.kind === "fork" ? "sessionOpFork" : "sessionOpRewind");

  return (
    <Confirmation
      approval={{ id: request.request_id }}
      state="approval-requested"
      data-agent-chat-session-op=""
      className="relative min-w-0 max-h-[40vh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border-foreground/20 bg-background"
    >
      <ShineBorder
        duration={7}
        borderWidth={1}
        shineColor={["#0284c7", "#0369a1"]}
      />
      <ConfirmationRequest>
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-sky-500" aria-hidden="true" />
          <span className="font-medium text-sky-500">{t("sessionOpRequested")}</span>
        </div>
        {heading ? (
          <p className="max-w-full text-sm text-muted-foreground">{heading}</p>
        ) : null}
      </ConfirmationRequest>
      <ConfirmationActions className="mt-1 w-full min-w-0 flex-nowrap justify-start self-stretch overflow-hidden">
        {request.options.map((opt) => (
          <PermissionActionButton
            key={opt.option_id}
            label={opt.name}
            variant={sessionOpOptionVariant(opt.kind ?? opt.option_id)}
            onClick={() => onRespond(opt.option_id)}
          />
        ))}
      </ConfirmationActions>
    </Confirmation>
  );
}
