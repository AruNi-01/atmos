// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "../../../../..");

describe("copy message button", () => {
  test("matches the web Lucide copy glyph and 1200ms check", () => {
    const web = readFileSync(
      join(workspace, "apps/web/src/features/agent/components/CopyButtons.tsx"),
      "utf8",
    );
    const message = readFileSync(
      join(workspace, "apps/web/src/features/agent/components/AgentChatMessageView.tsx"),
      "utf8",
    );
    const button = readFileSync(join(here, "copy-message-button.tsx"), "utf8");
    expect(web).toContain('className="size-3.5"');
    expect(web).toContain("setTimeout(() => setCopied(false), 1200)");
    expect(message).toContain("inline-flex size-6 items-center justify-center");
    expect(button).toContain("export const COPY_MESSAGE_ICON_SIZE = 14");
    expect(button).toContain("export const COPY_MESSAGE_HIT = 24");
    expect(button).toContain("export const COPY_MESSAGE_COPIED_MS = 1200");
  });

  test("the footer and the user meta row use the shared icon button", () => {
    const button = readFileSync(join(here, "copy-message-button.tsx"), "utf8");
    const footer = readFileSync(join(here, "assistant-footer.tsx"), "utf8");
    const user = readFileSync(join(here, "user-message.tsx"), "utf8");
    const icons = readFileSync(join(here, "../../ui/icons/lucide-native.ts"), "utf8");
    expect(button).toContain("CopyIcon");
    expect(button).toContain("CheckIcon");
    expect(button).toContain("COPY_MESSAGE_ICON_SIZE");
    expect(footer).toContain("CopyMessageButton");
    expect(footer).toContain('from "./copy-message-button"');
    expect(footer).not.toContain("function CopyMessageButton");
    expect(user).toContain("CopyMessageButton");
    expect(user).toContain('from "./copy-message-button"');
    expect(user).not.toContain("function CopyMessageButton");
    expect(icons).toContain("export const CopyIcon = Copy");
  });
});
