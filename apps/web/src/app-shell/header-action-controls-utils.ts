import type { Locale } from "@atmos/i18n/config";

export function formatComputerSeenAt(
  value: number,
  locale: Locale,
  t: (key: string) => string,
): string {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return t("remoteAccess.recently");
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}
