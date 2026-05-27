# TEST · APP-018: GitHub Automation Triggers

> Test Plan · how we verify GitHub events can trigger local Atmos Automations through Relay. References PRD APP-018 and TECH APP-018.

## Test strategy

- **Unit / integration**: Relay webhook signature validation, event normalization, route matching, dedupe, and local trigger validation should be covered without real GitHub network calls.
- **Service-level**: `AutomationService::handle_external_trigger` should be tested with fake repositories/automation rows and no real tmux agent execution when possible.
- **End-to-end**: One scripted staging path should cover GitHub App webhook -> Relay -> online Computer -> automation run start -> run history attribution.
- **Manual-only**: GitHub App installation and organization permission prompts require a real GitHub account/org and should be manually verified before production rollout.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1 |
| M2 | S2, S3 |
| M3 | S3, S4 |
| M4 | S5 |
| M5 | S6, S7, S8, S9 |
| M6 | S6, S7, S8, S9 |
| M7 | S10, S15 |
| M8 | S11, S12 |
| M9 | S6, S10 |
| M10 | S16 |
| M11 | S14, S17 |
| M12 | S15 |
| M13 | S15 |
| M14 | S18 |
| M15 | S12 |
| M16 | S2, S21 |
| M17 | S22 |

## Scenarios

### S1 - Trigger picker exposes GitHub

- **Level**: Frontend integration
- **Given**: the Automations setup page is open.
- **When**: the user opens trigger selection.
- **Then**: `GitHub` appears as a trigger type alongside manual/scheduled options.
- **Signals**: trigger option visible; selecting it switches to GitHub setup state without losing current automation instructions.

### S2 - Local-only Computer shows Relay requirement

- **Level**: Frontend integration
- **Given**: the current Computer has no Relay registration.
- **When**: the user selects GitHub trigger.
- **Then**: the UI explains that GitHub webhooks require connecting this Computer to Atmos Relay and offers the existing registration path.
- **Signals**: setup-required panel visible; save stores a disabled `needs_setup` automation or enable is blocked; no route mutation request is sent.

### S3 - Relay connected but GitHub App missing

- **Level**: Frontend integration
- **Given**: the current Computer is registered to Relay, but no GitHub installation exists for the tenant.
- **When**: the user selects GitHub trigger.
- **Then**: the UI shows an install/connect action for the official Atmos GitHub App.
- **Signals**: `automation_github_status` response drives an install state; `automation_github_setup_session` is requested only after user action.

### S4 - GitHub App setup callback binds installation through OAuth state

- **Level**: Relay integration
- **Given**: Relay created a short-lived setup session for a tenant/server and GitHub redirects to Relay callback with `code`, `installation_id`, and `state`.
- **When**: Relay handles the callback.
- **Then**: Relay validates the one-time setup state, exchanges the GitHub OAuth code, verifies the installation through GitHub App authentication, and binds it to the tenant/server.
- **Signals**: `github_setup_sessions.used_at` is set; `github_app_installations` row exists; reused/expired state and spoofed installation id are rejected; no raw private key or token appears in logs.

### S5 - Repository selection is limited to installation scope

- **Level**: Relay/API integration
- **Given**: an installation grants access to repositories A and B.
- **When**: the UI asks for repositories.
- **Then**: only A and B are returned as selectable.
- **Signals**: repository list response contains expected ids/full names; requesting a route for repository C fails validation.

### S6 - Pull request opened triggers a run

- **Level**: End-to-end staging
- **Given**: a GitHub trigger is enabled for `pull_request.opened` on `owner/repo`, and the target Computer is online.
- **When**: GitHub sends a signed `pull_request` webhook with action `opened`.
- **Then**: Relay matches the route and the local Computer starts exactly one automation run.
- **Signals**: delivery row status becomes `accepted` after local ack; local run row has `trigger_kind = "github"`; run history shows repository and PR link.

### S7 - PR comment filter matches only intended comments

- **Level**: Service-level / Relay integration
- **Given**: a route filters PR comments by text `/atmos review` and sender `alice`.
- **When**: comments arrive from different users and with different text.
- **Then**: only matching comments dispatch an event.
- **Signals**: matching delivery becomes `accepted`; non-matching events create no route-level dispatch; no local run starts for non-matches.

### S8 - Push branch filter supports exact and simple glob

