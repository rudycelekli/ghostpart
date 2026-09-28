import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Github,
  MousePointer2,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PartPreview } from "./components/PartPreview";
import {
  downloadFile,
  fitCouponDiameters,
  openScadFromFitCoupon,
  openScadFromPlate,
  stlFromFitCoupon,
  stlFromPlate,
} from "./lib/cad";
import {
  calibrationTransform,
  plateFromImagePoints,
  type Point,
  type Quad,
} from "./lib/measure";
import { assessMeasurement } from "./lib/quality";
import {
  imageToLocalJpeg,
  listLocalModels,
  requestRepairAdvice,
  type LocalModel,
  type RepairAdvice,
} from "./lib/localAi";
import {
  recordTapSignature,
  requestSensorPermission,
  type TapSignature,
} from "./lib/sensors";

type Mode = "marker" | "holes" | "preview";
type Options = {
  margin: number;
  thickness: number;
  holeDiameter: number;
  cornerRadius: number;
};
const sampleCorners: Quad = [
  { x: 573, y: 355 },
  { x: 733, y: 355 },
  { x: 733, y: 515 },
  { x: 573, y: 515 },
];
const sampleHoles: Point[] = [
  { x: 533, y: 291 },
  { x: 773, y: 291 },
];
const initialOptions: Options = {
  margin: 10,
  thickness: 4,
  holeDiameter: 5,
  cornerRadius: 4,
};

function formatMm(value: number) {
  return `${Number(value.toFixed(1))} mm`;
}

function formatTap(signature: TapSignature | null) {
  if (!signature) return "—";
  return `${signature.dominantHz} Hz · ${Math.round(20 * Math.log10(signature.loudness))} dBFS`;
}

