# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs/APP-043_workspace-surface-cache.e2e.ts >> APP-043 workspace surface cache >> @stateful keeps prior workspace frame warm when switching contexts
- Location: tests/specs/APP-043_workspace-surface-cache.e2e.ts:40:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "warm:true|active:false"
Received: "missing|active:false"

Call Log:
- Timeout 45000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e7]:
    - banner [ref=f2e8]:
      - generic [ref=f2e9]:
        - generic [ref=f2e10]:
          - button "Collapse left sidebar" [ref=f2e11]
          - button "Go back" [ref=f2e14]
          - button "Go forward" [ref=f2e17]
          - button "Refresh page" [ref=f2e20]
        - generic [ref=f2e26]:
          - button "Open O" [ref=f2e27]:
            - generic: Open
            - generic: O
          - button [ref=f2e29]
      - generic [ref=f2e34]:
        - generic [ref=f2e35]:
          - status "Unable to compare the remote branch with origin/main" [ref=f2e36]
          - button "atmos/e2e/app043-warm-b-mu9xxm0h" [ref=f2e41] [cursor=pointer]
        - button "origin/ main" [ref=f2e48] [cursor=pointer]:
          - generic [ref=f2e49]: origin/
          - generic [ref=f2e50]: main
      - generic [ref=f2e54]:
        - button "Search" [ref=f2e55] [cursor=pointer]:
          - generic [ref=f2e59]: Search...
          - generic: K
        - button "Open workspace summary" [ref=f2e60]
        - button "Usage" [ref=f2e64]
    - generic [ref=f2e69]:
      - complementary [ref=f2e72]:
        - generic [ref=f2e73]:
          - generic [ref=f2e74]:
            - button "Launchpad" [ref=f2e75] [cursor=pointer]
            - generic [ref=f2e84]:
              - button "Workspaces" [ref=f2e86]
              - button "Terminals" [ref=f2e92]
              - button "Agent Chat" [ref=f2e97]
              - button "Disk Analyzer" [ref=f2e103]
              - button "Token Usage" [ref=f2e108]
              - button "Canvas" [ref=f2e115]
              - button "Prototype Design" [ref=f2e124]
              - button "Task" [ref=f2e136]
              - button "Agent Sessions" [ref=f2e142]
          - navigation "Launchpad" [ref=f2e149]:
            - button "Skills" [ref=f2e151]
            - button "Automations" [ref=f2e157]
            - button "New Workspace" [ref=f2e164]
          - generic: Move here to hide this feature
        - generic [ref=f2e171]:
          - generic [ref=f2e173]:
            - generic [ref=f2e175]:
              - button "Atmos E2E" [ref=f2e176] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - generic [ref=f2e183]:
              - button "APP-043 Warm B mu9xxm0h" [ref=f2e185] [cursor=pointer]
              - button "machop" [ref=f2e195] [cursor=pointer]
          - generic [ref=f2e205]:
            - generic [ref=f2e207]:
              - button "Atmos E2E" [ref=f2e208] [cursor=pointer]
              - generic:
                - generic:
                  - button
                  - button
            - button "vaporeon" [ref=f2e217] [cursor=pointer]
        - generic [ref=f2e227]:
          - button "Add Project" [ref=f2e229]
          - generic [ref=f2e233]:
            - button [ref=f2e234]
            - button "Open settings" [ref=f2e237]
      - separator [ref=f2e242]
      - generic [ref=f2e244]:
        - main [ref=f2e247]:
          - generic [ref=f2e248]:
            - generic [ref=f2e254]:
              - generic [ref=f2e256]:
                - tablist [ref=f2e258]:
                  - button "New tab" [ref=f2e261]
                - button "Open tab groups" [ref=f2e265]
              - generic [ref=f2e269]:
                - button "Overview" [ref=f2e270]
                - button "Terminal" [ref=f2e278]
                - button "Chat" [ref=f2e284]
                - button "Markdown" [ref=f2e290]
                - button "Browser" [ref=f2e296]
                - button "Files" [ref=f2e302]
                - button "Changes" [ref=f2e310]
                - button "Review" [ref=f2e317]
                - button "Run" [ref=f2e322]
                - button "GitHub" [ref=f2e327]
                - button "Prototype Design" [ref=f2e333]
                - button "Simulator" [ref=f2e343]
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - generic: atmos/e2e/app043-warm-b-mu9xxm0h
                              - button:
                                - generic: .../workspaces/atmos-e2e/e2e-app043-warm-b-mu9xxm0h
                          - heading [level=1]: APP-043 Warm B mu9xxm0h
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
                            - generic:
                              - generic: Status
                              - button:
                                - generic: In Progress
                            - generic:
                              - generic: Priority
                              - button:
                                - generic: No priority
                            - generic:
                              - generic: Labels
                              - button:
                                - generic: Add labels
                          - generic:
                            - generic: Created
                            - generic: Sep 20, 2026 • 14:57:51
                          - generic:
                            - heading [level=3]: Code reviews
                            - generic:
                              - generic:
                                - heading [level=3]: No code reviews yet
                                - paragraph: Reports will appear here after reviews.
                          - generic:
                            - heading [level=3]: Pull requests
                            - generic: No open PRs found
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
        - contentinfo [ref=f2e348]:
          - generic [ref=f2e349]:
            - 'button "Resource Monitor: CPU 96% · Memory 17%" [ref=f2e350]':
              - generic [ref=f2e353]: Monitor
            - button "Local 0" [ref=f2e356]
          - generic [ref=f2e361]:
            - button "Napping ~" [ref=f2e362] [cursor=pointer]:
              - generic [ref=f2e363]:
                - generic [ref=f2e364]:
                  - generic [ref=f2e368]: z
                  - generic [ref=f2e369]: z
                  - generic [ref=f2e370]: z
                - generic [ref=f2e371]: Napping ~
            - button "Open Chat" [ref=f2e373]:
              - generic [ref=f2e377]: Chat
  - alert [ref=f2e378]
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
  - generic:
    - region "Notifications"
