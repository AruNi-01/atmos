# Simulator capture helper

Packaging stages the pinned `@expo/serve-sim` payload into `serve-sim/`
and writes `helper-manifest.json`. Those files are generated at package
time (`scripts/prepare-package.ts`) on macOS only and are not committed.

At runtime the Desktop app loads:

`Contents/Resources/simulator-helper/serve-sim/`
