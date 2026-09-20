import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("onboarding Agent Chat setup is non-blocking", () => {
  it("does not replace Save and continue with the provisioning label", () => {
    const actions = readFileSync(
      join(root, "OnboardingStepActions.tsx"),
      "utf8",
    );
    expect(actions).toContain("{t('agents.next')}");
    expect(actions).not.toContain("t('agents.provisioning')");
  });

  it("fires Chat setup without awaiting it on continue", () => {
    const page = readFileSync(join(root, "OnboardingPage.tsx"), "utf8");
    expect(page).toContain("void startOnboardingChatSetup(");
    expect(page).not.toContain("await startOnboardingChatSetup(");
    expect(page).not.toContain("await enableChatForOnboardingAgents(");
  });
});
