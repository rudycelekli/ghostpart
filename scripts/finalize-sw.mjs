import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = fileURLToPath(new URL("../dist/", import.meta.url));
const assetDir = join(outputDir, "assets");
const assets = (
  await readdir(assetDir, { recursive: true, withFileTypes: true })
)
  .filter((entry) => entry.isFile())
  .map((entry) => relative(outputDir, join(entry.parentPath, entry.name)));
const swPath = join(outputDir, "sw.js");
const sw = await readFile(swPath, "utf8");
const placeholder = "/* BUILD_ASSETS */ []";
if (!sw.includes(placeholder))
  throw new Error("Service worker asset placeholder is missing.");
await writeFile(swPath, sw.replace(placeholder, JSON.stringify(assets)));
