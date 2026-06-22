import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const hyperframesDir = path.resolve(path.dirname(__filename), "..");
const gsapSourcePath = path.join(hyperframesDir, "node_modules/gsap/dist/gsap.min.js");
const gsapAssetPath = path.join(hyperframesDir, "assets/gsap.min.js");

export async function syncRuntimeAssets() {
  await fs.mkdir(path.dirname(gsapAssetPath), { recursive: true });
  try {
    await fs.copyFile(gsapSourcePath, gsapAssetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Missing GSAP runtime. Run npm install before previewing or rendering.");
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    await syncRuntimeAssets();
    console.log("synced assets/gsap.min.js");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
