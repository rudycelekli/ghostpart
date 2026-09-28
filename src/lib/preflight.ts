import type { MeasurementQuality } from "./quality";

export const PREFLIGHT_VIEWS = [
  "Square-on",
  "Left tilt",
  "Right tilt",
  "Up tilt",
  "Down tilt",
] as const;

export type PreflightReference = {
  markerSideMm: number;
  horizontalSpanMm: number;
  verticalSpanMm: number;
};

export type PreflightAttempt = {
  view: (typeof PREFLIGHT_VIEWS)[number];
  captureId: string;
  recordedAt: string;
  markerMethod: "automatic" | "manual" | "not-found";
  status: MeasurementQuality["status"] | "incomplete";
  photoSpansMm: [number | null, number | null];
  simulatedRangesMm: [[number, number] | null, [number, number] | null];
  imageSizePx: { width: number; height: number } | null;
  notes: string[];
};

export type PreflightSession = {
  schema: "ghostpart-preflight/v1";
  startedAt: string;
  reference: PreflightReference;
  attempts: PreflightAttempt[];
};

export function startPreflight(
  reference: PreflightReference,
): PreflightSession {
  if (
    Object.values(reference).some(
      (value) => !Number.isFinite(value) || value <= 0 || value > 5000,
    )
  )
    throw new Error("Enter all three measured dimensions in millimetres.");
  return {
    schema: "ghostpart-preflight/v1",
    startedAt: new Date().toISOString(),
    reference,
    attempts: [],
  };
}

export function recordPreflightAttempt(
  session: PreflightSession,
  input: {
    captureId: string;
    markerMethod: PreflightAttempt["markerMethod"];
    quality: MeasurementQuality | null;
    holeCount: number;
    markerSideMm: number | null;
    imageSizePx: { width: number; height: number } | null;
    captureError?: string;
  },
): PreflightSession {
  if (session.attempts.length >= PREFLIGHT_VIEWS.length)
    throw new Error(
      "The five-photo session is complete. Export its report first.",
    );
  if (
    !input.captureId ||
    session.attempts.some((row) => row.captureId === input.captureId)
  )
    throw new Error("Use a new photo for each recorded view.");
  const complete = input.holeCount === 3 && input.quality?.checks.length === 2;
  const checks = complete ? input.quality!.checks : [];
  if (
    complete &&
    (input.markerSideMm !== session.reference.markerSideMm ||
      checks[0].measuredMm !== session.reference.horizontalSpanMm ||
      checks[1].measuredMm !== session.reference.verticalSpanMm)
  )
    throw new Error(
      "The workbench readings differ from the locked card measurements.",
    );
  const attempt: PreflightAttempt = {
    view: PREFLIGHT_VIEWS[session.attempts.length],
    captureId: input.captureId,
    recordedAt: new Date().toISOString(),
    markerMethod: input.markerMethod,
    status: complete ? input.quality!.status : "incomplete",
    photoSpansMm: [checks[0]?.spanMm ?? null, checks[1]?.spanMm ?? null],
    simulatedRangesMm: [
      checks[0]?.clickIntervalMm ?? null,
      checks[1]?.clickIntervalMm ?? null,
    ],
    imageSizePx: input.imageSizePx,
    notes: complete
      ? input.quality!.notes
      : [
          input.captureError ||
            "Marker or all three target centers were not marked.",
        ],
  };
  return { ...session, attempts: [...session.attempts, attempt] };
}

export type PreflightResult = {
  complete: boolean;
  pass: boolean;
  pairs: {
    referenceMm: number;
    scanCount: number;
    maxErrorMm: number | null;
    spreadMm: number | null;
  }[];
  reasons: string[];
};

