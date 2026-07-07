import { getRequestConfig } from "next-intl/server";
import { routing } from "@atmos/i18n/routing";
import { Locale } from "@atmos/i18n/config";

export default getRequestConfig(async ({ requestLocale }) => {
  // The workbench uses runtime locale switching. Server-side locale requests
  // fall back to the default locale unless a localized surface provides one.
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "UTC",
  };
});
