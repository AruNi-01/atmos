/** App/terminal frame E2EE handshake helpers. ServerHub never holds the session key. */

import type { RelayEnvelope } from "./envelope";

const ALG = "x25519-chacha20poly1305";

export type ClientFrameE2ee = {
  eph_pk: string;
};

function isValidEphPk(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function parseClientFrameE2ee(url: URL): ClientFrameE2ee | null | "invalid" {
  const flag = url.searchParams.get("e2ee")?.trim();
  if (!flag || flag === "0") {
    return null;
  }
  const alg = url.searchParams.get("e2ee_alg")?.trim() ?? "";
  const ephPk = url.searchParams.get("eph_pk")?.trim() ?? "";
  if (alg !== ALG || !isValidEphPk(ephPk)) {
    return "invalid";
  }
  return { eph_pk: ephPk };
}

export function e2eeOpenEnvelope(
  sid: string,
  stream: "app" | "terminal",
  ephPk: string,
): RelayEnvelope {
  return {
    v: 1,
    stream,
    kind: "e2ee_open",
    from: `client:${sid}`,
    to: "server",
    body: JSON.stringify({
      v: 1,
      alg: ALG,
      eph_pk: ephPk,
    }),
  };
}
