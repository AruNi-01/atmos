/**
 * Apply Atmos host color scheme into a browser guest WebContents (APP-053).
 */

import type { WebContents } from "electron";

export type GuestColorScheme = "light" | "dark";

export async function applyGuestColorScheme(
  wc: WebContents,
  scheme: GuestColorScheme,
): Promise<void> {
  if (!wc || wc.isDestroyed()) return;
  const css = `:root, html { color-scheme: ${scheme} !important; }`;
  try {
    await wc.insertCSS(css);
  } catch {
    /* navigation mid-flight */
  }
  try {
    await wc.executeJavaScript(
      `(() => {
          var scheme = ${JSON.stringify(scheme)};
          try {
            document.documentElement.style.colorScheme = scheme;
            document.documentElement.setAttribute('data-atmos-color-scheme', scheme);
          } catch (_) {}
        })();`,
      true,
    );
  } catch {
    /* guest not ready */
  }
  // Emulate prefers-color-scheme media so dark sites style scrollbars like Chrome.
  try {
    const dbg = wc.debugger;
    let attachedHere = false;
    if (!dbg.isAttached()) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    await dbg.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* debugger busy (DevTools) — insertCSS / color-scheme still applied */
  }
}
