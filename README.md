# GhostPart

**Make what is missing.** GhostPart is an open-source, local-first repair workbench. Its first release measures flat mounting points from a phone photo and generates a printable, editable replacement plate.

> **Status: experimental v0.7.0.** This is a working planar repair tool with printed and paperless reference modes, a guided printed-card accuracy check, an early fit revision loop, a dimensioned description-to-CAD studio, and an experimental WebXR depth preview. Real-world fit and strength are unverified.

**[Try GhostPart in your browser →](https://rudycelekli.github.io/ghostpart/)** Public HTTPS app. Works on phones; no account or install required.

## Try it

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the [hosted HTTPS app](https://rudycelekli.github.io/ghostpart/) on a phone, or use the local URL printed by Vite. The sample project is loaded by default. Rotate the 3D part, change fit controls, and download an STL or editable OpenSCAD file. No account, cloud API, model key, or photo upload service is involved.

For the printed-marker workflow, first print the [accuracy check card](public/accuracy-check-40mm.svg) and run the app's **Accuracy check** with five new photos. The [pretest guide](PRETEST.md) explains the physical readings and pass rule. The app locks the measured values across captures, checks each view against them, saves the session on this device, and exports a photo-free JSON report or CSV scan table.

### No-printer capture

Select **No printer · measured rectangle**. Place a rigid, flat rectangular object with four clear corners next to the holes on the _same plane_. Measure its actual width and height with a ruler or calipers; do not rely on a nominal product size. Add a photo, mark its corners clockwise from top left, then mark at least two hole centers. Width is edge 1→2 and height is edge 2→3. Enter both reference dimensions and independently measure every hole spacing. Exports remain locked until the measurements agree and point placement is stable. For the fit loop, use the same measured rectangle again beside both target and printed holes.

This removes the printed card, **not** the need for a physical scale measurement. The five-photo Accuracy check currently requires its own printed card and does not certify the paperless reference. A rigid rectangle can have rounded or obscured corners, thickness, or placement on another plane; reject those captures. If you cannot measure two sides and a hole spacing independently, do not treat the generated dimensions as verified.

### Try phone depth

On a compatible ARCore Android phone, open the HTTPS app in Chrome, scroll to **Use the sensors you already own**, and tap **Start depth preview**. Grant the AR camera permission. The overlay reports center distance, depth map resolution, and whether the browser granted raw, smooth, or unreported depth. Point at a matte surface and move slowly. Compare a few readings with a physical distance at different ranges; the preview is for capability and repeatability checks only. If the button says depth is unavailable, send the phone model, browser, and OS version with the result. On iPhone, this browser path cannot activate LiDAR; a native ARKit capture app is the next integration.

### Describe a part in millimetres

Open [Describe to 3D](https://rudycelekli.github.io/ghostpart/#describe-to-3d). Try `A 60 mm x 20 mm x 4 mm plate with two 5 mm holes 40 mm apart and 3 mm corner radius.` or `A washer with 20 mm outer diameter, 5 mm inner diameter, 4 mm thickness.` The offline parser accepts these explicit forms; the editable fields and 3D preview let you inspect every value before downloading STL or OpenSCAD. The example buttons work without AI or a photo. A local Ollama model can interpret freer phrasing, but every nonzero output dimension must occur explicitly in the description with `mm`; invented values and geometrically impossible drafts are rejected. Model output still needs human review because it may misassign an explicitly stated number.

This is a separate **unverified design draft**, not a measurement of the object. It never alters the cross-checked repair plate. Verify dimensions and fit physically before use.

## Repair something

For the printed-marker route:

1. Download and print the [automatic calibration marker](public/marker-auto-40mm.svg) at **100% scale**, without “fit to page.” Its **black square**, rather than the whole white card, must measure 40 mm. Check it with a ruler. The [older manual marker](public/marker-40mm.svg) remains available.
2. Put the marker on the **same flat plane** as the mounting holes. Take a sharp photo as square-on as practical. The camera, motion, and orientation controls work best in a secure browser context (HTTPS or localhost).
3. Add the photo and click **Find marker** to propose the four black-square corners. Check the overlay. If detection fails, click the black square's corners manually, clockwise from the top left. [js-aruco2](https://github.com/damianofalcioni/js-aruco2) performs detection locally and is MIT licensed.
   If you choose **Live camera**, wait until a moving picture appears and **Capture frame** becomes available. If permission is blocked or the camera is busy, the app shows a specific message; allow this site to use the camera or use **Add a photo** instead.
4. Click the center of at least two mounting holes, then choose **Build this part**.
5. Enter the marker side length **as measured on the print** and check the box. Measure each hole center spacing independently with calipers or a ruler and enter it in Measurement review. Zoom in and re-mark points if the app reports unstable placement. A later zoom does not improve points already marked.
6. Set edge margin, thickness, hole diameter, and corner radius. Print the optional clearance coupon (three holes at target diameter ±0.2 mm) and test it with the actual screw. Then select the working hole diameter for the full plate.
7. Export STL for a slicer or OpenSCAD for editable CAD. Check print orientation, material, screw clearance, and fit on the real object.
8. For a two-hole flat plate, put the printed test part and target mount on the same plane so both pairs of hole centers are visible. Take a new photo with the checked marker nearby. In **Fit loop**, mark the marker, target centers, and printed centers in matching order. Measure the printed hole-center spacing on the part with calipers or a ruler and enter it. The target and print measurements drive revision 2 only when both agree with the photo and the capture is stable. Download its STL, editable CAD, fit receipt, or vertical proof card. A photo or test print is never uploaded by the app.

### What works today

- Perspective-corrected planar measurements from a verified printed square or a measured rigid rectangle.
- Automatic ArUco marker proposals with manual correction. A detected marker is still subject to measurement review.
- A measurement review that compares the photo with independently entered marker and hole-spacing measurements, simulates point-placement sensitivity, and blocks exports when the capture is unstable or the checks disagree.
- Browser camera capture or image upload, with all processing on the device.
- Optional local repair reasoning with [Ollama](https://ollama.com/). The model receives a measurement ledger and your description; a photo is included only if you opt in and the selected local model supports vision. Model advice is separate from CAD and cannot change the dimensions.
- Description-to-editable-CAD for flat two-hole plates and ring spacers, with offline explicit-dimension parsing, local AI interpretation as an option, geometric validation, a 3D preview, and STL/OpenSCAD exports. These are unverified drafts separate from measured repairs.
- Optional phone accelerometer and orientation readout for steadier capture.
- An opt-in WebXR depth preview on compatible ARCore Android phones in Chrome. It requests CPU-readable depth, preferring the raw depth type when available, only after you tap **Start depth preview**. It shows the browser-granted mode and a live center distance. Depth data stays on the device and never sets CAD scale.
- Flat, rounded mounting plates with multiple holes, plus STL and editable OpenSCAD export.
- A three-size printable screw clearance coupon, also available as STL and editable OpenSCAD.
- A two-hole scan–print–rescan loop that requires a physical print measurement, cross-checks it against the photo, rejects mismatched or unstable scans, and generates a measured second CAD revision. It can export a local JSON receipt and shareable PNG proof card.
- An HTTPS, installable web app published by GitHub Pages. The app shell can work offline after its assets are cached; Ollama reasoning still needs a local model running.
- Optional microphone tap comparison before and after a repair. It reports the strongest frequency of the loudest captured moment; it is **not** a strength or safety assessment.
- A working sample project and a printable calibration marker.
- A printable accuracy check card and repeatability protocol for a pre-repair bench check.
- A guided five-view accuracy check that locks physical readings, prevents photo reuse, records failures, and applies a conservative repeatability gate before a repair trial.

### Boundaries

The reference and measured holes must be coplanar. Lens distortion, a bent reference, imprecise clicks, or an incorrect reference measurement can spoil fit. Automatic marker detection does **not** correct lens distortion. The point-placement range is a reproducible sensitivity simulation, **not** a statistical confidence interval or a complete error bound. The independent check is limited by your ruler or caliper technique. The fit loop corrects two-hole spacing only; it cannot infer a hidden hole center from an occluded photo or establish structural safety. Neither code nor AI infers hidden geometry, load capacity, material strength, printer tolerance, or whether a repair is safe. Do not use it for structural, electrical, medical, vehicle, or other safety-critical parts.

### Optional local AI

Install [Ollama](https://ollama.com/) separately and start a model on the same device. Click **Connect Ollama on this device**, choose a model, describe the repair, and click **Analyze this repair** after measurements are cross-checked. The app uses Ollama's [chat API](https://docs.ollama.com/api/chat) with structured JSON output. A [vision-capable model](https://docs.ollama.com/capabilities/vision) can also receive the photo when you explicitly select that option. The app connects only to `127.0.0.1:11434`; it has no cloud fallback. AI output is unverified advice, never measurement authority.

The description-to-CAD studio also supports local Ollama to map freer wording to plate or spacer parameters. It sends only the text you enter. The offline dimension parser and manual template editor need no model. Ollama on your desktop is not automatically available to your phone browser; the published phone site remains usable without it.

### Image-to-3D research

The following projects informed the design. No generative mesh backend is bundled into this web app, and their output is not accepted as measured repair geometry.

| Project                                                       | Useful capability                       | GhostPart boundary                                                                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [TripoSR](https://github.com/vast-ai-research/TripoSR)        | Single-image object reconstruction      | Its example inference uses about 6 GB GPU memory; use the mesh as visual reference, not hole scale.                                                                                             |
| [Modly](https://github.com/lightningpixel/modly)              | Local desktop image or prompt to 3D     | A plausible optional desktop companion, with its own model setup and hardware needs.                                                                                                            |
| [pic2stl](https://github.com/niljub/pic2stl)                  | Extrudes a thresholded image silhouette | Good for logos and profiles; it cannot recover concealed 3D surfaces.                                                                                                                           |
| [TRELLIS](https://github.com/microsoft/TRELLIS)               | Text or image to detailed 3D assets     | The documented setup needs an NVIDIA GPU with at least 16 GB memory. Concept meshes are not dimensioned CAD.                                                                                    |
| [Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) | Image-to-shape and texture models       | Shape inference documents 6 GB VRAM; its [community license](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE) has territory and use restrictions to assess before integration. |

The next image-to-3D milestone is an **optional concept-mesh import and side-by-side comparison** with measured mounting geometry. A mesh would remain visually useful but could not unlock repair export or supply dimensions without an independent physical scale and fit check.

Phone motion and orientation can help capture a steadier photo, but cannot establish absolute millimetre scale. [Chrome on supported Android devices can expose ARCore depth through WebXR](https://developers.google.com/ar/develop/webxr/arcore-comparison); GhostPart now offers an experimental live preview through that API. Newer [WebXR depth APIs can request a raw or smooth depth type](https://immersive-web.github.io/depth-sensing/), and the app reports what the browser grants. This is **not** the native [ARCore Raw Depth confidence image](https://developers.google.com/ar/develop/java/depth/raw-depth). [WebXR depth has limited browser availability](https://developer.mozilla.org/en-US/docs/Web/API/XRFrame/getDepthInformation). Accessing the native ARCore confidence image and [iPhone LiDAR scene depth](https://developer.apple.com/documentation/arkit/arframe/scenedepth) requires Android and iOS integrations. No depth path sets repair dimensions until device-specific comparisons against physical measurements pass.

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
