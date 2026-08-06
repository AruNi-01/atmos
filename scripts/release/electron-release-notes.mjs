/**
 * Default release-notes body for Atmos Desktop (production Electron ship path).
 * Used by release-desktop-electron.mjs when a notes file is missing.
 * Product-facing: do not mention framework names in user-visible prose.
 *
 * GitHub Release UI notes:
 * - Collapsed Download is our own `<details>` block.
 * - The native **Contributors** avatar strip (above Assets) is *not* a release
 *   API flag. GitHub builds it from `@username` mentions in the release body.
 *   See: https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
 */

const DEFAULT_GITHUB_REPO = "AruNi-01/atmos";
const DOWNLOAD_SECTION_MARKER = "<!-- atmos-desktop-download -->";
const CONTRIBUTORS_SECTION_MARKER = "<!-- atmos-desktop-contributors -->";

/**
 * Collapsed Download section for GitHub Release bodies.
 * Links match electron-builder artifact names published by release-desktop-electron.yml:
 *   Atmos_<version>_aarch64.dmg
 *   Atmos_<version>_x64.dmg
 *   Atmos_<version>_x64-setup.exe
 *   Atmos_<version>_x64.AppImage
 *
 * @param {string} version calendar version e.g. 2026.8.2 or 2026.8.2-beta.1
 * @param {{ tag?: string, repo?: string }} [options]
 * @returns {string}
 */
export function buildDesktopDownloadSection(version, options = {}) {
  const tag = options.tag || `desktop-electron-${version}`;
  const repo = options.repo || DEFAULT_GITHUB_REPO;
  const base = `https://github.com/${repo}/releases/download/${tag}`;

  const asset = (name) => `${base}/${name}`;

  return `${DOWNLOAD_SECTION_MARKER}
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](${asset(`Atmos_${version}_aarch64.dmg`)}) (recommended)
- [Intel](${asset(`Atmos_${version}_x64.dmg`)})

### Windows

- [64-bit installer](${asset(`Atmos_${version}_x64-setup.exe`)})

### Linux

- [64-bit AppImage](${asset(`Atmos_${version}_x64.AppImage`)})

</details>
`;
}

/**
 * Build the thank-you line for GitHub's native Contributors avatar strip.
 * GitHub renders that UI from `@username` mentions in the release body.
 * Preserves caller order (expected: commit-volume ranked). Only strips @ /
 * empties and de-dupes first-seen; does not re-sort alphabetically.
 *
 * @param {string[]} logins GitHub usernames without or with leading @
 * @returns {string} empty string when no logins
 */
export function buildDesktopContributorsSection(logins) {
  const seen = new Set();
  const cleaned = [];
  for (const raw of logins || []) {
    const login = String(raw || "")
      .trim()
      .replace(/^@/, "");
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(login);
  }
  if (cleaned.length === 0) return "";

  const mentions = formatContributorMentions(cleaned);
  return `${CONTRIBUTORS_SECTION_MARKER}
Thanks to ${mentions}.
`;
}

/**
 * Rank contributor logins by contribution count (desc), then name (asc).
 * Pass one entry per commit (duplicates = more contributions).
 * Bots are kept (dependabot, github-actions, etc.).
 *
 * @param {string[]} logins may contain duplicates
 * @returns {string[]} unique logins, most commits first
 */
export function rankContributorLogins(logins) {
  /** @type {Map<string, { login: string, count: number }>} */
  const byKey = new Map();
  for (const raw of logins || []) {
    const login = String(raw || "")
      .trim()
      .replace(/^@/, "");
    if (!login) continue;
    const key = login.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(key, { login, count: 1 });
    }
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.login.localeCompare(b.login, "en", { sensitivity: "base" }),
    )
    .map((entry) => entry.login);
}

/** @deprecated alias — prefer rankContributorLogins */
export function normalizeContributorLogins(logins) {
  return rankContributorLogins(logins);
}

/**
 * @param {string[]} logins already normalized usernames without @
 * @returns {string}
 */
