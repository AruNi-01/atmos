import type { Page } from "@playwright/test";
import { apiPort } from "../../fixtures/app-server";
import { expect, test } from "../../fixtures/test";
import { seedOnboardingComplete } from "../smoke/support/app-smoke";

/**
 * APP-073 PT Design interactive canvas.
 * Board-level Interact / Edit journeys. Bun covers protocol/headless/registry.
 * Standalone `/pt-design` uses `PT_DESIGN_GLOBAL_CONTEXT_ID` → `pt-design/v2/global`.
 */

const PT_DESIGN_STORAGE_KEY = "pt-design/v2/global";
const UNDO = process.platform === "darwin" ? "Meta+z" : "Control+z";

const SEEDED_PTX = `<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
    <option value="gemini">Gemini</option>
  </select>
  <input id="prompt" label="Prompt" value="" x="300" y="250" width="240" height="40"/>
  <button id="run" label="Run" x="300" y="300" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
</page>
`;

type InvokeResult = {
  ok: boolean;
  data?: {
    ptx?: string;
    mime?: string;
    mediaType?: string;
    base64?: string;
    dataUrl?: string;
  };
  error?: { code?: string; message?: string };
};

/** S5 representative live UI: overlay dialog + block.auth-form (+ run so openSeededPtDesign can wait). */
const S5_REPRESENTATIVE_PTX = `<page id="s5-rep">
  <dialog id="dlg" title="Dialog" description="Review the details and confirm to continue." label="Confirm" x="40" y="40" width="320" height="200"/>
  <block-auth-form id="auth" title="Sign in" x="400" y="40" width="360" height="228">
    <input id="auth-email" label="Email" x="16" y="52" width="328" height="40"/>
    <input id="auth-password" label="Password" x="16" y="100" width="328" height="40"/>
    <button id="auth-submit" label="Continue" x="16" y="156" width="328" height="40"/>
  </block-auth-form>
  <button id="run" label="Run" x="300" y="300" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
</page>
`;

async function liveBoardEnvReady(): Promise<boolean> {
  const url = `ws://127.0.0.1:${apiPort}/ws?client_type=web`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      let settled = false;
      let socket: WebSocket | undefined;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        try {
          socket?.close();
        } catch {
          // ignore
        }
        resolve(value);
      };
      try {
        socket = new WebSocket(url);
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => finish(false), 2_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        finish(true);
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        finish(false);
      });
    });
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function invokeTool(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<InvokeResult> {
  const response = await fetch(`http://127.0.0.1:${apiPort}/api/pt-design/agent/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: crypto.randomUUID(),
      tool,
      args,
      client_id: "global",
    }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as InvokeResult;
  } catch {
    throw new Error(
      `pt-design invoke ${tool} returned non-JSON ${response.status}: ${text.slice(0, 240)}`,
    );
  }
}

async function getPtx(): Promise<string> {
  const got = await invokeTool("pt_ptx_get");
  if (!got.ok || typeof got.data?.ptx !== "string") {
    throw new Error(
      `pt_ptx_get failed: ${got.error?.code ?? "not-ok"} ${got.error?.message ?? JSON.stringify(got)}`,
    );
  }
  return got.data.ptx;
}

async function applyPtx(ptx: string): Promise<void> {
  const got = await invokeTool("pt_ptx_apply", { ptx });
  if (!got.ok) {
    throw new Error(
      `pt_ptx_apply failed: ${got.error?.code ?? "not-ok"} ${got.error?.message ?? JSON.stringify(got)}`,
    );
  }
}

function buttonAttr(ptx: string, attr: "x" | "y"): number {
  const match = ptx.match(new RegExp(`<button id="run"[^>]*\\s${attr}="([^"]+)"`));
  const value = Number(match?.[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`run ${attr} missing in PTX: ${ptx.slice(0, 400)}`);
  }
  return value;
}

