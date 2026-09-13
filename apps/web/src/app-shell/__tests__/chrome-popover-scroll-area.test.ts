import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

function count(source: string, snippet: string) {
  return source.split(snippet).length - 1;
}

describe("chrome popover scroll areas", () => {
  it("fades the quota popover provider row, detail list, and carousel list", () => {
    const source = read("../QuotaPopover.tsx");
    expect(count(source, "<ScrollArea")).toBe(3);
    expect(count(source, "scrollFade")).toBe(3);
    expect(source).toContain("viewportRef={providerScrollRef}");
    expect(source).toContain("overflow-y-hidden");
    expect(source).not.toContain("overflow-x-auto");
    expect(source).not.toContain("overflow-y-auto");
    expect(source).not.toContain("no-scrollbar");
    expect(source).not.toContain("bg-gradient-to-r from-background/95");
    expect(source).toContain("h-[min(62vh,560px)]");
    expect(source).toContain("scrollbarGutter");
  });

  it("fades the resource monitor popover and nested CPU core list", () => {
    const popover = read("../../features/resource-monitor/components/ResourceMonitorPopover.tsx");
    const footer = read("../../features/resource-monitor/components/ResourceMonitorFooterItem.tsx");
    const host = read("../../features/resource-monitor/components/ResourceMonitorHostSection.tsx");
    expect(popover).toContain("<ScrollArea");
    expect(popover).toContain("scrollFade");
    expect(popover).not.toContain("overflow-y-auto");
    expect(footer).toContain("overflow-y-hidden");
    expect(count(host, "<ScrollArea")).toBe(1);
    expect(host).toContain("scrollFade");
    expect(host).toContain('viewportClassName="h-auto max-h-64"');
    expect(host).toContain("overflow-y-hidden");
    expect(host).not.toContain("overflow-y-auto");
  });

  it("fades the local services footer popover list", () => {
    const source = read("../../features/local-services/components/LocalServicesFooterItem.tsx");
    expect(source).toContain("<ScrollArea");
    expect(source).toContain("scrollFade");
    expect(source).toContain("overflow-y-hidden");
    expect(source).toContain("max-h-[min(420px,var(--radix-popover-content-available-height))]");
    expect(source).toContain('viewportClassName="h-auto max-h-[min(420px,var(--radix-popover-content-available-height))] p-3"');
    expect(source).not.toContain("overflow-y-auto");
  });

  it("fades the agent status footer popover list", () => {
    const source = read("../Footer.tsx");
    expect(source).toContain("<ScrollArea");
    expect(source).toContain("scrollFade");
    expect(source).toContain("w-72 max-h-64");
    expect(source).toContain("overflow-y-hidden");
    expect(source).toContain('viewportClassName={cn("p-2", !embedded && "h-auto max-h-64")}');
    expect(source).not.toContain("overflow-y-auto");
  });
});
