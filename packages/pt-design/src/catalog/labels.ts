const ACRONYMS: Record<string, string> = {
  otp: "OTP",
  kbd: "Kbd",
  ui: "UI",
};

export function catalogDisplayName(componentType: string): string {
  const raw = componentType.startsWith("block.") ? componentType.slice("block.".length) : componentType;
  return raw
    .split("-")
    .filter(Boolean)
    .map((part) => ACRONYMS[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
