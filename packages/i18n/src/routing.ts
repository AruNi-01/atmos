import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "./config";

export const routing = defineRouting({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Don't use prefix for default locale (en)
  // / -> English, /zh -> Chinese
  localePrefix: "as-needed",
});
