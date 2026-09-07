# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/APP-066_resource-monitor.e2e.ts >> APP-066 resource monitor >> @spec S11/S13/S16/S20 — collapsed Host/Atmos summaries, details, sort, and 390px
- Location: tests/specs/APP-066_resource-monitor.e2e.ts:362:3

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    5.90625

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e7]:
    - banner [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]:
          - button "Collapse left sidebar" [ref=e11]
          - button "Go back" [ref=e15]
          - button "Go forward" [ref=e18]
          - button "Refresh page" [ref=e21]
        - 'button "Workspace status: Review Setup Script" [ref=e26]':
          - generic [ref=e27]: "50"
          - generic: Review Setup Script
      - generic [ref=e33]:
        - button "Search" [ref=e34] [cursor=pointer]:
          - generic [ref=e38]: Search...
          - generic: K
        - button "Usage" [ref=e40]
    - generic [ref=e45]:
      - complementary [ref=e48]:
        - generic [ref=e49]:
          - generic [ref=e50]:
            - button "Launchpad" [ref=e51] [cursor=pointer]
            - generic [ref=e60]:
              - button "Workspaces" [ref=e62]
              - button "Disk Analyzer" [ref=e68]
          - navigation "Launchpad" [ref=e73]:
            - button "Skills" [ref=e75]
            - button "Automations" [ref=e81]
            - button "Token Usage" [ref=e88]
            - button "Canvas" [ref=e96]
            - button "Prototype Design" [ref=e106]
            - button "Task" [ref=e119]
            - button "New Workspace" [ref=e126]
        - generic [ref=e133]:
          - generic [ref=e135]:
            - generic [ref=e136]:
              - button "Atmos E2E" [ref=e137] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - generic [ref=e144]:
              - button "APP-043 Warm B mt8ynegc" [ref=e146] [cursor=pointer]
              - button "vaporeon" [ref=e156] [cursor=pointer]
          - generic [ref=e166]:
            - generic [ref=e167]:
              - button "Atmos E2E" [ref=e168] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - button "parasect" [ref=e177] [cursor=pointer]
        - generic [ref=e187]:
          - button "Add Project" [ref=e189]
          - generic [ref=e193]:
            - button [ref=e194]
            - button "Open settings" [ref=e197]
      - separator [ref=e202]
      - generic [ref=e205]:
        - main [ref=e207]:
          - generic [ref=e213]:
            - heading "What do you want Atmos to spin up next" [level=1] [ref=e215]:
              - generic [ref=e218]:
                - generic [ref=e219]: What
                - generic [ref=e220]: do
                - generic [ref=e221]: you
                - generic [ref=e222]: want
                - generic [ref=e226]:
                  - generic [ref=e227]: A
                  - generic [ref=e228]: t
                  - generic [ref=e229]: m
                  - generic [ref=e232]: s
                - generic [ref=e233]: to
                - generic [ref=e234]: spin
                - generic [ref=e235]: up
                - generic [ref=e236]: next
            - generic [ref=e239]:
              - button "Select agent" [ref=e240] [cursor=pointer]:
                - img "Codex icon" [ref=e241]
              - generic [ref=e243]:
                - generic [ref=e244]:
                  - generic [ref=e245]:
                    - generic:
                      - generic:
                        - generic: Let Codex build the next idea in Atmos E2E.
                        - generic: (@ mention , / command, or paste directly)
                  - generic [ref=e247]:
                    - generic [ref=e248]:
                      - button "Atmos E2E" [ref=e249]
                      - button "No priority" [ref=e253] [cursor=pointer]
                      - button "In Progress" [ref=e259] [cursor=pointer]
                      - button "+ Label" [ref=e265]
                    - button "Create workspace and run agent" [ref=e266] [cursor=pointer]
                - generic [ref=e268]:
                  - button "Open advanced workspace options" [ref=e269]
                  - generic [ref=e274]: origin/main
        - contentinfo [ref=e281]:
          - generic [ref=e282]:
            - 'button "Resource Monitor: CPU 95% · Memory 16%" [ref=e283]':
              - generic [ref=e286]: Monitor
            - button "Local 0" [ref=e289]
          - button "Napping ~" [ref=e295] [cursor=pointer]:
            - generic [ref=e296]:
              - generic [ref=e297]:
                - generic [ref=e301]: z
                - generic [ref=e302]: z
                - generic [ref=e303]: z
              - generic [ref=e304]: Napping ~
  - alert [ref=e305]
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - tooltip [ref=e307]
```

# Test source

```ts
  288 |   }
  289 |   await sessionButton.first().scrollIntoViewIfNeeded();
  290 |   return sessionButton.first();
  291 | }
  292 | 
  293 | async function expandSessionProcesses(
  294 |   popover: import("@playwright/test").Locator,
  295 |   sessionId: string,
  296 | ): Promise<void> {
  297 |   const root = sessionRoot(popover, sessionId);
  298 |   await expect(root).toBeVisible({ timeout: 15_000 });
  299 |   const trigger = root.locator("[data-resource-monitor-session-trigger]");
  300 |   await expect(trigger, "session process trigger must exist after listener starts").toHaveCount(1);
  301 |   if ((await trigger.getAttribute("aria-expanded")) === "false") {
  302 |     await trigger.click();
  303 |   }
  304 |   await expect(trigger).toHaveAttribute("aria-expanded", "true");
  305 | }
  306 | 
  307 | async function readHorizontalOverflow(page: import("@playwright/test").Page) {
  308 |   return page.evaluate(() => {
  309 |     const root = document.documentElement;
  310 |     const body = document.body;
  311 |     const panel = document.querySelector("[data-resource-monitor-state]");
  312 |     return {
  313 |       document: root.scrollWidth - root.clientWidth,
  314 |       body: body.scrollWidth - body.clientWidth,
  315 |       popover: panel ? panel.scrollWidth - panel.clientWidth : 0,
  316 |     };
  317 |   });
  318 | }
  319 | 
  320 | type ResourceMonitorProcessLeaf = { name?: string; ports?: number[] };
  321 | type ResourceMonitorSnapshotProbe = {
  322 |   projects?: Array<{
  323 |     sessions?: Array<{ session_id?: string; processes?: ResourceMonitorProcessLeaf[] }>;
  324 |     other_processes?: ResourceMonitorProcessLeaf[];
  325 |     workspaces?: Array<{
  326 |       workspace_id?: string;
  327 |       sessions?: Array<{ session_id?: string; processes?: ResourceMonitorProcessLeaf[] }>;
  328 |       other_processes?: ResourceMonitorProcessLeaf[];
  329 |     }>;
  330 |   }>;
  331 | };
  332 | 
  333 | function snapshotListsPort(snapshot: ResourceMonitorSnapshotProbe, port: number): boolean {
  334 |   const leaves: ResourceMonitorProcessLeaf[] = [];
  335 |   for (const project of snapshot.projects ?? []) {
  336 |     for (const session of project.sessions ?? []) leaves.push(...(session.processes ?? []));
  337 |     leaves.push(...(project.other_processes ?? []));
  338 |     for (const workspace of project.workspaces ?? []) {
  339 |       for (const session of workspace.sessions ?? []) leaves.push(...(session.processes ?? []));
  340 |       leaves.push(...(workspace.other_processes ?? []));
  341 |     }
  342 |   }
  343 |   return leaves.some((leaf) => (leaf.ports ?? []).includes(port));
  344 | }
  345 | 
  346 | async function isHttpOpen(port: number): Promise<boolean> {
  347 |   try {
  348 |     const response = await fetch(`http://127.0.0.1:${port}/`, {
  349 |       signal: AbortSignal.timeout(800),
  350 |     });
  351 |     return response.ok;
  352 |   } catch {
  353 |     return false;
  354 |   }
  355 | }
  356 | 
  357 | function workerHttpPort(workerIndex: number): number {
  358 |   return 49152 + (workerIndex % 24) * 640 + Math.floor(Math.random() * 500);
  359 | }
  360 | 
  361 | test.describe("APP-066 resource monitor", () => {
  362 |   test("@spec S11/S13/S16/S20 — collapsed Host/Atmos summaries, details, sort, and 390px", async ({
  363 |     page,
  364 |   }) => {
  365 |     test.setTimeout(90_000);
  366 | 
  367 |     await stubComputerClientSettingsApi(page);
  368 |     await connectLocalComputer(page, { locale: "en" });
  369 | 
  370 |     const footerItem = page.getByRole("button", { name: "Resource Monitor" });
  371 |     const footerLabel = footerItem.locator("[data-resource-monitor-footer-label]");
  372 |     const footerUsage = footerItem.locator("[data-resource-monitor-footer-usage]");
  373 |     await expect(footerItem).toBeVisible({ timeout: 45_000 });
  374 |     await expect(footerLabel).toHaveText("Monitor");
  375 |     const restingFooterWidth = (await footerItem.boundingBox())?.width ?? 0;
  376 |     await footerItem.hover();
  377 |     await expect(footerUsage.getByText(/^CPU \d/)).toBeVisible();
  378 |     await expect(footerUsage.getByText(/^Memory \d/)).toBeVisible();
  379 |     await expect
  380 |       .poll(async () => (await footerItem.boundingBox())?.width ?? 0)
  381 |       .toBeGreaterThan(restingFooterWidth + 40);
  382 |     await page.mouse.move(0, 0);
  383 |     await expect(footerLabel).toHaveText("Monitor");
  384 |     await expect
  385 |       .poll(async () =>
  386 |         Math.abs(((await footerItem.boundingBox())?.width ?? 0) - restingFooterWidth),
  387 |       )
> 388 |       .toBeLessThanOrEqual(2);
      |        ^ Error: expect(received).toBeLessThanOrEqual(expected)
  389 |     await expect(footerItem).toHaveAttribute(
  390 |       "aria-label",
  391 |       /CPU .*%.*Memory .*%/,
  392 |     );
  393 | 
  394 |     await footerItem.click();
  395 | 
  396 |     const popover = page.locator("[data-resource-monitor-state]");
  397 |     await expect(popover).toBeVisible({ timeout: 15_000 });
  398 |     await expect(popover.getByRole("heading", { name: "Resource Monitor" })).toBeVisible();
  399 | 
  400 |     const hostTrigger = popover.locator("[data-resource-monitor-host-trigger]");
  401 |     await expect(hostTrigger).toBeVisible({ timeout: 30_000 });
  402 |     await expect(hostTrigger).toHaveAttribute("aria-expanded", "false");
  403 |     await expect(hostTrigger.getByText(/%/)).toBeVisible();
  404 |     await expect(hostTrigger.getByText(/cores?/i)).toBeVisible();
  405 |     await expect(hostTrigger.getByText(/of /)).toBeVisible();
  406 | 
  407 |     const atmosTrigger = popover.locator("[data-resource-monitor-atmos-trigger]");
  408 |     await expect(atmosTrigger).toBeVisible();
  409 |     await expect(atmosTrigger.getByText("Atmos App", { exact: true })).toBeVisible();
  410 |     await expect(atmosTrigger).toHaveAttribute("aria-expanded", "false");
  411 |     await expect(popover.getByText("Atmos Server", { exact: true })).toHaveCount(0);
  412 | 
  413 |     await hostTrigger.click();
  414 |     await expect(hostTrigger).toHaveAttribute("aria-expanded", "true");
  415 |     const collecting = popover.locator("[data-resource-monitor-collecting]");
  416 |     const chart = popover.locator("[data-resource-monitor-chart]");
  417 |     await expect(collecting.or(chart)).toBeVisible();
  418 |     const serverGauge = popover.locator("[data-server-gauge]");
  419 |     await expect(serverGauge).toBeVisible();
  420 |     await expect(serverGauge.locator("canvas")).toHaveCount(2);
  421 |     const gaugeBox = await serverGauge.locator("canvas").first().boundingBox();
  422 |     expect(gaugeBox).not.toBeNull();
  423 |     expect(gaugeBox!.height).toBeGreaterThanOrEqual(100);
  424 |     expect(gaugeBox!.width).toBeGreaterThan(gaugeBox!.height * 1.5);
  425 |     if (await chart.isVisible()) {
  426 |       await expect(chart.locator("canvas").first()).toBeVisible();
  427 |     }
  428 |     await expect(popover.locator("svg.recharts-surface")).toHaveCount(0);
  429 |     await expect(popover.locator(".recharts-responsive-container")).toHaveCount(0);
  430 | 
  431 |     const diskTrigger = popover.locator("[data-resource-monitor-disk-trigger]");
  432 |     const diskRows = popover.locator("[data-resource-monitor-disk-row]");
  433 |     if ((await diskTrigger.count()) > 0) {
  434 |       await expect(diskTrigger).toHaveAttribute("aria-expanded", "false");
  435 |       await diskTrigger.click();
  436 |       await expect(diskTrigger).toHaveAttribute("aria-expanded", "true");
  437 |       await expect(diskRows).toHaveCount(1);
  438 |       await expect(diskRows.first()).toBeVisible();
  439 |       const diskText = await popover.innerText();
  440 |       expect(diskText).not.toContain("/System/Volumes/Data");
  441 |       expect(diskText).not.toContain("/Volumes/Atmos");
  442 |       expect(diskText).not.toContain("/Volumes/Dray");
  443 |       const diskAnalysis = popover.locator(
  444 |         "[data-resource-monitor-disk-analyzer]",
  445 |       );
  446 |       await expect(diskAnalysis).toBeVisible();
  447 |       await diskAnalysis.click();
  448 |       await expect(page).toHaveURL(/\/disk-analyzer\/?(?:\?|$)/);
  449 |       await expect(popover).toBeVisible();
  450 |     } else {
  451 |       await expect(diskRows).toHaveCount(0);
  452 |     }
  453 | 
  454 |     const cpuDetails = popover.locator("[data-resource-monitor-details='cpu']");
  455 |     await expect(cpuDetails).toBeVisible();
  456 |     await expect(cpuDetails).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
  457 |     await cpuDetails.click();
  458 |     const cpuDetail = page.locator("[data-resource-monitor-detail='cpu']");
  459 |     await expect(cpuDetail).toBeVisible();
  460 |     await page.keyboard.press("Escape");
  461 |     await expect(cpuDetail).toBeHidden();
  462 |     await expect(popover).toBeVisible();
  463 |     await expect(cpuDetails).toBeFocused();
  464 | 
  465 |     const memoryDetails = popover.locator("[data-resource-monitor-details='memory']");
  466 |     await memoryDetails.click();
  467 |     const memoryDetail = page.locator("[data-resource-monitor-detail='memory']");
  468 |     await expect(memoryDetail).toBeVisible();
  469 |     await expect(memoryDetail.getByText("Used")).toBeVisible();
  470 |     await hostTrigger.click({ force: true });
  471 |     await expect(hostTrigger).toHaveAttribute("aria-expanded", "false");
  472 |     await expect(memoryDetail).toBeHidden();
  473 | 
  474 |     await atmosTrigger.click();
  475 |     await expect(atmosTrigger).toHaveAttribute("aria-expanded", "true");
  476 |     await expect(popover.getByText("Atmos Server", { exact: true })).toBeVisible();
  477 |     await expect(popover.getByText("Shared runtime", { exact: true })).toBeVisible();
  478 |     await expect(popover.getByRole("heading", { name: "Desktop" })).toHaveCount(0);
  479 | 
  480 |     const sort = popover.locator("[data-resource-monitor-sort]");
  481 |     await expect(sort).toBeVisible();
  482 |     await expect(popover.getByRole("toolbar")).toHaveCount(0);
  483 |     await expect(sort).toHaveCSS("position", "sticky");
  484 |     await expect(sort.getByRole("button", { name: /Name/ })).toBeVisible();
  485 |     await expect(sort.getByRole("button", { name: /CPU/ })).toBeVisible();
  486 |     await expect(sort.getByRole("button", { name: /Memory/ })).toBeVisible();
  487 |     const cpuSort = sort.getByRole("button", { name: /CPU/ });
  488 |     await expect(cpuSort).toHaveAttribute(
```