function invokeHasPng(result: InvokeResult): boolean {
  const data = result.data;
  if (!data) return false;
  const mime = data.mime ?? data.mediaType;
  const dataUrl = typeof data.dataUrl === "string" ? data.dataUrl : "";
  const raw =
    typeof data.base64 === "string" && data.base64.length > 0
      ? data.base64
      : dataUrl.includes(",")
        ? dataUrl.slice(dataUrl.indexOf(",") + 1)
        : "";
  const mimeOk = mime === "image/png" || dataUrl.startsWith("data:image/png");
  if (!mimeOk || raw.length < 32) return false;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

async function openSeededPtDesign(page: Page, ptx = SEEDED_PTX): Promise<void> {
  await seedOnboardingComplete(page);
  await page.addInitScript(
    ({ key, ptx: source }) => {
      try {
        window.localStorage.setItem(key, JSON.stringify({ ptx: source }));
      } catch {
        // ignore quota / private-mode failures
      }
    },
    { key: PT_DESIGN_STORAGE_KEY, ptx },
  );
  const response = await page.goto("/pt-design", { waitUntil: "domcontentloaded" });
  expect(response, "missing navigation response for /pt-design").not.toBeNull();
  expect(response!.status(), `unexpected status for /pt-design`).toBeLessThan(500);

  await expect(
    page.getByTestId("pt-design-center"),
    "PT Design host panel did not mount",
  ).toBeVisible({ timeout: 60_000 });
  const board = page.getByTestId("pt-design-board");
  const mode = page.getByTestId("pt-design-mode");
  try {
    await expect(board).toBeVisible({ timeout: 60_000 });
    await expect(mode).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    const title = await page.title().catch(() => "(title unavailable)");
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "(body unavailable)");
    throw new Error(
      `PT Design board/mode did not hydrate after onboarding seed. title=${title} body=${body.slice(0, 500)}`,
      { cause: error },
    );
  }

  const storedRaw = await page.evaluate((key) => window.localStorage.getItem(key), PT_DESIGN_STORAGE_KEY);
  let storedPtx = "";
  try {
    const parsed = JSON.parse(storedRaw ?? "") as { ptx?: unknown };
    storedPtx = typeof parsed.ptx === "string" ? parsed.ptx : "";
  } catch {
    storedPtx = "";
  }
  expect(storedPtx, "seeded PTX missing from pt-design/v2/global").toContain('id="run"');
  await expect(page.locator('[data-pt-overlay-origin="canvas"]')).toBeAttached({ timeout: 15_000 });
  try {
    await expect(page.locator('[data-pt-overlay-id="run"]')).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const overlayIds = await page.locator("[data-pt-overlay-id]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-pt-overlay-id")),
    );
    throw new Error(
      `Seeded PTX did not project overlay nodes. overlayIds=${JSON.stringify(overlayIds)} ptxHasRun=${storedPtx.includes('id="run"')}`,
      { cause: error },
    );
  }
  await expect
    .poll(
      async () => {
        try {
          const live = await getPtx();
          return live.includes('id="run"') ? "ready" : `missing run in ${live.slice(0, 180)}`;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      { timeout: 45_000 },
    )
    .toBe("ready");
}

async function switchMode(page: Page, mode: "Edit" | "Interact"): Promise<void> {
  const toggle = page.getByTestId("pt-design-mode");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.getByRole("button", { name: mode, exact: true }).click();
  await expect(
    page.locator(`[data-pt-overlay-origin="canvas"][data-pt-mode="${mode.toLowerCase()}"]`),
  ).toBeVisible();
}

async function dragOverlay(page: Page, overlayId: string, dx: number, dy: number): Promise<void> {
  const overlay = page.locator(`[data-pt-overlay-id="${overlayId}"]`);
  await expect(overlay).toBeVisible();
  const box = await overlay.boundingBox();
  expect(box, `${overlayId} overlay had no bounding box`).toBeTruthy();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe("APP-073 PT Design interactive canvas", () => {
  test.beforeAll(async () => {
    if (!(await liveBoardEnvReady())) {
      test.skip(
        true,
        `Atmos WS not reachable on ws://127.0.0.1:${apiPort}/ws; PT Design E2E needs the live board bridge`,
      );
    }
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chromium",
      "APP-073 board journeys are desktop Chromium (TEST.md Non-coverage: mobile); client_id=global cannot register two boards",
    );
  });

  test("@spec S6 — Interact commits select, input, and click", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Interact");
    const select = page.locator('[data-pt-overlay-id="model"]');
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.getByRole("button").click();
    await page.getByRole("option", { name: "Gemini" }).click();
    await page.locator('[data-pt-overlay-id="prompt"]').locator("input").fill("hello from S6");
    await page.locator('[data-pt-overlay-id="run"]').getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("Running run")).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => {
        const ptx = await getPtx();
        return ptx.includes('value="gemini"') && ptx.includes("hello from S6");
      })
      .toBe(true);
  });

  test("@spec S29 — Select list is in-page, not an OS popup", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Interact");
    const select = page.locator('[data-pt-overlay-id="model"]');
    await expect(select.locator("select")).toHaveCount(0);
    await select.getByRole("button").click();
    const option = page.getByRole("option", { name: "Gemini" });
    await expect(option).toBeVisible();
    await option.click();
    await expect(select.getByRole("button")).toContainText("Gemini");
  });

  test("@spec S10 — Interact pointer drag does not change node spatial", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Interact");
    const before = await getPtx();
    expect(before).toContain('id="run"');
    expect(buttonAttr(before, "x")).toBe(300);
    expect(buttonAttr(before, "y")).toBe(300);
    await dragOverlay(page, "run", 80, 40);
    const after = await getPtx();
    expect(buttonAttr(after, "x")).toBe(300);
    expect(buttonAttr(after, "y")).toBe(300);
  });

  test("@spec S9 — Edit drag writes extract x/y", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Edit");
    await dragOverlay(page, "run", 280, 40);
    await expect
      .poll(async () => {
        const ptx = await getPtx();
        return Math.abs(buttonAttr(ptx, "x") - 300) > 20 || Math.abs(buttonAttr(ptx, "y") - 300) > 20;
      })
      .toBe(true);
    const moved = await getPtx();
    expect(moved).toContain('id="run"');
    expect(buttonAttr(moved, "x") !== 300 || buttonAttr(moved, "y") !== 300).toBe(true);
  });

  test("@spec S11 — Interact pan does not change node spatial", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Interact");
    const board = page.getByTestId("pt-design-board");
    const box = await board.boundingBox();
    expect(box, "board had no bounding box").toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height * 0.85;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y + 50, { steps: 8 });
    await page.mouse.up();
    const got = await getPtx();
    expect(buttonAttr(got, "x")).toBe(300);
    expect(buttonAttr(got, "y")).toBe(300);
  });

  test("@spec S21 — Cmd+Z after Edit drag restores extract", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Edit");
    await dragOverlay(page, "run", 90, 0);
    await expect
      .poll(async () => Math.abs(buttonAttr(await getPtx(), "x") - 300))
      .toBeGreaterThan(20);
    await page.keyboard.press(UNDO);
    await expect.poll(async () => buttonAttr(await getPtx(), "x")).toBe(300);
    await expect.poll(async () => buttonAttr(await getPtx(), "y")).toBe(300);
  });

  test("@spec S30 — Cmd+Z after pt_ptx_apply in Edit Mode reverts XML", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Edit");
    const current = await getPtx();
    expect(current).not.toContain("deepseek");
    const edited = current.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    await applyPtx(edited);
    await expect.poll(async () => (await getPtx()).includes("deepseek")).toBe(true);
    await page.locator('[data-pt-overlay-id="run"]').click({ force: true });
    await page.keyboard.press(UNDO);
    await expect.poll(async () => (await getPtx()).includes("deepseek")).toBe(false);
  });

  test("@spec S31 — Cmd+Z in Interact does not undo the board", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    await switchMode(page, "Edit");
    await dragOverlay(page, "run", 90, 0);
    await expect.poll(async () => Math.abs(buttonAttr(await getPtx(), "x") - 300)).toBeGreaterThan(20);
    const movedX = buttonAttr(await getPtx(), "x");
    await switchMode(page, "Interact");
    await page.keyboard.press(UNDO);
    await expect.poll(async () => buttonAttr(await getPtx(), "x")).toBe(movedX);
    await switchMode(page, "Edit");
    await page.locator('[data-pt-overlay-id="run"]').click({ force: true });
    await page.keyboard.press(UNDO);
    await expect.poll(async () => buttonAttr(await getPtx(), "x")).toBe(300);
  });

  test("@spec S33 — Live capture returns image bytes", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page);
    let shot = await invokeTool("pt_screenshot", {});
    if (!shot.ok) {
      shot = await invokeTool("pt_screenshot", { nodeIds: ["run"] });
    }
    expect(
      shot.ok,
      `pt_screenshot failed: ${shot.error?.code ?? "not-ok"} ${shot.error?.message ?? JSON.stringify(shot)}`,
    ).toBe(true);
    expect(invokeHasPng(shot), "pt_screenshot data is not a PNG (mime/mediaType + magic 89 50 4E 47)").toBe(
      true,
    );
  });

  test("@spec S5 — Interact representative overlay dialog and block.auth-form", async ({ page }) => {
    test.setTimeout(180_000);
    await openSeededPtDesign(page, S5_REPRESENTATIVE_PTX);
    await switchMode(page, "Interact");

    const dlg = page.locator('[data-pt-overlay-id="dlg"]');
    await expect(dlg, "dialog overlay did not project").toBeVisible({ timeout: 30_000 });
    await expect(dlg.locator('[role="dialog"]')).toBeVisible();

    const dlgPlacement = await dlg.evaluate((el) => ({
      inOverlay: Boolean(el.closest("[data-pt-overlay]")),
      parentIsBody: el.parentElement === document.body,
    }));
    expect(dlgPlacement.inOverlay, "dialog overlay node must live inside [data-pt-overlay]").toBe(true);
    expect(dlgPlacement.parentIsBody, "dialog overlay must not be a document.body portal").toBe(false);

    const escapedDialogs = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"]')]
        .filter((el) => !el.closest("[data-pt-overlay]"))
        .map((el) => ({
          tag: el.tagName,
          parent: el.parentElement?.tagName ?? "",
        })),
    );
    expect(escapedDialogs, "dialog role escaped outside [data-pt-overlay] (Radix body portal)").toEqual([]);

    const auth = page.locator('[data-pt-overlay-id="auth"]');
    await expect(auth, "block.auth-form overlay did not project").toBeVisible({ timeout: 30_000 });
    await expect(auth.locator("input")).not.toHaveCount(0);
    await expect(auth.locator("button")).not.toHaveCount(0);
    await expect(auth.locator("[data-pt-unresolved-type]")).toHaveCount(0);
  });
});
