# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/APP-067_atmos-agent-chat.e2e.ts >> APP-067 Atmos Agent Chat >> S1 plus menu New Agent Chat opens a center-stage tab next to New Terminal
- Location: tests/specs/APP-067_atmos-agent-chat.e2e.ts:11:3

# Error details

```
Error: locator.hover: Element is not visible
Call log:
  - waiting for locator('main [data-center-stage-plus-trigger]').filter({ visible: true }).first()
    - locator resolved to <button type="button" data-state="closed" aria-label="New tab" aria-haspopup="menu" aria-expanded="false" data-slot="popover-trigger" data-center-stage-plus-trigger="" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-active hover:text-foreground data-[state=open]:bg-active data-[state=open]:text-foreground">…</button>
  - attempting hover action
    - scrolling into view if needed
    - done scrolling

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e7]:
    - banner [ref=f1e8]:
      - generic [ref=f1e9]:
        - generic [ref=f1e10]:
          - button "Collapse left sidebar" [ref=f1e11]
          - button "Go back" [ref=f1e14]
          - button "Go forward" [ref=f1e17]
          - button "Refresh page" [ref=f1e20]
        - generic [ref=f1e24]:
          - button "Needs attention" [ref=f1e28]:
            - status [ref=f1e29]: Notifications, 1 unread
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic: "8"
                    - generic: "9"
                    - generic: "0"
                    - generic: "1"
                    - generic: "2"
                    - generic: "3"
                    - generic: "4"
          - generic [ref=f1e34]:
            - button "Open" [ref=f1e35]
            - button [ref=f1e37]
      - generic [ref=f1e40]:
        - generic [ref=f1e41]:
          - status "Remote branch is in sync with origin/main" [ref=f1e42]
          - generic [ref=f1e48]: main
        - button "origin/ main" [ref=f1e53] [cursor=pointer]:
          - generic [ref=f1e54]: origin/
          - generic [ref=f1e55]: main
      - generic [ref=f1e58]:
        - button "Search" [ref=f1e59] [cursor=pointer]:
          - generic [ref=f1e63]: Search...
          - generic: K
        - button "Open workspace summary" [ref=f1e64]
        - button "Usage" [ref=f1e68]
    - generic [ref=f1e73]:
      - complementary [ref=f1e76]:
        - generic [ref=f1e77]:
          - generic [ref=f1e78]:
            - button "Launchpad" [ref=f1e79] [cursor=pointer]
            - generic [ref=f1e88]:
              - button "Workspaces" [ref=f1e90]
              - button "Terminals" [ref=f1e96]
              - button "Agent Chat" [ref=f1e101]
              - button "Disk Analyzer" [ref=f1e107]
              - button "Token Usage" [ref=f1e112]
              - button "Agent Observer" [ref=f1e119]
              - button "Canvas" [ref=f1e129]
              - button "Prototype Design" [ref=f1e138]
              - button "Task" [ref=f1e150]
              - button "Agent Sessions" [ref=f1e156]
          - navigation "Launchpad" [ref=f1e163]:
            - button "Skills" [ref=f1e165]
            - button "Automations" [ref=f1e171]
            - button "New Workspace" [ref=f1e178]
          - generic: Move here to hide this feature
        - generic [ref=f1e185]:
          - generic [ref=f1e187]:
            - generic [ref=f1e189]:
              - button "Atmos E2E" [ref=f1e190] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - generic [ref=f1e197]:
              - button "m0w2xa" [ref=f1e199] [cursor=pointer]
              - button "APP-043 Warm B mvtogl0u" [ref=f1e209] [cursor=pointer]
              - button "cloyster" [ref=f1e219] [cursor=pointer]
          - generic [ref=f1e229]:
            - generic [ref=f1e231]:
              - button "Atmos E2E" [ref=f1e232] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - button "tentacruel" [ref=f1e241] [cursor=pointer]
        - generic [ref=f1e251]:
          - button "Add Project" [ref=f1e253]
          - generic [ref=f1e257]:
            - button [ref=f1e258]
            - button "Open settings" [ref=f1e261]
      - separator [ref=f1e266]
      - generic [ref=f1e268]:
        - main [ref=f1e272]:
          - generic [ref=f1e273]:
            - generic [ref=f1e280]:
              - tablist [ref=f1e282]:
                - button "New tab" [ref=f1e285]
              - button "Open tab groups" [ref=f1e289]
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - generic: main
                                - button:
                                  - generic: .../work/atmos/atmos
                            - heading [level=1]: Atmos E2E
                        - button:
                          - generic: Refresh
                      - generic:
                        - generic:
                          - generic:
                            - generic: Tasks
                            - generic: 0/0
                          - generic:
                            - generic:
                              - textbox:
                                - /placeholder: What needs to be done? (Double-click task to edit)
                              - button [disabled]
                            - generic: No tasks added yet.
                        - generic:
                          - generic: Details
                          - generic:
                            - generic:
                              - heading [level=3]: Code reviews
                              - generic:
                                - generic:
                                  - heading [level=3]: No code reviews yet
                                  - paragraph: Reports will appear here after reviews.
                            - generic:
                              - heading [level=3]: Pull requests
                            - generic:
                              - generic:
                                - heading [level=3]: Actions
                              - generic: No workflow runs detected
                      - generic:
                        - generic:
                          - generic:
                            - generic: Requirement specification
                            - button: Edit
                          - generic:
                            - generic:
                              - heading [level=3]: No requirement yet
                              - paragraph: Add a requirement document for this workspace.
                              - button: Add Requirement
                        - generic:
                          - generic:
                            - generic:
                              - generic: Note
                              - button: Edit
                            - generic:
                              - generic:
                                - heading [level=3]: No note yet
                                - paragraph: Add notes for this workspace.
                                - button: Add Note
                  - generic [ref=f1e292]:
                    - separator [ref=f1e293]
                    - generic [ref=f1e296]:
                      - generic [ref=f1e297]:
                        - generic [ref=f1e298]: Atmos E2E
                        - button "Locate current file" [disabled]
                      - generic [ref=f1e299]:
                        - button "Show hidden files" [ref=f1e300]
                        - button "Refresh files" [disabled] [ref=f1e306]
        - contentinfo [ref=f1e314]:
          - generic [ref=f1e315]:
            - 'button "Resource Monitor: CPU 96% · Memory 19%" [ref=f1e316]':
              - generic [ref=f1e319]: Monitor
            - button "Local 0" [ref=f1e322]
          - generic [ref=f1e327]:
            - button [ref=f1e328] [cursor=pointer]:
              - generic "1 Need attention" [ref=f1e330]: "1"
            - button "Open Chat" [ref=f1e337]:
              - generic [ref=f1e341]: Chat
  - alert [ref=f1e342]
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
```

