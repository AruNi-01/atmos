# Brainstorm · APP-060: Vendor serve-sim

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos should let a Desktop user open the **local iOS Simulator** inside a workspace, the same way they already open a terminal or browser. A prior attempt (workspace-simulator / APP-060 on a dirty branch, never on `main`) mixed three concerns and then painted its own phone chrome:

- Probe Xcode / `simctl` / devices.
- Drive HID and draw an MJPEG canvas inside an Atmos-designed device shell.
- Bundle `@expo/serve-sim` as Node + `.node` under `Atmos.app/Contents/Resources` and load it with `ELECTRON_RUN_AS_NODE`.

That path is ugly and brittle. Upstream [serve-sim](https://github.com/EvanBacon/serve-sim) (Apache-2.0; current npm pin `@expo/serve-sim@0.1.37` on `expo/serve-sim`) already ships a full preview page: device list, Home, rotate, tap, AX tree. We should **vendor that source, compile a real binary, download it on demand, and iframe the preview**.

The old spec refused to embed the preview because:

1. The preview exposes a token-gated **`/exec` shell** on the host.
2. The payload was Node + a native addon that had to `dlopen` inside Electron.

Both constraints change if we **bind loopback** and **exec a standalone binary** from `~/.atmos` instead of bundling it in the app. `/exec` stays as serve-sim shipped it.

Hosted `app.atmos.land` talks to a cloud Computer. It cannot start Simulator.app on the user's Mac. First ship is **Atmos Desktop on the same Mac as Xcode**.

## Goals (draft)

- Inherit: local iOS Simulator, Desktop entry, setup cards that name the missing step, one device per workspace.
- Overturn: D2 (Atmos-drawn phone shell / MJPEG canvas / home-made HID bar), D3 (helper inside `Contents/Resources`), and the rule “never embed the preview page”.
- Atmos owns probe, download, start, stop, embed, disconnect. serve-sim owns the picture and the controls.
- No `npx`, no runtime npm install, no GPL.

## Options

### Option A — Vendor + compiled binary + iframe preview (locked)

Copy serve-sim into `vendor/serve-sim/`, strip shell `/exec`, compile a darwin-arm64 executable, publish a GitHub Release archive, download to `~/.atmos/runtime/serve-sim/<version>/` on first use, spawn from Electron, iframe `http://127.0.0.1:<port>/?device=<udid>`.

**Pros**: one preview UI, Apache-2.0, on-demand install, no Electron `dlopen`, no second HID stack.
**Cons**: we maintain a fork; compiled bun binary still ships a sibling `serve-sim-native.node`.
**Unknown**: how much of the Tools pane still needs `/exec` after we delete the shell route.

### Option B — Keep `@expo/serve-sim` npm tarball, wrap it in Electron

The dirty-branch approach: stage the npm package, `ELECTRON_RUN_AS_NODE`, extra `ws` install, custom canvas.

**Pros**: no vendor tree.
**Cons**: already failed; Node + `.node` wants App Resources; we still reinvent the preview.

### Option C — Don't embed; open the preview in an external browser tab

Spawn serve-sim and `open` the URL.

**Pros**: zero iframe work.
**Cons**: leaves the workspace; focus fight with Simulator.app is worse; not “inside Atmos”.

### Option D — Re-implement capture in Rust / Swift

**Pros**: no third-party UI.
**Cons**: months of work we already rejected; we still cannot embed Simulator.app (Apple).

## Key forks in the road

- **Fork 1 (product)**: embed serve-sim's preview vs draw our own — **embed**. Decide in PRD.
- **Fork 2 (install)**: App Resources vs `~/.atmos/runtime/…` on demand — **on-demand `~/.atmos`**. Decide in PRD.
- **Fork 3 (control plane)**: Electron main spawn vs `apps/api` spawn — **Electron main** for phase 1. API spawn only if the API process is proven to be on this Mac. Decide in TECH.
- **Fork 4 (security)**: delete `/exec` vs keep serve-sim as-is — **keep `/exec` + `/exec-ws` identical to upstream**; bind loopback only. Decide in TECH.
- **Fork 5 (distribution)**: GitHub Release vs Cloudflare R2 — **GitHub only**. User-locked.

## Open questions

- [x] Where does the binary live? → TECH: `~/.atmos/runtime/serve-sim/<version>/`
- [x] Where do leases live? → TECH: `~/.atmos/state/simulator/`
- [x] Can we hide Tools in embed? → 0.1.37 has no `--panes`; embed the full page (N1).
- [x] Hosted Web? → setup card “needs Atmos Desktop”; no fake cloud Simulator.

## References

- Upstream: https://github.com/EvanBacon/serve-sim (Apache-2.0)
- Pin: `@expo/serve-sim@0.1.37` → `expo/serve-sim` commit `b2c92534d373f2a2975a3c013c25a3ab3985f268`
- Layout: `agents/references/runtime/atmos-home-layout.md`
- Related (intent only, not an implementation blueprint): abandoned workspace-simulator work on dirty branches

## Ready to promote

- Promote to PRD: Desktop-only first ship; iframe preview; on-demand download; setup cards; hide Simulator.app; one device per workspace; hosted Web stays a Desktop CTA.
- Promote to TECH: vendor path, `/exec` cut, bun compile, GitHub Release asset + `manifest.json`, Electron IPC, `~/.atmos` paths, spawn argv, iframe URL, kill-our-pid-only.
