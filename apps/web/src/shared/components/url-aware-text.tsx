"use client";

import React, {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  type ReactNode,
} from "react";
import {
  isCompletePreviewUrl,
  splitTextWithHttpUrls,
  splitTextWithUrlTokens,
} from "@/shared/lib/link-preview";
import {
  ConversationHttpUrl,
  HttpTextLink,
} from "@/shared/components/link-preview-chip";

export function UrlAwareText({
  text,
  chipCompleteUrls = false,
}: {
  text: string;
  chipCompleteUrls?: boolean;
}) {
  if (chipCompleteUrls) {
    return <AgentUrlText text={text} />;
  }
  return <UserUrlText text={text} />;
}

function UserUrlText({ text }: { text: string }) {
  const tokenSegments = splitTextWithUrlTokens(text);
  const hasChip = tokenSegments.some((segment) => segment.type === "url-chip");
  if (!hasChip) {
    return <PlainOrLinkedText text={text} />;
  }
  return (
    <>
      {tokenSegments.map((segment, index) =>
        segment.type === "url-chip" ? (
          <ConversationHttpUrl key={`chip-${index}`} href={segment.url} />
        ) : (
          <PlainOrLinkedText key={`text-${index}`} text={segment.value} />
        ),
      )}
    </>
  );
}

function AgentUrlText({ text }: { text: string }) {
  const segments = splitTextWithHttpUrls(text);
  if (segments.length === 1 && segments[0]?.type === "text") {
    return segments[0].value;
  }
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "url" && isCompletePreviewUrl(segment.url) ? (
          <ConversationHttpUrl key={`url-${index}`} href={segment.url} />
        ) : segment.type === "url" ? (
          <HttpTextLink key={`url-${index}`} href={segment.url}>
            {segment.url}
          </HttpTextLink>
        ) : (
          <React.Fragment key={`text-${index}`}>{segment.value}</React.Fragment>
        ),
      )}
    </>
  );
}

function PlainOrLinkedText({ text }: { text: string }) {
  const segments = splitTextWithHttpUrls(text);
  if (segments.length === 1 && segments[0]?.type === "text") {
    return segments[0].value;
  }
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "url" ? (
          <HttpTextLink key={`url-${index}`} href={segment.url}>
            {segment.url}
          </HttpTextLink>
        ) : (
          <React.Fragment key={`text-${index}`}>{segment.value}</React.Fragment>
        ),
      )}
    </>
  );
}

const SKIP_LINKIFY_TAGS = new Set(["a", "code", "pre", "kbd", "samp"]);

export function linkifyReactChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return <UrlAwareText text={child} chipCompleteUrls />;
    }
    if (!isValidElement(child)) return child;
    if (child.type === HttpTextLink || child.type === ConversationHttpUrl) return child;
    const tag = typeof child.type === "string" ? child.type : null;
    if (tag && SKIP_LINKIFY_TAGS.has(tag)) return child;
    const nested = (child.props as { children?: ReactNode }).children;
    if (nested == null) return child;
    return cloneElement(child, undefined, linkifyReactChildren(nested));
  });
}

const LINKIFY_TAGS = [
  "p",
  "li",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
] as const;

type MarkdownTagProps = {
  children?: ReactNode;
  node?: unknown;
} & Record<string, unknown>;

export function withLinkifiedMarkdownComponents<T extends Record<string, unknown>>(
  base: T,
): T {
  const next: Record<string, unknown> = { ...base };
  for (const tag of LINKIFY_TAGS) {
    const Inner = (next[tag] as React.ElementType | undefined) ?? tag;
    next[tag] = function LinkifiedMarkdownTag({
      children,
      node: _node,
      ...rest
    }: MarkdownTagProps) {
      return createElement(Inner, rest, linkifyReactChildren(children));
    };
  }
  return next as T;
}
