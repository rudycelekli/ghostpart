# GhostPart

**Make what is missing.** GhostPart is an open-source, local-first repair workbench. Its first release measures flat mounting points from a phone photo and generates a printable, editable replacement plate.

> **Status: experimental v0.1.** This is a working planar repair tool, not an automatic reconstruction system for arbitrary broken objects. Measure the generated dimensions independently before fabrication.

## Try it

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The sample project is loaded by default. Rotate the 3D part, change fit controls, and download an STL or editable OpenSCAD file. No account, cloud API, model key, or photo upload service is involved.

## Repair something

1. Download and print the [40 mm calibration marker](public/marker-40mm.svg) at **100% scale**, without “fit to page.” Check it with a ruler.
2. Put the marker on the **same flat plane** as the mounting holes. Take a sharp photo as square-on as practical. The camera, motion, and orientation controls work best in a secure browser context (HTTPS or localhost).
3. Add the photo. Click the marker's **outer** corners clockwise, starting at the top left.
4. Click the center of at least two mounting holes, then choose **Build this part**.
5. Set edge margin, thickness, hole diameter, and corner radius. Verify dimensions with a ruler or calipers.
6. Export STL for a slicer or OpenSCAD for editable CAD. Check print orientation, material, screw clearance, and fit on the real object.

### What works today

- Perspective-corrected planar measurements from a manually marked 40 mm reference square.
- Browser camera capture or image upload, with all processing on the device.
- Optional phone accelerometer and orientation readout for steadier capture.
- Flat, rounded mounting plates with multiple holes, plus STL and editable OpenSCAD export.
- Optional microphone tap comparison before and after a repair. It reports the strongest frequency of the loudest captured moment; it is **not** a strength or safety assessment.
- A working sample project and a printable calibration marker.

### Boundaries

The marker and measured holes must be coplanar. Lens distortion, a bent marker, imprecise clicks, or a marker printed at the wrong scale can spoil fit. The current generator only makes simple flat plates. It does not infer hidden geometry, load capacity, material strength, tolerances, or whether a repair is safe. Do not use it for structural, electrical, medical, vehicle, or other safety-critical parts.

Phone depth APIs vary by device and browser. Native depth and 3D reconstruction are research tracks, not v0.1 features.

## Why this exists

AI-generated 3D objects often look plausible but fail when printed. GhostPart focuses first on **measured function**: where the part attaches, what dimensions it needs, and whether a real print fits. The longer-term research goal is to infer missing functional geometry from an object and its mating surface, generate editable parametric CAD, and improve the design from test-fit feedback.

See [ROADMAP.md](ROADMAP.md) for the staged plan and acceptance criteria.

## Development

```sh
npm test
npm run build
npm audit
```

The code is TypeScript, React, Three.js, and Vite. `src/lib/measure.ts` contains the planar homography and dimensions. `src/lib/cad.ts` builds the 3D mesh and editable source. The app has no server component.

## Contribute

Real repair cases are the most valuable contribution. Share the broken object's photos, measured dimensions, generated design, printer/material, and whether the first and second prints fit. Remove personal details and locations before posting. See [CONTRIBUTING.md](CONTRIBUTING.md).

MIT licensed. See [LICENSE](LICENSE).
