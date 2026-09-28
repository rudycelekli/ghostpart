import { describe, expect, it } from "vitest";
import { assessFit } from "../src/lib/fit";
import type { Plate, Quad } from "../src/lib/measure";

const marker: Quad = [
  { x: 573, y: 355 },
  { x: 733, y: 355 },
  { x: 733, y: 515 },
  { x: 573, y: 515 },
];
const plate: Plate = {
  width: 80,
  height: 20,
  thickness: 4,
  holeDiameter: 5,
  cornerRadius: 4,
  holes: [
    { x: 10, y: 10 },
    { x: 70, y: 10 },
  ],
};
const base = {
  marker,
  markerSizeMm: 40,
  targetHoles: [
    { x: 533, y: 291 },
    { x: 773, y: 291 },
  ],
  printedHoles: [
    { x: 535, y: 330 },
    { x: 771, y: 330 },
  ],
  basePlate: plate,
  independentlyCheckedSpanMm: 60,
  independentlyCheckedPrintedSpanMm: 59,
  clickRadiusPx: 0.1,
};

describe("fit scan", () => {
  it("supports a measured rectangular reference in the fit loop", () => {
    const fit = assessFit({
      ...base,
      marker: [
        { x: 100, y: 100 },
        { x: 420, y: 100 },
        { x: 420, y: 220 },
        { x: 100, y: 220 },
      ],
      markerSizeMm: 80,
      referenceHeightMm: 30,
      targetHoles: [
        { x: 90, y: 160 },
        { x: 330, y: 160 },
      ],
      printedHoles: [
        { x: 92, y: 260 },
        { x: 328, y: 260 },
      ],
    });
    expect(fit.status).toBe("revision-ready");
    expect(fit.targetSpacingMm).toBeCloseTo(60);
    expect(fit.printedSpacingMm).toBeCloseTo(59);
  });

  it("corrects a physically short two-hole print without moving its center", () => {
    const fit = assessFit(base);
    expect(fit.status).toBe("revision-ready");
    expect(fit.targetSpacingMm).toBeCloseTo(60);
    expect(fit.printedSpacingMm).toBeCloseTo(59);
    expect(fit.spacingErrorMm).toBeCloseTo(1);
    expect(fit.revisedPlate?.holes[0].x).toBeCloseTo(9.5);
    expect(fit.revisedPlate?.holes[1].x).toBeCloseTo(70.5);
  });

  it("does not change CAD for a translated print whose spacing matches", () => {
    const fit = assessFit({
      ...base,
      printedHoles: [
        { x: 540, y: 330 },
        { x: 780, y: 330 },
      ],
      independentlyCheckedPrintedSpanMm: 60,
    });
    expect(fit.status).toBe("within-resolution");
    expect(fit.revisedPlate).toBeNull();
  });

  it("rejects a fit photo whose target disagrees with the baseline", () => {
    const fit = assessFit({
      ...base,
      targetHoles: [
        { x: 533, y: 291 },
        { x: 753, y: 291 },
      ],
    });
    expect(fit.status).toBe("target-mismatch");
    expect(fit.revisedPlate).toBeNull();
  });

  it("withholds an automatic revision when click placement is unstable", () => {
    const fit = assessFit({ ...base, clickRadiusPx: 3 });
    expect(fit.status).toBe("capture-unstable");
    expect(fit.revisedPlate).toBeNull();
  });

  it("requires a physical measurement of the printed spacing", () => {
    const fit = assessFit({
      ...base,
      independentlyCheckedPrintedSpanMm: null,
    });
    expect(fit.status).toBe("needs-print-check");
    expect(fit.revisedPlate).toBeNull();
    expect(fit.spacingErrorMm).toBeNull();
  });

  it("rejects a printed measurement that disagrees with its photo", () => {
    const fit = assessFit({
      ...base,
      independentlyCheckedPrintedSpanMm: 61,
    });
    expect(fit.status).toBe("print-mismatch");
    expect(fit.revisedPlate).toBeNull();
  });
});
