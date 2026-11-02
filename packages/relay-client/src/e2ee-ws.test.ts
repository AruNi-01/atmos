import { describe, expect, test } from "bun:test";
import {
  decodeB64Std,
  deriveRelayHttpE2eeKey,
  encodeB64Std,
  encodeB64Url,
  frameAad,
  generateX25519KeyPair,
  openRecord,
  RelayFrameCodec,
  sealRecord,
} from "./e2ee";
import { wrapRelayE2eeSocket, type RelayE2eeSocketLike } from "./e2ee-ws";

class FakeSocket implements RelayE2eeSocketLike {
  readyState = 1;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: RelayE2eeSocketLike["onopen"] = null;
  onclose: RelayE2eeSocketLike["onclose"] = null;
  onerror: RelayE2eeSocketLike["onerror"] = null;
  onmessage: RelayE2eeSocketLike["onmessage"] = null;

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }

  emit(data: string) {
    this.onmessage?.({ data });
  }
}

function session() {
  const computer = generateX25519KeyPair();
  const eph = generateX25519KeyPair();
  const key = deriveRelayHttpE2eeKey({
    localSecret: eph.secretKey,
    peerPublic: computer.publicKey,
    ephPublic: eph.publicKey,
    staticPublic: computer.publicKey,
  });
  const ephPk = encodeB64Url(eph.publicKey);
  return { key, ephPk, codec: new RelayFrameCodec(key, "app", ephPk) };
}

describe("wrapRelayE2eeSocket", () => {
  test("seals outbound JSON and opens inbound sealed frames", () => {
    const { key, ephPk, codec } = session();
    const raw = new FakeSocket();
    const wrapped = wrapRelayE2eeSocket(raw, codec);
    const inbound: string[] = [];
    wrapped.onmessage = (event) => inbound.push(String(event.data));

    wrapped.send('{"hello":1}');
    expect(raw.sent).toHaveLength(1);
    expect(raw.sent[0]).not.toContain("hello");
    expect(
      new TextDecoder().decode(
        openRecord(key, frameAad(ephPk, "app", 0, "frame_c2s"), decodeB64Std(raw.sent[0]!)),
      ),
    ).toBe('{"hello":1}');

    const s2c = encodeB64Std(
      sealRecord(
        key,
        frameAad(ephPk, "app", 0, "frame_s2c"),
        new TextEncoder().encode('{"ok":true}'),
      ),
    );
    raw.emit(s2c);
    expect(inbound).toEqual(['{"ok":true}']);
  });

  test("passes Worker plaintext relay_ctrl and closes on garbage", () => {
    const { codec } = session();
    const raw = new FakeSocket();
    const wrapped = wrapRelayE2eeSocket(raw, codec);
    const inbound: string[] = [];
    wrapped.onmessage = (event) => inbound.push(String(event.data));

    raw.emit(JSON.stringify({ type: "relay_ctrl", code: "server_offline" }));
    expect(inbound).toEqual([JSON.stringify({ type: "relay_ctrl", code: "server_offline" })]);

    raw.emit("%%%not-a-record%%%");
    expect(raw.closed).toEqual({ code: 4003, reason: "e2ee_open_failed" });
  });
});
