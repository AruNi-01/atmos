import type { ConsoleMessage, Page, TestInfo } from "@playwright/test";

const allowedConsoleErrorPatterns = [
  /favicon\.ico/i,
  /Encountered a script tag while rendering React component/i,
  /(Failed to load (local models|skills)|Error fetching projects): Error: WebSocket disconnected/i,
  /\[WebSocket\] Error: Event/i,
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
