// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { COMPOSER_DOCK_COMPACT_HEIGHT } from "./composer-dock";
import { COMPOSER_GLASS_CONTROL_SIZE } from "./composer-glass";
import { PILL_SCROLL_FADE_PX } from "./edge-fade-stops";

const here = dirname(fileURLToPath(import.meta.url));

function source(relative: string): string {
  return readFileSync(join(here, relative), "utf8");
}

describe("composer card chrome alignment", () => {
  test("chip, pill, and compact composer keep three distinct heights", () => {
    const chips = source("../../ui/primitives/glass-action-buttons.tsx");
    expect(chips).toContain("export const GLASS_CHIP_HEIGHT = 33");
    expect(chips).not.toContain("GLASS_CHIP_HOST_INSET");
    expect(chips).not.toContain("marginBottom: -");
    expect(chips).not.toContain("marginTop: -");
    expect(COMPOSER_GLASS_CONTROL_SIZE).toBe(36);
    expect(COMPOSER_DOCK_COMPACT_HEIGHT).toBe(52);
  });

  test("shared header/body/gap tokens match the web dock type scale", () => {
    const expanded = source("cards/expanded-card.tsx");
    expect(expanded).toContain("export const CARD_GAP = 8");
    expect(expanded).toContain("export const CARD_CHIP_GAP = 8");
    expect(expanded).toContain('fontSize: 14, fontWeight: "500" as const, lineHeight: 20');
    expect(expanded).toContain("fontSize: 14, lineHeight: 20");
    expect(expanded).toContain('fontFamily: "Menlo", fontSize: 13, lineHeight: 18');
    expect(expanded).toContain("fontSize: 11, lineHeight: 14");
    expect(expanded).toContain('export const SESSION_OP_SKY = "#0ea5e9"');
    expect(expanded).toContain("export const CARD_PAD_VERTICAL = 14");
  });

  test("pill row uses one 18pt content inset and does not pad the row twice", () => {
    const pills = source("composer-pill-row.tsx");
    expect(pills).toContain("paddingHorizontal: 18");
    expect(pills).toContain("scrollerContentWithScroll");
    expect(pills).toContain("paddingLeft: PILL_SCROLL_FADE_PX");
    expect(pills).toContain("PILL_SCROLL_FADE_PX");
    expect(pills).not.toMatch(/row:\s*\{[^}]*paddingHorizontal:\s*18/s);
    expect(PILL_SCROLL_FADE_PX).toBe(18);
  });

  test("expanded card keeps the passing 18pt margin and 14pt body pad", () => {
    const expanded = source("cards/expanded-card.tsx");
    expect(expanded).toContain("marginHorizontal: 18");
    expect(expanded).toContain("paddingHorizontal: CARD_PAD_HORIZONTAL");
    expect(expanded).toContain("paddingVertical: CARD_PAD_VERTICAL");
    expect(expanded).toContain("export const CARD_PAD_HORIZONTAL = 14");
    expect(expanded).toContain("export function CardHeader");
    expect(expanded).toContain("columnGap: CARD_CHIP_GAP");
    expect(expanded).toContain("rowGap: CARD_CHIP_GAP");
    expect(expanded).toContain('flexWrap: "wrap"');
    expect(expanded).toContain('justifyContent: "flex-end"');
    expect(expanded).not.toContain("numberOfLines={1}");
    expect(expanded).toContain('alignItems: "baseline"');
    expect(expanded).toContain("includeFontPadding: false");
  });

  test("every dock card uses CardHeader or the session-op sky row", () => {
    expect(source("AgentChatPermissionCard.tsx")).toContain("<CardHeader");
    expect(source("cards/plan-card.tsx")).toContain("<CardHeader");
    expect(source("cards/queue-card.tsx")).toContain("<CardHeader");
    expect(source("cards/background-card.tsx")).toContain("<CardHeader");
    expect(source("cards/subagent-card.tsx")).toContain("<CardHeader");
    expect(source("cards/goal-card.tsx")).toContain("<CardHeader");
    expect(source("cards/workflow-card.tsx")).toContain("<CardHeader");
    expect(source("cards/context-card.tsx")).toContain("<CardHeader");
    const sessionOp = source("AgentChatSessionOpCard.tsx");
    expect(sessionOp).toContain("SESSION_OP_SKY");
    expect(sessionOp).toContain("GitForkIcon");
    expect(sessionOp).toContain("copy.sessionOpRequested");
    expect(sessionOp).not.toContain("<CardHeader");
  });

  test("plan markdown overrides headings; background commands wrap in mono", () => {
    expect(source("cards/plan-card.tsx")).toContain('variant="card"');
    expect(source("AgentChatPermissionCard.tsx")).toContain('variant="card"');
    const background = source("cards/background-card.tsx");
    expect(background).toContain("CARD_MONO");
    expect(background).not.toContain("numberOfLines={1}");
    expect(background).toContain("PromptTerminalIcon");
    expect(background).toContain("copy.backgroundRunning");
    expect(background).toContain("CARD_META");
    expect(source("cards/context-card.tsx")).toContain("contextBarTone");
    expect(source("cards/subagent-card.tsx")).not.toContain("numberOfLines={1}");
    expect(source("cards/subagent-card.tsx")).toContain("SubagentStatusIcon");
    expect(source("cards/subagent-card.tsx")).toContain("rowLast");
    expect(source("cards/subagent-card.tsx")).toContain("paddingBottom: 0");
    expect(source("cards/goal-card.tsx")).toContain("CardStatusRow");
    expect(source("cards/goal-card.tsx")).toContain("CardBulletRow");
    expect(source("cards/workflow-card.tsx")).toContain("CardStatusRow");
    expect(source("cards/queue-card.tsx")).toContain("<ChipRow");
    const permission = source("AgentChatPermissionCard.tsx");
    expect(permission).toContain('justify="end"');
    expect(permission).toContain("permissionOptionTone");
    expect(permission).toContain("historicPermissionTitle");
  });
});
