import { describe, expect, it } from "bun:test";
import {
  ATMOS_OPEN_HREF,
  findAtmosUrlInArgv,
  isAtmosProtocolUrl,
} from "./deep-link.ts";

describe("desktop atmos deep link", () => {
  it("recognizes atmos://open and other atmos URLs", () => {
    expect(isAtmosProtocolUrl(ATMOS_OPEN_HREF)).toBe(true);
    expect(isAtmosProtocolUrl("atmos://app")).toBe(true);
    expect(isAtmosProtocolUrl("atmos://hub-auth/callback")).toBe(true);
    expect(isAtmosProtocolUrl("https://app.atmos.land")).toBe(false);
    expect(isAtmosProtocolUrl("")).toBe(false);
  });

  it("finds the protocol URL in Windows-style argv", () => {
    expect(
      findAtmosUrlInArgv([
        "C:\\Program Files\\Atmos\\Atmos.exe",
        "--allow-file-access-from-files",
        "atmos://open",
      ]),
    ).toBe("atmos://open");
    expect(findAtmosUrlInArgv(["electron", ".", "--dev"])).toBeNull();
  });
});
