import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Camera,
  Crosshair,
  RefreshCw,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { downloadFile, openScadFromPlate, stlFromPlate } from "../lib/cad";
import { assessFit } from "../lib/fit";
import { detectGhostMarker } from "../lib/marker";
import { downloadProofCard } from "../lib/proofCard";
import type { Plate, Point, Quad } from "../lib/measure";

type Step = "marker" | "target" | "printed" | "review";

const sampleMarker: Quad = [
  { x: 573, y: 450 },
  { x: 733, y: 450 },
  { x: 733, y: 610 },
  { x: 573, y: 610 },
];
const sampleTarget = [
  { x: 533, y: 291 },
  { x: 773, y: 291 },
];
const samplePrinted = [
  { x: 535, y: 350 },
  { x: 771, y: 350 },
];
const fitSampleAsset = `${import.meta.env.BASE_URL}demo-fit.svg`;

function mm(value: number) {
  return `${value.toFixed(1)} mm`;
}

export function FitWorkbench({
  basePlate,
  baseSpanMm,
  markerSizeMm,
  sample,
}: {
  basePlate: Plate | null;
  baseSpanMm: number;
  markerSizeMm: number;
  sample: boolean;
}) {
  const [image, setImage] = useState(sample ? fitSampleAsset : "");
  const [naturalSize, setNaturalSize] = useState({ width: 1200, height: 760 });
  const [marker, setMarker] = useState<Point[]>(sample ? sampleMarker : []);
  const [targetHoles, setTargetHoles] = useState<Point[]>(
    sample ? sampleTarget : [],
  );
  const [printedHoles, setPrintedHoles] = useState<Point[]>(
    sample ? samplePrinted : [],
  );
  const [step, setStep] = useState<Step>(sample ? "review" : "marker");
  const [zoom, setZoom] = useState(1);
  const [markerClickRadiusPx, setMarkerClickRadiusPx] = useState(
    sample ? 0.1 : 0,
  );
  const [targetClickRadiusPx, setTargetClickRadiusPx] = useState(
    sample ? 0.1 : 0,
  );
  const [printedClickRadiusPx, setPrintedClickRadiusPx] = useState(
    sample ? 0.1 : 0,
  );
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState("");
  const [proofBusy, setProofBusy] = useState(false);
  const [checkedPrintedSpacing, setCheckedPrintedSpacing] = useState(
    sample ? "59" : "",
  );
  const input = useRef<HTMLInputElement>(null);
  const blobUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );

  const assessment = useMemo(() => {
    if (
      !basePlate ||
      marker.length !== 4 ||
      targetHoles.length !== 2 ||
      printedHoles.length !== 2 ||
      baseSpanMm <= 0
    )
      return null;
    try {
      return assessFit({
        marker: marker as Quad,
        markerSizeMm,
        targetHoles,
        printedHoles,
        basePlate,
        independentlyCheckedSpanMm: baseSpanMm,
        independentlyCheckedPrintedSpanMm:
          checkedPrintedSpacing.trim() === ""
            ? null
            : Number(checkedPrintedSpacing),
        clickRadiusPx: Math.max(
          markerClickRadiusPx,
          targetClickRadiusPx,
          printedClickRadiusPx,
        ),
      });
    } catch {
      return null;
    }
  }, [
    basePlate,
    baseSpanMm,
    checkedPrintedSpacing,
    markerSizeMm,
    marker,
    targetHoles,
    printedHoles,
    markerClickRadiusPx,
    targetClickRadiusPx,
    printedClickRadiusPx,
  ]);

  const loadPhoto = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file.");
      return;
    }
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = URL.createObjectURL(file);
    setImage(blobUrl.current);
    setMarker([]);
    setTargetHoles([]);
    setPrintedHoles([]);
    setMarkerClickRadiusPx(0);
    setTargetClickRadiusPx(0);
    setPrintedClickRadiusPx(0);
    setZoom(1);
    setStep("marker");
    setMessage("");
  };

  const findMarker = async () => {
    if (!image) return;
    setFinding(true);
    setMessage("");
    try {
      const found = await detectGhostMarker(image);
      if (!found) {
        setMessage(
          "Automatic marker not found. Use the new printed marker, or mark its corners manually.",
        );
        return;
      }
      setMarker(found);
      setMarkerClickRadiusPx(0.75);
      setStep(
        targetHoles.length === 2 && printedHoles.length === 2
          ? "review"
          : "target",
      );
      setMessage(
        "Marker found. Check the four corner dots, then review or mark the hole centers.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not inspect this photo.",
      );
    } finally {
      setFinding(false);
    }
  };

  const onPhotoClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (step === "review") return;
    const img = event.currentTarget.querySelector("img");
    if (!img) return;
    const bounds = img.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * naturalSize.width,
      y: ((event.clientY - bounds.top) / bounds.height) * naturalSize.height,
    };
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > naturalSize.width ||
      point.y > naturalSize.height
    )
      return;
    const radius = (2 * naturalSize.width) / bounds.width;
    if (step === "marker") {
      setMarkerClickRadiusPx((previous) => Math.max(previous, radius));
      const next = [...marker, point];
      setMarker(next);
      if (next.length === 4) setStep("target");
    } else if (step === "target") {
      setTargetClickRadiusPx((previous) => Math.max(previous, radius));
      const next = [...targetHoles, point];
      setTargetHoles(next);
      if (next.length === 2) setStep("printed");
    } else {
      setPrintedClickRadiusPx((previous) => Math.max(previous, radius));
      const next = [...printedHoles, point];
      setPrintedHoles(next);
      if (next.length === 2) setStep("review");
    }
  };

  const downloadReceipt = () => {
    if (!assessment || !basePlate) return;
    const receipt = {
      schema: "ghostpart-fit-receipt/v2",
      createdAt: new Date().toISOString(),
      source: sample ? "sample" : "user",
      markerSideMm: markerSizeMm,
      baselineCheckedSpacingMm: baseSpanMm,
      printedCheckedSpacingMm: assessment.checkedPrintedSpacingMm,
      targetPhotoSpacingMm: assessment.targetSpacingMm,
      printedPhotoSpacingMm: assessment.printedSpacingMm,
      checkedSpacingErrorMm: assessment.spacingErrorMm,
      targetPhotoAgreementMm: assessment.targetAgreementMm,
      printedPhotoAgreementMm: assessment.printedAgreementMm,
      fitStatus: assessment.status,
      originalCad: basePlate,
      revisedCad: assessment.revisedPlate,
      note: "Photo and personal metadata are not included. Fit and strength require physical verification.",
    };
    downloadFile(
      "ghostpart-fit-receipt.json",
      JSON.stringify(receipt, null, 2),
      "application/json",
    );
  };

  return (
    <section className="fit-section" id="fit-loop">
      <div className="section-heading">
        <div>
          <div className="eyebrow">03 / FIT LOOP</div>
          <h2>Print. Scan. Correct.</h2>
        </div>
        <p>
          Compare target and printed hole centers in one photo. A measured
          spacing error can produce a second, editable CAD revision.
        </p>
      </div>
      <div className="fit-workspace">
        <div className="fit-capture">
          <div className="fit-toolbar">
            <button disabled={sample} onClick={() => input.current?.click()}>
              <Camera size={17} /> Add fit photo
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadPhoto(file);
                event.target.value = "";
              }}
            />
            <button disabled={!image || finding} onClick={findMarker}>
              <ScanSearch size={17} /> {finding ? "Finding…" : "Find marker"}
            </button>
            {sample && (
              <button
                aria-label="Reset sample fit scan"
                onClick={() => {
                  if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
                  blobUrl.current = null;
                  setImage(fitSampleAsset);
                  setMarker(sampleMarker);
                  setTargetHoles(sampleTarget);
                  setPrintedHoles(samplePrinted);
                  setMarkerClickRadiusPx(0.1);
                  setTargetClickRadiusPx(0.1);
                  setPrintedClickRadiusPx(0.1);
                  setStep("review");
                  setMessage("");
                  setCheckedPrintedSpacing("59");
                }}
              >
                <RefreshCw size={17} />
              </button>
            )}
          </div>
          {image ? (
            <div className="fit-stage">
              <div
                className={`fit-image ${step !== "review" ? "is-marking" : ""}`}
                style={{ width: `${zoom * 100}%` }}
                onClick={onPhotoClick}
              >
                <img
                  src={image}
                  alt="Fit photo with target mounting holes, printed test holes, and a scale marker"
                  onLoad={(event) =>
                    setNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                />
                <svg
                  viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polygon
                    className="fit-marker-area"
                    points={marker.map((p) => `${p.x},${p.y}`).join(" ")}
                  />
                  {marker.map((p, i) => (
                    <circle
                      key={`m${i}`}
                      className="fit-marker-dot"
                      cx={p.x}
                      cy={p.y}
                      r="8"
                    />
                  ))}
                  {targetHoles.map((p, i) => (
                    <g key={`t${i}`}>
                      <circle
                        className="fit-target-ring"
                        cx={p.x}
                        cy={p.y}
                        r="19"
                      />
                      <text
                        x={p.x + 21}
                        y={p.y - 11}
                        className="fit-target-label"
                      >
                        T{i + 1}
                      </text>
                    </g>
                  ))}
                  {printedHoles.map((p, i) => (
                    <g key={`p${i}`}>
                      <circle
                        className="fit-print-ring"
                        cx={p.x}
                        cy={p.y}
                        r="15"
                      />
                      <text
                        x={p.x + 18}
                        y={p.y + 21}
                        className="fit-print-label"
                      >
                        P{i + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          ) : (
            <div className="fit-empty">
              <Crosshair size={36} />
              <strong>Show the target and the test print together.</strong>
              <span>
                Place the verified marker nearby and take a sharp, square-on
                photo.
              </span>
            </div>
          )}
          <div className="photo-zoom fit-zoom">
            <span>Zoom before marking points</span>
            <button
              aria-label="Fit photo zoom out"
              disabled={zoom <= 1}
              onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
            >
              <ZoomOut size={17} />
            </button>
            <strong>{zoom.toFixed(1)}×</strong>
            <button
              aria-label="Fit photo zoom in"
              disabled={zoom >= 4}
              onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
            >
              <ZoomIn size={17} />
            </button>
          </div>
          <div className="fit-steps">
            <button
              className={step === "marker" ? "active" : ""}
              disabled={!image}
              onClick={() => {
                setMarker([]);
                setTargetHoles([]);
                setPrintedHoles([]);
                setMarkerClickRadiusPx(0);
                setTargetClickRadiusPx(0);
                setPrintedClickRadiusPx(0);
                setStep("marker");
              }}
            >
              1 · Marker corners
            </button>
            <button
              className={step === "target" ? "active" : ""}
              disabled={marker.length !== 4}
              onClick={() => {
                setTargetHoles([]);
                setPrintedHoles([]);
                setTargetClickRadiusPx(0);
                setPrintedClickRadiusPx(0);
                setStep("target");
              }}
            >
              2 · Target centers
            </button>
            <button
              className={step === "printed" ? "active" : ""}
              disabled={targetHoles.length !== 2}
              onClick={() => {
                setPrintedHoles([]);
                setPrintedClickRadiusPx(0);
                setStep("printed");
              }}
            >
              3 · Print centers
            </button>
          </div>
          <p className="fit-help">
            {step === "marker"
              ? `Tap the black square corners clockwise, starting top left (${marker.length}/4).`
              : step === "target"
                ? `Tap both target mounting-hole centers in order (${targetHoles.length}/2).`
                : step === "printed"
                  ? `Tap both printed hole centers in the same order (${printedHoles.length}/2).`
                  : "Target and printed centers must be visible on the same flat plane."}
          </p>
          {message && (
            <p className="fit-message" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="fit-report">
          <div className="fit-report-kicker">MEASURED FIT / REVISION 02</div>
          <h3>
            {assessment ? "A second chance to fit." : "Waiting for a fit scan."}
          </h3>
          <p>
            Aligning the print by eye does not change hole spacing. This review
            compares the two distances after perspective correction.
          </p>
          {!basePlate && (
            <p className="fit-callout">
              Cross-check the original design above to unlock a fit revision.
            </p>
          )}
          {sample && (
            <p className="fit-callout">
              This is a demonstration scan. Add your own original photo above to
              measure a real print.
            </p>
          )}
          {basePlate && (
            <label className="fit-measure-input">
              <span>Printed center spacing, measured on the part</span>
              <span className="fit-input-line">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={checkedPrintedSpacing}
                  onChange={(event) =>
                    setCheckedPrintedSpacing(event.target.value)
                  }
                  placeholder="Enter caliper or ruler reading"
                />
                <strong>mm</strong>
              </span>
              <small>
                The measured target and print spacings set the correction. The
                photo checks that both readings match the visible geometry.
              </small>
            </label>
          )}
          {assessment && (
            <>
              <div className="fit-metrics">
                <div>
                  <span>Target · checked</span>
                  <strong>{mm(assessment.checkedTargetSpacingMm)}</strong>
                </div>
                <div>
                  <span>Print · checked</span>
                  <strong>
                    {assessment.checkedPrintedSpacingMm === null
                      ? "—"
                      : mm(assessment.checkedPrintedSpacingMm)}
                  </strong>
                </div>
                <div>
                  <span>Print difference</span>
                  <strong>
                    {assessment.spacingErrorMm === null
                      ? "—"
                      : `${assessment.spacingErrorMm > 0 ? "+" : ""}${mm(assessment.spacingErrorMm)}`}
                  </strong>
                </div>
              </div>
              <div className={`fit-verdict ${assessment.status}`}>
                <strong>
                  {assessment.status === "revision-ready"
                    ? "REVISION READY"
                    : assessment.status.replaceAll("-", " ").toUpperCase()}
                </strong>
                <span>{assessment.reason}</span>
              </div>
              <small className="fit-uncertainty">
                Simulated point range: target{" "}
                {mm(assessment.targetClickRangeMm[0])}–
                {mm(assessment.targetClickRangeMm[1])}; print{" "}
                {mm(assessment.printedClickRangeMm[0])}–
                {mm(assessment.printedClickRangeMm[1])}. This is not a
                calibrated confidence interval.
              </small>
              <div className="fit-downloads">
                <button
                  disabled={!assessment.revisedPlate}
                  onClick={() =>
                    assessment.revisedPlate &&
                    downloadFile(
                      "ghostpart-revision-2.stl",
                      stlFromPlate(assessment.revisedPlate),
                      "model/stl",
                    )
                  }
                >
                  <ArrowDownToLine size={17} /> Revision STL
                </button>
                <button
                  disabled={!assessment.revisedPlate}
                  onClick={() =>
                    assessment.revisedPlate &&
                    downloadFile(
                      "ghostpart-revision-2.scad",
                      openScadFromPlate(assessment.revisedPlate),
                      "text/plain",
                    )
                  }
                >
                  Editable CAD
                </button>
                <button onClick={downloadReceipt}>Fit receipt JSON</button>
                <button
                  disabled={proofBusy}
                  onClick={async () => {
                    setProofBusy(true);
                    try {
                      await downloadProofCard({
                        imageUrl: image,
                        targetHoles,
                        printedHoles,
                        assessment,
                      });
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Could not make the proof image.",
                      );
                    } finally {
                      setProofBusy(false);
                    }
                  }}
                >
                  {proofBusy ? "Making card…" : "Proof card PNG"}
                </button>
              </div>
              <p className="fit-caveat">
                Spacing correction is supported for two-hole flat plates. It
                does not verify edge fit, thickness, loads, material, or hidden
                geometry.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
