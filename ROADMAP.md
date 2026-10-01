# Roadmap

GhostPart advances by verified repairs, not by a list of generated meshes.

## Milestone 1: measured flat parts (current)

- Capture and perspective-correct a planar photo with a verified printed square or measured rigid rectangle.
- Generate a plate from hole locations and explicit parameters.
- Export editable CAD and printable STL.
- Require independent scale and hole-spacing checks; reject unstable point placement.
- Offer opt-in local AI advice that cannot change measurements or CAD.
- Publish 10 independent repair trials with measured fit results.

**Release gate:** dimensions in exported files match input measurements; no claims about 3D reconstruction or strength.

## Milestone 2: fit loop

- Gather real printer feedback for the three-size screw-clearance coupon and add more material-specific fit guidance.
- Validate the new two-hole fit scan and revision against measured physical parts. Record actual first-print and second-print fit, including failures.
- Extend the local repair receipt with user-entered material, printer, and physical outcome. The current receipt has dimensions and design revision but omits the photo and unverified physical result.
- Support simple knobs, spacers, and brackets using parametric families.
- Validate the new description-to-CAD flat plate and ring spacer drafts against physical prints. Both are available as unverified standalone concepts; measured repair support remains flat plates only.

**Research target:** at least 30 real parts across three families, with 70% fitting within two prints. This is a target, not a current result.

## Milestone 3: assisted reconstruction

- Improve the on-device marker proposal with subpixel refinement and camera distortion calibration. Add hole proposals with human correction.
- Multi-view reconstruction of a mating surface where device APIs permit it.
- Functional intent prompts and parametric CAD synthesis from constrained templates.
- Optional import of concept meshes made by TripoSR, Modly, TRELLIS, or Hunyuan3D for visual comparison beside cross-checked mounting geometry; generated mesh geometry must remain separate from measured dimensions.
- Device-specific depth adapters, explicitly tested against reference measurements.
- Use the experimental WebXR depth preview to collect on-device compatibility and repeatability observations; it does not authorize CAD dimensions.
- A native ARKit/ARCore depth prototype: preserve raw depth, confidence, intrinsics, and synchronized image coordinates; reject low-confidence or non-coplanar points. Benchmark against caliper-measured hole spacing across distance, angle, lighting, and devices before allowing reference-free CAD export.
- Confidence intervals and a clear “cannot infer” state for hidden geometry.

**Research target:** demonstrate that assisted reconstruction reduces design time and print waste against a manual CAD baseline on held-out repairs.

## What we need

Experienced CAD makers, phone vision contributors, FDM printers, repair cafes, and people with mundane broken objects. The best issue is a complete, reproducible repair case, including a failed print.
