# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/app-shell/app-shell-preferences-menu.e2e.ts >> smoke app shell preferences menu >> @smoke @stateful exercises theme and language controls from Appearance settings
- Location: tests/smoke/app-shell/app-shell-preferences-menu.e2e.ts:9:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /^(Appearance|外观)$/ }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: /^(Appearance|外观)$/ }).first()

```

```yaml
- alert
- region "Notifications"
- region "Notifications"
- region "Notifications"
- button "Close settings": Back
- textbox "Search settings":
  - /placeholder: Search settings...
- button "Clear search"
- text: You
- list:
  - listitem:
    - button "General":
      - img
      - text: General
  - listitem:
    - button "Account":
      - img
      - text: Account
- text: Workspace
- list:
  - listitem:
    - button "Interface":
      - img
      - text: Interface
  - listitem:
    - button "Editor":
      - img
      - text: Editor
  - listitem:
    - button "Terminal":
      - img
      - text: Terminal
  - listitem:
    - button "Workspace":
      - img
      - text: Workspace
- text: Agents
- list:
  - listitem:
    - button "Agents":
      - img
      - text: Agents
  - listitem:
    - button "Models":
      - img
      - text: Models
  - listitem:
    - button "Notifications":
      - img
      - text: Notifications
- text: System
- list:
  - listitem:
    - button "Remote Access":
      - img
      - text: Remote Access
  - listitem:
    - button "Apps":
      - img
      - text: Apps
  - listitem:
    - button "Privacy":
      - img
      - text: Privacy
  - listitem:
    - button "Keyboard":
      - img
      - text: Keyboard
- main:
  - tablist:
    - tab "Appearance" [selected]
    - tab "About"
    - tab "Experiments"
  - text: Theme Use light, dark, or match the system.
  - tablist "Theme":
    - tab "Light"
    - tab "Dark" [selected]
    - tab "System"
  - text: Language Changes labels across the app. Does not reload the page.
  - combobox "Language": English
```

# Test source

```ts
  1  | import { expect, test } from "../../../fixtures/test";
  2  | import {
  3  |   connectLocalComputer,
  4  |   gotoSettingsRoute,
  5  |   stubComputerClientSettingsApi,
  6  | } from "../support/app-smoke";
  7  | 
  8  | test.describe("smoke app shell preferences menu", () => {
  9  |   test("@smoke @stateful exercises theme and language controls from Appearance settings", async ({
  10 |     page,
  11 |   }) => {
  12 |     await stubComputerClientSettingsApi(page);
  13 |     await connectLocalComputer(page);
  14 | 
  15 |     await gotoSettingsRoute(page, "appearance");
> 16 |     await expect(page.getByRole("heading", { name: /^(Appearance|外观)$/ }).first()).toBeVisible();
     |                                                                                    ^ Error: expect(locator).toBeVisible() failed
  17 | 
  18 |     await page.getByRole("tab", { name: /^(Light|浅色)$/ }).click();
  19 |     await expect
  20 |       .poll(async () => page.evaluate(() => document.documentElement.classList.contains("light")))
  21 |       .toBe(true);
  22 | 
  23 |     await page.getByRole("combobox", { name: /^(Language|语言)$/ }).click();
  24 |     await page.getByRole("option", { name: /简体中文/ }).click();
  25 |     await expect
  26 |       .poll(async () => page.locator("html").getAttribute("lang"))
  27 |       .toBe("zh");
  28 |     // APP-028: runtime locale must not navigate to /zh/...
  29 |     await expect
  30 |       .poll(async () => new URL(page.url()).pathname)
  31 |       .not.toMatch(/^\/zh(\/|$)/);
  32 |     await expect
  33 |       .poll(async () =>
  34 |         page.evaluate(() => window.localStorage.getItem("atmos:v1:global:locale")),
  35 |       )
  36 |       .toBe("zh");
  37 |   });
  38 | });
  39 | 
```