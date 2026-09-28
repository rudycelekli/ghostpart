# Before the first repair: accuracy check

This check exercises the actual phone, printer, marker, camera, and point-marking workflow on a flat, noncritical target. Passing it is **not** proof that a repair will fit or carry a load.

## What to prepare

- Print [the accuracy check card](public/accuracy-check-40mm.svg) at **100% scale** on ordinary paper. Disable “fit to page.” Keep it flat.
- Use the phone and browser you plan to use for the repair. Have a ruler or, preferably, calipers available.
- Measure the **black square** side on the physical print. The SVG nominal value is 40 mm, but enter the value you actually measure.
- Measure center-to-center H1→H2 and H1→H3 on the physical print. Both are nominally 60 mm. Enter your measured values, even if they differ from 60 mm. Keep the readings before looking at GhostPart's photo result.

The circles have a 5 mm nominal centerline diameter and a crosshair at each center. For a caliper measurement between two equal circles, measure outside-to-outside and subtract the **measured** circle diameter. A ruler aligned to the crosshairs is acceptable for a rough check; do not present ruler readings with false precision.

## Five-photo check

1. In the app's **Accuracy check**, enter the three readings from the _physical print_, tick the measurement checkbox, and select **Lock readings and begin**. The app carries those values into every new photo. Do not change them to make a photo pass.
2. Take five **new** photos of the card in the prompted order: square-on, modest left tilt, right tilt, up tilt, down tilt. Keep the whole card in focus. Do not reuse a photo or crop away the marker. Use the same lighting and rear camera you plan to use for the repair; avoid ultra-wide, digital zoom, portrait mode, and strong shadows.
3. For each photo, select **Add a photo**, run **Find marker**, and confirm the four proposed corners trace the black square. If it fails, mark the corners manually. Zoom to 3×–4× **before** tapping H1, H2, and H3 in that order, panning the image as needed. Zooming after the taps does not improve those points; re-mark them if needed.
4. Select **Record scan** under Accuracy check. Record incomplete or blocked captures too; they are useful evidence. The app prevents the same photo from filling two views. After all five, read the gate result and download **Report JSON** or **Scan table CSV**. The session survives a reload on the same device, but no photo is saved in it. Export the report before selecting **New session**, which clears the saved scans.

| Photo | View       | Auto marker? | H1→H2 photo (mm) | H1→H3 photo (mm) | Status / notes |
| ----- | ---------- | ------------ | ---------------: | ---------------: | -------------- |
| 1     | square-on  |              |                  |                  |                |
| 2     | left tilt  |              |                  |                  |                |
| 3     | right tilt |              |                  |                  |                |
| 4     | up tilt    |              |                  |                  |                |
| 5     | down tilt  |              |                  |                  |                |

**Preflight gate:** all five captures should be cross-checked, each reported span should be within **0.5 mm** of your corresponding physical reading, and the maximum minus minimum photo span across captures should be at most **0.5 mm** for each pair. The app calculates this automatically. The table above is an optional paper backup. This is a conservative decision rule for moving to a _noncritical_ repair trial, not a confidence interval or a claim of product accuracy. If it fails, improve lighting, flatten the card, move the marker closer in the frame, use more pixels, and repeat. Record repeated failures rather than hiding them.

## Fit-loop dry run

The built-in sample can verify the software path before a real print: its checked target span is 60 mm and checked print span is 59 mm. The fit loop should offer a revision moving each hole 0.5 mm outward. Clear the printed-spacing field and verify that revision downloads disable; enter 61 mm and verify **PRINT MISMATCH**. This checks the decision gates, not real-world printer behavior.

For the first physical test, choose a low-risk flat plate that is easy to reprint. Print the clearance coupon first, then the plate. Record the target spacing, original CAD spacing, as-printed spacing, selected coupon hole, material and printer settings, whether the first print fit, and any second revision. Keep the failed print and its measurements. Use the [repair case template](https://github.com/rudycelekli/ghostpart/issues/new/choose) when you are ready to share a result.

## What this cannot establish

The card does not measure lens distortion across the entire camera field, hole-center visibility on a real object, out-of-plane geometry, fastener clearance, printer shrinkage on a different material, or mechanical strength. Do not use GhostPart for a safety-critical part.
