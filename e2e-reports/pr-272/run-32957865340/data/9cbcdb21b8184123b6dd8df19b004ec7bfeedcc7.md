# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/workspace/workspace-sidebar-routes.e2e.ts >> smoke workspace >> @smoke @stateful exercises workspace center tool tabs and read-only subtabs
- Location: tests/smoke/workspace/workspace-sidebar-routes.e2e.ts:16:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('menuitem', { name: /^(图形历史|Graph History)$/ })
    - locator resolved to <div tabindex="-1" role="menuitem" data-variant="default" data-orientation="vertical" data-radix-collection-item="" data-slot="dropdown-menu-item" class="focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foregroun…>…</div>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [ref=f3e1]:
  - alert [ref=f3e2]
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - generic [ref=f3e8]:
    - banner [ref=f3e9]:
      - generic [ref=f3e10]:
        - generic [ref=f3e11]:
          - button "收起左侧边栏" [ref=f3e12]
          - button "返回上一步" [ref=f3e16]
          - button "前进" [ref=f3e19]
          - button "刷新页面" [ref=f3e22]
        - generic [ref=f3e28]:
          - button "打开 O" [ref=f3e29]:
            - generic: 打开
            - generic: O
          - button [ref=f3e31]
      - generic [ref=f3e35]:
        - generic [ref=f3e36]:
          - status "无法将远程分支与 origin/main 进行比较" [ref=f3e37]
          - generic [ref=f3e42]: HEAD
        - button "origin/ main" [ref=f3e47] [cursor=pointer]:
          - generic [ref=f3e48]: origin/
          - generic [ref=f3e49]: main
      - generic [ref=f3e52]:
        - button "搜索" [ref=f3e53] [cursor=pointer]:
          - generic [ref=f3e57]: 搜索...
          - generic: K
        - button "打开工作区摘要" [ref=f3e58]
        - button "用量" [ref=f3e62]
    - generic [ref=f3e67]:
      - complementary [ref=f3e70]:
        - generic [ref=f3e71]:
          - generic [ref=f3e72]:
            - button "Launchpad" [ref=f3e73] [cursor=pointer]
            - generic [ref=f3e82]:
              - button "工作区" [ref=f3e84]
              - button "磁盘分析器" [ref=f3e90]
          - navigation "Launchpad" [ref=f3e95]:
            - button "技能" [ref=f3e97]
            - button "自动化" [ref=f3e103]
            - button "Token 用量" [ref=f3e110]
            - button "画布" [ref=f3e118]
            - button "Prototype Design" [ref=f3e128]
            - button "任务" [ref=f3e141]
            - button "新建工作区" [ref=f3e148]
        - generic [ref=f3e157]:
          - generic [ref=f3e158]:
            - button "Atmos E2E" [ref=f3e159] [cursor=pointer]
            - generic:
              - generic:
                - button
                - button
          - button "vileplume" [ref=f3e168] [cursor=pointer]
        - generic [ref=f3e178]:
          - button "添加项目" [ref=f3e180]
          - generic [ref=f3e184]:
            - button [ref=f3e185]
            - button "打开设置" [ref=f3e188]
      - separator [ref=f3e193]
      - generic [ref=f3e196]:
        - main [ref=f3e199]:
          - generic [ref=f3e200]:
            - tablist [ref=f3e209]:
              - generic:
                - button [ref=f3e210]:
                  - tab "关闭 终端 终端" [ref=f3e211]:
                    - generic [ref=f3e212]:
                      - button "关闭 终端"
                    - generic [ref=f3e217]: 终端
                - button [ref=f3e218]:
                  - tab "文件" [ref=f3e219]:
                    - generic [ref=f3e220]:
                      - button "关闭文件标签页"
                - button [ref=f3e228]:
                  - tab "变更" [selected] [ref=f3e229]:
                    - generic [ref=f3e230]:
                      - button "关闭变更标签页"
              - generic [ref=f3e237]:
                - button "新建标签页" [ref=f3e238]
                - button "打开标签组" [ref=f3e240]
            - generic [ref=f3e244]:
              - generic [ref=f3e246]:
                - button "选择变更范围" [active] [ref=f3e247] [cursor=pointer]:
                  - generic [ref=f3e248]: 分支
                - generic [ref=f3e249]:
                  - button "更改文件视图" [ref=f3e250] [cursor=pointer]
                  - generic [ref=f3e251]:
                    - button "全部暂存" [disabled]
                    - button "更多变更操作" [ref=f3e252] [cursor=pointer]
              - generic [ref=f3e256]:
                - generic [ref=f3e257] [cursor=pointer]:
                  - generic [ref=f3e258]:
                    - 'img "File: en.json" [ref=f3e259]'
                    - generic [ref=f3e260]: en.json
                    - generic [ref=f3e261]: apps/web/messages/
                  - generic [ref=f3e263]:
                    - generic [ref=f3e264]:
                      - generic [ref=f3e265]: "+86"
                      - generic [ref=f3e266]: "-1"
                    - generic [ref=f3e267]: M
                - generic [ref=f3e268] [cursor=pointer]:
                  - generic [ref=f3e269]:
                    - 'img "File: zh.json" [ref=f3e270]'
                    - generic [ref=f3e271]: zh.json
                    - generic [ref=f3e272]: apps/web/messages/
                  - generic [ref=f3e274]:
                    - generic [ref=f3e275]:
                      - generic [ref=f3e276]: "+86"
                      - generic [ref=f3e277]: "-1"
                    - generic [ref=f3e278]: M
                - generic [ref=f3e279] [cursor=pointer]:
                  - generic [ref=f3e280]:
                    - 'img "File: agent-hook-navigation.test.ts" [ref=f3e281]'
                    - generic [ref=f3e282]: agent-hook-navigation.test.ts
                    - generic [ref=f3e283]: apps/web/src/features/agent/lib/__tests__/
                  - generic [ref=f3e285]:
                    - generic [ref=f3e286]:
                      - generic [ref=f3e287]: "+2"
                      - generic [ref=f3e288]: "-2"
                    - generic [ref=f3e289]: M
                - generic [ref=f3e290] [cursor=pointer]:
                  - generic [ref=f3e291]:
                    - 'img "File: agent-hook-navigation.ts" [ref=f3e292]'
                    - generic [ref=f3e293]: agent-hook-navigation.ts
                    - generic [ref=f3e294]: apps/web/src/features/agent/lib/
                  - generic [ref=f3e296]:
                    - generic [ref=f3e297]:
                      - generic [ref=f3e298]: "+11"
                      - generic [ref=f3e299]: "-10"
                    - generic [ref=f3e300]: M
                - generic [ref=f3e301] [cursor=pointer]:
                  - generic [ref=f3e302]:
                    - 'img "File: IssueDetailView.tsx" [ref=f3e303]'
                    - generic [ref=f3e304]: IssueDetailView.tsx
                    - generic [ref=f3e305]: apps/web/src/features/github/components/
                  - generic [ref=f3e307]:
                    - generic [ref=f3e308]:
                      - generic [ref=f3e309]: "+54"
                      - generic [ref=f3e310]: "-157"
                    - generic [ref=f3e311]: M
                - generic [ref=f3e312] [cursor=pointer]:
                  - generic [ref=f3e313]:
                    - 'img "File: PRDetailView.tsx" [ref=f3e314]'
                    - generic [ref=f3e315]: PRDetailView.tsx
                    - generic [ref=f3e316]: apps/web/src/features/github/components/
                  - generic [ref=f3e318]:
                    - generic [ref=f3e319]:
                      - generic [ref=f3e320]: "+79"
                      - generic [ref=f3e321]: "-272"
                    - generic [ref=f3e322]: M
                - generic [ref=f3e323] [cursor=pointer]:
                  - generic [ref=f3e324]:
                    - 'img "File: TimelineActivityEvent.tsx" [ref=f3e325]'
                    - generic [ref=f3e326]: TimelineActivityEvent.tsx
                    - generic [ref=f3e327]: apps/web/src/features/github/components/
                  - generic [ref=f3e329]:
                    - generic [ref=f3e330]: "+425"
                    - generic [ref=f3e332]: A
                - generic [ref=f3e333] [cursor=pointer]:
                  - generic [ref=f3e334]:
                    - 'img "File: TimelineReferencesEvent.tsx" [ref=f3e335]'
                    - generic [ref=f3e336]: TimelineReferencesEvent.tsx
                    - generic [ref=f3e337]: apps/web/src/features/github/components/
                  - generic [ref=f3e339]:
                    - generic [ref=f3e340]: "+220"
                    - generic [ref=f3e342]: A
                - generic [ref=f3e343] [cursor=pointer]:
                  - generic [ref=f3e344]:
                    - 'img "File: timeline-commits.test.ts" [ref=f3e345]'
                    - generic [ref=f3e346]: timeline-commits.test.ts
                    - generic [ref=f3e347]: apps/web/src/features/github/lib/__tests__/
                  - generic [ref=f3e349]:
                    - generic [ref=f3e350]: "+44"
                    - generic [ref=f3e352]: M
                - generic [ref=f3e353] [cursor=pointer]:
                  - generic [ref=f3e354]:
                    - 'img "File: timeline-event-map.test.ts" [ref=f3e355]'
                    - generic [ref=f3e356]: timeline-event-map.test.ts
                    - generic [ref=f3e357]: apps/web/src/features/github/lib/__tests__/
                  - generic [ref=f3e359]:
                    - generic [ref=f3e360]: "+559"
                    - generic [ref=f3e362]: A
                - generic [ref=f3e363] [cursor=pointer]:
                  - generic [ref=f3e364]:
                    - 'img "File: timeline-refs.test.ts" [ref=f3e365]'
                    - generic [ref=f3e366]: timeline-refs.test.ts
                    - generic [ref=f3e367]: apps/web/src/features/github/lib/__tests__/
                  - generic [ref=f3e369]:
                    - generic [ref=f3e370]: "+176"
                    - generic [ref=f3e372]: A
                - generic [ref=f3e373] [cursor=pointer]:
                  - generic [ref=f3e374]:
                    - 'img "File: pr-detail-parts.tsx" [ref=f3e375]'
                    - generic [ref=f3e376]: pr-detail-parts.tsx
                    - generic [ref=f3e377]: apps/web/src/features/github/lib/
                  - generic [ref=f3e379]:
                    - generic [ref=f3e380]:
                      - generic [ref=f3e381]: "+50"
                      - generic [ref=f3e382]: "-1"
                    - generic [ref=f3e383]: M
                - generic [ref=f3e384] [cursor=pointer]:
                  - generic [ref=f3e385]:
                    - 'img "File: timeline-commits.ts" [ref=f3e386]'
                    - generic [ref=f3e387]: timeline-commits.ts
                    - generic [ref=f3e388]: apps/web/src/features/github/lib/
                  - generic [ref=f3e390]:
                    - generic [ref=f3e391]:
                      - generic [ref=f3e392]: "+17"
                      - generic [ref=f3e393]: "-3"
                    - generic [ref=f3e394]: M
                - generic [ref=f3e395] [cursor=pointer]:
                  - generic [ref=f3e396]:
                    - 'img "File: timeline-event-map.ts" [ref=f3e397]'
                    - generic [ref=f3e398]: timeline-event-map.ts
                    - generic [ref=f3e399]: apps/web/src/features/github/lib/
                  - generic [ref=f3e401]:
                    - generic [ref=f3e402]: "+666"
                    - generic [ref=f3e404]: A
                - generic [ref=f3e405] [cursor=pointer]:
                  - generic [ref=f3e406]:
                    - 'img "File: timeline-refs.ts" [ref=f3e407]'
                    - generic [ref=f3e408]: timeline-refs.ts
                    - generic [ref=f3e409]: apps/web/src/features/github/lib/
                  - generic [ref=f3e411]:
                    - generic [ref=f3e412]: "+179"
                    - generic [ref=f3e414]: A
              - generic [ref=f3e417]:
                - generic [ref=f3e418]:
                  - textbox "消息（Cmd/Ctrl+Enter 提交）" [ref=f3e420]
                  - button [disabled] [ref=f3e421]
                - generic [ref=f3e425]:
                  - button "发布分支" [ref=f3e426]
                  - button [ref=f3e428]
        - contentinfo [ref=f3e431]:
          - generic [ref=f3e432]:
            - 'button "资源监视器: CPU 95% · 内存 13%" [ref=f3e433]':
              - generic [ref=f3e436]: 监视器
            - button "本地 0" [ref=f3e439]
          - button "休眠中 ~" [ref=f3e445] [cursor=pointer]:
            - generic [ref=f3e446]:
              - generic [ref=f3e447]:
                - generic [ref=f3e451]: z
                - generic [ref=f3e452]: z
                - generic [ref=f3e453]: z
              - generic [ref=f3e454]: 休眠中 ~
