---
name: atmos-web-app-deploy
description: Deploy the Atmos web app (`apps/web`) to Cloudflare Pages for this repository. Use when the user asks to deploy `app.atmos.land`, publish the web app, or create and push a `deploy-web-app-*` deployment tag.
user-invokable: true
args:
  - name: tag_name
    description: Deployment tag to create and push, for example `deploy-web-app-20260518`
    required: false
  - name: dry_run
    description: Preview the deployment steps without creating or pushing a tag
    required: false
---

Deploy `apps/web` to Cloudflare Pages using the repository-standard GitHub tag flow.

## Source of truth

- `apps/web/wrangler.jsonc`
- `scripts/pages/build-pages-web.mjs`
- `scripts/pages/README.md`
- `.github/workflows/deploy-web-app-pages.yml`

## Deployment rule

- production deploys happen by pushing a tag that matches `deploy-web-app-*`
- the Pages deployment is always targeted at the production branch `main`

Do not use any other GitHub deployment path.

## Dry run

If `dry_run=true`:

1. do not create or push the tag
2. report the exact build, tag, and push commands
3. report any missing prerequisites

## Preconditions

Before a real deployment, confirm:

- you are in the Atmos repository
- `apps/web/wrangler.jsonc` still targets the correct Pages project
- the user intends to deploy the current code state
- GitHub auth exists for tag pushes

## Standard flow

1. inspect git status for unexpected local changes
2. run:

```bash
bun run build:web:pages
```

3. choose a tag matching:

```text
deploy-web-app-*
```

Examples:

- `deploy-web-app-20260518`
- `deploy-web-app-homepage-refresh`
- `deploy-web-app-abc1234`

4. create and push the tag
5. monitor the workflow run triggered by that tag

## Never do these things

- never deploy production on every `main` push
- never change the Pages project name without confirming with the user
- never invent a semver release process for the web app
- never create a deployment tag that does not match `deploy-web-app-*`
- never switch to direct local deployment as a substitute

## Quick reference

```bash
bun run build:web:pages
git tag deploy-web-app-20260518
git push origin deploy-web-app-20260518
gh run list --workflow deploy-web-app-pages.yml --limit 5
gh run watch <run-id>
```
