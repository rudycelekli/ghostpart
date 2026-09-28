export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

/** Maps four image points (clockwise from top left) to a square in millimetres. */
export function calibrationTransform(corners: Quad, sizeMm: number): number[] {
  if (!Number.isFinite(sizeMm) || sizeMm <= 0)
    throw new Error("Marker size must be positive.");
  if (!corners.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
    throw new Error("Marker corners must be finite points.");
  const turns = corners.map((point, index) => {
    const next = corners[(index + 1) % 4];
    const after = corners[(index + 2) % 4];
    return (
      (next.x - point.x) * (after.y - next.y) -
      (next.y - point.y) * (after.x - next.x)
    );
  });
  if (
    turns.some((turn) => Math.abs(turn) < 1e-6) ||
    turns.some((turn) => Math.sign(turn) !== Math.sign(turns[0]))
  )
    throw new Error("Marker corners must trace a convex square in order.");
  const target: Quad = [
    { x: 0, y: 0 },
    { x: sizeMm, y: 0 },
    { x: sizeMm, y: sizeMm },
    { x: 0, y: sizeMm },
  ];
  const rows: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = corners[i];
    const { x: u, y: v } = target[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-10)
      throw new Error("Marker corners are too close or out of order.");
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let j = col; j <= 8; j += 1) rows[col][j] /= divisor;
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let j = col; j <= 8; j += 1) rows[row][j] -= factor * rows[col][j];
    }
  }
  return [...rows.map((row) => row[8]), 1];
}

export function transformPoint(h: number[], point: Point): Point {
  const denominator = h[6] * point.x + h[7] * point.y + h[8];
  if (Math.abs(denominator) < 1e-10)
    throw new Error("Point is outside the calibrated plane.");
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / denominator,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / denominator,
  };
}

export type Plate = {
  width: number;
  height: number;
  thickness: number;
  holeDiameter: number;
  cornerRadius: number;
  holes: Point[];
};

export function plateFromImagePoints(
  h: number[],
  imageHoles: Point[],
  options: {
    margin: number;
    thickness: number;
    holeDiameter: number;
    cornerRadius: number;
  },
): Plate {
  if (imageHoles.length < 2)
    throw new Error("Mark at least two mounting holes.");
  const mmHoles = imageHoles.map((point) => transformPoint(h, point));
  const xs = mmHoles.map((point) => point.x);
  const ys = mmHoles.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX + options.margin * 2;
  const height = Math.max(...ys) - minY + options.margin * 2;
  const holes = mmHoles.map(({ x, y }) => ({
    x: x - minX + options.margin,
    y: y - minY + options.margin,
  }));
  const plate = {
    width,
    height,
    holes,
    thickness: options.thickness,
    holeDiameter: options.holeDiameter,
    cornerRadius: Math.min(options.cornerRadius, width / 2, height / 2),
  };
  validatePlate(plate);
  return plate;
}

export function validatePlate(plate: Plate): void {
  const values = [
    plate.width,
    plate.height,
    plate.thickness,
    plate.holeDiameter,
    plate.cornerRadius,
  ];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    plate.width <= 0 ||
    plate.height <= 0 ||
    plate.thickness <= 0 ||
    plate.holeDiameter <= 0 ||
    plate.cornerRadius < 0
  ) {
    throw new Error("Plate dimensions must be finite and positive.");
  }
  const radius = plate.holeDiameter / 2;
  for (const hole of plate.holes) {
    if (
      ![hole.x, hole.y].every(Number.isFinite) ||
      hole.x - radius < 0 ||
      hole.x + radius > plate.width ||
      hole.y - radius < 0 ||
      hole.y + radius > plate.height
    ) {
      throw new Error(
        "A hole falls outside the plate. Increase the margin or reduce the hole diameter.",
      );
    }
  }
  for (let i = 0; i < plate.holes.length; i += 1) {
    for (let j = i + 1; j < plate.holes.length; j += 1) {
      const dx = plate.holes[i].x - plate.holes[j].x;
      const dy = plate.holes[i].y - plate.holes[j].y;
      if (Math.hypot(dx, dy) < plate.holeDiameter)
        throw new Error("Mounting holes overlap.");
    }
  }
}
