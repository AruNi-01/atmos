//! Cleanup-hint matching against scanned tree basenames.

use serde::Serialize;

use super::types::DiskNode;

/// Common cleanup suggestion heuristics from a scanned tree.
///
/// Matches **directory/file basenames** already present in the scan tree
/// (case-insensitive). This is intentionally broad for developer rebuildable
/// artifacts — never source. Safe to delete ≠ auto-delete.
pub fn cleanup_suggestions(tree: &DiskNode) -> Vec<CleanupSuggestion> {
    let mut out = Vec::new();
    collect_suggestions(tree, CLEANUP_HINTS, &mut out);
    // Prefer larger first; de-dupe same path if tree has aliases.
    out.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.path.cmp(&b.path)));
    out.dedup_by(|a, b| a.path == b.path);
    out.truncate(40);
    out
}

/// Rebuildable / cache basenames across common languages and frameworks.
/// Matched case-insensitively against the node basename only (not full path).
///
/// Intentionally **omits** ultra-generic names that collide with OS or app data
/// when scanning home (`Library`, `Logs`, `bin`, `.env` secrets, etc.).
const CLEANUP_HINTS: &[(&str, &str)] = &[
    // ── JavaScript / TypeScript / Node ──────────────────────────────
    (
        "node_modules",
        "Node.js dependencies (reinstall with npm/pnpm/yarn)",
    ),
    (".npm", "npm cache"),
    (".pnpm-store", "pnpm content-addressable store"),
    (".yarn", "Yarn cache / releases"),
    (".yarn-cache", "Yarn classic cache"),
    ("bower_components", "Bower packages (legacy)"),
    (".next", "Next.js build output"),
    (".nuxt", "Nuxt build output"),
    (".output", "Nuxt/Nitro/framework output"),
    (".vercel", "Vercel build cache"),
    (".turbo", "Turborepo remote/local cache"),
    (".svelte-kit", "SvelteKit build output"),
    (".angular", "Angular CLI cache"),
    (".vite", "Vite prebundle cache"),
    (".webpack", "Webpack cache"),
    (".parcel-cache", "Parcel bundler cache"),
    (".eslintcache", "ESLint cache"),
    (".stylelintcache", "Stylelint cache"),
    (".rpt2_cache", "rollup-plugin-typescript2 cache"),
    (".rts2_cache_cjs", "rollup-plugin-typescript2 CJS cache"),
    (".rts2_cache_es", "rollup-plugin-typescript2 ESM cache"),
    (".rts2_cache_umd", "rollup-plugin-typescript2 UMD cache"),
    ("storybook-static", "Storybook static build"),
    (".storybook-out", "Storybook output"),
    (".docusaurus", "Docusaurus build cache"),
    (".astro", "Astro build cache"),
    (".remix", "Remix build cache"),
    ("coverage", "Test coverage reports"),
    (".nyc_output", "Istanbul/nyc coverage temp"),
    (".jest", "Jest cache"),
    (".vitest", "Vitest cache"),
    (".swc", "SWC compiler cache"),
    ("jspm_packages", "JSPM packages"),
    (".nx", "Nx computation cache"),
    // ── Generic caches (no bare dist/build/out/tmp/output — those
    // often hold source, exports, or app data rather than rebuildable cache)
    (".cache", "Tool cache directory"),
    (".tmp", "Temporary build files"),
    (".temp", "Temporary build files"),
    // ── Rust ────────────────────────────────────────────────────────
    ("target", "Rust/Cargo or sbt/Scala build artifacts"),
    // ── Python ──────────────────────────────────────────────────────
    ("__pycache__", "Python bytecode cache"),
    (".pytest_cache", "pytest cache"),
    (".mypy_cache", "mypy type-check cache"),
    (".ruff_cache", "Ruff linter cache"),
    (".tox", "tox virtualenvs"),
    (".nox", "nox virtualenvs"),
    (".venv", "Python virtual environment"),
    ("venv", "Python virtual environment"),
    (".virtualenv", "virtualenv directory"),
    (".pdm-cache", "PDM package cache"),
    (".pdm-build", "PDM build directory"),
    (".ipynb_checkpoints", "Jupyter notebook checkpoints"),
    (".pytype", "pytype cache"),
    (".pyre", "Pyre type-checker cache"),
    ("htmlcov", "coverage.py HTML report"),
    (".hypothesis", "Hypothesis example database"),
    (".eggs", "Python eggs"),
    ("wheels", "Local Python wheel cache"),
    // ── Java / Kotlin / JVM ─────────────────────────────────────────
    (".gradle", "Gradle cache"),
    (".m2", "Maven local repository"),
    (".ivy2", "Ivy dependency cache"),
    ("kotlin-js-store", "Kotlin/JS dependency store"),
    (".kotlin", "Kotlin compiler daemon/cache"),
    // Note: do NOT flag `vendor` — often real project deps (Go/PHP) that are
    // committed or locally patched, not pure regenerable cache.
    // ── C / C++ / CMake ─────────────────────────────────────────────
    ("CMakeFiles", "CMake generated files"),
    ("cmake-build-debug", "CLion/CMake debug build"),
    ("cmake-build-release", "CLion/CMake release build"),
    (
        "cmake-build-relwithdebinfo",
        "CLion/CMake RelWithDebInfo build",
    ),
    ("cmake-build-minsizerel", "CLion/CMake MinSizeRel build"),
    (".cxx", "Android NDK / CMake CXX cache"),
    // ── Apple / iOS / macOS ─────────────────────────────────────────
    ("DerivedData", "Xcode DerivedData"),
    ("Pods", "CocoaPods dependencies"),
    (".build", "SwiftPM / generic dot-build output"),
    ("Carthage", "Carthage checkouts/build"),
    ("xcuserdata", "Xcode per-user data"),
    (".swiftpm", "Swift Package Manager cache"),
    // ── Android ─────────────────────────────────────────────────────
    ("captures", "Android Studio layout captures"),
    (".externalNativeBuild", "Android NDK external build"),
    // ── Flutter / Dart ──────────────────────────────────────────────
    (".dart_tool", "Dart/Flutter tool cache"),
    (".pub-cache", "Pub global package cache"),
    (".pub", "Pub temporary data"),
    ("ephemeral", "Flutter ephemeral generated files"),
    // ── .NET / C# ───────────────────────────────────────────────────
    ("obj", ".NET intermediate build objects"),
    (".nuget", "NuGet package cache"),
    ("TestResults", ".NET / VS test results"),
    // ── PHP ─────────────────────────────────────────────────────────
    (".phpunit.result.cache", "PHPUnit result cache"),
    (".php-cs-fixer.cache", "PHP-CS-Fixer cache"),
    // ── Ruby ────────────────────────────────────────────────────────
    (".bundle", "Bundler cache/config"),
    (".sass-cache", "Sass cache"),
    // ── Elixir / Erlang ─────────────────────────────────────────────
    ("_build", "Mix/Elixir or Dune/OCaml build"),
    ("deps", "Mix dependencies"),
    (".elixir_ls", "ElixirLS cache"),
    ("cover", "Elixir test coverage"),
    // ── Haskell ─────────────────────────────────────────────────────
    (".stack-work", "Stack work directory"),
    ("dist-newstyle", "Cabal new-style build"),
    (".cabal-sandbox", "Cabal sandbox (legacy)"),
    // ── Scala / LSP ─────────────────────────────────────────────────
    (".bloop", "Bloop BSP cache"),
    (".metals", "Metals language server cache"),
    (".bsp", "Build Server Protocol metadata"),
    // ── Zig / Nim / OCaml / Esy ─────────────────────────────────────
    ("zig-cache", "Zig build cache"),
    ("zig-out", "Zig build output"),
    ("nimcache", "Nim compiler cache"),
    ("_esy", "Esy package builds"),
    ("_opam", "opam local switch"),
    (".opam", "opam root / package cache"),
    // ── Terraform / IaC / cloud ─────────────────────────────────────
    (".terraform", "Terraform providers and modules"),
    (".terragrunt-cache", "Terragrunt download cache"),
    (".pulumi", "Pulumi plugins/cache"),
    (".serverless", "Serverless Framework package"),
    (".aws-sam", "AWS SAM build artifacts"),
    (".cdk.staging", "AWS CDK staging"),
    ("cdk.out", "AWS CDK cloud assembly"),
    // ── Containers / VMs (project-local only; still rebuildable) ───
    (".vagrant", "Vagrant machine data"),
    // ── Unity (prefer specific names; avoid bare Library on macOS) ─
    ("MemoryCaptures", "Unity memory captures"),
    // ── Unreal ──────────────────────────────────────────────────────
    ("Intermediate", "Unreal Engine intermediate"),
    ("Binaries", "Unreal Engine binaries"),
    ("DerivedDataCache", "Unreal derived data cache"),
    // ── Bazel / Buck / Pants ────────────────────────────────────────
    ("bazel-bin", "Bazel bin outputs"),
    ("bazel-out", "Bazel output tree"),
    ("bazel-testlogs", "Bazel test logs"),
    (".bazel-cache", "Bazel disk cache"),
    (".pants.d", "Pants build cache"),
    ("buck-out", "Buck build output"),
    // ── DevEnv ──────────────────────────────────────────────────────
    (".direnv", "direnv layout cache"),
    (".devenv", "devenv cache"),
    // ── AI / ML caches (often multi‑GB) ─────────────────────────────
    (".ollama", "Ollama local models"),
    (".huggingface", "Hugging Face hub cache"),
    ("huggingface", "Hugging Face cache"),
    ("transformers_cache", "Transformers model cache"),
    (".torch", "PyTorch hub cache"),
    (".keras", "Keras datasets/models"),
    (".paddlepaddle", "PaddlePaddle cache"),
    // Nested under `.cache` (basename still matches when that folder is a node)
    ("ms-playwright", "Playwright browser binaries"),
    ("puppeteer", "Puppeteer Chromium"),
    ("Cypress", "Cypress binary cache"),
    ("pip", "pip download cache (under .cache)"),
    ("typescript", "TypeScript cache (under .cache)"),
    ("prisma", "Prisma engines cache (under .cache)"),
    // ── Browser automation / e2e ────────────────────────────────────
    (".playwright", "Playwright cache"),
    ("playwright-report", "Playwright HTML report"),
    ("test-results", "E2E/test artifacts"),
    ("allure-results", "Allure raw results"),
    ("allure-report", "Allure HTML report"),
    // ── Docs static generators ──────────────────────────────────────
    ("_site", "Jekyll / static site output"),
    (".vuepress", "VuePress cache/dist"),
    // ── IDE / editor test hosts ─────────────────────────────────────
    (".vscode-test", "VS Code extension test host"),
    (".history", "Local History IDE plugin data"),
    // Session subdirs only — never whole agent homes (`.cursor`, `.claude`, …).
    ("history-session-state", "Copilot CLI session files"),
    ("archived_sessions", "Codex session files"),
    ("acp-events", "Devin session files"),
];

