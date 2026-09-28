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
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PartPreview } from "./components/PartPreview";
import { FitWorkbench } from "./components/FitWorkbench";
import { PreflightLab } from "./components/PreflightLab";
import {
  downloadFile,
  fitCouponDiameters,
  openScadFromFitCoupon,
  openScadFromPlate,
  stlFromFitCoupon,
  stlFromPlate,
} from "./lib/cad";
import {
  calibrationTransformRectangle,
  plateFromImagePoints,
  type Point,
  type Quad,
} from "./lib/measure";
import { assessMeasurement } from "./lib/quality";
import { detectGhostMarker } from "./lib/marker";
import {
  PREFLIGHT_STORAGE_KEY,
  readPreflightSession,
  type PreflightSession,
} from "./lib/preflight";
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
type ReferenceMode = "printed" | "measured";
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
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

function formatMm(value: number) {
  return `${Number(value.toFixed(1))} mm`;
}

function formatTap(signature: TapSignature | null) {
  if (!signature) return "—";
  return `${signature.dominantHz} Hz · ${Math.round(20 * Math.log10(signature.loudness))} dBFS`;
}

export default function App() {
  const [image, setImage] = useState(asset("demo-workbench.svg"));
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
  const [referenceHeightMm, setReferenceHeightMm] = useState("40");
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("printed");
  const [markerScaleChecked, setMarkerScaleChecked] = useState(true);
  const [spanChecksMm, setSpanChecksMm] = useState<string[]>(["60"]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [sensorState, setSensorState] = useState({
    active: false,
    motion: null as number | null,
    tilt: null as number | null,
  });
  const [sensorError, setSensorError] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [findingMarker, setFindingMarker] = useState(false);
  const [autoMarkerFound, setAutoMarkerFound] = useState(false);
  const [captureId, setCaptureId] = useState("");
  const [preflightSession, setPreflightSession] =
    useState<PreflightSession | null>(() => {
      try {
        return readPreflightSession(window.localStorage);
      } catch {
        return null;
      }
    });
  const [preflightStorageError, setPreflightStorageError] = useState("");
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
  const cameraRequestId = useRef(0);
  const blobUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      cameraRequestId.current += 1;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const stream = cameraStream.current;
    if (!video || !stream) return;

    let hasFrame = false;
    let closed = false;
    const fail = (message: string) => {
      if (closed) return;
      closed = true;
      cameraRequestId.current += 1;
      stream.getTracks().forEach((track) => track.stop());
      if (cameraStream.current === stream) cameraStream.current = null;
      setCameraOn(false);
      setCameraReady(false);
      setCaptureError(message);
    };
    const markReady = () => {
      if (closed) return;
      if (
        video.videoWidth > 0 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        hasFrame = true;
        setCameraReady(true);
        setCaptureError("");
      }
    };
    const onVideoError = () =>
      fail(
        "The camera opened but could not show video. Try Add a photo instead.",
      );
    const onTrackEnded = () =>
      fail(
        "The camera disconnected. Reconnect it and retry, or use Add a photo.",
      );
    const track = stream.getVideoTracks()[0];
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    video.addEventListener("error", onVideoError);
    track?.addEventListener("ended", onTrackEnded);
    video.srcObject = stream;
    void video
      .play()
      .then(markReady)
      .catch(() => {
        fail(
          "The browser blocked live video playback. Check camera permission or use Add a photo.",
        );
      });
    const timeout = window.setTimeout(() => {
      if (!hasFrame)
        fail(
          "The camera opened but no video frame arrived. Check camera permission or use Add a photo.",
        );
    }, 10000);
    return () => {
      closed = true;
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
      video.removeEventListener("error", onVideoError);
      track?.removeEventListener("ended", onTrackEnded);
      video.pause();
      video.srcObject = null;
    };
  }, [cameraOn]);

  useEffect(() => {
    try {
      if (preflightSession)
        window.localStorage.setItem(
          PREFLIGHT_STORAGE_KEY,
          JSON.stringify(preflightSession),
        );
      else window.localStorage.removeItem(PREFLIGHT_STORAGE_KEY);
      setPreflightStorageError("");
    } catch {
      setPreflightStorageError(
        "Device storage is unavailable. Export the report before closing this page.",
      );
    }
  }, [preflightSession]);

  const calibration = useMemo(() => {
    if (corners.length !== 4) return null;
    try {
      const width = Number(markerMeasuredMm);
      const height =
        referenceMode === "printed" ? width : Number(referenceHeightMm);
      if (width <= 0 || height <= 0) return null;
      return calibrationTransformRectangle(corners as Quad, width, height);
    } catch {
      return null;
    }
  }, [corners, markerMeasuredMm, referenceHeightMm, referenceMode]);

  const quality = useMemo(() => {
    if (!calibration || corners.length !== 4 || holes.length < 2) return null;
    try {
      return assessMeasurement({
        corners: corners as Quad,
        holes,
        markerSizeMm: Number(markerMeasuredMm),
        referenceHeightMm:
          referenceMode === "printed"
            ? Number(markerMeasuredMm)
            : Number(referenceHeightMm),
        markerScaleChecked,
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
    referenceHeightMm,
    referenceMode,
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
  const preflightReference =
    preflightSession && preflightSession.attempts.length < 5
      ? preflightSession.reference
      : null;
  const lockedPreflightSpans = preflightReference
    ? [
        String(preflightReference.horizontalSpanMm),
        String(preflightReference.verticalSpanMm),
      ]
    : [];

  const stopCamera = () => {
    cameraRequestId.current += 1;
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraOn(false);
    setCameraReady(false);
    setCameraStarting(false);
  };

  const changePreflightSession = (next: PreflightSession | null) => {
    if (!preflightSession && next && !isSample) {
      setReferenceMode("printed");
      setReferenceHeightMm(String(next.reference.markerSideMm));
      setCorners([]);
      setHoles([]);
      setMode("marker");
      setMarkerMeasuredMm(String(next.reference.markerSideMm));
      setMarkerScaleChecked(true);
      setSpanChecksMm([
        String(next.reference.horizontalSpanMm),
        String(next.reference.verticalSpanMm),
      ]);
    }
    setPreflightSession(next);
  };

  useEffect(() => {
    aiRequestId.current += 1;
    setAiAdvice(null);
  }, [result.plate, quality, repairGoal, image]);

  const loadImage = (url: string, sample = false) => {
    stopCamera();
    setImage(url);
    setIsSample(sample);
    setCaptureId(sample ? "" : crypto.randomUUID());
    setAutoMarkerFound(false);
    setCorners(sample ? sampleCorners : []);
    setHoles(sample ? sampleHoles : []);
    setMode(sample ? "preview" : "marker");
    setZoom(1);
    setCornerClickRadiusPx(sample ? 0.1 : 0);
    setHoleClickRadiusPx(sample ? 0.1 : 0);
    setMarkerMeasuredMm(
      sample
        ? "40"
        : preflightReference
          ? String(preflightReference.markerSideMm)
          : "",
    );
    setReferenceHeightMm(sample ? "40" : "");
    if (sample || preflightReference) setReferenceMode("printed");
    setMarkerScaleChecked(sample || !!preflightReference);
    setSpanChecksMm(sample ? ["60"] : lockedPreflightSpans);
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

  const findMarker = async () => {
    if (referenceMode !== "printed") return;
    setCaptureError("");
    setFindingMarker(true);
    setAutoMarkerFound(false);
    try {
      const found = await detectGhostMarker(image);
      if (!found) {
        setCaptureError(
          "Automatic marker not found. Print the new marker, or mark four corners manually.",
        );
        return;
      }
      setCorners(found);
      setHoles([]);
      setSpanChecksMm(lockedPreflightSpans);
      setAutoMarkerFound(true);
      setCornerClickRadiusPx(0.75);
      setHoleClickRadiusPx(0);
      setMode("holes");
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : "Could not inspect this photo.",
      );
    } finally {
      setFindingMarker(false);
    }
  };

  const changeReferenceMode = (next: ReferenceMode) => {
    if (next === referenceMode) return;
    setReferenceMode(next);
    setCorners([]);
    setHoles([]);
    setMode("marker");
    setMarkerMeasuredMm("");
    setReferenceHeightMm("");
    setMarkerScaleChecked(false);
    setSpanChecksMm([]);
    setAutoMarkerFound(false);
    setCornerClickRadiusPx(0);
    setHoleClickRadiusPx(0);
  };

  const startCamera = async () => {
    setCaptureError("");
    setCameraReady(false);
    setCameraStarting(true);
    const requestId = ++cameraRequestId.current;
    let timeout: number | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const pending = navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      void pending
        .then((stream) => {
          if (requestId !== cameraRequestId.current)
            stream.getTracks().forEach((track) => track.stop());
        })
        .catch(() => {});
      const stream = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(
            () =>
              reject(
                new DOMException("Camera request timed out", "TimeoutError"),
              ),
            12000,
          );
        }),
      ]);
      if (requestId !== cameraRequestId.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream.current = stream;
      setCameraOn(true);
      setCameraStarting(false);
    } catch (error) {
      if (requestId !== cameraRequestId.current) return;
      cameraRequestId.current += 1;
      setCameraStarting(false);
      setCaptureError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission is blocked. Allow camera for this site in your browser, then retry, or use Add a photo."
          : error instanceof DOMException && error.name === "TimeoutError"
            ? "Camera permission is still pending. Check the browser's camera prompt, then retry, or use Add a photo."
            : error instanceof DOMException && error.name === "NotFoundError"
              ? "No camera was found. Connect a camera or use Add a photo."
              : error instanceof DOMException &&
                  error.name === "NotReadableError"
                ? "The camera is busy. Close other camera apps or tabs, then retry, or use Add a photo."
                : "Live camera is unavailable in this browser. Try Add a photo instead.",
      );
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (
      !cameraReady ||
      !video ||
      video.videoWidth === 0 ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      setCaptureError("Wait for the live picture before capturing a frame.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    loadImage(canvas.toDataURL("image/jpeg", 0.94));
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
          <a href="#fit-loop">Fit loop</a>
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
          <span /> OPEN SOURCE / V0.5.0
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
              <a
                className="text-action"
                href={asset("marker-auto-40mm.svg")}
                download
              >
                Get the auto marker <ArrowDownToLine size={17} />
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
                    {referenceMode === "printed"
                      ? "Place the printed marker on the same flat surface as the mounting holes."
                      : "Place a rigid rectangular object beside the holes on the same flat surface. Measure its width and height."}
                  </p>
                </div>
              </div>
              <div
                className="reference-mode"
                role="group"
                aria-label="Calibration reference"
              >
                <button
                  className={referenceMode === "printed" ? "active" : ""}
                  onClick={() => changeReferenceMode("printed")}
                  disabled={!!preflightReference}
                  aria-pressed={referenceMode === "printed"}
                >
                  Printed marker
                </button>
                <button
                  className={referenceMode === "measured" ? "active" : ""}
                  onClick={() => changeReferenceMode("measured")}
                  disabled={!!preflightReference}
                  aria-pressed={referenceMode === "measured"}
                >
                  No printer · measured rectangle
                </button>
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
                  disabled={cameraStarting || (cameraOn && !cameraReady)}
                >
                  {cameraOn ? <ScanLine size={17} /> : <Camera size={17} />}
                  {cameraStarting
                    ? "Opening camera…"
                    : cameraOn
                      ? cameraReady
                        ? "Capture frame"
                        : "Waiting for video…"
                      : "Live camera"}
                </button>
                {(cameraOn || cameraStarting) && (
                  <button className="toolbar-button" onClick={stopCamera}>
                    Stop camera
                  </button>
                )}
                {referenceMode === "printed" && (
                  <button
                    className="toolbar-button"
                    onClick={findMarker}
                    disabled={cameraOn || cameraStarting || findingMarker}
                  >
                    <ScanSearch size={17} />
                    {findingMarker ? "Finding…" : "Find marker"}
                  </button>
                )}
                <button
                  className="icon-button"
                  title="Load sample"
                  aria-label="Load sample"
                  onClick={() => loadImage(asset("demo-workbench.svg"), true)}
                >
                  <RotateCcw size={18} />
                </button>
              </div>
              <p className="accuracy-check-link">
                {referenceMode === "printed" ? (
                  <>
                    Before a real repair, print the{" "}
                    <a href={asset("accuracy-check-40mm.svg")} download>
                      accuracy check card
                    </a>{" "}
                    and run the{" "}
                    <a
                      href="https://github.com/rudycelekli/ghostpart/blob/main/PRETEST.md"
                      target="_blank"
                      rel="noreferrer"
                    >
                      five-photo check
                    </a>
                    .
                  </>
                ) : (
                  "No print needed. Use a flat, rigid rectangle with four visible corners. Measure edge 1→2 as width and 2→3 as height; a nominal size is not enough."
                )}
              </p>
              {captureError && (
                <p className="inline-error" role="alert">
                  {captureError}
                </p>
              )}
              <div
                className={`photo-stage ${mode !== "preview" ? "is-marking" : ""}`}
              >
                {cameraOn ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted />
                    {!cameraReady && (
                      <span className="camera-wait">
                        Connecting to live video…
                      </span>
                    )}
                  </>
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
                    setSpanChecksMm(lockedPreflightSpans);
                    setAutoMarkerFound(false);
                    setCornerClickRadiusPx(0);
                    setHoleClickRadiusPx(0);
                    setMode("marker");
                  }}
                >
                  <span>1</span> Mark 4 reference corners
                </button>
                <button
                  className={mode === "holes" ? "active" : ""}
                  disabled={corners.length !== 4}
                  onClick={() => {
                    setHoles([]);
                    setSpanChecksMm(lockedPreflightSpans);
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
                  ? `Tap the outer ${referenceMode === "printed" ? "marker" : "rectangle"} corners clockwise, starting top left (${corners.length}/4).`
                  : mode === "holes"
                    ? `Tap the center of each mounting hole (${holes.length} marked). Add at least two, then build.`
                    : "Tap a step to remeasure. The reference and holes must share a flat plane."}
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
                  Measure the{" "}
                  {referenceMode === "printed"
                    ? "printed marker"
                    : "reference width and height"}{" "}
                  and each hole spacing independently. Export unlocks when they
                  agree.
                </p>
                <div className="review-inputs">
                  <label>
                    {referenceMode === "printed"
                      ? "Printed marker side"
                      : "Reference width"}{" "}
                    <div>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        disabled={!!preflightReference}
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
                  {referenceMode === "measured" && (
                    <label>
                      Reference height{" "}
                      <div>
                        <input
                          type="number"
                          min="1"
                          step="0.1"
                          value={referenceHeightMm}
                          onChange={(event) => {
                            setReferenceHeightMm(event.target.value);
                            setMarkerScaleChecked(false);
                          }}
                          placeholder="Measured"
                        />
                        <span>mm</span>
                      </div>
                    </label>
                  )}
                  <label className="review-checkbox">
                    <input
                      type="checkbox"
                      disabled={!!preflightReference}
                      checked={markerScaleChecked}
                      onChange={(event) =>
                        setMarkerScaleChecked(event.target.checked)
                      }
                    />{" "}
                    {referenceMode === "printed"
                      ? "I checked the printed marker with a ruler."
                      : "I measured both sides of this rigid rectangle."}
                  </label>
                  {holes.slice(1).map((_, index) => (
                    <label key={index}>
                      H1 → H{index + 2} center spacing{" "}
                      <div>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          disabled={!!preflightReference}
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
                    {quality.checks.map((check, index) => (
                      <div className="review-pair" key={index}>
                        <span>
                          Photo span H1 → H{index + 2}{" "}
                          <strong>{formatMm(check.spanMm)}</strong>
                        </span>
                        <span>
                          Simulated click range (5–95%){" "}
                          <strong>
                            {formatMm(check.clickIntervalMm[0])}–
                            {formatMm(check.clickIntervalMm[1])}
                          </strong>
                        </span>
                        <span>
                          Difference{" "}
                          <strong>
                            {check.differenceMm == null
                              ? "awaiting check"
                              : formatMm(check.differenceMm)}
                          </strong>
                        </span>
                      </div>
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
                      Mark four reference corners and at least two holes to
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

        <PreflightLab
          session={preflightSession}
          onSessionChange={changePreflightSession}
          quality={quality}
          isSample={isSample}
          captureId={captureId}
          holeCount={holes.length}
          markerSideMm={
            referenceMode === "printed"
              ? Number(markerMeasuredMm) || null
              : null
          }
          markerMethod={
            autoMarkerFound
              ? "automatic"
              : corners.length === 4
                ? "manual"
                : "not-found"
          }
          imageSizePx={isSample ? null : naturalSize}
          captureError={captureError}
          storageError={preflightStorageError}
        />

        <FitWorkbench
          key={`${image}-${referenceMode}`}
          basePlate={exportReady ? result.plate : null}
          baseSpanMm={quality?.checks[0]?.measuredMm ?? 0}
          markerSizeMm={
            Number(markerMeasuredMm) > 0 ? Number(markerMeasuredMm) : 40
          }
          referenceHeightMm={
            referenceMode === "printed"
              ? Number(markerMeasuredMm) || 40
              : Number(referenceHeightMm) || 40
          }
          referenceMode={referenceMode}
          sample={isSample}
        />

        <section className="ai-section" id="intelligence">
          <div className="section-heading">
            <div>
              <div className="eyebrow">04 / REPAIR INTELLIGENCE</div>
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
              <div className="eyebrow">05 / YOUR PHONE IS A WORKSHOP</div>
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
              <span className="future-label">RESEARCH TRACK / NOT IN V0.5</span>
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
