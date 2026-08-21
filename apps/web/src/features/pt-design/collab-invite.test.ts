import { describe, expect, test } from "bun:test";
import { hasPtDesignCollabInvite } from "./collab-invite";

describe("hasPtDesignCollabInvite", () => {
  test("accepts hosted invite hashes", () => {
    expect(
      hasPtDesignCollabInvite(
        "https://app.atmos.land/?tab=pt-design#room=abc123def456,secretKey",
      ),
    ).toBe(true);
    expect(
      hasPtDesignCollabInvite(
        "https://app.atmos.land/pt-design#room=abc123def456,secretKey",
      ),
    ).toBe(true);
    expect(
      hasPtDesignCollabInvite(
        "https://app.atmos.land/?room=abc123def456,secretKey",
      ),
    ).toBe(true);
  });

  test("ignores ordinary Prototype Design entry without a room", () => {
    expect(hasPtDesignCollabInvite("https://app.atmos.land/")).toBe(false);
    expect(hasPtDesignCollabInvite("https://app.atmos.land/?tab=pt-design")).toBe(
      false,
    );
    expect(hasPtDesignCollabInvite("https://app.atmos.land/pt-design")).toBe(
      false,
    );
    expect(hasPtDesignCollabInvite("https://app.atmos.land/#room=")).toBe(false);
    expect(hasPtDesignCollabInvite("https://app.atmos.land/#nope")).toBe(false);
  });
});