```

# Test source

```ts
  91  |               return;
  92  |             }
  93  |             finish(
  94  |               (v) => reject(v as Error),
  95  |               new Error(message.payload?.message ?? `failed ${action}`),
  96  |             );
  97  |           });
  98  |           socket.addEventListener("error", () => {
  99  |             finish((v) => reject(v as Error), new Error(`ws error ${action}`));
  100 |           });
  101 |         });
  102 |       }
  103 | 
  104 |       const projects = await wsRequest<Array<{ guid: string }>>("project_list", {});
  105 |       const project = projects[0];
  106 |       if (!project) throw new Error("no project for APP-043 e2e");
  107 | 
  108 |       let workspaces = await wsRequest<
  109 |         Array<{ guid: string; is_archived?: boolean | null; display_name?: string | null }>
  110 |       >("workspace_list", {
  111 |         project_guid: project.guid,
  112 |       });
  113 | 
  114 |       let first = workspaces.find((w) => !w.is_archived) ?? workspaces[0] ?? null;
  115 |       if (!first) throw new Error("no workspace A");
  116 | 
  117 |       let second =
  118 |         workspaces.find((w) => w.guid !== first!.guid && !w.is_archived) ?? null;
  119 |       if (!second) {
  120 |         const stamp = Date.now().toString(36);
  121 |         const branch = `e2e/app043-warm-b-${stamp}`;
  122 |         await wsRequest("workspace_create", {
  123 |           project_guid: project.guid,
  124 |           name: branch,
  125 |           display_name: `APP-043 Warm B ${stamp}`,
  126 |           branch,
  127 |           base_branch: null,
  128 |           sidebar_order: 1,
  129 |           initial_requirement: null,
  130 |           github_issue: null,
  131 |           github_pr: null,
  132 |           auto_extract_todos: false,
  133 |           priority: "no_priority",
  134 |           workflow_status: "in_progress",
  135 |           label_guids: null,
  136 |           attachments: [],
  137 |         });
  138 |         workspaces = await wsRequest("workspace_list", {
  139 |           project_guid: project.guid,
  140 |         });
  141 |         second =
  142 |           workspaces.find((w) => w.guid !== first!.guid && !w.is_archived) ?? null;
  143 |       }
  144 |       if (!second) throw new Error("no workspace B");
  145 |       return { a: first.guid, b: second.guid };
  146 |     }, apiPort);
  147 | 
  148 |     expect(pair.a).not.toBe(pair.b);
  149 | 
  150 |     const origin = new URL(page.url()).origin;
  151 |     // Initial load of A may use full navigation (cold start).
  152 |     await gotoContextRoute(
  153 |       page,
  154 |       withSearchParams(`${origin}/workspace?id=${pair.a}`, { tab: "terminal" }),
  155 |       { locale: "en" },
  156 |     );
  157 | 
  158 |     await expect
  159 |       .poll(
  160 |         async () =>
  161 |           page.evaluate(() =>
  162 |             document.querySelectorAll("[data-workspace-frame]").length > 0
  163 |               ? "ok"
  164 |               : "none",
  165 |           ),
  166 |         { timeout: 45_000 },
  167 |       )
  168 |       .toBe("ok");
  169 | 
  170 |     // Soft switch A → B (preserves Zustand warm cache)
  171 |     await softOpenWorkspace(page, pair.b);
  172 | 
  173 |     await expect
  174 |       .poll(
  175 |         async () =>
  176 |           page.evaluate(
  177 |             ({ aId, bId }) => {
  178 |               const read = (id: string) => {
  179 |                 const el = document.querySelector(`[data-workspace-frame="${id}"]`);
  180 |                 if (!el) return "missing";
  181 |                 // Warm frames use data-tier + visibility (not HTML hidden) so
  182 |                 // xterm WebGL is not discarded on hop.
  183 |                 return `${el.getAttribute("data-tier") ?? "?"}:${el.getAttribute("aria-hidden") ?? "?"}`;
  184 |               };
  185 |               return `${read(aId)}|${read(bId)}`;
  186 |             },
  187 |             { aId: pair.a, bId: pair.b },
  188 |           ),
  189 |         { timeout: 45_000 },
  190 |       )
> 191 |       .toBe("warm:true|active:false");
      |        ^ Error: expect(received).toBe(expected) // Object.is equality
  192 | 
  193 |     // Soft switch B → A
  194 |     await softOpenWorkspace(page, pair.a);
  195 | 
  196 |     await expect
  197 |       .poll(
  198 |         async () =>
  199 |           page.evaluate(
  200 |             ({ aId, bId }) => {
  201 |               const read = (id: string) => {
  202 |                 const el = document.querySelector(`[data-workspace-frame="${id}"]`);
  203 |                 if (!el) return "missing";
  204 |                 return `${el.getAttribute("data-tier") ?? "?"}:${el.getAttribute("aria-hidden") ?? "?"}`;
  205 |               };
  206 |               return `${read(aId)}|${read(bId)}`;
  207 |             },
  208 |             { aId: pair.a, bId: pair.b },
  209 |           ),
  210 |         { timeout: 45_000 },
  211 |       )
  212 |       .toBe("active:false|warm:true");
  213 |   });
  214 | });
  215 | 
```