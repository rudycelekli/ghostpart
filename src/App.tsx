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
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { PartPreview } from "./components/PartPreview";
import { downloadFile, openScadFromPlate, stlFromPlate } from "./lib/cad";
import {
  calibrationTransform,
  plateFromImagePoints,
  type Point,
  type Quad,
} from "./lib/measure";
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
  { x: 92, y: 548 },
  { x: 252, y: 548 },
  { x: 252, y: 708 },
  { x: 92, y: 708 },
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
      return calibrationTransform(corners as Quad, 40);
    } catch {
      return null;
    }
  }, [corners]);

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

  const loadImage = (url: string, sample = false) => {
    setImage(url);
    setIsSample(sample);
    setCorners(sample ? sampleCorners : []);
    setHoles(sample ? sampleHoles : []);
    setMode(sample ? "preview" : "marker");
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
    if (mode === "marker") {
      const next = [...corners, { x, y }];
      setCorners(next);
      if (next.length === 4) setMode("holes");
    } else setHoles((previous) => [...previous, { x, y }]);
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
          <span /> OPEN SOURCE / V0.1
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
                onClick={onPhotoClick}
              >
                {cameraOn ? (
                  <video ref={videoRef} autoPlay playsInline muted />
                ) : (
                  <>
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
                  </>
                )}
                <span className="photo-badge">
                  {cameraOn
                    ? "LIVE CAPTURE"
                    : isSample
                      ? "SAMPLE PROJECT"
                      : "YOUR CAPTURE"}
                </span>
              </div>
              <div className="measurement-steps">
                <button
                  className={mode === "marker" ? "active" : ""}
                  onClick={() => {
                    setCorners([]);
                    setHoles([]);
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
                  disabled={!result.plate}
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
                  disabled={!result.plate}
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
              <p className="fit-note">
                <CircleHelp size={15} /> Check hole spacing with a ruler or
                calipers before printing. This early version makes flat plates
                only.
              </p>
            </div>
          </div>
        </section>

        <section className="sensor-section" id="how">
          <div className="section-heading sensor-heading">
            <div>
              <div className="eyebrow">02 / YOUR PHONE IS A WORKSHOP</div>
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
              <span className="future-label">RESEARCH TRACK / NOT IN V0.1</span>
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
