/**
 * Desktop Use process lifecycle for the Electron shell.
 *
 * APP-076: the control-engine host is owned by Atmos Runtime, not Desktop.
 * Window hide and app quit must not pkill the host; `atmos runtime stop` does.
 */

/** Same `pkill -f` needle as `crates/desktop-use` `stop_daemon`. */
export const HOST_SERVE_PKILL_PATTERN =
  "Atmos Desktop Use.app/Contents/MacOS/.*serve";

/** APP-076: host daemon is owned by Runtime, not Desktop quit. */
export async function stopDesktopUseOnAppQuit(): Promise<void> {
  return;
}
