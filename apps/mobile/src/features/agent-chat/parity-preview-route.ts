/** Where a parity build should send the cold-start route. */
export function parityPreviewHref(
  flag: string | undefined,
  pathname: string,
): "/preview-chat" | null {
  if (flag !== "1") return null;
  if (
    pathname === "/preview-chat" ||
    pathname.startsWith("/preview-chat/") ||
    pathname.startsWith("/preview-chat?")
  ) {
    return null;
  }
  // Cold start opens `(home)`, which paints the pair screen when no computer
  // is connected. `unstable_settings.initialRouteName` still mounted
  // preview-chat (the route log fired) and left this screen on top.
  if (
    pathname === "/" ||
    pathname === "" ||
    pathname.startsWith("/(home)") ||
    pathname.startsWith("/sign-in")
  ) {
    return "/preview-chat";
  }
  return null;
}
