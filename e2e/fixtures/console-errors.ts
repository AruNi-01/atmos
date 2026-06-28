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

  page.on("pageerror", (error) => {
    errors.push(`[pageerror] ${error.stack || error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(formatConsoleMessage(message));
    }
  });

  return async () => {
    const unexpected = errors.filter((message) => !isAllowedConsoleError(message));
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