- **Level**: Unit / Relay integration
- **Given**: routes for branch `main` and `release/*`.
- **When**: push events arrive for `main`, `release/1.2`, and `feature/foo`.
- **Then**: first two match their routes and `feature/foo` does not.
- **Signals**: route matcher returns expected route ids.

### S9 - Failed workflow completion triggers a run

- **Level**: Relay integration
- **Given**: a route is configured for GitHub Actions `workflow_run.completed` with failure.
- **When**: GitHub sends `workflow_run` completed events with `success`, `failure`, and `cancelled`.
- **Then**: only failure triggers the route.
- **Signals**: normalized event conclusion is parsed; matcher filters by conclusion.

### S10 - Local automation definition remains source of truth

- **Level**: Service-level
- **Given**: Relay dispatches a valid route event for an automation with `trigger_enabled = false` or `trigger_status != "active"`.
- **When**: `AutomationService::handle_external_trigger` receives the event.
- **Then**: the service rejects it and does not start a run.
- **Signals**: no run row is created; warning/error code is logged; ack reports `local_rejected`.

### S11 - Relay route stores no instructions or artifacts

- **Level**: Relay unit / migration test
- **Given**: a route is created for an automation.
- **When**: D1 route rows are inspected.
- **Then**: only route metadata is stored; no automation instructions, prompt text, final output, or raw model content is present.
- **Signals**: route schema columns and serialized filters exclude sensitive local fields.

### S12 - Route cleanup on automation disable/delete

- **Level**: API/service integration
- **Given**: an enabled GitHub-triggered automation with a Relay route.
- **When**: the automation is disabled or deleted.
- **Then**: the matching Relay route is disabled or removed.
- **Signals**: route mutation request succeeds; subsequent webhook deliveries do not start a run.

### S13 - Webhook signature validation rejects invalid requests

- **Level**: Relay unit
- **Given**: a GitHub webhook request with a missing or invalid `X-Hub-Signature-256`.
- **When**: Relay receives it.
- **Then**: Relay rejects it before route matching or persistence.
- **Signals**: HTTP status is non-2xx; no delivery row is written; logs contain no raw body.

### S14 - Duplicate delivery does not duplicate runs

- **Level**: Relay + service integration
- **Given**: GitHub sends the same `X-GitHub-Delivery` twice for the same route.
- **When**: both requests are processed.
- **Then**: only the first request dispatches to the Computer.
- **Signals**: delivery table has one primary row keyed by `delivery_id + route_id`; second request increments duplicate tracking without changing the accepted delivery; local run count is one.

### S15 - GitHub event context is attached to the run

- **Level**: Service-level
- **Given**: a valid GitHub trigger event with PR URL, sender, and comment excerpt.
- **When**: the automation run prompt/context is generated.
- **Then**: the run includes structured GitHub context and marks user-authored text as untrusted.
- **Signals**: `prompt.md` contains trigger metadata and an untrusted-content warning; raw webhook payload is not copied wholesale.

### S16 - Offline Computer records missed delivery

- **Level**: Relay integration
- **Given**: a matching route targets a registered but offline Computer.
- **When**: GitHub sends a matching webhook.
- **Then**: Relay records the delivery as `missed_offline` and does not queue a replay in v1.
- **Signals**: delivery row status is `missed_offline`; no dispatch envelope is sent later when the Computer reconnects.

### S17 - Overlapping route behavior is deterministic

- **Level**: Relay integration
- **Given**: two enabled automations match the same GitHub event.
- **When**: that event arrives.
- **Then**: Relay dispatches one delivery per matching route, with independent dedupe.
- **Signals**: two delivery rows with the same delivery id and different route ids; two local run attempts.

### S18 - Run history shows GitHub attribution

- **Level**: Frontend integration
- **Given**: a run was created from a GitHub trigger.
- **When**: the user opens automation run history.
- **Then**: the row/detail shows GitHub trigger source, repository, event action, and source link when available.
- **Signals**: visible GitHub label; source URL opens through the existing runtime opener.

### S19 - Running automation prevents duplicate concurrent run

- **Level**: Service-level
- **Given**: an automation already has a `running` run.
- **When**: a matching GitHub event arrives.
- **Then**: v1 skips or rejects the event without creating a second concurrent run for the same automation.
- **Signals**: run count remains unchanged; delivery ack indicates `local_rejected`.

### S20 - Production App permission smoke test

