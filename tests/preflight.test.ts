import { describe, expect, it } from "vitest";
import {
  evaluatePreflight,
  preflightCsv,
  readPreflightSession,
  recordPreflightAttempt,
  startPreflight,
  type PreflightSession,
} from "../src/lib/preflight";
import type { MeasurementQuality } from "../src/lib/quality";

const reference = {
  markerSideMm: 40,
  horizontalSpanMm: 60,
  verticalSpanMm: 60,
};

function quality(horizontal: number, vertical: number): MeasurementQuality {
  return {
    spanMm: horizontal,
    clickIntervalMm: [horizontal - 0.1, horizontal + 0.1],
    markerMinEdgePx: 250,
    maxReachInMarkerWidths: 1.5,
    status: "cross-checked",
    notes: [],
    checks: [horizontal, vertical].map((spanMm) => ({
      spanMm,
      clickIntervalMm: [spanMm - 0.1, spanMm + 0.1],
      measuredMm: 60,
      differenceMm: Math.abs(spanMm - 60),
      toleranceMm: 1.2,
    })),
  };
}

function append(
  session: PreflightSession,
  index: number,
  currentQuality: MeasurementQuality | null,
) {
  return recordPreflightAttempt(session, {
    captureId: `photo-${index}`,
    markerMethod: "automatic",
    quality: currentQuality,
    holeCount: currentQuality ? 3 : 0,
    markerSideMm: 40,
    imageSizePx: { width: 3000, height: 2000 },
  });
}

describe("five-photo preflight", () => {
  it("passes five distinct, cross-checked views within the physical and spread limits", () => {
    let session = startPreflight(reference);
    const readings = [
      [60, 60],
      [60.1, 59.9],
      [59.9, 60.1],
      [60.2, 60],
      [60, 60.2],
    ];
    readings.forEach(([horizontal, vertical], index) => {
      session = append(session, index, quality(horizontal, vertical));
    });
    const result = evaluatePreflight(session);
    expect(result.complete).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.pairs[0].spreadMm).toBeCloseTo(0.3);
    expect(session.attempts.map((row) => row.view)).toEqual([
      "Square-on",
      "Left tilt",
      "Right tilt",
      "Up tilt",
      "Down tilt",
    ]);
  });

  it("blocks a scan inside the app's looser cross-check tolerance but beyond the preflight gate", () => {
    let session = startPreflight(reference);
    [60, 60.1, 60.2, 60.7, 60].forEach((span, index) => {
      session = append(session, index, quality(span, 60));
    });
    const result = evaluatePreflight(session);
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("exceeded 0.5 mm"),
        expect.stringContaining("varied by more than 0.5 mm"),
      ]),
    );
  });

  it("keeps incomplete captures in the record and rejects the same photo twice", () => {
    let session = startPreflight(reference);
    session = append(session, 0, null);
    expect(session.attempts[0].status).toBe("incomplete");
    expect(() => append(session, 0, quality(60, 60))).toThrow(/new photo/);
    for (let index = 1; index < 5; index += 1)
      session = append(session, index, quality(60, 60));
    expect(evaluatePreflight(session).pass).toBe(false);
    expect(() => append(session, 5, quality(60, 60))).toThrow(/complete/);
  });

  it("rejects edited physical readings and restores only a valid local session", () => {
    const session = startPreflight(reference);
    expect(() =>
      recordPreflightAttempt(session, {
        captureId: "edited",
        markerMethod: "manual",
        quality: quality(60, 60),
        holeCount: 3,
        markerSideMm: 39,
        imageSizePx: null,
      }),
    ).toThrow(/differ/);
    const storage = { getItem: () => JSON.stringify(session) };
    expect(readPreflightSession(storage)).toEqual(session);
    expect(readPreflightSession({ getItem: () => "{broken" })).toBeNull();
    expect(
      readPreflightSession({
        getItem: () =>
          JSON.stringify({ ...session, attempts: [{ view: "Fake" }] }),
      }),
    ).toBeNull();
    expect(
      readPreflightSession({
        getItem: () =>
          JSON.stringify({
            ...session,
            reference: { x: 40, y: 60, z: 60 },
          }),
      }),
    ).toBeNull();
    const recorded = append(session, 0, quality(60, 60));
    expect(
      readPreflightSession({
        getItem: () =>
          JSON.stringify({
            ...recorded,
            attempts: [{ ...recorded.attempts[0], photoSpansMm: [null, null] }],
          }),
      }),
    ).toBeNull();
  });

  it("never passes when a completed session is missing a photo span", () => {
    let session = startPreflight(reference);
    for (let index = 0; index < 5; index += 1)
      session = append(session, index, quality(60, 60));
    session.attempts[4].photoSpansMm[0] = null;
    expect(evaluatePreflight(session).pass).toBe(false);
    expect(evaluatePreflight(session).reasons).toContain(
      "H1→H2 is missing a photo span.",
    );
  });

  it("exports a photo-free CSV with the physical reference and recorded status", () => {
    const session = append(startPreflight(reference), 0, quality(60.1, 59.9));
    const csv = preflightCsv(session);
    expect(csv).toContain('"Square-on"');
    expect(csv).toContain('"cross-checked"');
    expect(csv).toContain('"60.1"');
    expect(csv).not.toContain("data:image");
  });

  it("neutralizes spreadsheet formulas in report notes", () => {
    const session = append(startPreflight(reference), 0, quality(60, 60));
    session.attempts[0].notes = ['=HYPERLINK("https://example.test")'];
    expect(preflightCsv(session)).toContain(
      '"\'=HYPERLINK(""https://example.test"")"',
    );
  });
});
