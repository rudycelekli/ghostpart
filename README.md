# GhostPart

**Make what is missing.** GhostPart is an open-source, local-first repair workbench. Its first release measures flat mounting points from a phone photo and generates a printable, editable replacement plate.

> **Status: experimental v0.4.** This is a working planar repair tool with a guided accuracy check and an early fit revision loop. Real-world fit and strength are unverified.

**[Try GhostPart in your browser →](https://rudycelekli.github.io/ghostpart/)** Public HTTPS app. Works on phones; no account or install required.

## Try it

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the [hosted HTTPS app](https://rudycelekli.github.io/ghostpart/) on a phone, or use the local URL printed by Vite. The sample project is loaded by default. Rotate the 3D part, change fit controls, and download an STL or editable OpenSCAD file. No account, cloud API, model key, or photo upload service is involved.

Before measuring a real object, print the [accuracy check card](public/accuracy-check-40mm.svg) and run the app's **Accuracy check** with five new photos. The [pretest guide](PRETEST.md) explains the physical readings and pass rule. The app locks the measured values across captures, checks each view against them, saves the session on this device, and exports a photo-free JSON report or CSV scan table.

## Repair something

1. Download and print the [automatic calibration marker](public/marker-auto-40mm.svg) at **100% scale**, without “fit to page.” Its **black square**, rather than the whole white card, must measure 40 mm. Check it with a ruler. The [older manual marker](public/marker-40mm.svg) remains available.
2. Put the marker on the **same flat plane** as the mounting holes. Take a sharp photo as square-on as practical. The camera, motion, and orientation controls work best in a secure browser context (HTTPS or localhost).
3. Add the photo and click **Find marker** to propose the four black-square corners. Check the overlay. If detection fails, click the black square's corners manually, clockwise from the top left. [js-aruco2](https://github.com/damianofalcioni/js-aruco2) performs detection locally and is MIT licensed.
4. Click the center of at least two mounting holes, then choose **Build this part**.
5. Enter the marker side length **as measured on the print** and check the box. Measure each hole center spacing independently with calipers or a ruler and enter it in Measurement review. Zoom in and re-mark points if the app reports unstable placement. A later zoom does not improve points already marked.
6. Set edge margin, thickness, hole diameter, and corner radius. Print the optional clearance coupon (three holes at target diameter ±0.2 mm) and test it with the actual screw. Then select the working hole diameter for the full plate.
7. Export STL for a slicer or OpenSCAD for editable CAD. Check print orientation, material, screw clearance, and fit on the real object.
8. For a two-hole flat plate, put the printed test part and target mount on the same plane so both pairs of hole centers are visible. Take a new photo with the checked marker nearby. In **Fit loop**, mark the marker, target centers, and printed centers in matching order. Measure the printed hole-center spacing on the part with calipers or a ruler and enter it. The target and print measurements drive revision 2 only when both agree with the photo and the capture is stable. Download its STL, editable CAD, fit receipt, or vertical proof card. A photo or test print is never uploaded by the app.

### What works today

- Perspective-corrected planar measurements from a manually marked 40 mm reference square.
- Automatic ArUco marker proposals with manual correction. A detected marker is still subject to measurement review.
- A measurement review that compares the photo with independently entered marker and hole-spacing measurements, simulates point-placement sensitivity, and blocks exports when the capture is unstable or the checks disagree.
- Browser camera capture or image upload, with all processing on the device.
- Optional local repair reasoning with [Ollama](https://ollama.com/). The model receives a measurement ledger and your description; a photo is included only if you opt in and the selected local model supports vision. Model advice is separate from CAD and cannot change the dimensions.
- Optional phone accelerometer and orientation readout for steadier capture.
- Flat, rounded mounting plates with multiple holes, plus STL and editable OpenSCAD export.
- A three-size printable screw clearance coupon, also available as STL and editable OpenSCAD.
- A two-hole scan–print–rescan loop that requires a physical print measurement, cross-checks it against the photo, rejects mismatched or unstable scans, and generates a measured second CAD revision. It can export a local JSON receipt and shareable PNG proof card.
- An HTTPS, installable web app published by GitHub Pages. The app shell can work offline after its assets are cached; Ollama reasoning still needs a local model running.
- Optional microphone tap comparison before and after a repair. It reports the strongest frequency of the loudest captured moment; it is **not** a strength or safety assessment.
- A working sample project and a printable calibration marker.
- A printable accuracy check card and repeatability protocol for a pre-repair bench check.
- A guided five-view accuracy check that locks physical readings, prevents photo reuse, records failures, and applies a conservative repeatability gate before a repair trial.

### Boundaries

The marker and measured holes must be coplanar. Lens distortion, a bent marker, imprecise clicks, or a marker printed at the wrong scale can spoil fit. Automatic marker detection does **not** correct lens distortion. The point-placement range is a reproducible sensitivity simulation, **not** a statistical confidence interval or a complete error bound. The independent check is limited by your ruler or caliper technique. The fit loop corrects two-hole spacing only; it cannot infer a hidden hole center from an occluded photo or establish structural safety. Neither code nor AI infers hidden geometry, load capacity, material strength, printer tolerance, or whether a repair is safe. Do not use it for structural, electrical, medical, vehicle, or other safety-critical parts.

### Optional local AI

Install [Ollama](https://ollama.com/) separately and start a model on the same device. Click **Connect Ollama on this device**, choose a model, describe the repair, and click **Analyze this repair** after measurements are cross-checked. The app uses Ollama's [chat API](https://docs.ollama.com/api/chat) with structured JSON output. A [vision-capable model](https://docs.ollama.com/capabilities/vision) can also receive the photo when you explicitly select that option. The app connects only to `127.0.0.1:11434`; it has no cloud fallback. AI output is unverified advice, never measurement authority.

Phone depth APIs vary by device and browser. Native depth and 3D reconstruction are research tracks, not v0.4 features.

## Why this exists

AI-generated 3D objects often look plausible but fail when printed. GhostPart focuses first on **measured function**: where the part attaches, what dimensions it needs, and whether a real print fits. The longer-term research goal is to infer missing functional geometry from an object and its mating surface, generate editable parametric CAD, and improve the design from test-fit feedback.

See [ROADMAP.md](ROADMAP.md) for the staged plan and acceptance criteria.

## Development

```sh
npm test
npm run build
npm audit
```

The code is TypeScript, React, Three.js, and Vite. `src/lib/measure.ts` contains the planar homography and dimensions. `src/lib/quality.ts` handles measurement review and sensitivity checks. `src/lib/preflight.ts` evaluates the five-view accuracy check. `src/lib/fit.ts` computes the measured second revision. `src/lib/cad.ts` builds the 3D mesh and editable source. `src/lib/localAi.ts` isolates the optional Ollama connection. The app has no server component. GitHub Pages deployment is defined in [pages.yml](.github/workflows/pages.yml).

## Contribute

Real repair cases are the most valuable contribution. Share the broken object's photos, measured dimensions, generated design, printer/material, and whether the first and second prints fit. Remove personal details and locations before posting. See [CONTRIBUTING.md](CONTRIBUTING.md).

MIT licensed. See [LICENSE](LICENSE).
