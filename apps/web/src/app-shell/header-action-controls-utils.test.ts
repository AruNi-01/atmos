import { describe, expect, it } from "bun:test";

import { formatComputerSeenAt } from "./header-action-controls-utils";

const t = () => "Recently";
const julyThirdSeconds = Date.UTC(2026, 6, 3, 12, 0, 0) / 1000;

describe("formatComputerSeenAt", () => {
  it("formats dates with the selected English locale", () => {
    expect(formatComputerSeenAt(julyThirdSeconds, "en", t)).toBe("Jul 3");
  });

  it("formats dates with the selected Chinese locale", () => {
    expect(formatComputerSeenAt(julyThirdSeconds, "zh", t)).toBe("7月3日");
  });

  it("falls back when the timestamp is invalid", () => {
    expect(formatComputerSeenAt(Number.NaN, "en", t)).toBe("Recently");
  });
});