export function evaluatePreflight(session: PreflightSession): PreflightResult {
  const complete = session.attempts.length === PREFLIGHT_VIEWS.length;
  const references = [
    session.reference.horizontalSpanMm,
    session.reference.verticalSpanMm,
  ];
  const pairs = references.map((referenceMm, index) => {
    const values = session.attempts
      .map((row) => row.photoSpansMm[index])
      .filter(
        (value): value is number => value !== null && Number.isFinite(value),
      );
    return {
      referenceMm,
      scanCount: values.length,
      maxErrorMm: values.length
        ? Math.max(...values.map((value) => Math.abs(value - referenceMm)))
        : null,
      spreadMm:
        values.length >= 2 ? Math.max(...values) - Math.min(...values) : null,
    };
  });
  const reasons: string[] = [];
  if (complete) {
    if (session.attempts.some((row) => row.status !== "cross-checked"))
      reasons.push(
        "At least one scan was incomplete, mismatched, or unstable.",
      );
    pairs.forEach((pair, index) => {
      if (pair.scanCount !== PREFLIGHT_VIEWS.length)
        reasons.push(`H1→H${index + 2} is missing a photo span.`);
      if (pair.maxErrorMm === null || pair.maxErrorMm > 0.5)
        reasons.push(
          `H1→H${index + 2} exceeded 0.5 mm from the physical reading.`,
        );
      if (pair.spreadMm === null || pair.spreadMm > 0.5)
        reasons.push(
          `H1→H${index + 2} varied by more than 0.5 mm across views.`,
        );
    });
  }
  return { complete, pass: complete && reasons.length === 0, pairs, reasons };
}

export const PREFLIGHT_STORAGE_KEY = "ghostpart-preflight-v1";

function validPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validSpan(value: unknown): value is number | null {
  return value === null || validPositive(value);
}

function validRange(value: unknown): value is [number, number] | null {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 2 &&
      value.every(validPositive) &&
      value[0] <= value[1])
  );
}

export function readPreflightSession(
  storage: Pick<Storage, "getItem">,
): PreflightSession | null {
  try {
    const raw = storage.getItem(PREFLIGHT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const item = parsed as Partial<PreflightSession>;
    if (
      item.schema !== "ghostpart-preflight/v1" ||
      !item.reference ||
      !Array.isArray(item.attempts)
    )
      return null;
    if (
      !validPositive(item.reference.markerSideMm) ||
      item.reference.markerSideMm > 5000 ||
      !validPositive(item.reference.horizontalSpanMm) ||
      item.reference.horizontalSpanMm > 5000 ||
      !validPositive(item.reference.verticalSpanMm) ||
      item.reference.verticalSpanMm > 5000 ||
      typeof item.startedAt !== "string"
    )
      return null;
    if (item.attempts.length > PREFLIGHT_VIEWS.length) return null;
    const captureIds = new Set<string>();
    if (
      item.attempts.some((row, index) => {
        if (!row || typeof row !== "object") return true;
        if (
          row.view !== PREFLIGHT_VIEWS[index] ||
          typeof row.captureId !== "string" ||
          !row.captureId ||
          captureIds.has(row.captureId) ||
          typeof row.recordedAt !== "string" ||
          !["automatic", "manual", "not-found"].includes(row.markerMethod) ||
          ![
            "cross-checked",
            "needs-scale",
            "needs-check",
            "mismatch",
            "needs-recapture",
            "incomplete",
          ].includes(row.status) ||
          !Array.isArray(row.photoSpansMm) ||
          row.photoSpansMm.length !== 2 ||
          !row.photoSpansMm.every(validSpan) ||
          !Array.isArray(row.simulatedRangesMm) ||
          row.simulatedRangesMm.length !== 2 ||
          !row.simulatedRangesMm.every(validRange) ||
          (row.status === "cross-checked" &&
            (row.photoSpansMm.includes(null) ||
              row.simulatedRangesMm.includes(null))) ||
          !Array.isArray(row.notes) ||
          !row.notes.every((note) => typeof note === "string") ||
          (row.imageSizePx !== null &&
            (!row.imageSizePx ||
              !validPositive(row.imageSizePx.width) ||
              !validPositive(row.imageSizePx.height)))
        )
          return true;
        captureIds.add(row.captureId);
        return false;
      })
    )
      return null;
    return item as PreflightSession;
  } catch {
    return null;
  }
}

function csvCell(value: string | number | null): string {
  const raw = value === null ? "" : String(value);
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function preflightCsv(session: PreflightSession): string {
  const header = [
    "View",
    "Time",
    "Marker",
    "Status",
    "H1-H2 photo mm",
    "H1-H3 photo mm",
    "H1-H2 reference mm",
    "H1-H3 reference mm",
    "Notes",
  ];
  const rows = session.attempts.map((row) => [
    row.view,
    row.recordedAt,
    row.markerMethod,
    row.status,
    row.photoSpansMm[0],
    row.photoSpansMm[1],
    session.reference.horizontalSpanMm,
    session.reference.verticalSpanMm,
    row.notes.join("; "),
  ]);
  return (
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
