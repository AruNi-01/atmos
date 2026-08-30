import { spawnSync } from "node:child_process";
import path from "node:path";
import { rewriteShadcnAliases } from "./rewrite-shadcn-aliases";

const uiRoot = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const result = spawnSync("bunx", ["--bun", "shadcn@latest", "add", ...args], {
  cwd: uiRoot,
  stdio: "inherit",
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const changed = await rewriteShadcnAliases();
if (changed.length === 0) {
  console.log("shadcn aliases: no @/ imports to rewrite");
} else {
  for (const file of changed) {
    console.log(`shadcn aliases: ${path.relative(uiRoot, file)}`);
  }
}