```

# Test source

```ts
  1   | import { expect, test } from "../../../fixtures/test";
  2   | import {
  3   |   buildProjectWorkspaceDeepLink,
  4   |   closeSettingsPage,
  5   |   connectLocalComputer,
  6   |   expectHealthyRoute,
  7   |   getCenterStage,
  8   |   gotoContextRoute,
  9   |   gotoSettingsRoute,
  10  |   normalizePathname,
  11  |   stubComputerClientSettingsApi,
  12  |   withSearchParams,
  13  | } from "../support/app-smoke";
  14  | 
  15  | test.describe("smoke workspace", () => {
  16  |   test("@smoke @stateful exercises workspace center tool tabs and read-only subtabs", async ({
  17  |     page,
  18  |   }) => {
  19  |     await stubComputerClientSettingsApi(page);
  20  |     await connectLocalComputer(page, { locale: "zh" });
  21  | 
  22  |     await expectHealthyRoute(page, "/", { locale: "zh" });
  23  |     await expect(page.getByRole("button", { name: /搜索|Search/ })).toBeVisible({
  24  |       timeout: 45_000,
  25  |     });
  26  | 
  27  |     const contextUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page), {
  28  |       activeSettingTab: null,
  29  |     });
  30  | 
  31  |     await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "files" }), {
  32  |       locale: "zh",
  33  |     });
  34  |     await expect(page.getByRole("tab", { name: /^(文件|Files)$/ })).toBeVisible({
  35  |       timeout: 45_000,
  36  |     });
  37  |     await expect
  38  |       .poll(async () => new URL(page.url()).searchParams.get("tab"))
  39  |       .toBeNull();
  40  | 
  41  |     await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "changes" }), {
  42  |       locale: "zh",
  43  |     });
  44  |     await expect(page.getByRole("tab", { name: /^(变更|Changes)$/ })).toBeVisible();
  45  |     const changesStage = await getCenterStage(page);
  46  |     const scopeTrigger = changesStage.getByRole("button", {
  47  |       name: /选择变更范围|Select changes scope/,
  48  |     });
  49  |     await expect(scopeTrigger).toBeVisible();
  50  |     await scopeTrigger.click();