- **Level**: Manual
- **Given**: the production Atmos GitHub App is installed on a test repository with selected repositories only.
- **When**: PR, comment, push, and workflow events are performed.
- **Then**: GitHub delivers events for subscribed permissions and does not require write permissions.
- **Signals**: GitHub App delivery page shows successful webhook deliveries; Atmos delivery log receives expected event families.

### S21 - Incomplete setup saves disabled automation

- **Level**: API/service integration
- **Given**: the user saves a GitHub-triggered automation while GitHub App setup or Relay route sync is incomplete.
- **When**: local automation creation succeeds but route sync is not active.
- **Then**: the automation remains saved locally but cannot be triggered by GitHub.
- **Signals**: `trigger_enabled = false`; `trigger_status = "needs_setup"`; header/setup UI offers a retry action; no incoming webhook can start a run until route sync activates the trigger.

### S22 - Access Token switch does not transfer GitHub routes

- **Level**: Relay/API/service integration
- **Given**: a Computer and GitHub-triggered automation were configured under Access Token A.
- **When**: the local user replaces the Access Token with Token B without using a rotation flow.
- **Then**: Relay treats Token B as a different tenant, and APP-018 does not transfer installations or routes from Token A.
- **Signals**: `automation_github_status` under Token B cannot see Token A installations/routes; the local automation is marked `trigger_enabled = false` and `trigger_status = "needs_setup"`; route mutation with Token B cannot disable or claim Token A's route; a rotation request authorized by Token A preserves the existing tenant rows.

## Performance & load budgets

- Webhook validation, persistence, and route matching should return a 2xx response to GitHub within 2 seconds at p95 for a tenant with 1,000 routes.
- Route matching should use indexed D1 queries and should not scan all tenant routes for every delivery.
- Relay should cap stored text excerpts to a small fixed length, such as 4 KB per delivery context.
- Duplicate delivery checks should be O(1) on `delivery_id + route_id`.

## Regression checklist

- [ ] GitHub webhook secret, App private key, installation tokens, and Atmos Access Tokens are never logged.
- [ ] Invalid signatures do not write delivery rows.
- [ ] Duplicate GitHub deliveries do not start duplicate local runs.
- [ ] One GitHub delivery can intentionally produce one run per matching route.
- [ ] Offline Computers do not receive delayed surprise runs after reconnect.
- [ ] Disabling/deleting an automation prevents future route dispatch.
- [ ] User-authored GitHub text is marked untrusted in prompt context.
- [ ] Manual and scheduled APP-017 automations still work without Relay.
- [ ] Relay route mutations verify tenant ownership of `server_id`.
- [ ] Setup sessions are single-use, short-lived, and bound to tenant plus `server_id`.
- [ ] Route/control-plane mutations use the user's Atmos Relay Access Token, not `server_secret`.
- [ ] Replacing the local Access Token is treated as an identity switch, while authorized token rotation preserves existing Computers and GitHub routes.

## Acceptance criteria

- [ ] All Must Have PRD items M1-M17 have at least one implemented and passing scenario.
- [ ] Relay webhook handler validates signature before parsing or persisting.
- [ ] Route matching, dedupe, and offline delivery status are covered by automated tests.
- [ ] Local `AutomationService` revalidates trigger enabled/status and route id before starting a run.
- [ ] Frontend clearly blocks or disables GitHub trigger enablement when Relay/GitHub setup is incomplete.
- [ ] Frontend clearly shows `needs_setup` when the current Access Token cannot manage the stored GitHub route.
- [ ] GitHub-triggered run history includes source attribution.
- [ ] Existing automation regression suite remains green.
- [ ] Relay deployment docs include required GitHub App secrets and D1 migrations.

## Manual verification steps

1. Install `Atmos Dev` GitHub App on a staging repository with selected repository access.
2. Register a local or VPS Atmos Computer with staging Relay.
3. Create a GitHub-triggered automation for `pull_request.opened`.
4. Open a PR in the staging repository.
5. Confirm GitHub App delivery succeeds in GitHub's delivery UI.
6. Confirm Relay delivery status is `accepted`.
7. Confirm the target Computer creates a run and run history shows GitHub attribution.
8. Disable the automation and repeat the event; confirm no new run starts.
9. Stop the target Computer and repeat the event; confirm delivery is recorded as missed/offline and is not replayed after reconnect.

## Non-coverage

- GitHub Enterprise Server behavior is not covered in v1.
- GitLab and other providers are not covered in v1.
- Marketplace billing/install purchase flows are not covered.
- Long-term offline replay semantics are not covered because v1 intentionally records missed/offline only.
