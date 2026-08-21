import { join } from "node:path";

const dir = import.meta.dir;
const excalidrawCss = join(
  dir,
  "../node_modules/@excalidraw/excalidraw/dist/dev/index.css",
);
const themeCss = join(dir, "../src/embed/excalidraw-theme.css");

export async function startPlayground(port = Number(process.env.PT_DESIGN_PLAYGROUND_PORT ?? 4173)) {
  const built = await Bun.build({
    entrypoints: [join(dir, "main.tsx")],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
  });
  if (!built.success) {
    const message = built.logs.map((log) => String(log)).join("\n");
    throw new Error(`PT Design playground build failed:\n${message}`);
  }
  const js = await built.outputs[0]!.text();
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PT Design</title>
  <link rel="stylesheet" href="/excalidraw.css" />
  <style>
    html, body, #root { height: 100%; margin: 0; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="root" data-testid="pt-design-playground"></div>
  <script type="module" src="/playground.js"></script>
</body>
</html>`;

  const css = `${await Bun.file(excalidrawCss).text()}\n${await Bun.file(themeCss).text()}`;

  return Bun.serve({
    port,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/playground.js") {
        return new Response(js, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      }
      if (path === "/excalidraw.css") {
        return new Response(css, {
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      }
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
}

if (import.meta.main) {
  const server = await startPlayground();
  console.log(`PT Design playground http://127.0.0.1:${server.port}`);
}
