const CALENDAR_VERSION_RE =
  /^(?<year>\d{4})\.(?<month>[1-9]|1[0-2])\.(?<day>[1-9]|[12]\d|3[01])(?:-(?<prerelease>[0-9A-Za-z](?:[0-9A-Za-z.-]*[0-9A-Za-z])?))?$/;

function invalidCalendarVersionMessage(value, label) {
  return (
    `Invalid ${label} "${value}". Expected a calendar version like ` +
    `2026.7.2 or 2026.7.2-rc.1. Use no leading zeroes because Cargo, npm, ` +
    `and Tauri versions must remain SemVer-compatible.`
  );
}

export function parseCalendarVersion(value, label = "version") {
  const version = String(value || "").trim();
  const match = version.match(CALENDAR_VERSION_RE);

  if (!match?.groups) {
    throw new Error(invalidCalendarVersionMessage(version, label));
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(invalidCalendarVersionMessage(version, label));
  }

  return {
    version,
    year,
    month,
    day,
    prerelease: match.groups.prerelease || "",
  };
}

export function ensureCalendarVersion(value, label = "version") {
  return parseCalendarVersion(value, label).version;
}

export function extractCalendarVersionFromTag(tag, prefix) {
  const normalizedTag = String(tag || "").trim();

  if (!normalizedTag.startsWith(prefix)) {
    throw new Error(`Invalid release tag "${normalizedTag}". Expected format: ${prefix}<version>`);
  }

  return ensureCalendarVersion(
    normalizedTag.slice(prefix.length),
    `${prefix}<version> release tag`,
  );
}

export function calendarVersionToMsiVersion(value, label = "version") {
  const parsed = parseCalendarVersion(value, label);
  const msiMajor = parsed.year - 2000;

  if (msiMajor < 0 || msiMajor > 255) {
    throw new Error(
      `Cannot map calendar version "${parsed.version}" to MSI ProductVersion for ${label}. ` +
        `Expected year 2000 through 2255 so the MSI major segment stays within 0..255.`,
    );
  }

  let msiVersion = `${msiMajor}.${parsed.month}.${parsed.day}`;

  if (parsed.prerelease) {
    const lastSegment = parsed.prerelease.split(".").at(-1) || "";
    if (!/^\d+$/.test(lastSegment)) {
      throw new Error(
        `Cannot map prerelease calendar version "${parsed.version}" to MSI ProductVersion for ${label}. ` +
          `Prerelease versions must end with a numeric segment, for example 2026.7.2-rc.1.`,
      );
    }

    const buildNumber = Number(lastSegment);
    if (buildNumber > 65535) {
      throw new Error(
        `MSI build segment ${buildNumber} exceeds 65535 for ${label}, version "${parsed.version}".`,
      );
    }

    msiVersion = `${msiVersion}.${buildNumber}`;
  }

  return msiVersion;
}
