import { useMemo, useState } from "react";
import { ArrowDownToLine, Check, RotateCcw, ShieldCheck } from "lucide-react";
import { downloadFile } from "../lib/cad";
import {
  evaluatePreflight,
  preflightCsv,
  PREFLIGHT_VIEWS,
  recordPreflightAttempt,
  startPreflight,
  type PreflightAttempt,
  type PreflightSession,
} from "../lib/preflight";
import type { MeasurementQuality } from "../lib/quality";

type Props = {
  session: PreflightSession | null;
  onSessionChange: (session: PreflightSession | null) => void;
  quality: MeasurementQuality | null;
  isSample: boolean;
  captureId: string;
  holeCount: number;
  markerSideMm: number | null;
  markerMethod: PreflightAttempt["markerMethod"];
  imageSizePx: { width: number; height: number } | null;
  captureError: string;
  storageError: string;
};

function mm(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)} mm`;
}

export function PreflightLab({
  session,
  onSessionChange,
  quality,
  isSample,
  captureId,
  holeCount,
  markerSideMm,
  markerMethod,
  imageSizePx,
  captureError,
  storageError,
}: Props) {
  const [markerInput, setMarkerInput] = useState("");
  const [horizontalInput, setHorizontalInput] = useState("");
  const [verticalInput, setVerticalInput] = useState("");
  const [measured, setMeasured] = useState(false);
  const [error, setError] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const result = useMemo(
    () => (session ? evaluatePreflight(session) : null),
    [session],
  );
  const nextView = session ? PREFLIGHT_VIEWS[session.attempts.length] : null;
  const usedCapture = !!session?.attempts.some(
    (row) => row.captureId === captureId,
  );

  const begin = () => {
    setError("");
    try {
      if (!measured)
        throw new Error("Check that these are physical print readings.");
      onSessionChange(
        startPreflight({
          markerSideMm: Number(markerInput),
          horizontalSpanMm: Number(horizontalInput),
          verticalSpanMm: Number(verticalInput),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start the check.",
      );
    }
  };

  const record = () => {
    if (!session) return;
    setError("");
    try {
      onSessionChange(
        recordPreflightAttempt(session, {
          captureId,
          markerMethod,
          quality,
          holeCount,
          markerSideMm,
          imageSizePx,
          captureError,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not record this scan.",
      );
    }
  };

  const exportJson = () => {
    if (!session) return;
    downloadFile(
      "ghostpart-preflight.json",
      JSON.stringify(
        {
          ...session,
          result,
          note: "No photos are included. This is a preflight check, not physical fit or strength proof.",
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  return (
    <section className="preflight-section" id="accuracy-check">
      <div className="preflight-header">
        <div>
          <div className="eyebrow">02 / ACCURACY CHECK</div>
          <h2>Know your camera before the part.</h2>
        </div>
        <p>
          Five views of one printed card reveal measurement drift before you
          spend time printing a repair. Results stay on this device.
        </p>
      </div>

      {!session ? (
        <div className="preflight-setup">
          <div className="preflight-intro">
            <span className="preflight-index">01</span>
            <h3>Measure the card.</h3>
            <p>
              <a
                href={`${import.meta.env.BASE_URL}accuracy-check-40mm.svg`}
                download
              >
                Print the card at 100%.
              </a>{" "}
              Measure its black square and both crosshair spacings with a ruler
              or calipers. Enter the readings from your physical print.
            </p>
          </div>
          <div className="preflight-inputs">
            <label>
              Black square
              <input
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                value={markerInput}
                onChange={(event) => setMarkerInput(event.target.value)}
                placeholder="Measured mm"
              />
            </label>
            <label>
              H1→H2
              <input
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                value={horizontalInput}
                onChange={(event) => setHorizontalInput(event.target.value)}
                placeholder="Measured mm"
              />
            </label>
            <label>
              H1→H3
              <input
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                value={verticalInput}
                onChange={(event) => setVerticalInput(event.target.value)}
                placeholder="Measured mm"
              />
            </label>
            <label className="preflight-attest">
              <input
                type="checkbox"
                checked={measured}
                onChange={(event) => setMeasured(event.target.checked)}
              />
              These values came from my physical print.
            </label>
            <button className="preflight-primary" onClick={begin}>
              Lock readings and begin <Check size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="preflight-session">
          <div className="preflight-session-top">
            <div>
              <span className="preflight-index">
                {String(session.attempts.length).padStart(2, "0")} / 05
              </span>
              <h3>
                {result?.complete
                  ? result.pass
                    ? "Ready for a low-risk trial."
                    : "Investigate before a repair."
                  : `Next: ${nextView}.`}
              </h3>
              <p>
                Physical card: {mm(session.reference.markerSideMm)} marker ·{" "}
                {mm(session.reference.horizontalSpanMm)} H1→H2 ·{" "}
                {mm(session.reference.verticalSpanMm)} H1→H3.
              </p>
            </div>
            <div
              className={`preflight-verdict ${result?.complete ? (result.pass ? "pass" : "fail") : "collecting"}`}
            >
              {result?.complete
                ? result.pass
                  ? "PREFLIGHT PASSED"
                  : "PREFLIGHT BLOCKED"
                : "COLLECTING EVIDENCE"}
            </div>
          </div>

          {!result?.complete && (
            <div className="preflight-next">
              <div>
                <strong>Take a new {nextView?.toLowerCase()} photo.</strong>
                <span>
                  In the workbench above, find the marker and mark H1, H2, H3 at
                  3×–4× zoom. Record blocked scans too.
                </span>
              </div>
              <a href="#workbench">Open camera and measurement ↑</a>
              <button
                className="preflight-primary"
                disabled={isSample || !captureId || usedCapture}
                onClick={record}
              >
                {usedCapture
                  ? "This photo is recorded"
                  : `Record ${nextView?.toLowerCase()} scan`}
              </button>
            </div>
          )}

          <div className="preflight-attempts">
            {PREFLIGHT_VIEWS.map((view, index) => {
              const row = session.attempts[index];
              return (
                <div
                  className={`preflight-attempt ${row ? "recorded" : "pending"}`}
                  key={view}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{view}</strong>
                  <span>
                    {row ? row.status.replaceAll("-", " ") : "awaiting scan"}
                  </span>
                  <span>
                    {row
                      ? `${mm(row.photoSpansMm[0])} / ${mm(row.photoSpansMm[1])}`
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="preflight-summary">
            {result?.pairs.map((pair, index) => (
              <div key={index}>
                <span>H1→H{index + 2}</span>
                <strong>{mm(pair.maxErrorMm)}</strong>
                <small>largest error · spread {mm(pair.spreadMm)}</small>
              </div>
            ))}
          </div>
          {result?.reasons.map((reason) => (
            <p className="preflight-reason" key={reason}>
              {reason}
            </p>
          ))}
          <p className="preflight-limits">
            Pass rule: five cross-checked views; each span within 0.5 mm of its
            physical reading; spread across views at most 0.5 mm. This is a
            bench gate, not a strength or fit certification. Photos are never
            saved in the session or report.
          </p>
          <div className="preflight-actions">
            <button onClick={exportJson}>
              <ArrowDownToLine size={16} /> Report JSON
            </button>
            <button
              onClick={() =>
                downloadFile(
                  "ghostpart-preflight.csv",
                  preflightCsv(session),
                  "text/csv",
                )
              }
            >
              <ArrowDownToLine size={16} /> Scan table CSV
            </button>
            {!confirmNew ? (
              <button
                className="preflight-new"
                onClick={() => setConfirmNew(true)}
              >
                <RotateCcw size={15} /> New session
              </button>
            ) : (
              <div className="preflight-confirm">
                <span>
                  Export first. Starting over clears this device's saved scans.
                </span>
                <button
                  onClick={() => {
                    onSessionChange(null);
                    setConfirmNew(false);
                  }}
                >
                  Clear and start over
                </button>
                <button onClick={() => setConfirmNew(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
      {(error || storageError) && (
        <p className="preflight-error" role="alert">
          {error || storageError}
        </p>
      )}
      <p className="preflight-privacy">
        <ShieldCheck size={15} /> No account, cloud upload, or saved photo.
      </p>
    </section>
  );
}
