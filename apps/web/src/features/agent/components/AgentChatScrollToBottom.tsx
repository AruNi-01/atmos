"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import {
  ConversationScrollButton,
  SlidingNumber,
  TextMorph,
} from "@workspace/ui";
import type { MessagesBelowCountStore } from "../lib/agent-chat-below-count";

export function AgentChatScrollToBottomButton({
  host,
  belowCountStore,
}: {
  host?: HTMLElement | null;
  belowCountStore: MessagesBelowCountStore;
}) {
  const t = useTranslations("Agent.components.chatPanel");
  const count = useSyncExternalStore(
    belowCountStore.subscribe,
    belowCountStore.getSnapshot,
    belowCountStore.getSnapshot,
  );
  const showCopy = count > 0;

  return (
    <ConversationScrollButton
      aria-label={showCopy ? t("scrollBelow.aria", { count }) : t("bottom")}
      host={host}
    >
      <ChevronDown className="size-4" />
      {showCopy ? <AgentChatScrollBelowCopy count={count} /> : null}
    </ConversationScrollButton>
  );
}

function AgentChatScrollBelowCopy({ count }: { count: number }) {
  const t = useTranslations("Agent.components.chatPanel.scrollBelow");
  const prefix = t("prefix");
  const unit = t("unit", { count });
  const suffix = t("suffix");

  return (
    <span
      data-agent-chat-scroll-below=""
      aria-hidden="true"
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium tabular-nums leading-none"
    >
      {prefix ? <span>{prefix}</span> : null}
      <SlidingNumber value={count} />
      {unit ? (
        <TextMorph as="span" className="inline-flex">
          {unit}
        </TextMorph>
      ) : null}
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}
