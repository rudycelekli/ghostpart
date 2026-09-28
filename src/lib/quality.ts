import {
  calibrationTransform,
  transformPoint,
  type Point,
  type Quad,
} from "./measure";

export type MeasurementQuality = {
  spanMm: number;
  clickIntervalMm: [number, number];
  markerMinEdgePx: number;
  maxReachInMarkerWidths: number;
  checks: {
    spanMm: number;
    measuredMm: number | null;
    differenceMm: number | null;
    toleranceMm: number | null;
  }[];
  status:
    | "needs-scale"
    | "needs-check"
    | "mismatch"
    | "needs-recapture"
    | "cross-checked";
  notes: string[];
};

export function measuredHoleSpan(h: number[], holes: Point[]): number {
  if (holes.length < 2) throw new Error("Two holes are required for spacing.");
  const a = transformPoint(h, holes[0]);
  const b = transformPoint(h, holes[1]);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function percentile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

/** A reproducible sensitivity interval for point placement, not a total accuracy claim. */
export function clickSensitivity(
  corners: Quad,
  holes: Point[],
  markerSizeMm: number,
  clickRadiusPx: number,
): [number, number] {
  if (holes.length < 2) throw new Error("Two holes are required for spacing.");
  if (!Number.isFinite(clickRadiusPx) || clickRadiusPx < 0)
    throw new Error("Click radius must be non-negative.");
  const values: number[] = [];
  let seed = 1919;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let sample = 0; sample < 256; sample += 1) {
    const move = ({ x, y }: Point): Point => ({
      x: x + (random() * 2 - 1) * clickRadiusPx,
      y: y + (random() * 2 - 1) * clickRadiusPx,
    });
    const shiftedCorners = corners.map(move) as Quad;
    const shiftedHoles = holes.slice(0, 2).map(move);
    try {
      const h = calibrationTransform(shiftedCorners, markerSizeMm);
      const span = measuredHoleSpan(h, shiftedHoles);
      if (Number.isFinite(span)) values.push(span);
    } catch {
      // A heavily perturbed marker is itself a sign the source photo lacks resolution.
    }
  }
  if (values.length < 64)
    throw new Error("Marker is too small for stable measurement.");
  values.sort((a, b) => a - b);
  return [percentile(values, 0.05), percentile(values, 0.95)];
}

export function assessMeasurement(input: {
  corners: Quad;
  holes: Point[];
  markerSizeMm: number;
  markerScaleChecked: boolean;
  independentSpansMm: (number | null)[];
  clickRadiusPx: number;
}): MeasurementQuality {
  const {
    corners,
    holes,
    markerSizeMm,
    markerScaleChecked,
    independentSpansMm,
    clickRadiusPx,
  } = input;
  const h = calibrationTransform(corners, markerSizeMm);
  const spanMm = measuredHoleSpan(h, holes);
  const edges = corners.map((point, index) =>
    Math.hypot(
      point.x - corners[(index + 1) % 4].x,
      point.y - corners[(index + 1) % 4].y,
    ),
  );
  const markerMinEdgePx = Math.min(...edges);
  const markerCenter = {
    x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
    y: corners.reduce((sum, p) => sum + p.y, 0) / 4,
  };
  const maxReachInMarkerWidths =
    Math.max(
      ...holes.map((p) =>
        Math.hypot(p.x - markerCenter.x, p.y - markerCenter.y),
      ),
    ) /
    (edges.reduce((sum, edge) => sum + edge, 0) / 4);
  const clickIntervalMm = clickSensitivity(
    corners,
    holes,
    markerSizeMm,
    clickRadiusPx,
  );
  const checks = holes.slice(1).map((_, index) => {
    const measuredMm = independentSpansMm[index] ?? null;
    const predictedMm = measuredHoleSpan(h, [holes[0], holes[index + 1]]);
    return {
      spanMm: predictedMm,
      measuredMm,
      differenceMm:
        measuredMm == null ? null : Math.abs(predictedMm - measuredMm),
      toleranceMm: measuredMm == null ? null : Math.max(0.5, measuredMm * 0.02),
    };
  });
  const placementWidthMm = clickIntervalMm[1] - clickIntervalMm[0];
  const captureUnstable =
    markerMinEdgePx < 100 ||
    maxReachInMarkerWidths > 3 ||
    placementWidthMm > Math.max(1.5, spanMm * 0.02);
  const status = !markerScaleChecked
    ? "needs-scale"
    : checks.some((check) => check.measuredMm == null)
      ? "needs-check"
      : checks.some((check) => check.differenceMm! > check.toleranceMm!)
        ? "mismatch"
        : captureUnstable
          ? "needs-recapture"
          : "cross-checked";
  const notes: string[] = [];
  if (markerMinEdgePx < 100)
    notes.push(
      "The marker is small in the source photo. Move closer or use a higher-resolution image.",
    );
  if (maxReachInMarkerWidths > 3)
    notes.push(
      "The holes are far from the marker. Move the marker nearer to reduce extrapolation and lens-distortion risk.",
    );
  if (placementWidthMm > Math.max(1.5, spanMm * 0.02))
    notes.push(
      "Point placement changes the spacing noticeably. Zoom in and re-mark the corners and holes.",
    );
  if (status === "mismatch")
    notes.push(
      "Photo spacing disagrees with the independent measurement. Recheck marker scale, plane, and point centers.",
    );
  return {
    spanMm,
    clickIntervalMm,
    markerMinEdgePx,
    maxReachInMarkerWidths,
    checks,
    status,
    notes,
  };
}
