import { describe, expect, it } from "vitest";
import {
  calibrationTransform,
  type Point,
  type Quad,
} from "../src/lib/measure";
import { assessMeasurement, clickSensitivity } from "../src/lib/quality";

const corners: Quad = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 300 },
  { x: 100, y: 300 },
];
const holes: Point[] = [
  { x: 150, y: 200 },
  { x: 350, y: 200 },
  { x: 250, y: 400 },
];

describe("measurement review", () => {
  it("does not treat a generated dimension as independently verified", () => {
    const base = { corners, holes, markerSizeMm: 40, clickRadiusPx: 2 };
    expect(
      assessMeasurement({
        ...base,
        markerScaleChecked: false,
        independentSpansMm: [40, Math.sqrt(2000)],
      }).status,
    ).toBe("needs-scale");
    expect(
      assessMeasurement({
        ...base,
        markerScaleChecked: true,
        independentSpansMm: [40, null],
      }).status,
    ).toBe("needs-check");
    expect(
      assessMeasurement({
        ...base,
        markerScaleChecked: true,
        independentSpansMm: [40, 44.7],
      }).status,
    ).toBe("cross-checked");
    expect(
      assessMeasurement({
        ...base,
        markerScaleChecked: true,
        independentSpansMm: [37, 44.7],
      }).status,
    ).toBe("mismatch");
  });

  it("models point-placement sensitivity without presenting it as total accuracy", () => {
    const exact = clickSensitivity(corners, holes, 40, 0);
    const uncertain = clickSensitivity(corners, holes, 40, 5);
    expect(exact[0]).toBeCloseTo(40);
    expect(exact[1]).toBeCloseTo(40);
    expect(uncertain[0]).toBeLessThan(40);
    expect(uncertain[1]).toBeGreaterThan(40);
  });

  it("blocks export when a cross-checked capture is too sensitive to point placement", () => {
    const quality = assessMeasurement({
      corners,
      holes,
      markerSizeMm: 40,
      markerScaleChecked: true,
      independentSpansMm: [40, 44.7],
      clickRadiusPx: 8,
    });
    expect(quality.status).toBe("needs-recapture");
    expect(
      quality.clickIntervalMm[1] - quality.clickIntervalMm[0],
    ).toBeGreaterThan(1.5);
  });

  it("keeps the sample within its own measurement limits", () => {
    const quality = assessMeasurement({
      corners: [
        { x: 573, y: 355 },
        { x: 733, y: 355 },
        { x: 733, y: 515 },
        { x: 573, y: 515 },
      ],
      holes: [
        { x: 533, y: 291 },
        { x: 773, y: 291 },
      ],
      markerSizeMm: 40,
      markerScaleChecked: true,
      independentSpansMm: [60],
      clickRadiusPx: 0.1,
    });
    expect(quality.status).toBe("cross-checked");
    expect(quality.spanMm).toBeCloseTo(60);
  });

  it("rejects a crossed or concave reference marker", () => {
    const crossed: Quad = [corners[0], corners[2], corners[1], corners[3]];
    expect(() => calibrationTransform(crossed, 40)).toThrow(/convex/);
  });
});
