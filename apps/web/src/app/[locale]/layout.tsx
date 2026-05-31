import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@atmos/i18n/routing";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/providers/app/theme-provider";
import { ThemeReadyBridge } from "@/providers/app/theme-ready-bridge";
import { WebSocketProvider } from "@/providers/app/websocket-provider";
import { SplashPrefetchBootstrap } from "@/app-shell/bootstrap/SplashPrefetchBootstrap";
import { TmuxCheckProvider } from "@/providers/app/tmux-check-provider";
import { DesktopExternalUrlBridge } from "@/providers/app/desktop-external-url-bridge";
import UpdateNotification from "@/app-shell/UpdateNotification";
import { ToastProvider, AgentToastProvider, AnchoredToastProvider, TooltipProvider } from "@workspace/ui";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const THEME_INIT_SCRIPT = `
(() => {
  const root = document.documentElement;
  try {
    let storedTheme = null;
    try {
      storedTheme = window.localStorage.getItem("atmos:v1:global:theme");
    } catch {}

    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : storedTheme === "system"
        ? (systemDark ? "dark" : "light")
        : "dark";

    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } finally {
    root.dataset.themeReady = "true";
  }
})();
`;

export const metadata: Metadata = {
  title: "ATMOS",
  description: "An open-source platform designed for developers to organize their agentic life and build in a unified workspace",
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Providing all messages to the client
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
            storageKey="atmos:v1:global:theme"
          >
            <ThemeReadyBridge />
            <DesktopExternalUrlBridge />
            <UpdateNotification />
            <NextIntlClientProvider messages={messages}>
              <WebSocketProvider>
                <SplashPrefetchBootstrap />
                <TmuxCheckProvider>
                  <ToastProvider position="bottom-right">
                    <AgentToastProvider>
                      <AnchoredToastProvider>
                        <TooltipProvider>
                          {children}
                        </TooltipProvider>
                      </AnchoredToastProvider>
                    </AgentToastProvider>
                  </ToastProvider>
                </TmuxCheckProvider>
              </WebSocketProvider>
            </NextIntlClientProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
