export const MD_LIVE_FENCE_OPEN = "<!--atmos-md-live-->";
export const MD_LIVE_FENCE_CLOSE = "<!--/atmos-md-live-->";
export const MD_LIVE_CODE_FENCE_LANG = "atmos-md-live";

export type FenceAbort = "no-fence" | "junk";

export type FencePushResult = {
  payloadDelta: string;
  done: boolean;
  abort?: FenceAbort;
};

const TOOL_JUNK = /"tool_use"|tool_use/;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/;

function looksLikeJunk(text: string): boolean {
  if (TOOL_JUNK.test(text)) return true;
  if (ANSI.test(text) && text.length > 24) return true;
  return false;
}

function unwrapMarkdownWrapper(inner: string): string {
  const trimmed = inner.trim();
  const wrapped = trimmed.match(/^```(?:markdown|md)[ \t]*\r?\n([\s\S]*?)\r?\n```$/);
  return wrapped ? wrapped[1] : inner;
}

export type FenceExtractor = {
  push(chunk: string): FencePushResult;
  end(): FencePushResult;
  reset(): void;
};

export function createFenceExtractor(): FenceExtractor {
  let buffer = "";
  let emitted = 0;
  let opened: "html" | "code" | null = null;
  let finished = false;
  let aborted: FenceAbort | undefined;

  function result(delta: string, done: boolean, abort?: FenceAbort): FencePushResult {
    return abort ? { payloadDelta: delta, done, abort } : { payloadDelta: delta, done };
  }

  function innerAfterOpen(): string {
    if (opened === "html") {
      const idx = buffer.indexOf(MD_LIVE_FENCE_OPEN);
      return idx >= 0 ? buffer.slice(idx + MD_LIVE_FENCE_OPEN.length) : "";
    }
    const marker = "```" + MD_LIVE_CODE_FENCE_LANG;
    const idx = buffer.indexOf(marker);
    if (idx < 0) return "";
    let rest = buffer.slice(idx + marker.length);
    if (rest.startsWith("\r\n")) rest = rest.slice(2);
    else if (rest.startsWith("\n")) rest = rest.slice(1);
    return rest;
  }

  function closedInner(inner: string): { payload: string; closed: boolean } {
    if (opened === "html") {
      const close = inner.indexOf(MD_LIVE_FENCE_CLOSE);
      if (close < 0) return { payload: inner, closed: false };
      return { payload: inner.slice(0, close), closed: true };
    }
    const close = inner.search(/\r?\n```/);
    if (close < 0) return { payload: inner, closed: false };
    return { payload: inner.slice(0, close), closed: true };
  }

  function ingest(): FencePushResult {
    if (aborted) return result("", true, aborted);
    if (finished) return result("", true);

    if (!opened) {
      if (buffer.includes(MD_LIVE_FENCE_OPEN)) opened = "html";
      else if (buffer.includes("```" + MD_LIVE_CODE_FENCE_LANG)) opened = "code";
    }
    if (!opened) return result("", false);

    const { payload, closed } = closedInner(innerAfterOpen());
    if (looksLikeJunk(payload)) {
      aborted = "junk";
      finished = true;
      return result("", true, "junk");
    }
    const unwrapped = closed ? unwrapMarkdownWrapper(payload) : payload;
    const delta = unwrapped.slice(emitted);
    emitted = unwrapped.length;
    if (closed) {
      finished = true;
      return result(delta, true);
    }
    return result(delta, false);
  }

  return {
    push(chunk: string): FencePushResult {
      if (finished || aborted) {
        return result("", true, aborted);
      }
      buffer += chunk;
      return ingest();
    },
    end(): FencePushResult {
      if (finished || aborted) return result("", true, aborted);
      if (!opened) {
        aborted = "no-fence";
        finished = true;
        return result("", true, "no-fence");
      }
      const last = ingest();
      if (!last.done && !last.abort) {
        finished = true;
        return result(last.payloadDelta, true);
      }
      return last;
    },
    reset(): void {
      buffer = "";
      emitted = 0;
      opened = null;
      finished = false;
      aborted = undefined;
    },
  };
}
