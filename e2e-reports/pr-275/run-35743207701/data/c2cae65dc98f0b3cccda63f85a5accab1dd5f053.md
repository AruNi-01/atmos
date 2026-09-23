# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/APP-075_pt-design-interactive-canvas.e2e.ts >> APP-075 PT Design interactive canvas >> @spec S21 — Cmd+Z after Edit drag restores extract
- Location: tests/specs/APP-075_pt-design-interactive-canvas.e2e.ts:360:3

# Error details

```
Error: pt_ptx_get failed: PT_DESIGN_CLIENT_NOT_FOUND No open Prototype Design tab matches that client_id. Open the board first.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e7]:
    - banner [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]:
          - button "Collapse left sidebar" [ref=e11]
          - button "Go back" [ref=e14]
          - button "Go forward" [ref=e17]
          - button "Refresh page" [ref=e20]
        - button "Needs attention" [ref=e28]:
          - status [ref=e29]: Notifications, 1 unread
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
      - generic [ref=e35]:
        - button "Search" [ref=e36] [cursor=pointer]:
          - generic [ref=e40]: Search...
          - generic: K
        - button "Usage" [ref=e42]
    - generic [ref=e47]:
      - complementary [ref=e50]:
        - generic [ref=e51]:
          - generic [ref=e52]:
            - button "Launchpad" [expanded] [ref=e53] [cursor=pointer]
            - generic [ref=e64]:
              - button "Workspaces" [ref=e66]
              - button "Terminals" [ref=e72]
              - button "Agent Chat" [ref=e77]
              - button "Disk Analyzer" [ref=e83]
              - button "Token Usage" [ref=e88]
              - button "Agent Observer" [ref=e95]
              - button "Canvas" [ref=e105]
              - button "Prototype Design" [ref=e114]
              - button "Task" [ref=e126]
              - button "Agent Sessions" [ref=e132]
          - navigation "Launchpad" [ref=e139]:
            - button "Skills" [ref=e141]
            - button "Automations" [ref=e147]
            - button "New Workspace" [ref=e154]
          - generic: Move here to hide this feature
        - generic [ref=e161]:
          - generic [ref=e163]:
            - generic [ref=e165]:
              - button "Atmos E2E" [ref=e166] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - generic [ref=e173]:
              - button "APP-043 Warm B mucsskpl" [ref=e175] [cursor=pointer]
              - button "butterfree" [ref=e185] [cursor=pointer]
          - generic [ref=e195]:
            - generic [ref=e197]:
              - button "Atmos E2E" [ref=e198] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - button "pidgey" [ref=e207] [cursor=pointer]
        - generic [ref=e217]:
          - button "Add Project" [ref=e219]
          - generic [ref=e223]:
            - button [ref=e224]
            - button "Open settings" [ref=e227]
      - separator [ref=e232]
      - generic [ref=e234]:
        - main [ref=e236]:
          - generic [ref=e239]:
            - generic [ref=e243]:
              - generic [active] [ref=e244]:
                - generic:
                  - generic:
                    - generic:
                      - generic [ref=e245]:
                        - button [ref=e247] [cursor=pointer]
                        - region "Selected shape actions":
                          - heading "Selected shape actions" [level=2] [ref=e251]
                          - generic [ref=e253]:
                            - generic [ref=e254]:
                              - heading [level=3] [ref=e255]: Stroke
                              - dialog [ref=e257]:
                                - generic [ref=e258]:
                                  - button "#1e1e1e" [ref=e259] [cursor=pointer]
                                  - button "#e03131" [ref=e261] [cursor=pointer]
                                  - button "#2f9e44" [ref=e262] [cursor=pointer]
                                  - button "#1971c2" [ref=e263] [cursor=pointer]
                                  - button "#f08c00" [ref=e264] [cursor=pointer]
                                - button "Stroke" [ref=e266] [cursor=pointer]
                            - generic [ref=e267]:
                              - heading [level=3] [ref=e268]: Background
                              - dialog [ref=e270]:
                                - generic [ref=e271]:
                                  - button "transparent" [ref=e272] [cursor=pointer]
                                  - button "#ffc9c9" [ref=e273] [cursor=pointer]
                                  - button "#b2f2bb" [ref=e274] [cursor=pointer]
                                  - button "#a5d8ff" [ref=e275] [cursor=pointer]
                                  - button "#ffec99" [ref=e276] [cursor=pointer]
                                - button "Background" [ref=e278] [cursor=pointer]
                            - group "Fill" [ref=e279]:
                              - generic [ref=e281]:
                                - button "Hachure (Alt-Click)" [ref=e282] [cursor=pointer]
                                - button "Cross-hatch" [ref=e287] [cursor=pointer]
                                - button "Solid" [ref=e293] [cursor=pointer]
                            - group "Stroke width" [ref=e297]:
                              - generic [ref=e299]:
                                - generic "Thin" [ref=e300] [cursor=pointer]:
                                  - radio [checked]
                                - generic "Bold" [ref=e302] [cursor=pointer]:
                                  - radio
                                - generic "Extra bold" [ref=e304] [cursor=pointer]:
                                  - radio
                            - group "Stroke style" [ref=e306]:
                              - generic [ref=e308]:
                                - generic "Solid" [ref=e309] [cursor=pointer]:
                                  - radio [checked]
                                - generic "Dashed" [ref=e311] [cursor=pointer]:
                                  - radio
                                - generic "Dotted" [ref=e315] [cursor=pointer]:
                                  - radio
                            - group "Sloppiness" [ref=e319]:
                              - generic [ref=e321]:
                                - generic "Architect" [ref=e322] [cursor=pointer]:
                                  - radio
                                - generic "Artist" [ref=e325] [cursor=pointer]:
                                  - radio [checked]
                                - generic "Cartoonist" [ref=e328] [cursor=pointer]:
                                  - radio
                            - group "Edges" [ref=e331]:
                              - generic [ref=e333]:
                                - generic "Sharp" [ref=e334] [cursor=pointer]:
                                  - radio
                                - generic "Round" [ref=e338] [cursor=pointer]:
                                  - radio [checked]
                            - generic [ref=e343]:
                              - text: Opacity
                              - generic [ref=e344]:
                                - slider "Opacity 100 0" [ref=e345]: "100"
                                - generic [ref=e346]: "100"
                                - generic [ref=e347]: "0"
                            - group "Layers" [ref=e348]:
                              - generic [ref=e350]:
                                - button "Send to back — Ctrl+Shift+[" [ref=e351] [cursor=pointer]
                                - button "Send backward — Ctrl+[" [ref=e357] [cursor=pointer]
                                - button "Bring forward — Ctrl+]" [ref=e363] [cursor=pointer]
                                - button "Bring to front — Ctrl+Shift+]" [ref=e369] [cursor=pointer]
                            - group "Actions" [ref=e375]:
                              - generic [ref=e377]:
                                - button "Duplicate" [ref=e378] [cursor=pointer]
                                - button "Delete" [ref=e384] [cursor=pointer]
                                - button "Add link" [ref=e388] [cursor=pointer]
                      - region "Shapes":
                        - generic [ref=e397]:
                          - generic: Press Enter to add text. Hold Ctrl and Arrow key to create a flowchart
                          - heading "Shapes" [level=2] [ref=e398]
                          - generic [ref=e399]:
                            - generic "Hand (panning tool) — H" [ref=e400] [cursor=pointer]:
                              - radio "Hand (panning tool) — H"
                            - generic "Selection — V or 1" [ref=e409] [cursor=pointer]:
                              - radio "Selection" [checked]
                              - generic [ref=e410]: "1"
                            - generic "Rectangle — R or 2" [ref=e417] [cursor=pointer]:
                              - radio "Rectangle"
                              - generic [ref=e418]: "2"
                            - generic "Diamond — D or 3" [ref=e424] [cursor=pointer]:
                              - radio "Diamond"
                              - generic [ref=e425]: "3"
                            - generic "Ellipse — O or 4" [ref=e431] [cursor=pointer]:
                              - radio "Ellipse"
                              - generic [ref=e432]: "4"
                            - generic "Arrow — A or 5" [ref=e438] [cursor=pointer]:
                              - radio "Arrow"
                              - generic [ref=e439]: "5"
                            - generic "Line — L or 6" [ref=e446] [cursor=pointer]:
                              - radio "Line"
                              - generic [ref=e447]: "6"
                            - generic "Draw — P or 7" [ref=e450] [cursor=pointer]:
                              - radio "Draw"
                              - generic [ref=e451]: "7"
                            - generic "Text — T or 8" [ref=e457] [cursor=pointer]:
                              - radio "Text"
                              - generic [ref=e458]: "8"
                            - generic "Insert image — 9" [ref=e465] [cursor=pointer]:
                              - radio "Insert image"
                              - generic [ref=e466]: "9"
                            - generic "Eraser — E or 0" [ref=e473] [cursor=pointer]:
                              - radio "Eraser"
                              - generic [ref=e474]: "0"
                            - button "More tools" [ref=e481] [cursor=pointer]
                      - generic [ref=e489]:
                        - button "Collaborate" [ref=e490] [cursor=pointer]
                        - button "Library" [ref=e496] [cursor=pointer]
                        - button "Component" [ref=e499] [cursor=pointer]
                  - contentinfo:
                    - region [ref=e506]:
                      - heading "Canvas actions" [level=2] [ref=e507]
                      - generic [ref=e509]:
                        - button "Zoom out" [ref=e510] [cursor=pointer]
                        - button "Reset zoom" [ref=e514] [cursor=pointer]: 100%
                        - button "Zoom in" [ref=e515] [cursor=pointer]
                      - generic [ref=e519]:
                        - button "Undo" [ref=e522] [cursor=pointer]
                        - button "Redo" [disabled] [ref=e528]
                - generic [ref=e532]: Drawing canvas
              - button "Back" [ref=e533] [cursor=pointer]
              - group "Mode" [ref=e536]:
                - button "Edit" [pressed] [ref=e537] [cursor=pointer]
                - button "Interact" [ref=e541] [cursor=pointer]
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - button "Claude"
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - textbox "Prompt":
                              - /placeholder: ""
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - button "Run"
                - generic:
                  - 'button "Variant: Default" [ref=e549] [cursor=pointer]'
                  - 'button "Size: M" [ref=e553] [cursor=pointer]':
                    - generic [ref=e554]: M
                  - 'button "Radius: Default" [ref=e556] [cursor=pointer]'
            - button "Agent working on Prototype Design" [ref=e560]:
              - status "Loading" [ref=e561]
              - generic [ref=e588]: Reading prototype source
        - contentinfo [ref=e590]:
          - generic [ref=e591]:
            - 'button "Resource Monitor: CPU 94% · Memory 17%" [ref=e592]':
              - generic [ref=e595]: Monitor
            - button "Local 0" [ref=e598]
          - generic [ref=e603]:
            - button [ref=e604] [cursor=pointer]:
              - generic "1 Need attention" [ref=e606]: "1"
            - button "Open Chat" [ref=e613]:
              - generic [ref=e617]: Chat
  - alert [ref=e618]
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
```

