import type { ConsoleMessage, Page, TestInfo } from "@playwright/test";

const allowedConsoleErrorPatterns = [
  /favicon\.ico/i,
  /\[response\.404\] .*\/api\/system\/client-session\b/i,
  // Setup / remote onboarding probes the relay proxy before credentials exist.
  /\[response\.400\] .*\/api\/system\/computer\/relay\b/i,
  // registerAccessTokenOnRelay treats 409 as success (token already registered).
  /\[response\.409\] .*\/v1\/tenants\b/i,
  /Encountered a script tag while rendering React component/i,
  /(Failed to load (local models|skills)|Error fetching projects): Error: WebSocket disconnected/i,
  /\[console\.error\] Error: WebSocket not connected\b/i,
  /\[WebSocket\] Error: Event/i,
  // TanStack Query cancels in-flight settings bootstrap on computer/scope change.
  /CancelledError\b/,
  // Canvas probes the default pin doc; missing docs 404 is expected until first save.
  /\[response\.404\] .*\/api\/canvas\/documents\/Default\.atmos\.tldr(?:\?.*)?$/i,
  // APP-060 Playwright stub has no live capture helper on loopback 18789.
  /127\.0\.0\.1:18789\/s\/token/,
];

function formatConsoleMessage(message: ConsoleMessage): string {
  return `[console.${message.type()}] ${message.text()}`;
}

function isAllowedConsoleError(message: string): boolean {
  return allowedConsoleErrorPatterns.some((pattern) => pattern.test(message));
}

export async function attachBrowserErrorCollector(
  page: Page,
  testInfo: TestInfo,
): Promise<() => Promise<void>> {
  const errors: string[] = [];
  const failedResponseUrls = new Set<string>();

  page.on("pageerror", (error) => {
    errors.push(`[pageerror] ${error.stack || error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(formatConsoleMessage(message));
    }
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    failedResponseUrls.add(url);
    errors.push(`[response.${status}] ${url}`);
  });

  return async () => {
    const unexpected = errors.filter((message) => {
      if (isAllowedConsoleError(message)) return false;
      if (
        failedResponseUrls.size > 0 &&
        /\[console\.error\] Failed to load resource: the server responded with a status of \d+/.test(message)
      ) {
        return false;
      }
      return true;
    });
    if (unexpected.length === 0) {
      return;
    }

    await testInfo.attach("browser-errors", {
      body: unexpected.join("\n\n"),
      contentType: "text/plain",
    });

    throw new Error(
      `Unexpected browser error output:\n${unexpected
        .map((message) => `- ${message}`)
        .join("\n")}`,
    );
  };
}
