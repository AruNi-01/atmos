import { describe, expect, test } from "bun:test";

import { localServiceCommandLabel } from "./local-service-command-label";

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
});
