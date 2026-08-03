import type { Page, Route } from "@playwright/test";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const defaultNotificationSettings = {
  browser_notification: false,
  desktop_notification: false,
  app_toast_notification: false,
  system_notification_when_focused: false,
  notify_on_permission_request: true,
  notify_on_task_complete: true,
  notify_on_automation_outcome: true,
  push_automation_outcomes: false,
  push_servers: [],
};

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }

  await route.fulfill({
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function stubUnavailableLocalApi(page: Page): Promise<void> {
  await page.route(
    /^https?:\/\/(127\.0\.0\.1|localhost):30303\/api\/system\/computer$/,
    async (route) => {
      await fulfillJson(route, 200, {
        success: false,
        error: "E2E local API unavailable",
      });
    },
  );

  await page.route(
    /^https?:\/\/(127\.0\.0\.1|localhost):30303\/hooks\/notification\/settings$/,
    async (route) => {
      await fulfillJson(route, 200, defaultNotificationSettings);
    },
  );
}
