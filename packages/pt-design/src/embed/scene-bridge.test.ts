import { describe, expect, test } from "bun:test";
import {
  applyHistoryInversePartial,
  bumpHandleVersions,
  cloneScenePtCustomData,
  createPtRestampState,
  excalidrawElementsToScene,
  excalidrawStrippedElementDelta,
  fillMissingPtCustomData,
  keepOverlayThroughEmptyLoad,
  mergePtPayloadSource,
  ptPayloadSource,
  sceneFingerprint,
  sceneToExcalidrawElements,
  stampPtCustomData,
  toExcalidrawCompatElements,
} from "./scene-bridge";
import type { PtElement, PtScene } from "../core/types";
import { extractDocument, parsePtx, projectDocument, serializePtx } from "../protocol";

function rect(overrides: Partial<PtElement> & Pick<PtElement, "id">): PtElement {
  return {
    type: "rectangle",
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    locked: false,
    ...overrides,
  };
}

describe("excalidraw scene bridge", () => {
  test("projected handles without roughness get the sketch default", () => {
    const els = toExcalidrawCompatElements([
      { id: "el_run", type: "rectangle", x: 0, y: 0, width: 120, height: 40 },
    ]);
    expect(els[0]?.roughness).toBe(1);
    expect(els[0]?.roundness).toEqual({ type: 3, value: 12 });
    expect(els[0]?.strokeColor).toBe("#1e1e1e");
    expect(els[0]?.strokeWidth).toBe(2);
  });
  test("round-trip keeps handle payload and required fields", () => {
    const scene: PtScene = {
      elements: [
        rect({
          id: "el_run",
          x: 12,
          y: 24,
          customData: { pt: { schemaVersion: 1, instanceId: "run", componentType: "button", catalogVersion: "1", props: { label: "Save" } } },
        }),
      ],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    const elements = sceneToExcalidrawElements(scene);
    expect(elements.length).toBe(1);
    expect(elements[0]?.strokeStyle).toBe("solid");
    expect(typeof elements[0]?.version).toBe("number");
    expect(elements[0]?.link).toBeNull();
    expect(elements[0]?.customData?.pt?.props.label).toBe("Save");

    const moved = elements.map((el) => ({ ...el, x: el.x + 40 }));
    const next = excalidrawElementsToScene(moved, { viewBackgroundColor: "#ffffff" });
    expect(next.elements[0]?.x).toBe(52);
    expect(sceneFingerprint(next)).not.toBe(sceneFingerprint(scene));
  });

  test("tall unbound labels are recentered when pushed to the board", () => {
    const scene: PtScene = {
      elements: [
        {
          ...rect({ id: "txt" }),
          type: "text",
          text: "Save",
          y: 0,
          height: 32,
          fontSize: 13,
          lineHeight: 1.25,
          verticalAlign: "middle",
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    const shown = sceneToExcalidrawElements(scene, "light");
    const label = shown.find((el) => el.type === "text");
    expect(label?.height).toBe(16);
    expect(label?.y).toBe(8);
  });

  test("Virgil text is coerced to bundled Excalifont so labels stay handwritten", () => {
    const scene: PtScene = {
      elements: [
        {
          ...rect({ id: "txt" }),
          type: "text",
          text: "Hi",
          fontFamily: 1,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    const shown = sceneToExcalidrawElements(scene, "light");
    expect(shown.filter((el) => el.type === "text").every((el) => el.fontFamily === 5)).toBe(true);
    const stored = excalidrawElementsToScene(shown, { viewBackgroundColor: "#ffffff" }, "light");
    expect(stored.elements.filter((el) => el.type === "text").every((el) => el.fontFamily === 5)).toBe(true);
  });

  test("dark theme remaps default Excalidraw ink so freehand stays visible", () => {
    const raw: PtScene = {
      elements: [rect({ id: "rect-1" })],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    const shown = sceneToExcalidrawElements(raw, "dark");
    expect(shown[0]?.strokeColor).toBe("#fafafa");
    const stored = excalidrawElementsToScene(shown, { viewBackgroundColor: "#09090b" }, "dark");
    expect(stored.elements[0]?.strokeColor).toBe("#1e1e1e");
  });

  test("PT paper handles keep Artist ink on a dark canvas", () => {
    const raw: PtScene = {
      elements: [
        rect({
          id: "el_run",
          backgroundColor: "#fffef7",
          customData: { pt: { instanceId: "run", componentType: "button" } },
        }),
      ],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    const shown = sceneToExcalidrawElements(raw, "dark");
    expect(shown[0]?.strokeColor).toBe("#1e1e1e");
    expect(shown[0]?.backgroundColor).toBe("#fffef7");
    expect(shown[0]?.roughness).toBe(1);
  });

  test("fingerprint includes fill and canvas background", () => {
    const scene: PtScene = {
      elements: [rect({ id: "a", backgroundColor: "#ffffff" })],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    const fillOnly: PtScene = {
      ...scene,
      elements: scene.elements.map((el) => ({ ...el, backgroundColor: "#ef4444" })),
    };
    const backgroundOnly: PtScene = {
      ...scene,
      appState: { viewBackgroundColor: "#fafafa" },
    };
    expect(sceneFingerprint(fillOnly)).not.toBe(sceneFingerprint(scene));
    expect(sceneFingerprint(backgroundOnly)).not.toBe(sceneFingerprint(scene));
  });
});

const SEEDED_PTX = `<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
    <option value="gemini">Gemini</option>
  </select>
  <input id="prompt" label="Prompt" value="" x="300" y="250" width="240" height="40"/>
  <button id="run" label="Run" x="300" y="300" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
</page>
`;

describe("ptx-only handle convert", () => {
  test("stamps customData.pt after convert so extract keeps page-level ids", () => {
    const handles = projectDocument(parsePtx(SEEDED_PTX), []);
    const dropped = handles.map((el) => {
      const { customData: _omit, ...rest } = el;
      void _omit;
      return { ...rest, seed: 1, versionNonce: 1 };
    });
    expect(dropped.every((el) => el.customData === undefined)).toBe(true);
    const stamped = stampPtCustomData(dropped, handles);
    expect(stamped.map((el) => el.customData?.pt?.id)).toEqual(["model", "prompt", "run"]);

    const converted = toExcalidrawCompatElements(handles);
    expect(converted.every((el) => typeof el.seed === "number")).toBe(true);
    expect(converted.map((el) => el.customData?.pt?.id)).toEqual(["model", "prompt", "run"]);
    const extracted = extractDocument(converted);
    expect(extracted.pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });

  test("fillMissingPtCustomData restores pt after geometry-only restore clones", () => {
    const handles = projectDocument(parsePtx(SEEDED_PTX), []);
    const converted = toExcalidrawCompatElements(handles);
    const geometryOnly = converted.map((el) => {
      const { customData: _omit, ...rest } = el;
      void _omit;
      return { ...rest };
    });
    expect(geometryOnly.every((el) => el.customData === undefined)).toBe(true);
    const filled = fillMissingPtCustomData(geometryOnly, converted);
    expect(extractDocument(filled).pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    const already = fillMissingPtCustomData(converted, converted);
    expect(already.map((el) => el.customData?.pt?.id)).toEqual(["model", "prompt", "run"]);
  });

  test("fillMissingPtCustomData keeps History-restored payload on the applied nonce", () => {
    const seed = toExcalidrawCompatElements(projectDocument(parsePtx(SEEDED_PTX), []));
    const appliedXml = SEEDED_PTX.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    const applied = bumpHandleVersions(
      toExcalidrawCompatElements(projectDocument(parsePtx(appliedXml), seed)),
    );
    const merged = mergePtPayloadSource(ptPayloadSource(seed), ptPayloadSource(applied));
    const undone = applied.map((el) => {
      const prev = seed.find((item) => item.id === el.id);
      return { ...el, customData: prev?.customData };
    });
    expect(serializePtx(extractDocument(undone))).not.toContain("deepseek");
    const restored = fillMissingPtCustomData(undone, merged);
    const xml = serializePtx(extractDocument(restored));
    expect(xml).not.toContain("deepseek");
    expect(xml).toContain("claude");
  });

  test("fillMissingPtCustomData does not refill applied nonce after live dropped customData", () => {
    const seed = toExcalidrawCompatElements(projectDocument(parsePtx(SEEDED_PTX), []));
    const appliedXml = SEEDED_PTX.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    const applied = bumpHandleVersions(
      toExcalidrawCompatElements(projectDocument(parsePtx(appliedXml), seed)),
    );
    const merged = mergePtPayloadSource(ptPayloadSource(seed), ptPayloadSource(applied));
    const witnessed = new Set<string>();
    fillMissingPtCustomData(applied, merged, witnessed);
    expect(witnessed.size).toBeGreaterThan(0);
    const shapeC = applied.map((el) => {
      const { customData: _omit, ...rest } = el;
      void _omit;
      return { ...rest };
    });
    expect(shapeC.every((el) => el.customData === undefined)).toBe(true);
    expect(shapeC.map((el) => el.versionNonce)).toEqual(applied.map((el) => el.versionNonce));
    expect(shapeC.map((el) => el.versionNonce)).not.toEqual(seed.map((el) => el.versionNonce));
    const filled = fillMissingPtCustomData(shapeC, merged, witnessed);
    const xml = serializePtx(extractDocument(filled));
    expect(xml).not.toContain("deepseek");
    expect(xml).toContain("claude");
    expect(extractDocument(filled).pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });

  test("createPtRestampState undo of full pre-apply elements does not refill applied payload", () => {
    const seed = toExcalidrawCompatElements(projectDocument(parsePtx(SEEDED_PTX), []));
    const appliedXml = SEEDED_PTX.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    const applied = bumpHandleVersions(
      toExcalidrawCompatElements(projectDocument(parsePtx(appliedXml), seed)),
    );
    const restamp = createPtRestampState();
    restamp.ingest(seed);
    expect(serializePtx(extractDocument(restamp.restamp(seed)))).not.toContain("deepseek");
    restamp.ingest(applied);
    expect(serializePtx(extractDocument(restamp.restamp(applied)))).toContain("deepseek");

    const preApply = seed.map((el) => ({
      ...el,
      customData: el.customData ? { pt: { ...el.customData.pt } } : el.customData,
    }));
    const undone = restamp.restamp(preApply);
    const xml = serializePtx(extractDocument(undone));
    expect(xml).not.toContain("deepseek");
    expect(xml).toContain("claude");

    const historyShape = applied.map((el) => {
      const prev = seed.find((item) => item.id === el.id);
      return { ...el, customData: prev?.customData };
    });
    const unstuck = restamp.restamp(historyShape);
    expect(serializePtx(extractDocument(unstuck))).not.toContain("deepseek");

    const shapeC = applied.map((el) => {
      const { customData: _omit, ...rest } = el;
      void _omit;
      return { ...rest };
    });
    expect(shapeC.every((el) => el.customData === undefined)).toBe(true);
    expect(shapeC.map((el) => el.versionNonce)).toEqual(applied.map((el) => el.versionNonce));
    expect(shapeC.map((el) => el.versionNonce)).not.toEqual(seed.map((el) => el.versionNonce));
    const missed = restamp.restamp(shapeC);
    const missedXml = serializePtx(extractDocument(missed));
    expect(missedXml).not.toContain("deepseek");
    expect(missedXml).toContain("claude");
    expect(extractDocument(missed).pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    const missedAgain = restamp.restamp(shapeC);
    expect(serializePtx(extractDocument(missedAgain))).toContain("claude");
    expect(extractDocument(missedAgain).pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });

  test("bumpHandleVersions changes versionNonce so IMMEDIATELY can enter history", () => {
    const bumped = bumpHandleVersions([{ id: "a", version: 1, versionNonce: 1 }]);
    expect(bumped[0]?.version).toBe(2);
    expect(bumped[0]?.versionNonce).toBe(2);
    expect(bumped[0]?.id).toBe("a");
  });

  test("bumpHandleVersions clones customData so History sees a distinct payload key", () => {
    const options = [{ value: "claude", label: "Claude" }];
    const pt = { id: "model", type: "select", options };
    const el = { id: "el_model", version: 1, versionNonce: 1, customData: { pt } };
    const bumped = bumpHandleVersions([el]);
    expect(bumped[0]?.customData).not.toBe(el.customData);
    expect(bumped[0]?.customData?.pt).not.toBe(pt);
    expect(bumped[0]?.customData?.pt?.options).not.toBe(options);
    expect(bumped[0]?.customData?.ptv).toBe(2);
    options.push({ value: "deepseek", label: "DeepSeek" });
    expect((bumped[0]?.customData?.pt?.options as { value: string }[]).map((o) => o.value)).not.toContain(
      "deepseek",
    );
    const cloned = cloneScenePtCustomData(el);
    expect(cloned.customData).not.toBe(el.customData);
    expect(cloned.customData?.pt).not.toBe(el.customData.pt);
    expect(cloned.customData?.ptv).toBe(1);
  });

  test("IMMEDIATELY apply delta after strip includes customData; inverse drops deepseek", () => {
    const seed = toExcalidrawCompatElements(projectDocument(parsePtx(SEEDED_PTX), []));
    const appliedXml = SEEDED_PTX.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    const applied = bumpHandleVersions(
      toExcalidrawCompatElements(projectDocument(parsePtx(appliedXml), seed)),
    );
    const modelPrev = seed.find((el) => el.customData?.pt?.id === "model") as Record<string, unknown>;
    const modelNext = applied.find((el) => el.customData?.pt?.id === "model") as Record<string, unknown>;
    expect(modelPrev).toBeDefined();
    expect(modelNext).toBeDefined();
    const delta = excalidrawStrippedElementDelta(modelPrev, modelNext);
    expect(delta).not.toBeNull();
    expect(Object.keys(delta!.inserted)).toContain("customData");
    expect(Object.keys(delta!.deleted)).toContain("customData");
    expect(JSON.stringify(delta!.inserted.customData)).toContain("deepseek");
    expect(JSON.stringify(delta!.deleted.customData)).not.toContain("deepseek");

    const undoneModel = applyHistoryInversePartial(modelNext, delta!.deleted);
    const restored = applied.map((el) =>
      el.customData?.pt?.id === "model" ? (undoneModel as typeof el) : el,
    );
    const xml = serializePtx(extractDocument(restored));
    expect(xml).not.toContain("deepseek");
    expect(xml).toContain("claude");
    expect(extractDocument(restored).pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });

  test("fillMissingPtCustomData copies payload only and keeps live spatial", () => {
    const live = [
      {
        id: "el_run",
        x: 50,
        y: 60,
        width: 100,
        height: 40,
        angle: 0,
      },
    ];
    const source = [
      {
        id: "el_run",
        x: 999,
        y: 888,
        width: 1,
        height: 1,
        angle: 2,
        customData: { pt: { id: "run", type: "button" } },
      },
    ];
    const filled = fillMissingPtCustomData(live, source);
    expect(filled[0]?.x).toBe(50);
    expect(filled[0]?.y).toBe(60);
    expect(filled[0]?.width).toBe(100);
    expect(filled[0]?.height).toBe(40);
    expect(filled[0]?.angle).toBe(0);
    expect(filled[0]?.customData?.pt?.id).toBe("run");
  });

  test("fillMissingPtCustomData does not resurrect a newer apply onto undo clones", () => {
    const seed = toExcalidrawCompatElements(projectDocument(parsePtx(SEEDED_PTX), []));
    const appliedXml = SEEDED_PTX.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    const applied = bumpHandleVersions(
      toExcalidrawCompatElements(projectDocument(parsePtx(appliedXml), seed)),
    );
    const undoClones = seed.map((el) => {
      const { customData: _omit, ...rest } = el;
      void _omit;
      return { ...rest };
    });
    expect(undoClones.every((el) => el.customData === undefined)).toBe(true);
    const fromAppliedOnly = fillMissingPtCustomData(undoClones, applied);
    expect(serializePtx(extractDocument(fromAppliedOnly))).not.toContain("deepseek");

    const merged = mergePtPayloadSource(ptPayloadSource(seed), ptPayloadSource(applied));
    const restored = fillMissingPtCustomData(undoClones, merged);
    const xml = serializePtx(extractDocument(restored));
    expect(xml).not.toContain("deepseek");
    expect(xml).toContain("claude");
    expect(extractDocument(restored).pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });
});

describe("keepOverlayThroughEmptyLoad", () => {
  test("does not replace a seeded overlay with an empty delayed echo while loading", () => {
    const seeded = extractDocument(projectDocument(parsePtx(SEEDED_PTX), []));
    const empty = { version: "ptx/1" as const, pages: [{ id: "page", nodes: [] }] };
    expect(keepOverlayThroughEmptyLoad(seeded, empty, true)).toBe(true);
    expect(keepOverlayThroughEmptyLoad(seeded, empty, false)).toBe(false);
    expect(keepOverlayThroughEmptyLoad(empty, empty, true)).toBe(false);
    expect(keepOverlayThroughEmptyLoad(seeded, seeded, true)).toBe(false);
  });
});
