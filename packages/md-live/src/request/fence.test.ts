import { describe, expect, test } from "bun:test";
import { createFenceExtractor } from "./fence";

describe("createFenceExtractor", () => {
  test("emits only inner markdown from chunked html fence", () => {
    const ex = createFenceExtractor();
    expect(ex.push("noise ").payloadDelta).toBe("");
    const a = ex.push("<!--atmos-md-live-->Hello");
    expect(a.done).toBe(false);
    expect(a.payloadDelta).toBe("Hello");
    const b = ex.push(" world<!--/atmos-md-live-->trailer");
    expect(b.payloadDelta).toBe(" world");
    expect(b.done).toBe(true);
    expect(b.abort).toBeUndefined();
  });

  test("no-fence abort on end", () => {
    const ex = createFenceExtractor();
    ex.push("just tool output");
    const ended = ex.end();
    expect(ended.abort).toBe("no-fence");
    expect(ended.payloadDelta).toBe("");
    expect(ended.done).toBe(true);
  });

  test("junk abort on tool_use inside fence", () => {
    const ex = createFenceExtractor();
    const result = ex.push('<!--atmos-md-live-->{"tool_use":true}<!--/atmos-md-live-->');
    expect(result.abort).toBe("junk");
    expect(result.done).toBe(true);
    expect(result.payloadDelta).toBe("");
  });

  test("unwraps one markdown code fence inside the html fence", () => {
    const ex = createFenceExtractor();
    const inner = "```markdown\n# Hi\n```";
    const result = ex.push(`<!--atmos-md-live-->${inner}<!--/atmos-md-live-->`);
    expect(result.done).toBe(true);
    expect(result.payloadDelta).toBe("# Hi");
  });
});