export function formatContributorMentions(logins) {
  const mentions = logins.map((login) => `@${login}`);
  if (mentions.length === 0) return "";
  if (mentions.length === 1) return mentions[0];
  if (mentions.length === 2) return `${mentions[0]} and ${mentions[1]}`;
  return `${mentions.slice(0, -1).join(", ")}, and ${mentions[mentions.length - 1]}`;
}

/**
 * Strip any previously appended Atmos download section (marker or bare details block).
 * @param {string} body
 * @returns {string}
 */
export function stripDesktopDownloadSection(body) {
  let text = String(body ?? "");

  // Preferred: marker + trailing details block through end (or next marker).
  text = text.replace(
    /\n*<!--\s*atmos-desktop-download\s*-->[\s\S]*?(?=<!--\s*atmos-desktop-(?:download|contributors)\s*-->|$)/gi,
    "\n",
  );

  // Fallback: un-marked collapsed Download section at end of body.
  text = text.replace(
    /\n*<details>\s*\n?\s*<summary><strong>Download<\/strong><\/summary>[\s\S]*?<\/details>\s*$/i,
    "\n",
  );

  return text.replace(/\s+$/u, "") + "\n";
}

/**
 * Strip injected contributors thank-you block (marker-based).
 * @param {string} body
 * @returns {string}
 */
export function stripDesktopContributorsSection(body) {
  let text = String(body ?? "");

  text = text.replace(
    /\n*<!--\s*atmos-desktop-contributors\s*-->[\s\S]*?(?=<!--\s*atmos-desktop-(?:download|contributors)\s*-->|$)/gi,
    "\n",
  );

  // Fallback: a trailing "Thanks to @…." line we may have injected without a marker.
  text = text.replace(
    /\n+Thanks to @[A-Za-z0-9-]+(?:,? (?:and )?@[A-Za-z0-9-]+)*\.?\s*$/u,
    "\n",
  );

  return text.replace(/\s+$/u, "") + "\n";
}

/**
 * Ensure body ends with optional Contributors mentions + Download section.
 * Order: product narrative → contributors (for GitHub avatar UI) → Download.
 *
 * @param {string} body
 * @param {string} version
 * @param {{ tag?: string, repo?: string, contributors?: string[] }} [options]
 * @returns {string}
 */
export function ensureDesktopReleaseNotesExtras(body, version, options = {}) {
  let text = stripDesktopDownloadSection(body);
  text = stripDesktopContributorsSection(text).replace(/\s+$/u, "");

  const parts = [text];
  const contributors = buildDesktopContributorsSection(options.contributors || []);
  if (contributors) {
    parts.push(contributors.trimEnd());
  }
  parts.push(buildDesktopDownloadSection(version, options).trimEnd());
  return `${parts.join("\n\n")}\n`;
}

/**
 * Ensure body ends with a single current-version Download section.
 * @param {string} body
 * @param {string} version
 * @param {{ tag?: string, repo?: string }} [options]
 * @returns {string}
 */
export function ensureDesktopDownloadSection(body, version, options = {}) {
  return ensureDesktopReleaseNotesExtras(body, version, options);
}

/**
 * @param {string} version calendar version e.g. 2026.7.28
 * @param {string} tag full tag e.g. desktop-electron-2026.7.28
 */
export function defaultElectronReleaseNotes(version, tag) {
  const summary = `Atmos desktop release \`${version}\` (tag \`${tag}\`).

## Highlights

- Packaged desktop app with bundled Atmos Server runtime
- Shared on-disk contracts: AppShot \`~/.atmos/appshots\`, Server data \`~/.atmos/desktop\`, tunnel gateway + entry_token
- App identity: \`com.atmos.desktop\`
`;

  return ensureDesktopReleaseNotesExtras(summary, version, { tag });
}

/** Forbidden phrases that re-assert wrong defaults or experimental framing. */
export const FORBIDDEN_ELECTRON_NOTES_PHRASES = [
  "Experimental Chromium shell",
  "Production default remains Tauri",
  "until Phase 5 product sign-off",
  "experimental Electron",
];