# Test source

```ts
  1   | import { expect, test } from "../../fixtures/test";
  2   | import {
  3   |   buildProjectWorkspaceDeepLink,
  4   |   connectLocalComputer,
  5   |   getCenterStage,
  6   |   gotoContextRoute,
  7   |   withSearchParams,
  8   | } from "../smoke/support/app-smoke";
  9   | 
  10  | test.describe("APP-067 Atmos Agent Chat", () => {
  11  |   test("S1 plus menu New Agent Chat opens a center-stage tab next to New Terminal", async ({
  12  |     page,
  13  |   }) => {
  14  |     test.setTimeout(90_000);
  15  |     await connectLocalComputer(page);
  16  |     const contextUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page), {
  17  |       activeSettingTab: null,
  18  |       tab: null,
  19  |     });
  20  |     await gotoContextRoute(page, contextUrl);
  21  | 
  22  |     const plusMenu = page.locator("[data-center-stage-plus-menu]");
  23  |     // Hover-open is the product path. Native click misses mouseenter, and
  24  |     // layout disk-sync can remount the plus control after the first attempt.
  25  |     await expect
  26  |       .poll(
  27  |         async () => {
  28  |           const plusTrigger = page
  29  |             .locator("main [data-center-stage-plus-trigger]")
  30  |             .filter({ visible: true })
  31  |             .first();
  32  |           if (!(await plusTrigger.isVisible().catch(() => false))) return false;
> 33  |           await plusTrigger.hover({ force: true });
      |                             ^ Error: locator.hover: Element is not visible
  34  |           return plusMenu.isVisible();
  35  |         },
  36  |         { timeout: 15_000 },
  37  |       )
  38  |       .toBe(true);
  39  | 
  40  |     const newAgentChat = plusMenu.locator("#create-agent-chat");
  41  |     const newTerminal = plusMenu.locator("#create-terminal");
  42  |     await expect(newAgentChat).toBeVisible({ timeout: 15_000 });
  43  |     await expect(newTerminal).toBeVisible();
  44  |     const agentBox = await newAgentChat.boundingBox();
  45  |     const terminalBox = await newTerminal.boundingBox();
  46  |     expect(agentBox && terminalBox).toBeTruthy();
  47  |     if (agentBox && terminalBox) {
  48  |       expect(agentBox.y).toBeGreaterThanOrEqual(terminalBox.y - 4);
  49  |     }
  50  | 
  51  |     await newAgentChat.click();
  52  |     const stage = await getCenterStage(page);
  53  |     await expect(stage.locator("[data-agent-chat-tab]").first()).toBeVisible({
  54  |       timeout: 20_000,
  55  |     });
  56  |     await expect(stage.locator("[data-agent-chat-workspace]").first()).toBeVisible();
  57  |   });
  58  | 
  59  |   test("S16 standalone /agent-chat?chatId= shares the chat", async ({ page }) => {
  60  |     test.setTimeout(90_000);
  61  |     await connectLocalComputer(page);
  62  |     await page.goto("/agent-chat");
  63  |     await expect(page.locator("[data-agent-chat-workspace]").first()).toBeVisible({
  64  |       timeout: 30_000,
  65  |     });
  66  |     const composerRoot = page.locator("[data-agent-chat-composer]").first();
  67  |     await expect(composerRoot).toBeVisible({ timeout: 15_000 });
  68  |     const cwdTrigger = composerRoot.getByRole("button", { name: "Working directory" });
  69  |     if (await cwdTrigger.isVisible().catch(() => false)) {
  70  |       await cwdTrigger.click();
  71  |       const projectItem = page.getByRole("menuitem").nth(1);
  72  |       if (await projectItem.isVisible().catch(() => false)) {
  73  |         await projectItem.click();
  74  |       } else {
  75  |         await page.keyboard.press("Escape");
  76  |       }
  77  |     }
  78  |     const composer = composerRoot.locator("[data-prompt-composer-editor]").first();
  79  |     await expect(composer).toBeVisible({ timeout: 15_000 });
  80  |     await expect(composer).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
  81  |     await expect(composer).toBeEnabled();
  82  | 
  83  |     const marker = `s16-fanout-${Date.now()}`;
  84  |     await composer.click();
  85  |     await composer.fill(marker);
  86  |     await composer.press("Enter");
  87  |     await expect(page.locator("[data-agent-chat-message]").getByText(marker)).toBeVisible({
  88  |       timeout: 30_000,
  89  |     });
  90  | 
  91  |     await expect
  92  |       .poll(
  93  |         async () => {
  94  |           const id = await page
  95  |             .locator("[data-agent-chat-workspace]")
  96  |             .first()
  97  |             .getAttribute("data-agent-chat-workspace");
  98  |           return Boolean(id && id !== "draft");
  99  |         },
  100 |         { timeout: 30_000 },
  101 |       )
  102 |       .toBe(true);
  103 |     const chatId = await page
  104 |       .locator("[data-agent-chat-workspace]")
  105 |       .first()
  106 |       .getAttribute("data-agent-chat-workspace");
  107 |     expect(chatId && chatId !== "draft").toBeTruthy();
  108 | 
  109 |     const page2 = await page.context().newPage();
  110 |     await page2.goto(`/agent-chat?chatId=${chatId}`);
  111 |     await expect(page2.locator(`[data-agent-chat-workspace="${chatId}"]`)).toBeVisible({
  112 |       timeout: 20_000,
  113 |     });
  114 |     await expect(page2.locator("[data-agent-chat-message]").getByText(marker)).toBeVisible({
  115 |       timeout: 20_000,
  116 |     });
  117 |     await page2.close();
  118 |   });
  119 | });
  120 | 
```