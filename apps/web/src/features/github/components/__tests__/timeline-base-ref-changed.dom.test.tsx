// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { enUS } from "date-fns/locale";
import enMessages from "../../../../../messages/en.json";
import zhMessages from "../../../../../messages/zh.json";
import { mapTimelineEvent } from "@/features/github/lib/timeline-event-map";

mock.module("@/features/github/components/GithubUserHoverCard", () => ({
  GithubUserAvatar: ({ label }: { label?: string }) => <span>{label}</span>,
}));

mock.module("@/features/github/hooks/use-open-github-center-tab", () => ({
  useOpenGithubCenterTab: () => ({
    openPullRequestTab: () => {},
    openIssueTab: () => {},
  }),
}));

const { TimelineActivityEvent } = await import("../TimelineActivityEvent");

const FROM = "aarynlu/mobile-terminal-main-path-7d6c";
const TO = "main";

function renderEvent(locale: "en" | "zh", withNames: boolean): HTMLElement {
  const mapped = mapTimelineEvent(
    {
      event: "base_ref_changed",
      ...(withNames ? { base_ref_change: { from: FROM, to: TO } } : {}),
    },
    { owner: "AruNi-01", repo: "atmos" },
  );
  const messages = locale === "zh" ? zhMessages : enMessages;
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <TimelineActivityEvent
        mapped={mapped}
        actorLogin="AruNi-01"
        locale={enUS}
        createdAt="2026-09-29T03:29:01Z"
      />
    </NextIntlClientProvider>,
  );
  const doc = new Window({ url: "https://app.atmos.local/workspace" }).document;
  doc.body.innerHTML = html;
  return doc.body as unknown as HTMLElement;
}

describe("base branch change timeline row", () => {
  it("shows the previous and current branch the way GitHub does", () => {
    const body = renderEvent("en", true);
    const text = body.textContent ?? "";
    expect(text).toContain("changed the base branch from");
    expect(text).toContain(FROM);
    expect(text).toContain("to");
    expect(text).toContain(TO);
    expect(text).not.toContain("changed the base branch to");
    const chips = [...body.querySelectorAll("span[title]")].map((node) =>
      node.getAttribute("title"),
    );
    expect(chips).toEqual([FROM, TO]);
    expect(body.querySelector("svg path")?.getAttribute("d") ?? "").toContain(
      "M9.5 3.25",
    );
  });

  it("uses the short sentence when the branch names are missing", () => {
    const text = renderEvent("en", false).textContent ?? "";
    expect(text).toContain("changed the base branch");
    expect(text).not.toContain(FROM);
  });

  it("renders the Chinese from/to sentence", () => {
    const text = renderEvent("zh", true).textContent ?? "";
    expect(text).toContain("将基准分支从");
    expect(text).toContain(FROM);
    expect(text).toContain("改为");
    expect(text).toContain(TO);
  });
});