#[derive(Debug, Clone, Serialize)]
pub struct CleanupSuggestion {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub reason: String,
}

fn collect_suggestions(node: &DiskNode, hints: &[(&str, &str)], out: &mut Vec<CleanupSuggestion>) {
    if node.size > 0 {
        let node_name = node.name.as_str();
        // Exact / case-insensitive basename match.
        for (name, reason) in hints {
            // Skip pattern placeholders that aren't real basenames.
            if name.contains('/') || name.contains('*') {
                continue;
            }
            if node_name.eq_ignore_ascii_case(name) {
                out.push(CleanupSuggestion {
                    path: node.path.clone(),
                    name: node.name.clone(),
                    size: node.size,
                    reason: (*reason).to_string(),
                });
                break; // one reason per node
            }
        }
        // Suffix patterns: Python egg-info, TypeScript buildinfo files, etc.
        if node_name.ends_with(".egg-info")
            || node_name.ends_with(".eggs")
            || node_name.ends_with(".tsbuildinfo")
            || node_name.eq_ignore_ascii_case(".DS_Store")
        {
            // Only flag sizable egg-info / tsbuildinfo dirs/files.
            if node_name.ends_with(".egg-info") {
                out.push(CleanupSuggestion {
                    path: node.path.clone(),
                    name: node.name.clone(),
                    size: node.size,
                    reason: "Python package egg-info (rebuildable)".into(),
                });
            } else if node_name.ends_with(".tsbuildinfo") && node.size > 1024 {
                out.push(CleanupSuggestion {
                    path: node.path.clone(),
                    name: node.name.clone(),
                    size: node.size,
                    reason: "TypeScript incremental build info".into(),
                });
            }
        }
    }
    for child in &node.children {
        collect_suggestions(child, hints, out);
    }
}