# Test source

```ts
  25  |       <action type="agent" name="run"/>
  26  |     </on>
  27  |   </button>
  28  | </page>
  29  | `;
  30  | 
  31  | type InvokeResult = {
  32  |   ok: boolean;
  33  |   data?: {
  34  |     ptx?: string;
  35  |     mime?: string;
  36  |     mediaType?: string;
  37  |     base64?: string;
  38  |     dataUrl?: string;
  39  |   };
  40  |   error?: { code?: string; message?: string };
  41  | };
  42  | 
  43  | /** S5 representative live UI: overlay dialog + block.auth-form (+ run so openSeededPtDesign can wait). */
  44  | const S5_REPRESENTATIVE_PTX = `<page id="s5-rep">
  45  |   <dialog id="dlg" title="Dialog" description="Review the details and confirm to continue." label="Confirm" x="40" y="40" width="320" height="200"/>
  46  |   <block-auth-form id="auth" title="Sign in" x="400" y="40" width="360" height="228">
  47  |     <input id="auth-email" label="Email" x="16" y="52" width="328" height="40"/>
  48  |     <input id="auth-password" label="Password" x="16" y="100" width="328" height="40"/>
  49  |     <button id="auth-submit" label="Continue" x="16" y="156" width="328" height="40"/>
  50  |   </block-auth-form>
  51  |   <button id="run" label="Run" x="300" y="300" width="100" height="40">
  52  |     <on event="click">
  53  |       <action type="agent" name="run"/>
  54  |     </on>
  55  |   </button>
  56  | </page>
  57  | `;
  58  | 
  59  | async function liveBoardEnvReady(): Promise<boolean> {
  60  |   const url = `ws://127.0.0.1:${apiPort}/ws?client_type=web`;
  61  |   const deadline = Date.now() + 30_000;
  62  |   while (Date.now() < deadline) {
  63  |     const ok = await new Promise<boolean>((resolve) => {
  64  |       let settled = false;
  65  |       let socket: WebSocket | undefined;
  66  |       const finish = (value: boolean) => {
  67  |         if (settled) return;
  68  |         settled = true;
  69  |         try {
  70  |           socket?.close();
  71  |         } catch {
  72  |           // ignore
  73  |         }
  74  |         resolve(value);
  75  |       };
  76  |       try {
  77  |         socket = new WebSocket(url);
  78  |       } catch {
  79  |         resolve(false);
  80  |         return;
  81  |       }
  82  |       const timer = setTimeout(() => finish(false), 2_000);
  83  |       socket.addEventListener("open", () => {
  84  |         clearTimeout(timer);
  85  |         finish(true);
  86  |       });
  87  |       socket.addEventListener("error", () => {
  88  |         clearTimeout(timer);
  89  |         finish(false);
  90  |       });
  91  |     });
  92  |     if (ok) return true;
  93  |     await new Promise((resolve) => setTimeout(resolve, 500));
  94  |   }
  95  |   return false;
  96  | }
  97  | 
  98  | async function invokeTool(
  99  |   tool: string,
  100 |   args: Record<string, unknown> = {},
  101 | ): Promise<InvokeResult> {
  102 |   const response = await fetch(`http://127.0.0.1:${apiPort}/api/pt-design/agent/invoke`, {
  103 |     method: "POST",
  104 |     headers: { "content-type": "application/json" },
  105 |     body: JSON.stringify({
  106 |       request_id: crypto.randomUUID(),
  107 |       tool,
  108 |       args,
  109 |       client_id: "global",
  110 |     }),
  111 |   });
  112 |   const text = await response.text();
  113 |   try {
  114 |     return JSON.parse(text) as InvokeResult;
  115 |   } catch {
  116 |     throw new Error(
  117 |       `pt-design invoke ${tool} returned non-JSON ${response.status}: ${text.slice(0, 240)}`,
  118 |     );
  119 |   }
  120 | }
  121 | 
  122 | async function getPtx(): Promise<string> {
  123 |   const got = await invokeTool("pt_ptx_get");
  124 |   if (!got.ok || typeof got.data?.ptx !== "string") {
> 125 |     throw new Error(
      |           ^ Error: pt_ptx_get failed: PT_DESIGN_CLIENT_NOT_FOUND No open Prototype Design tab matches that client_id. Open the board first.
  126 |       `pt_ptx_get failed: ${got.error?.code ?? "not-ok"} ${got.error?.message ?? JSON.stringify(got)}`,
  127 |     );
  128 |   }
  129 |   return got.data.ptx;
  130 | }
  131 | 
  132 | async function applyPtx(ptx: string): Promise<void> {
  133 |   const got = await invokeTool("pt_ptx_apply", { ptx });
  134 |   if (!got.ok) {
  135 |     throw new Error(
  136 |       `pt_ptx_apply failed: ${got.error?.code ?? "not-ok"} ${got.error?.message ?? JSON.stringify(got)}`,
  137 |     );
  138 |   }
  139 | }
  140 | 
  141 | function buttonAttr(ptx: string, attr: "x" | "y"): number {
  142 |   const match = ptx.match(new RegExp(`<button id="run"[^>]*\\s${attr}="([^"]+)"`));
  143 |   const value = Number(match?.[1]);
  144 |   if (!Number.isFinite(value)) {
  145 |     throw new Error(`run ${attr} missing in PTX: ${ptx.slice(0, 400)}`);
  146 |   }
  147 |   return value;
  148 | }
  149 | 
  150 | function invokeHasPng(result: InvokeResult): boolean {
  151 |   const data = result.data;
  152 |   if (!data) return false;
  153 |   const mime = data.mime ?? data.mediaType;
  154 |   const dataUrl = typeof data.dataUrl === "string" ? data.dataUrl : "";
  155 |   const raw =
  156 |     typeof data.base64 === "string" && data.base64.length > 0
  157 |       ? data.base64
  158 |       : dataUrl.includes(",")
  159 |         ? dataUrl.slice(dataUrl.indexOf(",") + 1)
  160 |         : "";
  161 |   const mimeOk = mime === "image/png" || dataUrl.startsWith("data:image/png");
  162 |   if (!mimeOk || raw.length < 32) return false;
  163 |   const bytes = Buffer.from(raw, "base64");
  164 |   return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  165 | }
  166 | 
  167 | async function openSeededPtDesign(page: Page, ptx = SEEDED_PTX): Promise<void> {
  168 |   await seedOnboardingComplete(page);
  169 |   await page.addInitScript(
  170 |     ({ key, ptx: source }) => {
  171 |       try {
  172 |         window.localStorage.setItem(key, JSON.stringify({ ptx: source }));
  173 |       } catch {
  174 |         // ignore quota / private-mode failures
  175 |       }
  176 |     },
  177 |     { key: PT_DESIGN_STORAGE_KEY, ptx },
  178 |   );
  179 |   const response = await page.goto("/pt-design?design=global", { waitUntil: "domcontentloaded" });
  180 |   expect(response, "missing navigation response for /pt-design").not.toBeNull();
  181 |   expect(response!.status(), `unexpected status for /pt-design`).toBeLessThan(500);
  182 | 
  183 |   await expect(
  184 |     page.getByTestId("pt-design-center"),
  185 |     "PT Design host panel did not mount",
  186 |   ).toBeVisible({ timeout: 60_000 });
  187 |   const board = page.getByTestId("pt-design-board");
  188 |   const mode = page.getByTestId("pt-design-mode");
  189 |   try {
  190 |     await expect(board).toBeVisible({ timeout: 60_000 });
  191 |     await expect(mode).toBeVisible({ timeout: 15_000 });
  192 |   } catch (error) {
  193 |     const title = await page.title().catch(() => "(title unavailable)");
  194 |     const body = await page
  195 |       .locator("body")
  196 |       .innerText()
  197 |       .catch(() => "(body unavailable)");
  198 |     throw new Error(
  199 |       `PT Design board/mode did not hydrate after onboarding seed. title=${title} body=${body.slice(0, 500)}`,
  200 |       { cause: error },
  201 |     );
  202 |   }
  203 | 
  204 |   const storedRaw = await page.evaluate((key) => window.localStorage.getItem(key), PT_DESIGN_STORAGE_KEY);
  205 |   let storedPtx = "";
  206 |   try {
  207 |     const parsed = JSON.parse(storedRaw ?? "") as { ptx?: unknown };
  208 |     storedPtx = typeof parsed.ptx === "string" ? parsed.ptx : "";
  209 |   } catch {
  210 |     storedPtx = "";
  211 |   }
  212 |   expect(storedPtx, "seeded PTX missing from pt-design/v2/global").toContain('id="run"');
  213 |   await expect(page.locator('[data-pt-overlay-origin="canvas"]')).toBeAttached({ timeout: 15_000 });
  214 |   try {
  215 |     await expect(page.locator('[data-pt-overlay-id="run"]')).toBeVisible({ timeout: 30_000 });
  216 |   } catch (error) {
  217 |     const overlayIds = await page.locator("[data-pt-overlay-id]").evaluateAll((els) =>
  218 |       els.map((el) => el.getAttribute("data-pt-overlay-id")),
  219 |     );
  220 |     throw new Error(
  221 |       `Seeded PTX did not project overlay nodes. overlayIds=${JSON.stringify(overlayIds)} ptxHasRun=${storedPtx.includes('id="run"')}`,
  222 |       { cause: error },
  223 |     );
  224 |   }
  225 |   await expect
```