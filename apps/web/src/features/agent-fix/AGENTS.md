# Agent Fix Feature

Reusable Web/Desktop Agent Fix controls live here because they depend on agent,
terminal, and source-feature contracts. Keep prompt builders source-owned when
they need domain data from diff, GitHub PRs, or GitHub Actions.

Do not move these components into `shared/` unless they no longer import agent
or terminal feature APIs.
