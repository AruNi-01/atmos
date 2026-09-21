import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ProjectEmpty source", () => {
  const dir = import.meta.dir;
  const block = readFileSync(join(dir, "project-empty.tsx"), "utf8");
  const kit = readFileSync(join(dir, "empty-state-kit.tsx"), "utf8");

  it("vendors Spectrum project-empty Minimal with reusable kit primitives", () => {
    expect(block).toContain("Spectrum UI — ProjectEmpty");
    expect(block).toContain("from 'motion/react'");
    expect(block).not.toContain("framer-motion");
    expect(block).toContain("variant === 'Minimal'");
    expect(block).toContain("if (variant === 'Minimal') return emptyState");
    expect(block).toContain("docsLabel = 'Read the guide'");
    expect(block).toContain("@workspace/ui/lib/utils");
    expect(kit).toContain("Spectrum UI — empty-state kit");
    expect(kit).toContain('data-slot="empty-panel"');
    expect(kit).toContain('data-slot="empty-state"');
    expect(kit).toContain("EMPTY_FONT = 'antialiased'");
    expect(kit).not.toContain("font-inter");
    expect(kit).not.toContain("from '@workspace/ui/components/ui/button'");
    expect(kit).toContain("bg-primary text-primary-foreground");
    expect(kit).toContain("React.forwardRef<HTMLButtonElement, EmptyActionProps>");
    expect(kit).toContain("density?: 'default' | 'compact'");
    expect(kit).toContain("size?: 'sm' | 'md'");
    expect(kit).toContain("ACTION_SIZE");
    expect(block).toContain("docsAction");
    expect(block).toContain("createAction");
  });
});
