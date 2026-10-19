// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { permissionOptionTone, preferredPrimaryPermissionOptionId } from "./permission-actions";

const allowOnce = { option_id: "allow_once", name: "Allow" };
const allowAlways = { option_id: "allow_always", name: "Always allow" };
const deny = { option_id: "reject_once", name: "Deny" };
const skip = { option_id: "skip", name: "Skip", kind: "reject" };

describe("permission option tones", () => {
  test("Allow is primary and Deny is ghost, matching web command actions", () => {
    const options = [deny, allowOnce];
    expect(preferredPrimaryPermissionOptionId(options)).toBe("allow_once");
    expect(permissionOptionTone(allowOnce, options)).toBe("primary");
    expect(permissionOptionTone(deny, options)).toBe("ghost");
  });

  test("prefers allow_once over allow_always so Always stays ghost", () => {
    const options = [allowAlways, allowOnce, deny];
    expect(permissionOptionTone(allowOnce, options)).toBe("primary");
    expect(permissionOptionTone(allowAlways, options)).toBe("ghost");
    expect(permissionOptionTone(deny, options)).toBe("ghost");
  });

  test("a reject-only primary candidate stays ghost", () => {
    expect(preferredPrimaryPermissionOptionId([skip])).toBeNull();
    expect(permissionOptionTone(skip, [skip])).toBe("ghost");
  });

  test("bare once is not treated as allow-once; reject is never chosen as primary", () => {
    const once = { option_id: "once", name: "Once" };
    const options = [deny, once, allowOnce];
    expect(preferredPrimaryPermissionOptionId(options)).toBe("allow_once");
    expect(permissionOptionTone(once, options)).toBe("ghost");
    expect(permissionOptionTone(deny, options)).toBe("ghost");
    expect(preferredPrimaryPermissionOptionId([deny, skip])).toBeNull();
  });
});
