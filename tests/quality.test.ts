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
    const base = { corners, holes, markerSizeMm: 40, clickRadiusPx: 0.1 };
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

  it("checks point placement for every hole pair, including a third hole", () => {
    const farHoles: Point[] = [
      { x: 150, y: 200 },
      { x: 350, y: 200 },
      { x: 500, y: 500 },
    ];
    const farSpan = Math.hypot(350, 300) * 0.2;
    const quality = assessMeasurement({
      corners,
      holes: farHoles,
      markerSizeMm: 40,
      markerScaleChecked: true,
      independentSpansMm: [40, farSpan],
      clickRadiusPx: 2,
    });
    expect(
      quality.checks[0].clickIntervalMm[1] -
        quality.checks[0].clickIntervalMm[0],
    ).toBeLessThan(1.5);
    expect(
      quality.checks[1].clickIntervalMm[1] -
        quality.checks[1].clickIntervalMm[0],
    ).toBeGreaterThan(Math.max(1.5, farSpan * 0.02));
    expect(quality.status).toBe("needs-recapture");
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

  it("recovers both independent spans under varied planar perspectives", () => {
    const physicalMarker: Quad = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    const physicalHoles = [
      { x: -10, y: 20 },
      { x: 50, y: 20 },
      { x: -10, y: 80 },
    ];
    for (const view of [
      { x: 120, y: 80, xx: 5, xy: 0.4, yx: 0.2, yy: 4, px: 0.001, py: 0.0007 },
      {
        x: 350,
        y: 120,
        xx: 4,
        xy: -0.8,
        yx: 0.6,
        yy: 3.8,
        px: -0.0004,
        py: 0.001,
      },
      {
        x: 70,
        y: 300,
        xx: 3.8,
        xy: 1,
        yx: -0.7,
        yy: 4.4,
        px: 0.0009,
        py: -0.0005,
      },
    ]) {
      const project = ({ x, y }: Point): Point => {
        const depth = 1 + view.px * x + view.py * y;
        return {
          x: (view.x + view.xx * x + view.xy * y) / depth,
          y: (view.y + view.yx * x + view.yy * y) / depth,
        };
      };
      const quality = assessMeasurement({
        corners: physicalMarker.map(project) as Quad,
        holes: physicalHoles.map(project),
        markerSizeMm: 40,
        markerScaleChecked: true,
        independentSpansMm: [60, 60],
        clickRadiusPx: 0.1,
      });
      expect(quality.status).toBe("cross-checked");
      expect(quality.checks[0].spanMm).toBeCloseTo(60, 6);
      expect(quality.checks[1].spanMm).toBeCloseTo(60, 6);
    }
  });
});
