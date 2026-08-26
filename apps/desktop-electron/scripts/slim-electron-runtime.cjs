/**
 * Shrink packaged Electron: keep Chromium locales en / zh-CN / zh-TW (plus
 * Chromium gender variants) and drop SwiftShader.
 *
 * Missing locale.pak files fall back to en-US inside Chromium — we do not
 * force `--lang`, so Accept-Language still follows the OS.
 *
 * Do not use electron-builder `electronLanguages` for this: 26.x matching
 * drops `en_FEMININE.lproj` / `zh_CN_MASCULINE.lproj` and Windows `en-US.pak`.
 */

const {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} = require("node:fs");
const { join } = require("node:path");

/** Chromium locale tags we ship. Gender suffixes are stripped before compare. */
const KEPT_LOCALE_TAGS = Object.freeze(["en", "en-us", "zh-cn", "zh-tw"]);

const GENDER_SUFFIX = /-(feminine|masculine|neuter)$/;

const SWIFTSHADER_NAMES = Object.freeze([
  "libvk_swiftshader.dylib",
  "libvk_swiftshader.so",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
]);

function normalizeLocaleTag(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(GENDER_SUFFIX, "");
}

function localeFileBase(filename) {
  const name = String(filename);
  if (name.endsWith(".lproj")) return name.slice(0, -".lproj".length);
  if (name.endsWith(".pak")) return name.slice(0, -".pak".length);
  return name;
}

function isLocaleEntryName(filename, platform) {
  if (platform === "darwin") return filename.endsWith(".lproj");
  return filename.endsWith(".pak");
}

function shouldKeepLocaleFile(filename) {
  return KEPT_LOCALE_TAGS.includes(
    normalizeLocaleTag(localeFileBase(filename)),
  );
}

function findMacApp(appOutDir) {
  const direct = join(appOutDir, "Atmos.app");
  if (existsSync(direct)) return direct;
  if (!existsSync(appOutDir)) return null;
  try {
    for (const name of readdirSync(appOutDir)) {
      if (name.endsWith(".app")) return join(appOutDir, name);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function localeDirs(appOutDir, platform) {
  if (platform === "darwin") {
    const app = findMacApp(appOutDir);
    if (!app) return [];
    return [
      join(app, "Contents", "Resources"),
      join(
        app,
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
        "Versions",
        "A",
        "Resources",
      ),
    ];
  }
  return [join(appOutDir, "locales")];
}

function swiftshaderPaths(appOutDir, platform) {
  if (platform === "darwin") {
    const app = findMacApp(appOutDir);
    if (!app) return [];
    const lib = join(
      app,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
      "Libraries",
    );
    return [
      join(lib, "libvk_swiftshader.dylib"),
      join(lib, "vk_swiftshader_icd.json"),
    ];
  }
  if (platform === "win32") {
    return [
      join(appOutDir, "vk_swiftshader.dll"),
      join(appOutDir, "vk_swiftshader_icd.json"),
    ];
  }
  return [
    join(appOutDir, "libvk_swiftshader.so"),
    join(appOutDir, "vk_swiftshader_icd.json"),
  ];
}

function listLocaleEntries(dir, platform) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((name) => isLocaleEntryName(name, platform));
  } catch {
    return [];
  }
}

function entrySize(path) {
  try {
    const st = statSync(path);
    if (!st.isDirectory()) return st.size;
  } catch {
    return 0;
  }
  let total = 0;
  const stack = [path];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const child = join(dir, name);
      try {
        const st = statSync(child);
        if (st.isDirectory()) stack.push(child);
        else total += st.size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

function slimLocales(appOutDir, platform) {
  const kept = [];
  const removed = [];
  let removedBytes = 0;

  for (const dir of localeDirs(appOutDir, platform)) {
    const entries = listLocaleEntries(dir, platform);
    if (entries.length === 0) continue;

    const keepNames = entries.filter((name) => shouldKeepLocaleFile(name));
    const dropNames = entries.filter((name) => !shouldKeepLocaleFile(name));

    if (keepNames.length === 0) {
      throw new Error(
        `[slim-electron-runtime] refusing to delete locales in ${dir}: ` +
          `none of ${KEPT_LOCALE_TAGS.join(", ")} remain (would crash Chromium)`,
      );
    }

    for (const name of keepNames) {
      if (!kept.includes(name)) kept.push(name);
    }
    for (const name of dropNames) {
      const target = join(dir, name);
      removedBytes += entrySize(target);
      rmSync(target, { recursive: true, force: true });
      removed.push(name);
    }
  }

  return { kept: [...new Set(kept)].sort(), removed, removedBytes };
}

function slimSwiftshader(appOutDir, platform) {
  const removed = [];
  let removedBytes = 0;
  for (const target of swiftshaderPaths(appOutDir, platform)) {
    if (!existsSync(target)) continue;
    removedBytes += entrySize(target);
    rmSync(target, { force: true });
    removed.push(target);
  }
  return { removed, removedBytes };
}

/**
 * @param {string} appOutDir electron-builder afterPack appOutDir
 * @param {string} platform darwin | win32 | linux
 */
function slimPackagedElectronApp(appOutDir, platform) {
  const locales = slimLocales(appOutDir, platform);
  const swiftshader = slimSwiftshader(appOutDir, platform);
  return { locales, swiftshader };
}

function inspectSlimState(appOutDir, platform) {
  const localeNames = [];
  for (const dir of localeDirs(appOutDir, platform)) {
    for (const name of listLocaleEntries(dir, platform)) {
      localeNames.push(name);
    }
  }
  const swiftshader = swiftshaderPaths(appOutDir, platform).filter((p) =>
    existsSync(p),
  );
  return { localeNames, swiftshader };
}

function verifySlimPackagedApp(appOutDir, platform) {
  const problems = [];
  const { localeNames, swiftshader } = inspectSlimState(appOutDir, platform);
  const extras = localeNames.filter((name) => !shouldKeepLocaleFile(name));
  if (extras.length > 0) {
    problems.push(`leftover Chromium locales: ${extras.slice(0, 8).join(", ")}`);
  }

  const keptTags = new Set(
    localeNames.map((name) => normalizeLocaleTag(localeFileBase(name))),
  );
  if (platform === "darwin") {
    if (!keptTags.has("en")) problems.push("missing en.lproj");
    if (!keptTags.has("zh-cn")) problems.push("missing zh_CN.lproj");
    if (!keptTags.has("zh-tw")) problems.push("missing zh_TW.lproj");
  } else {
    const hasEnglish = keptTags.has("en") || keptTags.has("en-us");
    if (!hasEnglish) problems.push("missing en-US.pak (or en.pak)");
    if (!keptTags.has("zh-cn")) problems.push("missing zh-CN.pak");
    if (!keptTags.has("zh-tw")) problems.push("missing zh-TW.pak");
  }

  if (swiftshader.length > 0) {
    problems.push(
      `SwiftShader still present: ${swiftshader.map((p) => p.split(/[/\\]/).pop()).join(", ")}`,
    );
  }

  return { ok: problems.length === 0, problems, localeNames, swiftshader };
}

module.exports = {
  KEPT_LOCALE_TAGS,
  SWIFTSHADER_NAMES,
  normalizeLocaleTag,
  shouldKeepLocaleFile,
  isLocaleEntryName,
  localeDirs,
  swiftshaderPaths,
  slimPackagedElectronApp,
  inspectSlimState,
  verifySlimPackagedApp,
};
