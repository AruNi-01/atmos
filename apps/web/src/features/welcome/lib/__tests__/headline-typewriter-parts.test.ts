// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { headlineTypewriterParts } from "../welcome-page-helpers";

const EN: Record<string, string> = {
  "helpers.headline.comeAlive.prefix": "What should come alive in",
  "helpers.headline.questionMark": "?",
  "helpers.headline.spinUpNext.prefix": "What do you want",
  "helpers.headline.spinUpNext.suffix": "to spin up next",
  "helpers.headline.startBuildingWithYou.prefix": "What should",
  "helpers.headline.startBuildingWithYou.suffix": "start building with you",
  "helpers.headline.deservesWorkspace.prefix": "What idea deserves an",
  "helpers.headline.deservesWorkspace.suffix": "workspace",
};

const ZH: Record<string, string> = {
  "helpers.headline.comeAlive.prefix": "你希望什么在",
  "helpers.headline.questionMark": "里活起来",
  "helpers.headline.spinUpNext.prefix": "你想让",
  "helpers.headline.spinUpNext.suffix": "接下来启动什么",
  "helpers.headline.startBuildingWithYou.prefix": "你希望",
  "helpers.headline.startBuildingWithYou.suffix": "和你一起开始构建什么",
  "helpers.headline.deservesWorkspace.prefix": "什么想法值得拥有一个",
  "helpers.headline.deservesWorkspace.suffix": "工作区",
};

function t(map: Record<string, string>) {
  return (key: string) => map[key] ?? key;
}

describe("headlineTypewriterParts", () => {
  it("splits English headlines around the Atmos brand word", () => {
    expect(headlineTypewriterParts("come_alive", t(EN))).toEqual([
      { text: "What" },
      { text: "should" },
      { text: "come" },
      { text: "alive" },
      { text: "in" },
      { text: "Atmos", brand: true },
    ]);

    expect(headlineTypewriterParts("spin_up_next", t(EN))).toEqual([
      { text: "What" },
      { text: "do" },
      { text: "you" },
      { text: "want" },
      { text: "Atmos", brand: true },
      { text: "to" },
      { text: "spin" },
      { text: "up" },
      { text: "next" },
    ]);
  });

  it("drops trailing punctuation from Chinese phrases", () => {
    expect(headlineTypewriterParts("come_alive", t(ZH))).toEqual([
      { text: "你希望什么在" },
      { text: "Atmos", brand: true },
      { text: "里活起来" },
    ]);
  });

  it("drops a punctuation-only token", () => {
    expect(headlineTypewriterParts("come_alive", t({
      ...EN,
      "helpers.headline.questionMark": "?",
    }))).toEqual([
      { text: "What" },
      { text: "should" },
      { text: "come" },
      { text: "alive" },
      { text: "in" },
      { text: "Atmos", brand: true },
    ]);
  });
});
