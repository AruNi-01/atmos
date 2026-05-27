# Brainstorm · APP-018: GitHub Automation Triggers

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-017 makes Automations a local-per-Computer object with manual and scheduled triggers. Users also want event-driven automations: run an agent when a pull request opens, when a PR comment is added, when a GitHub Actions workflow fails, or when code is pushed to a branch. GitHub cannot deliver webhooks to a local-only `localhost` Atmos Server, so this capability must cross the network boundary introduced by APP-016 Atmos Computer and the relay.

The core tension is product fit: Atmos stays local-first for execution and artifacts, but external systems need a stable public ingress. The right boundary is for Relay to receive and route external events while the selected Atmos Computer remains the execution owner.

## Goals (draft)

- Let users create GitHub-triggered automations from the same Automations setup flow.
- Keep automation definitions, prompts, run artifacts, and terminal execution local to the target Atmos Computer.
- Use a GitHub App for production-grade webhook delivery, repository selection, installation identity, and future GitHub API access.
- Make Relay an external event ingress and routing layer, not a hosted automation runner.
- Make the Relay requirement explicit for users who only run Atmos locally.

## Options

### Option A - Repository webhook MVP

Users manually add a repository webhook pointing at an Atmos Relay URL. The Relay validates the webhook secret, matches the event to an automation route, and dispatches it to the target Computer.

**Pros**: Fastest to build; no GitHub App registration flow; useful for internal dogfood.
**Cons**: Per-repo manual setup; requires repository admin access; weak install/repo UX; hard to support organizations cleanly.
**Unknown**: Whether users would tolerate manual webhook setup for a feature that appears inside the Automations UI.

### Option B - Official Atmos GitHub App

Atmos operates one production GitHub App and one development/staging App. Users install the App on selected repositories. GitHub sends App webhooks to Relay; Relay uses installation and repository metadata to match routes and dispatch to the selected Atmos Computer.

**Pros**: Best product UX; supports selected repositories, organization installs, clear permissions, installation identity, and future GitHub API reads; closest to the menu-style trigger picker users expect.
**Cons**: Requires App registration, private key/secret operations, setup callback flow, D1 schema, and Relay webhook handling.
**Unknown**: Whether first version needs installation-token API calls beyond validating installation and listing repositories.

### Option C - Local GitHub polling trigger

For users who do not connect Relay, Atmos polls GitHub via local `gh` CLI every N minutes and starts automations when it observes new PRs, comments, pushes, or workflow results.

**Pros**: Fully local; no Relay registration; reuses APP-005 `gh` assumptions.
**Cons**: Delayed, rate-limited, state-heavy, brittle for comments/workflow events, and likely to expand APP-017 scheduler complexity.
**Unknown**: Whether local-only users value event triggers enough to accept delayed polling semantics.

## Key forks in the road

- **GitHub App vs manual repository webhooks**: Choose GitHub App for the product path. Manual webhooks may remain a dev/internal escape hatch.
- **Relay required vs local fallback**: GitHub webhook triggers require Relay. Local polling can be a later distinct trigger type, not the v1 behavior.
- **Queued offline delivery vs missed offline delivery**: Prefer missed/offline in v1 to match APP-017's no-catch-up scheduled semantics. Add short TTL replay later only if users need it.
- **Relay owns routes vs local Computer owns routes**: Store routing metadata in Relay D1 so webhook dispatch can work while the UI is closed. Store the complete automation definition locally.
- **Webhook payload as prompt vs structured event context**: Treat webhook payload as untrusted input. Generate a structured event context for the local runner instead of directly injecting raw payload text as instructions.
- **GitHub-specific identity vs Relay tenant identity**: Reuse the same stable Relay tenant identity that owns registered Computers. APP-019 owns Access Token rotation; APP-018 must not introduce a GitHub-specific Atmos identity.

## Open questions

- [x] Should v1 expose GitHub triggers only when the current Computer is already registered to Relay, or allow saving a disabled `needs_setup` trigger before registration? Settled: allow local save as disabled `needs_setup`, but do not activate external delivery until Relay registration, GitHub installation, and route sync are complete.
- [x] Which first event set is small enough? Settled: pull request, issue comment on PRs, push, and GitHub Actions `workflow_run.completed`.
- [x] Does Relay need to list repositories through installation tokens in v1? Settled: yes, repository choices come from GitHub App installation scope.
- [x] Should the App request user OAuth during install, or rely only on installation identity for v1? Settled: request GitHub user authorization during App installation and bind through a short-lived Relay setup session.
- [ ] Should repeated events while the same automation is running be visible in local run history as skipped non-runs, or only in Relay delivery logs?
- [ ] What exact UI copy should warn that overlapping routes may intentionally start multiple automations?

## References

- Existing code: `packages/relay/`, `apps/api/src/relay/`, `crates/core-service/src/service/automation/`, `apps/web/src/features/automations/`
- Related specs: [APP-016 Atmos Computer](../APP-016_atmos-computer/TECH.md), [APP-017 Atmos Automations](../APP-017_atmos-automations/TECH.md), [APP-005 GitHub Integration](../APP-005_github-integration/PRD.md)
- External: [GitHub App registration](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app), [GitHub App webhooks](https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps), [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

## Ready to promote

- Promote to PRD: GitHub webhook triggers require an Atmos Relay-connected Computer; manual and scheduled triggers remain local-only.
- Promote to PRD: The production path is an official Atmos GitHub App installed by the user on selected repositories.
- Promote to PRD: Relay routes and deduplicates events but does not run automations or store prompts/results.
- Promote to PRD: Users may save incomplete GitHub-triggered automations as disabled `needs_setup` definitions.
- Promote to TECH: Add a Relay external event ingress domain beside the existing Computer connectivity domain.
- Promote to TECH: Add short-lived Relay setup sessions, GitHub OAuth callback binding, local `github` trigger config, and Relay D1 route rows keyed by installation/repository/event/action/server/automation.
- Promote to TEST: Cover signature validation, route matching, offline Computer handling, duplicate delivery idempotency, and untrusted comment payload handling.
