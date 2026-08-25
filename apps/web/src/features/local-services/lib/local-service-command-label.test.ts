import { describe, expect, test } from "bun:test";

import {
  localServiceCommandLabel,
  localServiceCommandTooltip,
} from "./local-service-command-label";

describe("localServiceCommandLabel", () => {
  test("uses only the last path segment plus following args", () => {
    expect(
      localServiceCommandLabel(
        "node /Users/lurunrun/.npm/_npx/cef9b194a47a5767/node_modules/.bin/agentation-mcp server",
      ),
    ).toBe("agentation-mcp server");
  });

  test("does not keep parent directories of the script path", () => {
    expect(
      localServiceCommandLabel(
        "node /repo/apps/web/node_modules/next/dist/server/lib/start-server.js",
      ),
    ).toBe("start-server.js");
  });

  test("skips flags before the script path", () => {
    expect(localServiceCommandLabel('java -jar "/opt/apps/api.jar" --port 8080')).toBe(
      "api.jar --port 8080",
    );
  });

  test("handles windows paths", () => {
    expect(localServiceCommandLabel("node C:\\Users\\dev\\.bin\\vite.js --port 5173")).toBe(
      "vite.js --port 5173",
    );
  });

  test("without a path, drops the leading runtime token", () => {
    expect(localServiceCommandLabel("node server.js")).toBe("server.js");
    expect(localServiceCommandLabel("next-server")).toBe("next-server");
  });

  test("keeps spaces in process titles instead of leaving only the version", () => {
    expect(localServiceCommandLabel("next-server (v16.3.0)")).toBe("next-server (v16.3.0)");
    expect(localServiceCommandLabel("node (v16.3.0)")).toBe("node (v16.3.0)");
  });
});

describe("localServiceCommandTooltip", () => {
  test("keeps the full command when it contains a path", () => {
    const command =
      "node /Users/aarynlu/OpenSource/atmos/apps/web/node_modules/.bin/next dev --port 3030";
    expect(localServiceCommandTooltip(command, "/Users/aarynlu/OpenSource/atmos/apps/web")).toBe(
      command,
    );
  });

  test("prefers the recovered launch command over the process title", () => {
    expect(
      localServiceCommandTooltip(
        "next-server (v16.3.0)",
        "/Users/aarynlu/OpenSource/atmos/apps/web",
        "node /Users/aarynlu/OpenSource/atmos/apps/web/node_modules/.bin/next dev --port 3030",
      ),
    ).toBe(
      "node /Users/aarynlu/OpenSource/atmos/apps/web/node_modules/.bin/next dev --port 3030",
    );
  });

  test("falls back to the launch directory when the command has no path", () => {
    expect(
      localServiceCommandTooltip(
        "next-server (v16.3.0)",
        "/Users/aarynlu/OpenSource/atmos/apps/web",
      ),
    ).toBe("/Users/aarynlu/OpenSource/atmos/apps/web");
  });

  test("falls back to the command when no path is available", () => {
    expect(localServiceCommandTooltip("next-server (v16.3.0)")).toBe("next-server (v16.3.0)");
    expect(localServiceCommandTooltip("next-server (v16.3.0)", "  ")).toBe("next-server (v16.3.0)");
  });
});
