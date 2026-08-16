export function createId(prefix = "el"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function createInstanceId(): string {
  return `inst_${crypto.randomUUID().replaceAll("-", "")}`;
}
