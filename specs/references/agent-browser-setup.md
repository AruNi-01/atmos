# Agent Browser Setup

> Optional local-tool setup for spec verification. Read this only when a `TEST.md` or `atmos-specs-test-run` pass asks for `agent-browser` exploratory checks and the current machine does not have a working Agent Browser CLI / skill.

Agent Browser is an external browser automation CLI for AI agents. Official docs:

- https://agent-browser.dev/
- https://agent-browser.dev/installation
- https://agent-browser.dev/skills

### Check Existing Install

```bash
command -v agent-browser
agent-browser --version
agent-browser doctor --offline --quick
```

If the CLI exists but browser automation fails, run:

```bash
agent-browser doctor
```

Use `agent-browser doctor --fix` only when the user approves destructive repair actions.

### Install CLI

Preferred global install:

```bash
npm install -g agent-browser
agent-browser install
```

macOS Homebrew alternative:

```bash
brew install agent-browser
agent-browser install
```

No-install / temporary fallback:

```bash
npx agent-browser install
npx agent-browser open example.com
```

Linux dependency helper:

```bash
agent-browser install --with-deps
```

### Install Agent Skill

Install the discovery skill for coding agents:

```bash
npx skills add vercel-labs/agent-browser
```

Before browser work, load current CLI-served instructions:

```bash
agent-browser skills get core --full
```

This is important because the installed discovery skill intentionally delegates detailed usage to the CLI so instructions match the installed `agent-browser` version.

### Minimal Smoke Check

```bash
agent-browser open http://127.0.0.1:3030
agent-browser snapshot -i
agent-browser screenshot /tmp/agent-browser-smoke.png
agent-browser close
```

If the app is not running, use a public static target:

```bash
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser close
```

### Recording Setup Gaps

If setup cannot be completed in the current session, do not fake a browser result. Record the check in `TEST.md` `Coverage Status` as:

```markdown
- Exploratory agent-browser — not_run: `agent-browser` CLI/skill unavailable; see `specs/references/agent-browser-setup.md`.
```
