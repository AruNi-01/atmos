import { describe, expect, test } from "bun:test";
import { emailFromIdToken } from "../src/user-security";
import { LINK_TICKET_SHAPES } from "./user-security-shapes";

// Pure helpers without D1 — ticket format + account filter semantics.
describe("user-security shapes", () => {
  test("linked account response omits secrets", () => {
    const row = LINK_TICKET_SHAPES.sampleAccount;
    expect(row).not.toHaveProperty("accessToken");
    expect(row.providerId).toBe("github");
    expect(row.scopes).toEqual(["read:user"]);
  });

  test("session row keeps token for revoke", () => {
    const row = LINK_TICKET_SHAPES.sampleSession;
    expect(row.token.length).toBeGreaterThan(8);
    expect(row.userId).toBeTruthy();
  });

  test("emailFromIdToken reads OIDC payload email", () => {
    const payload = btoa(JSON.stringify({ email: "user@gmail.com", sub: "1" }));
    const token = `hdr.${payload}.sig`;
    expect(emailFromIdToken(token)).toBe("user@gmail.com");
    expect(emailFromIdToken(null)).toBe(null);
    expect(emailFromIdToken("not-a-jwt")).toBe(null);
  });
});