export default function App() {
  const [image, setImage] = useState("/demo-workbench.svg");
  const [naturalSize, setNaturalSize] = useState({ width: 1200, height: 760 });
  const [isSample, setIsSample] = useState(true);
  const [corners, setCorners] = useState<Point[]>(sampleCorners);
  const [holes, setHoles] = useState<Point[]>(sampleHoles);
  const [mode, setMode] = useState<Mode>("preview");
  const [options, setOptions] = useState<Options>(initialOptions);
  const [zoom, setZoom] = useState(1);
  const [cornerClickRadiusPx, setCornerClickRadiusPx] = useState(0.1);
  const [holeClickRadiusPx, setHoleClickRadiusPx] = useState(0.1);
  const [markerMeasuredMm, setMarkerMeasuredMm] = useState("40");
  const [markerScaleChecked, setMarkerScaleChecked] = useState(true);
  const [spanChecksMm, setSpanChecksMm] = useState<string[]>(["60"]);
  const [cameraOn, setCameraOn] = useState(false);
  const [sensorState, setSensorState] = useState({
    active: false,
    motion: null as number | null,
    tilt: null as number | null,
  });
  const [sensorError, setSensorError] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [tapBefore, setTapBefore] = useState<TapSignature | null>(null);
  const [tapAfter, setTapAfter] = useState<TapSignature | null>(null);
  const [tapBusy, setTapBusy] = useState<"before" | "after" | null>(null);
  const [tapError, setTapError] = useState("");
  const [repairGoal, setRepairGoal] = useState(
    "Replace a broken support tab between these mounting holes.",
  );
  const [aiModels, setAiModels] = useState<LocalModel[]>([]);
  const [aiModel, setAiModel] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiAdvice, setAiAdvice] = useState<RepairAdvice | null>(null);
  const [aiUsedImage, setAiUsedImage] = useState(false);
  const [sendPhotoToLocalAi, setSendPhotoToLocalAi] = useState(false);
  const aiRequestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const blobUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );

  const calibration = useMemo(() => {
    if (corners.length !== 4) return null;
    try {
      const size = Number(markerMeasuredMm);
      return calibrationTransform(corners as Quad, size > 0 ? size : 40);
    } catch {
      return null;
    }
  }, [corners, markerMeasuredMm]);

  const quality = useMemo(() => {
    if (!calibration || corners.length !== 4 || holes.length < 2) return null;
    try {
      return assessMeasurement({
        corners: corners as Quad,
        holes,
        markerSizeMm:
          Number(markerMeasuredMm) > 0 ? Number(markerMeasuredMm) : 40,
        markerScaleChecked: markerScaleChecked && Number(markerMeasuredMm) > 0,
        independentSpansMm: holes.slice(1).map((_, index) => {
          const value = Number(spanChecksMm[index]);
          return value > 0 ? value : null;
        }),
        clickRadiusPx: Math.max(cornerClickRadiusPx, holeClickRadiusPx),
      });
    } catch {
      return null;
    }
  }, [
    calibration,
    corners,
    holes,
    markerMeasuredMm,
    markerScaleChecked,
    spanChecksMm,
    cornerClickRadiusPx,
    holeClickRadiusPx,
  ]);

  const result = useMemo(() => {
    if (!calibration || holes.length < 2) return { plate: null, error: "" };
    try {
      return {
        plate: plateFromImagePoints(calibration, holes, options),
        error: "",
      };
    } catch (error) {
      return {
        plate: null,
        error:
          error instanceof Error ? error.message : "Could not make the part.",
      };
    }
  }, [calibration, holes, options]);

  const couponDiameters = useMemo(() => {
    try {
      return fitCouponDiameters(options.holeDiameter);
    } catch {
      return null;
    }
  }, [options.holeDiameter]);

  const exportReady = !!result.plate && quality?.status === "cross-checked";

  useEffect(() => {
    aiRequestId.current += 1;
    setAiAdvice(null);
  }, [result.plate, quality, repairGoal, image]);

  const loadImage = (url: string, sample = false) => {
    setImage(url);
    setIsSample(sample);
    setCorners(sample ? sampleCorners : []);
    setHoles(sample ? sampleHoles : []);
    setMode(sample ? "preview" : "marker");
    setZoom(1);
    setCornerClickRadiusPx(sample ? 0.1 : 0);
    setHoleClickRadiusPx(sample ? 0.1 : 0);
    setMarkerMeasuredMm(sample ? "40" : "");
    setMarkerScaleChecked(sample);
    setSpanChecksMm(sample ? ["60"] : []);
    setRepairGoal(
      sample
        ? "Replace a broken support tab between these mounting holes."
        : "",
    );
    setCaptureError("");
  };

  const uploadImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setCaptureError("Choose an image file.");
      return;
    }
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = URL.createObjectURL(file);
    loadImage(blobUrl.current);
  };

  const startCamera = async () => {
    setCaptureError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStream.current = stream;
      setCameraOn(true);
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch {
      setCaptureError(
        "Camera access is unavailable. You can still upload a photo.",
      );
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCaptureError("Camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    loadImage(canvas.toDataURL("image/jpeg", 0.94));
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraOn(false);
  };

  const enableSensors = async () => {
    setSensorError("");
    try {
      await requestSensorPermission();
      setSensorState((previous) => ({ ...previous, active: true }));
    } catch (error) {
      setSensorError(
        error instanceof Error ? error.message : "Could not start sensors.",
      );
    }
  };

  useEffect(() => {
    if (!sensorState.active) return;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.acceleration;
      if (a?.x != null && a.y != null && a.z != null) {
        setSensorState((previous) => ({
          ...previous,
          motion: Math.hypot(a.x!, a.y!, a.z!),
        }));
      }
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma != null)
        setSensorState((previous) => ({
          ...previous,
          tilt: Math.round(event.gamma!),
        }));
    };
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [sensorState.active]);

  const onPhotoClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (mode === "preview" || cameraOn) return;
    const imageElement = event.currentTarget.querySelector("img");
    if (!imageElement) return;
    const bounds = imageElement.getBoundingClientRect();
    const x =
      ((event.clientX - bounds.left) / bounds.width) * naturalSize.width;
    const y =
      ((event.clientY - bounds.top) / bounds.height) * naturalSize.height;
    if (x < 0 || y < 0 || x > naturalSize.width || y > naturalSize.height)
      return;
    const clickRadiusPx = (2 * naturalSize.width) / bounds.width;
    if (mode === "marker") {
      setCornerClickRadiusPx((previous) => Math.max(previous, clickRadiusPx));
      const next = [...corners, { x, y }];
      setCorners(next);
      if (next.length === 4) setMode("holes");
    } else {
      setHoleClickRadiusPx((previous) => Math.max(previous, clickRadiusPx));
      setHoles((previous) => [...previous, { x, y }]);
    }
  };

  const changeOption = (key: keyof Options, value: number) => {
    setOptions((previous) => ({
      ...previous,
      [key]: Number.isFinite(value) ? value : 0,
    }));
  };

  const runTap = async (phase: "before" | "after") => {
    setTapBusy(phase);
    setTapError("");
    try {
      const signature = await recordTapSignature();
      if (phase === "before") setTapBefore(signature);
      else setTapAfter(signature);
    } catch (error) {
      setTapError(
        error instanceof Error ? error.message : "Microphone test failed.",
      );
    } finally {
      setTapBusy(null);
    }
  };

  const connectLocalAi = async () => {
    setAiError("");
    setAiBusy(true);
    try {
      const models = await listLocalModels();
      if (!models.length)
        throw new Error("Ollama is running but has no downloaded models.");
      setAiModels(models);
      setAiModel(models[0].name);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Could not connect to local AI.",
      );
    } finally {
      setAiBusy(false);
    }
  };

  const runLocalAi = async () => {
    if (!result.plate || !quality) return;
    const requestId = ++aiRequestId.current;
    setAiError("");
    setAiBusy(true);
    try {
      const imageBase64 = sendPhotoToLocalAi
        ? await imageToLocalJpeg(image)
        : undefined;
      const response = await requestRepairAdvice({
        model: aiModel,
        goal: repairGoal,
        plate: result.plate,
        quality,
        imageBase64,
      });
      if (requestId === aiRequestId.current) {
        setAiAdvice(response.advice);
        setAiUsedImage(response.usedImage);
      }
    } catch (error) {
      if (requestId === aiRequestId.current)
        setAiError(
          error instanceof Error
            ? error.message
            : "Local AI could not analyze this repair.",
        );
    } finally {
      if (requestId === aiRequestId.current) setAiBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="GhostPart home">
          <span className="brand-mark">
            <span />
          </span>
          <span>
            GHOSTPART<span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="header-nav" aria-label="Main navigation">
          <a href="#workbench">Workbench</a>
          <a href="#intelligence">Intelligence</a>
          <a href="#how">How it works</a>
          <a
            href="https://github.com/rudycelekli/ghostpart"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={17} /> GitHub
          </a>
        </nav>
        <span className="release-pill">
          <span /> OPEN SOURCE / V0.2
        </span>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-rule" /> THE REPAIR CAMERA
            </div>
            <h1>
              Make what
              <br />
              <em>is missing.</em>
            </h1>
            <p>
              Measure a broken mounting point with your phone. Design a
              replacement that fits. Export the part and bring it back to life.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#workbench">
                Open the workbench <ChevronRight size={19} />
              </a>
              <a className="text-action" href="/marker-40mm.svg" download>
                Get the 40 mm marker <ArrowDownToLine size={17} />
              </a>
            </div>
          </div>
          <div className="hero-graphic" aria-hidden="true">
            <div className="hero-graphic-grid" />
            <div className="exploded-part">
              <div className="exploded-shadow" />
              <div className="exploded-layer layer-back" />
              <div className="exploded-layer layer-front">
                <span />
                <span />
              </div>
              <div className="exploded-line line-one" />
              <div className="exploded-line line-two" />
            </div>
            <span className="graphic-label graphic-label-top">
              PART 01 / RECONSTRUCTED
            </span>
            <span className="graphic-label graphic-label-bottom">
              80 × 20 × 4 MM
            </span>
          </div>
        </section>

        <section className="workbench-section" id="workbench">
          <div className="section-heading">
            <div>
              <div className="eyebrow">01 / WORKBENCH</div>
              <h2>From broken to buildable.</h2>
            </div>
            <p>
              Everything runs on your device. Your photos and microphone
              recordings stay in your browser.
            </p>
          </div>
          <div className="workbench">
            <div className="capture-column">
              <div className="panel-heading">
                <span className="panel-index">A</span>
                <div>
                  <h3>Capture & measure</h3>
                  <p>
                    Place the printed marker on the same flat surface as the
                    mounting holes.
                  </p>
                </div>
              </div>
              <div className="capture-toolbar">
                <button
                  className="toolbar-button primary"
                  onClick={() => fileInput.current?.click()}
                >
                  <Camera size={17} /> Add a photo
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadImage(file);
                    event.target.value = "";
                  }}
                />
                <button
                  className="toolbar-button"
                  onClick={cameraOn ? captureFrame : startCamera}
                >
                  {cameraOn ? <ScanLine size={17} /> : <Camera size={17} />}
                  {cameraOn ? "Capture frame" : "Live camera"}
                </button>
                <button
                  className="icon-button"
                  title="Load sample"
                  aria-label="Load sample"
                  onClick={() => loadImage("/demo-workbench.svg", true)}
                >
                  <RotateCcw size={18} />
                </button>
              </div>
              {captureError && (
                <p className="inline-error" role="alert">
                  {captureError}
                </p>
              )}
              <div
                className={`photo-stage ${mode !== "preview" ? "is-marking" : ""}`}
              >
                {cameraOn ? (
                  <video ref={videoRef} autoPlay playsInline muted />
                ) : (
                  <div
                    className="photo-image"
                    style={{ width: `${zoom * 100}%` }}
                    onClick={onPhotoClick}
                  >
                    <img
                      src={image}
                      alt={
                        isSample
                          ? "Sample broken mounting bracket with two holes and a 40 millimetre marker"
                          : "Uploaded repair surface"
                      }
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
                        className="marker-area"
                        points={
                          corners.length === 4
                            ? corners.map((p) => `${p.x},${p.y}`).join(" ")
                            : ""
                        }
                      />
                      {corners.map((point, index) => (
                        <g key={`c${index}`}>
                          <circle
                            className="marker-point"
                            cx={point.x}
                            cy={point.y}
                            r={Math.max(naturalSize.width / 100, 7)}
                          />
                          <text
                            className="marker-number"
                            x={point.x}
                            y={point.y - 18}
                          >
                            {index + 1}
                          </text>
                        </g>
                      ))}
                      {holes.map((point, index) => (
                        <g key={`h${index}`}>
                          <circle
                            className="hole-halo"
                            cx={point.x}
                            cy={point.y}
                            r={Math.max(naturalSize.width / 50, 13)}
                          />
                          <circle
                            className="hole-point"
                            cx={point.x}
                            cy={point.y}
                            r={Math.max(naturalSize.width / 130, 5)}
                          />
                          <text
                            className="hole-number"
                            x={point.x + 23}
                            y={point.y + 5}
                          >
                            H{index + 1}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                )}
                <span className="photo-badge">
                  {cameraOn
                    ? "LIVE CAPTURE"
                    : isSample
                      ? "SAMPLE PROJECT"
                      : "YOUR CAPTURE"}
                </span>
              </div>
              <div className="photo-zoom">
                <span>Zoom for precise points</span>
                <button
                  aria-label="Zoom out"
                  disabled={zoom <= 1}
                  onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
                >
                  <ZoomOut size={17} />
                </button>
                <strong>{zoom.toFixed(1)}×</strong>
                <button
                  aria-label="Zoom in"
                  disabled={zoom >= 4}
                  onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
                >
                  <ZoomIn size={17} />
                </button>
              </div>
              <div className="measurement-steps">
                <button
                  className={mode === "marker" ? "active" : ""}
                  onClick={() => {
                    setCorners([]);
                    setHoles([]);
                    setSpanChecksMm([]);
                    setCornerClickRadiusPx(0);
                    setHoleClickRadiusPx(0);
                    setMode("marker");
                  }}
                >
                  <span>1</span> Mark 4 marker corners
                </button>
                <button
                  className={mode === "holes" ? "active" : ""}
                  disabled={corners.length !== 4}
                  onClick={() => {
                    setHoles([]);
                    setSpanChecksMm([]);
                    setHoleClickRadiusPx(0);
                    setMode("holes");
                  }}
                >
                  <span>2</span> Mark mounting holes
                </button>
                <button
                  className={mode === "preview" ? "active" : ""}
                  disabled={holes.length < 2 || !calibration}
                  onClick={() => setMode("preview")}
                >
                  <span>3</span> Build part
                </button>
              </div>
              <p className="helper-line">
                <MousePointer2 size={16} />{" "}
                {mode === "marker"
                  ? `Tap the outer marker corners clockwise, starting top left (${corners.length}/4).`
                  : mode === "holes"
                    ? `Tap the center of each mounting hole (${holes.length} marked). Add at least two, then build.`
                    : "Tap a step to remeasure. The marker and holes must share a flat plane."}
              </p>
              <div className="measurement-review">
                <div className="review-heading">
                  <div>
                    <ShieldCheck size={18} />
                    <strong>Measurement review</strong>
                  </div>
                  <span
                    className={`review-status ${quality?.status ?? "waiting"}`}
                  >
                    {isSample
                      ? "SAMPLE ONLY"
                      : quality?.status === "cross-checked"
                        ? "CROSS-CHECKED"
                        : quality?.status === "mismatch"
                          ? "MISMATCH"
                          : quality?.status === "needs-recapture"
                            ? "REMARK PHOTO"
                            : "NEEDS CHECK"}
                  </span>
                </div>
                <p>
                  Measure the printed marker and each hole spacing
                  independently. Export unlocks when they agree.
                </p>
                <div className="review-inputs">
                  <label>
                    Printed marker side{" "}
                    <div>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={markerMeasuredMm}
                        onChange={(event) => {
                          setMarkerMeasuredMm(event.target.value);
                          setMarkerScaleChecked(false);
                        }}
                        placeholder="40.0"
                      />
                      <span>mm</span>
                    </div>
                  </label>
                  <label className="review-checkbox">
                    <input
                      type="checkbox"
                      checked={markerScaleChecked}
                      onChange={(event) =>
                        setMarkerScaleChecked(event.target.checked)
                      }
                    />{" "}
                    I checked the printed marker with a ruler.
                  </label>
                  {holes.slice(1).map((_, index) => (
                    <label key={index}>
                      H1 → H{index + 2} center spacing{" "}
                      <div>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={spanChecksMm[index] ?? ""}
                          onChange={(event) =>
                            setSpanChecksMm((previous) => {
                              const next = [...previous];
                              next[index] = event.target.value;
                              return next;
                            })
                          }
                          placeholder="Measured"
                        />
                        <span>mm</span>
                      </div>
                    </label>
                  ))}
                </div>
                {quality && (
                  <div className="review-results">
                    <span>
                      Photo span H1 → H2{" "}
                      <strong>{formatMm(quality.spanMm)}</strong>
                    </span>
                    <span>
                      Simulated click range (5–95%){" "}
                      <strong>
                        {formatMm(quality.clickIntervalMm[0])}–
                        {formatMm(quality.clickIntervalMm[1])}
                      </strong>
                    </span>
                    {quality.checks.map((check, index) => (
                      <span key={index}>
                        H1 → H{index + 2} difference{" "}
                        <strong>
                          {check.differenceMm == null
                            ? "awaiting check"
                            : formatMm(check.differenceMm)}
                        </strong>
                      </span>
                    ))}
                  </div>
                )}
                {quality?.notes.map((note, index) => (
                  <p className="review-note" key={index}>
                    {note}
                  </p>
                ))}
                {quality && (
                  <small>
                    This is a sensitivity simulation, not a calibrated
                    confidence interval. It excludes lens distortion, wrong
                    scale, and non-planar surfaces.
                  </small>
                )}
              </div>
              {mode === "holes" && holes.length >= 2 && (
                <button
                  className="finish-button"
                  onClick={() => setMode("preview")}
                >
                  Build this part <ChevronRight size={18} />
                </button>
              )}
            </div>

            <div className="design-column">
              <div className="panel-heading">
                <span className="panel-index">B</span>
                <div>
                  <h3>Shape the replacement</h3>
                  <p>
                    A dimensioned, editable plate built from your measurements.
                  </p>
                </div>
              </div>
              <div className="preview-wrap">
                {result.plate ? (
                  <PartPreview plate={result.plate} />
                ) : (
                  <div className="preview-empty">
                    <ScanLine size={38} strokeWidth={1.4} />
                    <strong>Waiting for measurements</strong>
                    <span>
                      Mark four marker corners and at least two holes to
                      generate a part.
                    </span>
                  </div>
                )}
                <span className="preview-overlay">
                  DRAG TO ROTATE / SCROLL TO ZOOM
                </span>
              </div>
              {result.error && (
                <p className="inline-error" role="alert">
                  {result.error}
                </p>
              )}
              <div className="dimension-strip">
                <div>
                  <span>WIDTH</span>
                  <strong>
                    {result.plate ? formatMm(result.plate.width) : "—"}
                  </strong>
                </div>
                <div>
                  <span>HEIGHT</span>
                  <strong>
                    {result.plate ? formatMm(result.plate.height) : "—"}
                  </strong>
                </div>
                <div>
                  <span>HOLES</span>
                  <strong>
                    {result.plate ? result.plate.holes.length : "—"}
                  </strong>
                </div>
              </div>
              <div className="settings-header">
                <SlidersHorizontal size={17} />
                <strong>Fit controls</strong>
                <span>All values in millimetres</span>
              </div>
              <div className="setting-grid">
                {(
                  [
                    ["margin", "Edge margin", 4, 40, 1],
                    ["thickness", "Thickness", 1, 20, 0.5],
                    ["holeDiameter", "Hole diameter", 2, 20, 0.5],
                    ["cornerRadius", "Corner radius", 0, 20, 1],
                  ] as const
                ).map(([key, label, min, max, step]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <div>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={options[key]}
                        onChange={(event) =>
                          changeOption(key, Number(event.target.value))
                        }
                      />
                      <small>mm</small>
                    </div>
                  </label>
                ))}
              </div>
              <div className="download-row">
                <button
                  className="download-primary"
                  disabled={!exportReady}
                  onClick={() => {
                    if (result.plate)
                      downloadFile(
                        "ghostpart-repair-plate.stl",
                        stlFromPlate(result.plate),
                        "model/stl",
                      );
                  }}
                >
                  <ArrowDownToLine size={18} /> Download STL
                </button>
                <button
                  className="download-secondary"
                  disabled={!exportReady}
                  onClick={() => {
                    if (result.plate)
                      downloadFile(
                        "ghostpart-repair-plate.scad",
                        openScadFromPlate(result.plate),
                        "text/plain",
                      );
                  }}
                >
                  Editable OpenSCAD
                </button>
              </div>
              <div className="coupon-row">
                <div>
                  <strong>Test screw clearance first</strong>
                  <span>
                    {couponDiameters
                      ? `Print a 3 mm coupon with ${couponDiameters.map((diameter) => diameter.toFixed(1)).join(" / ")} mm holes. Choose the fit that works on your printer.`
                      : "Set a hole diameter from 2 to 20 mm to make a test coupon."}
                  </span>
                </div>
                <button
                  disabled={!couponDiameters}
                  onClick={() =>
                    downloadFile(
                      "ghostpart-fit-coupon.stl",
                      stlFromFitCoupon(options.holeDiameter),
                      "model/stl",
                    )
                  }
                >
                  Coupon STL
                </button>
                <button
                  disabled={!couponDiameters}
                  onClick={() =>
                    downloadFile(
                      "ghostpart-fit-coupon.scad",
                      openScadFromFitCoupon(options.holeDiameter),
                      "text/plain",
                    )
                  }
                >
                  Coupon SCAD
                </button>
              </div>
              <p className="fit-note">
                <CircleHelp size={15} />{" "}
                {isSample
                  ? "Sample exports are for testing."
                  : exportReady
                    ? "Measurements are cross-checked. Fit and strength remain unverified until a real test print."
                    : "Exports unlock after scale and every hole spacing are independently checked and the capture passes point-placement review."}{" "}
                This version makes flat plates only.
              </p>
            </div>
          </div>
        </section>

        <section className="ai-section" id="intelligence">
          <div className="section-heading">
            <div>
              <div className="eyebrow">02 / REPAIR INTELLIGENCE</div>
              <h2>Reason from evidence.</h2>
            </div>
            <p>
              A local model can propose failure hypotheses and useful checks. It
              cannot alter dimensions or certify a print.
            </p>
          </div>
          <div className="ai-workspace">
            <div className="ai-inputs">
              <div className="ai-emblem">
                <Sparkles size={25} />
                <span>LOCAL AI / OPT IN</span>
              </div>
              <label htmlFor="repair-goal">
                What broke, and what should the replacement do?
              </label>
              <textarea
                id="repair-goal"
                value={repairGoal}
                onChange={(event) => setRepairGoal(event.target.value)}
                rows={4}
                placeholder="Describe the object, the failed part, and how it attaches."
              />
              <div className="ai-connect-row">
                {aiModels.length ? (
                  <select
                    aria-label="Local model"
                    value={aiModel}
                    onChange={(event) => setAiModel(event.target.value)}
                  >
                    {aiModels.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button onClick={connectLocalAi} disabled={aiBusy}>
                    {aiBusy ? "Connecting…" : "Connect Ollama on this device"}
                  </button>
                )}
                <span>
                  {aiModels.length
                    ? `${aiModels.length} local model${aiModels.length === 1 ? "" : "s"} found`
                    : "No account or cloud key"}
                </span>
              </div>
              <label className="ai-photo-choice">
                <input
                  type="checkbox"
                  checked={sendPhotoToLocalAi}
                  onChange={(event) =>
                    setSendPhotoToLocalAi(event.target.checked)
                  }
                />{" "}
                Share the current photo with the local model if it supports
                vision.
              </label>
              <button
                className="ai-run"
                disabled={
                  !quality ||
                  quality.status !== "cross-checked" ||
                  !result.plate ||
                  !aiModel ||
                  !repairGoal.trim() ||
                  aiBusy
                }
                onClick={runLocalAi}
              >
                <Sparkles size={18} />{" "}
                {aiBusy && aiModels.length
                  ? "Reasoning…"
                  : "Analyze this repair"}
              </button>
              <p className="ai-privacy">
                Connects only to Ollama at 127.0.0.1:11434. The photo is sent
                only if you opt in and the selected model supports vision. The
                AI result never changes CAD.
              </p>
              {aiError && (
                <p className="inline-error" role="alert">
                  {aiError}
                </p>
              )}
            </div>
            <div className="ai-output">
              {aiAdvice ? (
                <>
                  <div className="ai-output-header">
                    <span>MODEL ADVICE / UNVERIFIED</span>
                    <strong>
                      {aiUsedImage
                        ? "PHOTO + MEASUREMENTS"
                        : "MEASUREMENTS + DESCRIPTION"}
                    </strong>
                  </div>
                  <h3>{aiAdvice.purpose}</h3>
                  {(
                    [
                      [
                        "Measured evidence & proposed CAD",
                        aiAdvice.observations,
                      ],
                      ["Possible failure modes", aiAdvice.hypotheses],
                      ["Next physical checks", aiAdvice.checks],
                      ["What remains unknown", aiAdvice.unknowns],
                    ] as const
                  ).map(([title, items]) => (
                    <div className="ai-advice-group" key={title}>
                      <h4>{title}</h4>
                      <ul>
                        {items.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <p className="ai-disclaimer">
                    Model output is a hypothesis. Verify fit and real-world
                    behavior on the object.
                  </p>
                </>
              ) : (
                <div className="ai-empty">
                  <div className="ai-orbit">
                    <span />
                    <span />
                    <span />
                  </div>
                  <strong>Intelligence with boundaries.</strong>
                  <p>
                    First, measure and cross-check the mounting geometry. Then
                    ask a local model to critique the repair plan. Dimensions
                    come from the photo and your independent measurement.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="sensor-section" id="how">
          <div className="section-heading sensor-heading">
            <div>
              <div className="eyebrow">03 / YOUR PHONE IS A WORKSHOP</div>
              <h2>Use the sensors you already own.</h2>
            </div>
            <p>
              Extra signals help you capture and compare a repair. They do not
              invent dimensions the camera cannot see.
            </p>
          </div>
          <div className="sensor-grid">
            <div className="sensor-block">
              <div className="sensor-icon">
                <Activity size={24} />
              </div>
              <span className="sensor-number">01 / MOTION + ORIENTATION</span>
              <h3>Catch a steady frame.</h3>
              <p>
                Use the accelerometer and gyroscope to spot hand movement and
                roll while lining up a measurement photo.
              </p>
              <button onClick={enableSensors} disabled={sensorState.active}>
                {sensorState.active ? (
                  <>
                    <Check size={16} /> Sensors enabled
                  </>
                ) : (
                  "Enable motion sensors"
                )}{" "}
                <ChevronRight size={16} />
              </button>
              {sensorState.active && (
                <div className="sensor-readout">
                  <span>
                    Motion{" "}
                    <strong>
                      {sensorState.motion == null
                        ? "waiting…"
                        : `${sensorState.motion.toFixed(2)} m/s²`}
                    </strong>
                  </span>
                  <span>
                    Roll{" "}
                    <strong>
                      {sensorState.tilt == null
                        ? "waiting…"
                        : `${sensorState.tilt}°`}
                    </strong>
                  </span>
                  <span
                    className={
                      sensorState.motion != null && sensorState.motion < 0.45
                        ? "steady"
                        : ""
                    }
                  >
                    {sensorState.motion == null
                      ? "Move the phone to activate"
                      : sensorState.motion < 0.45
                        ? "Steady enough to capture"
                        : "Hold still for a sharper capture"}
                  </span>
                </div>
              )}
              {sensorError && (
                <p className="inline-error" role="alert">
                  {sensorError}
                </p>
              )}
            </div>
            <div className="sensor-block">
              <div className="sensor-icon">
                <Volume2 size={24} />
              </div>
              <span className="sensor-number">02 / MICROPHONE</span>
              <h3>Hear the difference.</h3>
              <p>
                Tap an object before and after repair. Compare its strongest
                frequency and relative signal level locally.
              </p>
              <div className="tap-actions">
                <button
                  onClick={() => runTap("before")}
                  disabled={tapBusy !== null}
                >
                  {tapBusy === "before" ? "Listening…" : "Record before"}
                </button>
                <button
                  onClick={() => runTap("after")}
                  disabled={tapBusy !== null}
                >
                  {tapBusy === "after" ? "Listening…" : "Record after"}
                </button>
              </div>
              {(tapBefore || tapAfter) && (
                <div className="sensor-readout">
                  <span>
                    Before <strong>{formatTap(tapBefore)}</strong>
                  </span>
                  <span>
                    After <strong>{formatTap(tapAfter)}</strong>
                  </span>
                  <span>
                    Frequency is descriptive, not a structural safety test.
                  </span>
                </div>
              )}
              {tapError && (
                <p className="inline-error" role="alert">
                  {tapError}
                </p>
              )}
            </div>
            <div className="sensor-block sensor-future">
              <div className="sensor-icon">
                <ScanLine size={24} />
              </div>
              <span className="sensor-number">03 / DEPTH, WHEN AVAILABLE</span>
              <h3>Next: scan the mating surface.</h3>
              <p>
                Native phone depth sensors could improve 3D fit. Browser access
                varies, so depth is on the roadmap rather than claimed as part
                of this release.
              </p>
              <span className="future-label">RESEARCH TRACK / NOT IN V0.2</span>
            </div>
          </div>
        </section>
        <section className="closing">
          <div>
            <div className="eyebrow">BUILT IN THE OPEN</div>
            <h2>
              Fix things.
              <br />
              <em>Share the fix.</em>
            </h2>
            <p>
              GhostPart is an early open-source experiment in practical physical
              intelligence. The first milestone is a repair anyone can measure,
              edit, print, and verify.
            </p>
          </div>
          <a
            href="https://github.com/rudycelekli/ghostpart"
            target="_blank"
            rel="noreferrer"
          >
            Explore the source <Github size={20} />
          </a>
        </section>
      </main>
      <footer>
        <span className="brand footer-brand">
          <span className="brand-mark">
            <span />
          </span>{" "}
          GHOSTPART<span className="brand-dot">.</span>
        </span>
        <span>MAKE WHAT IS MISSING. © 2026 GHOSTPART CONTRIBUTORS.</span>
        <a
          href="https://github.com/rudycelekli/ghostpart"
          target="_blank"
          rel="noreferrer"
        >
          GITHUB ↗
        </a>
      </footer>
    </div>
  );
}
