import { readFileSync, writeFileSync } from "node:fs";
import aruco from "js-aruco2";

const { AR } = aruco;

const generated = new AR.Dictionary("ARUCO_MIP_36h12").generateSVG(7);
const cells = generated.match(/<rect\b[^>]*\/>/g)?.join("\n    ");
if (!cells) throw new Error("Marker generator returned no cells.");

writeFileSync(
  new URL("../public/marker-auto-40mm.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="58mm" viewBox="0 0 50 58">
  <title>GhostPart automatic marker. Black square measures 40 mm.</title>
  <g transform="scale(5)">
    ${cells}
  </g>
  <text x="25" y="54" font-family="Arial,sans-serif" font-size="2.3" text-anchor="middle" fill="#182020">BLACK SQUARE = 40 mm · PRINT AT 100%</text>
</svg>
`,
);

const start = "  <!-- AUTO_MARKER_START -->";
const end = "  <!-- AUTO_MARKER_END -->";
for (const [filename, markerY, labelY] of [
  ["demo-workbench.svg", 335, 548],
  ["demo-fit.svg", 430, 643],
]) {
  const sampleUrl = new URL(`../public/${filename}`, import.meta.url);
  const sample = readFileSync(sampleUrl, "utf8");
  const marker = `${start}
  <g transform="translate(553 ${markerY}) scale(20)" filter="url(#shadow)">
    ${cells}
  </g>
  <text x="653" y="${labelY}" font-family="Arial,sans-serif" font-size="11" letter-spacing="1" text-anchor="middle" fill="#edf0eb">GHOSTPART / 40 mm</text>
${end}`;
  const first = sample.indexOf(start);
  const last = sample.indexOf(end);
  if (first < 0 || last < first)
    throw new Error(`${filename} marker sentinels are missing.`);
  writeFileSync(
    sampleUrl,
    sample.slice(0, first) + marker + sample.slice(last + end.length),
  );
}
