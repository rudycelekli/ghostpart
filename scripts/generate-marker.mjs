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

writeFileSync(
  new URL("../public/accuracy-check-40mm.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="170mm" height="130mm" viewBox="0 0 170 130">
  <title>GhostPart accuracy check card: 40 mm marker and three target centers</title>
  <rect width="170" height="130" fill="white"/>
  <text x="12" y="13" font-family="Arial,sans-serif" font-size="5" font-weight="bold" fill="#182020">GHOSTPART / ACCURACY CHECK</text>
  <text x="12" y="20" font-family="Arial,sans-serif" font-size="3" fill="#182020">Print at 100%. Measure the physical print before scanning.</text>
  <g stroke="#182020" stroke-width="0.45" fill="none">
    <circle cx="30" cy="35" r="2.5"/><path d="M25 35h10M30 30v10"/>
    <circle cx="90" cy="35" r="2.5"/><path d="M85 35h10M90 30v10"/>
    <circle cx="30" cy="95" r="2.5"/><path d="M25 95h10M30 90v10"/>
  </g>
  <g font-family="Arial,sans-serif" font-size="3.5" fill="#182020">
    <text x="23" y="43">H1</text><text x="83" y="43">H2</text><text x="23" y="104">H3</text>
    <text x="43" y="32">60 mm nominal</text>
    <text x="12" y="68" transform="rotate(-90 12 68)">60 mm nominal</text>
  </g>
  <g transform="translate(40 45) scale(5)">
    ${cells}
  </g>
  <text x="65" y="98" font-family="Arial,sans-serif" font-size="2.6" text-anchor="middle" fill="#182020">BLACK SQUARE = 40 mm</text>
  <text x="12" y="120" font-family="Arial,sans-serif" font-size="3" fill="#182020">Enter measured H1-H2 and H1-H3 spans in the app, not the nominal labels.</text>
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