> 51  |     await page.getByRole("menuitem", { name: /^(图形历史|Graph History)$/ }).click();
      |                                                                          ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  52  |     // The tab's computed name can include the close control; do not require an exact match.
  53  |     await expect(page.getByRole("tab", { name: /图形历史|Graph History/ })).toBeVisible();
  54  | 
  55  |     await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "review" }), {
  56  |       locale: "zh",
  57  |     });
  58  |     await expect(page.getByRole("tab", { name: /^(评审|Review)$/ })).toBeVisible();
  59  | 
  60  |     await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "run" }), {
  61  |       locale: "zh",
  62  |     });
  63  |     const runStage = await getCenterStage(page);
  64  |     // The Run surface's inner terminal strip reuses the same 运行/Run tab name.
  65  |     await expect(
  66  |       runStage.getByRole("tablist").first().getByRole("tab", { name: /运行|Run/ }),
  67  |     ).toBeVisible();
  68  | 
  69  |     await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "github" }), {
  70  |       locale: "zh",
  71  |     });
  72  |     await expect(page.getByRole("tab", { name: /^GitHub$/ })).toBeVisible();
  73  |     const githubStage = await getCenterStage(page);
  74  |     await expect(githubStage.getByRole("tab", { name: "拉取请求" })).toBeVisible();
  75  |     await expect(githubStage.getByRole("tab", { name: "议题" })).toBeVisible();
  76  |     await expect(githubStage.getByRole("tab", { name: "操作" })).toBeVisible();
  77  |   });
  78  | 
  79  |   test("@smoke @stateful boots direct workspace urls with read-only sidebar toggles and settings page", async ({
  80  |     page,
  81  |   }) => {
  82  |     await stubComputerClientSettingsApi(page);
  83  |     await connectLocalComputer(page, { locale: "zh" });
  84  | 
  85  |     const contextUrl = await buildProjectWorkspaceDeepLink(page);
  86  |     const workspaceUrl = new URL(contextUrl).searchParams.get("pvUrl");
  87  |     expect(workspaceUrl, "missing workspace url in project deep link").toBeTruthy();
  88  | 
  89  |     const projectsRoute = withSearchParams(workspaceUrl!, {
  90  |       lsTab: "projects",
  91  |       lsTask: "true",
  92  |       settingsModal: null,
  93  |       activeSettingTab: null,
  94  |     });
  95  |     const firstResponse = await page.goto(projectsRoute, {
  96  |       waitUntil: "domcontentloaded",
  97  |     });
  98  |     expect(firstResponse, `missing navigation response for ${projectsRoute}`).not.toBeNull();
  99  |     expect(firstResponse!.status(), `unexpected status for ${projectsRoute}`).toBeLessThan(500);
  100 |     await expect
  101 |       .poll(async () => normalizePathname(new URL(page.url()).pathname))
  102 |       .toBe("/workspace");
  103 |     await expect
  104 |       .poll(async () => new URL(page.url()).searchParams.get("id") ?? "")
  105 |       .not.toBe("");
  106 |     await expect
  107 |       .poll(async () => new URL(page.url()).searchParams.get("lsTab"))
  108 |       .toBe("projects");
  109 |     await expect
  110 |       .poll(async () => new URL(page.url()).searchParams.get("lsTask"))
  111 |       .toBe("true");
  112 |     await expect
  113 |       .poll(async () => page.locator("html").getAttribute("lang"))
  114 |       .toBe("zh");
  115 |     await expect(page.locator("body")).toBeVisible();
  116 | 
  117 |     const filesRoute = withSearchParams(workspaceUrl!, {
  118 |       tab: "files",
  119 |       lsTask: null,
  120 |       settingsModal: null,
  121 |       activeSettingTab: null,
  122 |     });
  123 |     const secondResponse = await page.goto(filesRoute, {
  124 |       waitUntil: "domcontentloaded",
  125 |     });
  126 |     expect(secondResponse, `missing navigation response for ${filesRoute}`).not.toBeNull();
  127 |     expect(secondResponse!.status(), `unexpected status for ${filesRoute}`).toBeLessThan(500);
  128 |     await expect(page.getByRole("tab", { name: /^(文件|Files)$/ })).toBeVisible({
  129 |       timeout: 45_000,
  130 |     });
  131 |     await expect
  132 |       .poll(async () => new URL(page.url()).searchParams.get("lsTask") ?? "")
  133 |       .toBe("");
  134 | 
  135 |     await gotoSettingsRoute(page, "keyboard", { locale: "zh" });
  136 |     await expect
  137 |       .poll(async () => normalizePathname(new URL(page.url()).pathname))
  138 |       .toBe("/settings");
  139 |     await expect
  140 |       .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
  141 |       .toBe("keyboard");
  142 |     await expect(page.getByRole("button", { name: /^(Keyboard|键盘)$/ })).toBeVisible();
  143 |     await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
  144 | 
  145 |     await closeSettingsPage(page);
  146 |     await expect
  147 |       .poll(async () => normalizePathname(new URL(page.url()).pathname))
  148 |       .not.toBe("/settings");
  149 |   });
  150 | });
  151 | 
```