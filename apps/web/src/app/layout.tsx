import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { defaultLocale } from "@atmos/i18n/config";
import { ThemeProvider } from "@/providers/app/theme-provider";
import { QueryProvider } from "@/providers/app/query-provider";
import { WebSocketProvider } from "@/providers/app/websocket-provider";
import { DesktopStartupPrefetchBootstrap } from "@/app-shell/bootstrap/DesktopStartupPrefetchBootstrap";
import { DesktopExternalUrlBridge } from "@/providers/app/desktop-external-url-bridge";
import { WorkbenchIntlProvider } from "@/providers/app/workbench-intl-provider";
import UpdateNotification from "@/app-shell/UpdateNotification";
import { ServerStateEventBridge } from "@/providers/app/server-state-event-bridge";
import { FloatingElevationProvider } from "@/shared/lib/desktop-overlay/floating-elevation-provider";
import {
  AgentToastProvider,
  AnchoredToastProvider,
  ToastProvider,
  TooltipProvider,
} from "@workspace/ui";
import "./globals.css";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={defaultLocale} data-theme-ready="true" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
            storageKey="atmos:v1:global:theme"
          >
            <DesktopExternalUrlBridge />
            <WorkbenchIntlProvider initialLocale={defaultLocale}>
              <QueryProvider>
                <UpdateNotification />
                <WebSocketProvider>
                  <ServerStateEventBridge />
                  <DesktopStartupPrefetchBootstrap />
                  <ToastProvider position="bottom-right">
                    <AgentToastProvider>
                      <AnchoredToastProvider>
                        <TooltipProvider>
                          <FloatingElevationProvider>
                            {children}
                          </FloatingElevationProvider>
                        </TooltipProvider>
                      </AnchoredToastProvider>
                    </AgentToastProvider>
                  </ToastProvider>
                </WebSocketProvider>
              </QueryProvider>
            </WorkbenchIntlProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
