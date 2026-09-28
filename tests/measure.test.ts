import { describe, expect, it } from "vitest";
import {
  calibrationTransform,
  calibrationTransformRectangle,
  plateFromImagePoints,
  transformPoint,
  validatePlate,
  type Quad,
} from "../src/lib/measure";
import {
  fitCouponDiameters,
  fitCouponGeometry,
  openScadFromFitCoupon,
  openScadFromPlate,
  plateGeometry,
  stlFromFitCoupon,
  stlFromPlate,
} from "../src/lib/cad";

const marker: Quad = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 300 },
  { x: 100, y: 300 },
];

describe("planar calibration", () => {
  it("measures known distances on the marker plane", () => {
    const h = calibrationTransform(marker, 40);
    expect(transformPoint(h, { x: 200, y: 200 }).x).toBeCloseTo(20);
    expect(transformPoint(h, { x: 200, y: 200 }).y).toBeCloseTo(20);
    expect(transformPoint(h, { x: 400, y: 200 }).x).toBeCloseTo(60);
  });

  it("corrects perspective distortion from four corners", () => {
    const tilted: Quad = [
      { x: 40, y: 50 },
      { x: 260, y: 70 },
      { x: 230, y: 240 },
      { x: 70, y: 220 },
    ];
    const h = calibrationTransform(tilted, 40);
    for (const [i, target] of [
      [0, { x: 0, y: 0 }],
      [1, { x: 40, y: 0 }],
      [2, { x: 40, y: 40 }],
      [3, { x: 0, y: 40 }],
    ] as const) {
      expect(transformPoint(h, tilted[i]).x).toBeCloseTo(target.x);
      expect(transformPoint(h, tilted[i]).y).toBeCloseTo(target.y);
    }
  });

  it("recovers a non-square measured rectangle under perspective", () => {
    const physicalCorners: Quad = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 30 },
      { x: 0, y: 30 },
    ];
    const project = ({ x, y }: { x: number; y: number }) => ({
      x: (200 + 4 * x + 0.3 * y) / (1 + 0.001 * x + 0.002 * y),
      y: (120 + 0.4 * x + 5 * y) / (1 + 0.001 * x + 0.002 * y),
    });
    const h = calibrationTransformRectangle(
      physicalCorners.map(project) as Quad,
      80,
      30,
    );
    const recovered = transformPoint(h, project({ x: 105, y: 15 }));
    expect(recovered.x).toBeCloseTo(105, 6);
    expect(recovered.y).toBeCloseTo(15, 6);
    expect(() => calibrationTransformRectangle(marker, 80, 0)).toThrow();
  });

  it("rejects a degenerate marker", () => {
    const corners: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(() => calibrationTransform(corners, 40)).toThrow();
  });
});

describe("repair plate", () => {
  const h = calibrationTransform(marker, 40);
  const plate = plateFromImagePoints(
    h,
    [
      { x: 150, y: 200 },
      { x: 350, y: 200 },
    ],
    {
      margin: 10,
      thickness: 4,
      holeDiameter: 5,
      cornerRadius: 4,
    },
  );

  it("centers measured holes inside a printable outline", () => {
    expect(plate.width).toBeCloseTo(60);
    expect(plate.height).toBeCloseTo(20);
    expect(plate.holes[0].x).toBeCloseTo(10);
    expect(plate.holes[0].y).toBeCloseTo(10);
    expect(plate.holes[1].x).toBeCloseTo(50);
    expect(plate.holes[1].y).toBeCloseTo(10);
  });

  it("produces editable CAD and a real STL mesh", () => {
    const scad = openScadFromPlate(plate);
    expect(scad).toContain("width = 60;");
    expect(scad).toContain("translate([50, 10, -0.1])");
    const geometry = plateGeometry(plate);
    const shapes = Array.isArray(geometry.parameters.shapes)
      ? geometry.parameters.shapes
      : [geometry.parameters.shapes];
    expect(shapes[0].holes).toHaveLength(2);
    geometry.dispose();
    const stl = stlFromPlate(plate);
    expect(stl).toContain("facet normal");
    expect(stl).not.toContain("NaN");
  });

  it("rejects holes that break through an edge or overlap", () => {
    expect(() => validatePlate({ ...plate, holeDiameter: 25 })).toThrow(
      /outside/,
    );
    expect(() =>
      validatePlate({
        ...plate,
        holes: [
          { x: 10, y: 10 },
          { x: 11, y: 10 },
        ],
      }),
    ).toThrow(/overlap/);
  });

  it("exports a physical three-size fastener clearance coupon", () => {
    expect(fitCouponDiameters(5)).toEqual([4.8, 5, 5.2]);
    const geometry = fitCouponGeometry(5);
    const shape = Array.isArray(geometry.parameters.shapes)
      ? geometry.parameters.shapes[0]
      : geometry.parameters.shapes;
    expect(shape.holes).toHaveLength(3);
    geometry.dispose();
    expect(openScadFromFitCoupon(5)).toContain("4.8, 5, 5.2");
    expect(stlFromFitCoupon(5)).toContain("facet normal");
  });
});
