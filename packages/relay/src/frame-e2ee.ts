/** App/terminal frame E2EE handshake helpers. Hub never holds the session key. */

import type { RelayEnvelope } from "./envelope";

const ALG = "x25519-chacha20poly1305";
const KEY_LEN = 32;

export type ClientFrameE2ee = {
  eph_pk: string;
};

function isValidEphPk(value: string): boolean {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    return binary.length === KEY_LEN;
  } catch {
    return false;
  }
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
