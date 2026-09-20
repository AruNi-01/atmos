import { describe, expect, test } from "bun:test";
import { enUS } from "date-fns/locale";
import { format, fromUnixTime } from "date-fns";
import {
  formatBlameAbsolute,
  formatBlameWhen,
} from "@/shared/lib/codemirror-git-blame-time";

describe("formatBlameWhen", () => {
  test("joins relative time with local-timezone wall clock", () => {
    const timestamp = 1_711_024_332;
    const absolute = formatBlameAbsolute(timestamp);
    const label = formatBlameWhen(timestamp, enUS);
    expect(absolute).toBe(format(fromUnixTime(timestamp), "yyyy-MM-dd HH:mm:ss"));
    expect(label.endsWith(`(${absolute})`)).toBe(true);
    expect(label.includes("ago")).toBe(true);
  });
});
