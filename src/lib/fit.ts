import {
  calibrationTransformRectangle,
  transformPoint,
  validatePlate,
  type Plate,
  type Point,
  type Quad,
} from "./measure";
import { clickSensitivity } from "./quality";

export type FitAssessment = {
  targetSpacingMm: number;
  printedSpacingMm: number;
  checkedTargetSpacingMm: number;
  checkedPrintedSpacingMm: number | null;
  spacingErrorMm: number | null;
  targetAgreementMm: number;
  printedAgreementMm: number | null;
  targetClickRangeMm: [number, number];
  printedClickRangeMm: [number, number];
  status:
    | "target-mismatch"
    | "needs-print-check"
    | "print-mismatch"
    | "capture-unstable"
    | "manual-review"
    | "within-resolution"
    | "revision-ready";
  reason: string;
  revisedPlate: Plate | null;
};

function spacing(points: Point[]): number {
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
}

/** Compares visible target and printed centers on one calibrated plane. */
export function assessFit(input: {
  marker: Quad;
  markerSizeMm: number;
  referenceHeightMm?: number;
  targetHoles: Point[];
  printedHoles: Point[];
  basePlate: Plate;
  independentlyCheckedSpanMm: number;
  independentlyCheckedPrintedSpanMm: number | null;
  clickRadiusPx: number;
}): FitAssessment {
  const {
    marker,
    markerSizeMm,
    referenceHeightMm = markerSizeMm,
    targetHoles,
    printedHoles,
    basePlate,
    independentlyCheckedSpanMm,
    independentlyCheckedPrintedSpanMm,
    clickRadiusPx,
  } = input;
  if (
    targetHoles.length !== 2 ||
    printedHoles.length !== 2 ||
    basePlate.holes.length !== 2
  )
    throw new Error(
      "Fit revision currently supports exactly two paired holes.",
    );
  if (
    !Number.isFinite(independentlyCheckedSpanMm) ||
    independentlyCheckedSpanMm <= 0
  )
    throw new Error("A verified baseline spacing is required.");
  validatePlate(basePlate);
  const h = calibrationTransformRectangle(
    marker,
    markerSizeMm,
    referenceHeightMm,
  );
  const target = targetHoles.map((point) => transformPoint(h, point));
  const printed = printedHoles.map((point) => transformPoint(h, point));
  const targetSpacingMm = spacing(target);
  const printedSpacingMm = spacing(printed);
  const checkedPrintedSpacingMm = independentlyCheckedPrintedSpanMm;
  if (
    checkedPrintedSpacingMm !== null &&
    (!Number.isFinite(checkedPrintedSpacingMm) || checkedPrintedSpacingMm <= 0)
  )
    throw new Error("Enter a positive measured spacing from the printed part.");
  const spacingErrorMm =
    checkedPrintedSpacingMm === null
      ? null
      : independentlyCheckedSpanMm - checkedPrintedSpacingMm;
  const targetAgreementMm = Math.abs(
    targetSpacingMm - independentlyCheckedSpanMm,
  );
  const printedAgreementMm =
    checkedPrintedSpacingMm === null
      ? null
      : Math.abs(printedSpacingMm - checkedPrintedSpacingMm);
  const targetClickRangeMm = clickSensitivity(
    marker,
    targetHoles,
    markerSizeMm,
    clickRadiusPx,
    referenceHeightMm,
  );
  const printedClickRangeMm = clickSensitivity(
    marker,
    printedHoles,
    markerSizeMm,
    clickRadiusPx,
    referenceHeightMm,
  );
  const markerMinEdgePx = Math.min(
    ...marker.map((p, index) =>
      Math.hypot(
        p.x - marker[(index + 1) % 4].x,
        p.y - marker[(index + 1) % 4].y,
      ),
    ),
  );
  const markerCenter = {
    x: marker.reduce((sum, p) => sum + p.x, 0) / 4,
    y: marker.reduce((sum, p) => sum + p.y, 0) / 4,
  };
  const farthest = Math.max(
    ...[...targetHoles, ...printedHoles].map((p) =>
      Math.hypot(p.x - markerCenter.x, p.y - markerCenter.y),
    ),
  );
  const result = (
    status: FitAssessment["status"],
    reason: string,
    revisedPlate: Plate | null = null,
  ): FitAssessment => ({
    targetSpacingMm,
    printedSpacingMm,
    checkedTargetSpacingMm: independentlyCheckedSpanMm,
    checkedPrintedSpacingMm,
    spacingErrorMm,
    targetAgreementMm,
    printedAgreementMm,
    targetClickRangeMm,
    printedClickRangeMm,
    status,
    reason,
    revisedPlate,
  });
  if (targetAgreementMm > Math.max(0.5, independentlyCheckedSpanMm * 0.02))
    return result(
      "target-mismatch",
      "The target spacing in this photo disagrees with the original independent check. Recheck the reference, plane, and hole centers.",
    );
  if (checkedPrintedSpacingMm === null)
    return result(
      "needs-print-check",
      "Measure the printed hole-center spacing with calipers or a ruler. The photo alone cannot authorize a CAD correction.",
    );
  if (
    printedAgreementMm !== null &&
    printedAgreementMm > Math.max(0.5, checkedPrintedSpacingMm * 0.02)
  )
    return result(
      "print-mismatch",
      "The printed spacing in this photo disagrees with the physical measurement. Recheck the marker, plane, hole centers, and caliper reading.",
    );
  const maxSimulatedRange = Math.max(
    targetClickRangeMm[1] - targetClickRangeMm[0],
    printedClickRangeMm[1] - printedClickRangeMm[0],
  );
  if (
    markerMinEdgePx < 100 ||
    farthest / markerMinEdgePx > 3 ||
    maxSimulatedRange > Math.max(1.5, targetSpacingMm * 0.02)
  )
    return result(
      "capture-unstable",
      "This fit photo is too sensitive to point placement. Move the marker close, take a sharper photo, and mark points while zoomed in.",
    );
  if (spacingErrorMm === null) throw new Error("Printed spacing is required.");
  if (Math.abs(spacingErrorMm) < 0.3)
    return result(
      "within-resolution",
      "The measured spacing difference is below this workflow's 0.3 mm revision threshold. Test the physical fit before changing CAD.",
    );
  if (Math.abs(spacingErrorMm) > Math.max(2, targetSpacingMm * 0.05))
    return result(
      "manual-review",
      "The spacing difference is large enough to suggest a marking, placement, or fabrication problem. Inspect the part before revising CAD.",
    );
  const [a, b] = basePlate.holes;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const half = spacingErrorMm / 2;
  const revisedPlate: Plate = {
    ...basePlate,
    holes: [
      { x: a.x - ux * half, y: a.y - uy * half },
      { x: b.x + ux * half, y: b.y + uy * half },
    ],
  };
  try {
    validatePlate(revisedPlate);
  } catch {
    return result(
      "manual-review",
      "The corrected holes would violate the current plate outline. Increase the margin or edit the CAD manually.",
    );
  }
  return result(
    "revision-ready",
    `Revision 2 moves each hole ${Math.abs(half).toFixed(2)} mm ${spacingErrorMm > 0 ? "outward" : "inward"}. Print a test piece and verify it on the object.`,
    revisedPlate,
  );
}
