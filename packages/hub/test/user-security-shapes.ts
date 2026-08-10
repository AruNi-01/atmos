/** Fixture shapes for user-security API responses (no secrets leaked). */
export const LINK_TICKET_SHAPES = {
  sampleAccount: {
    id: "acc_1",
    providerId: "github",
    accountId: "12345",
    userId: "user_1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    scopes: ["read:user"],
    email: null as string | null,
  },
  sampleSession: {
    id: "sess_1",
    token: "tok_abcdefghijklmnop",
    userId: "user_1",
    expiresAt: new Date("2026-12-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ipAddress: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  },
};
