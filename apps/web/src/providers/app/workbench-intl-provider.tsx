"use client";

import React from "react";
import { NextIntlClientProvider } from "next-intl";
import type { Locale } from "@atmos/i18n/config";
import { defaultLocale, locales } from "@atmos/i18n/config";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";

const WORKBENCH_LOCALE_STORAGE_KEY = "atmos:v1:global:locale";

const messagesByLocale = {
  en: enMessages,
  zh: zhMessages,
} as const;

type WorkbenchIntlContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const WorkbenchIntlContext = React.createContext<WorkbenchIntlContextValue | null>(null);

function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale);
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(WORKBENCH_LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(WORKBENCH_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale persistence should not block language switching.
  }
}

export function WorkbenchIntlProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);

  React.useEffect(() => {
    const storedLocale = readStoredLocale();
    if (storedLocale) {
      setLocaleState(storedLocale);
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    persistLocale(locale);
  }, [locale]);

  const setLocale = React.useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
  }, []);

  const value = React.useMemo(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <WorkbenchIntlContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messagesByLocale[locale]}>
        {children}
      </NextIntlClientProvider>
    </WorkbenchIntlContext.Provider>
  );
}

export function useWorkbenchLocale() {
  const context = React.useContext(WorkbenchIntlContext);
  if (!context) {
    throw new Error("useWorkbenchLocale must be used within WorkbenchIntlProvider");
  }
  return context;
}
