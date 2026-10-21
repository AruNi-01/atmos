// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useBucketCandidateLoad } from "./use-bucket-candidate-load";
import { useFilteredListWindow } from "./use-filtered-list-window";

const trace = { calls: 0 };

function retryNext(): Promise<boolean> {
  return Promise.resolve(false);
}

function CandidateProbe(props: {
  surface: "home" | "bucket";
  ready: boolean;
  sessionKey: string;
  reloadKey: string;
  load: () => void;
}) {
  useBucketCandidateLoad(props);
  return React.createElement("span", { "data-during": String(trace.calls) });
}

function PageProbe(props: {
  rows: number[];
  fetching: boolean;
  fetchNext: () => Promise<boolean>;
}) {
  const list = useFilteredListWindow({
    fetchFailed: false,
    fetchNext: props.fetchNext,
    fetching: props.fetching,
    filterKey: "bucket",
    hasNextServerPage: true,
    pending: false,
    retryNext,
    rows: props.rows,
  });
  return React.createElement(
    "button",
    { onClick: () => list.onEndReached(), type: "button" },
    "more",
  );
}

describe("filtered list hooks", () => {
  let root: Root | null = null;
  let container: HTMLElement;

  beforeEach(() => {
    trace.calls = 0;
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      writable: true,
      value: true,
    });
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window as unknown as Window & typeof globalThis.window;
    globalThis.document = window.document as unknown as Document;
    container = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  function render(node: ReactNode) {
    act(() => {
      root?.render(node);
    });
  }

  test("bucket candidates load after the opening render, then when sessions change", () => {
    const load = () => {
      trace.calls += 1;
    };
    render(
      React.createElement(CandidateProbe, {
        load,
        ready: true,
        reloadKey: "ws",
        sessionKey: "term-a",
        surface: "bucket",
      }),
    );
    expect(container.querySelector("[data-during]")?.getAttribute("data-during")).toBe("0");
    expect(trace.calls).toBe(1);

    render(
      React.createElement(CandidateProbe, {
        load,
        ready: true,
        reloadKey: "ws",
        sessionKey: "term-a",
        surface: "bucket",
      }),
    );
    expect(trace.calls).toBe(1);

    render(
      React.createElement(CandidateProbe, {
        load,
        ready: true,
        reloadKey: "ws",
        sessionKey: "term-a\nterm-b",
        surface: "bucket",
      }),
    );
    expect(container.querySelector("[data-during]")?.getAttribute("data-during")).toBe("1");
    expect(trace.calls).toBe(2);
  });

  test("home and an empty bucket do not load candidates", () => {
    const load = () => {
      trace.calls += 1;
    };
    render(
      React.createElement(CandidateProbe, {
        load,
        ready: true,
        reloadKey: "ws",
        sessionKey: "term-a",
        surface: "home",
      }),
    );
    render(
      React.createElement(CandidateProbe, {
        load,
        ready: true,
        reloadKey: "ws",
        sessionKey: "",
        surface: "bucket",
      }),
    );
    expect(trace.calls).toBe(0);
  });

  test("a fast page request unlocks the next one without a loading render", async () => {
    let fetches = 0;
    const rows = Array.from({ length: 20 }, (_, index) => index);
    const fetchNext = () => {
      fetches += 1;
      return Promise.resolve(true);
    };
    render(React.createElement(PageProbe, { fetchNext, fetching: false, rows }));
    expect(fetches).toBe(0);

    const button = container.querySelector("button");
    if (!button) throw new Error("missing end-reached button");
    await act(async () => {
      button.click();
    });
    expect(fetches).toBe(1);

    await act(async () => {
      button.click();
    });
    expect(fetches).toBe(2);
  });

  test("an in-flight page blocks a second end event, then a short list can fill", async () => {
    let fetches = 0;
    let resolveFetch: (value: boolean) => void = () => undefined;
    const fetchNext = () => {
      fetches += 1;
      return new Promise<boolean>((resolve) => {
        resolveFetch = resolve;
      });
    };
    const full = Array.from({ length: 20 }, (_, index) => index);
    render(React.createElement(PageProbe, { fetchNext, fetching: false, rows: full }));
    const button = container.querySelector("button");
    if (!button) throw new Error("missing end-reached button");

    await act(async () => {
      button.click();
    });
    expect(fetches).toBe(1);
    await act(async () => {
      button.click();
    });
    expect(fetches).toBe(1);

    render(React.createElement(PageProbe, { fetchNext, fetching: false, rows: [1] }));
    expect(fetches).toBe(1);

    await act(async () => {
      resolveFetch(true);
    });
    expect(fetches).toBe(2);
  });
});
