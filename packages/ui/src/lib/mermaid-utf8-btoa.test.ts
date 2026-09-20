import { describe, expect, test } from "bun:test";
import { installMermaidUtf8Btoa } from "./mermaid-utf8-btoa";

describe("installMermaidUtf8Btoa", () => {
  test("keeps Latin1 encodings identical to native btoa", () => {
    installMermaidUtf8Btoa();
    expect(btoa("Atmos.app / WS")).toBe("QXRtb3MuYXBwIC8gV1M=");
    expect(btoa("hello")).toBe("aGVsbG8=");
  });

  test("encodes mermaid edge points that include CJK labels", () => {
    installMermaidUtf8Btoa();
    const points = JSON.stringify([{ id: "User", label: "用户", x: 8, y: 66 }, { x: 33, y: 37 }]);
    const encoded = btoa(points);
    const utf8Binary = String.fromCharCode(...new TextEncoder().encode(points));
    expect(encoded.length).toBeGreaterThan(0);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(encoded).toBe(btoa(utf8Binary));
  });
});
