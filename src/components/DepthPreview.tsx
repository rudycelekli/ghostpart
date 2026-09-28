import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ScanLine } from "lucide-react";
import {
  startDepthPreview,
  supportsImmersiveAr,
  type DepthSample,
} from "../lib/webxrDepth";

type Status = "checking" | "unavailable" | "ready" | "starting" | "active";

export function DepthPreview({ onBegin }: { onBegin: () => void }) {
  const [status, setStatus] = useState<Status>("checking");
  const [sample, setSample] = useState<DepthSample | null>(null);
  const [depthType, setDepthType] = useState<"raw" | "smooth" | "unreported">(
    "unreported",
  );
  const [message, setMessage] = useState("");
  const overlay = useRef<HTMLDivElement>(null);
  const stop = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let mounted = true;
    void supportsImmersiveAr().then((supported) => {
      if (mounted) setStatus(supported ? "ready" : "unavailable");
    });
    return () => {
      mounted = false;
      void stop.current?.();
    };
  }, []);

  const begin = async () => {
    if (!overlay.current || status !== "ready") return;
    onBegin();
    setSample(null);
    setDepthType("unreported");
    setMessage("");
    // The DOM overlay must be visible before requestSession consumes the tap.
    flushSync(() => setStatus("starting"));
    try {
      const preview = await startDepthPreview(
        overlay.current,
        setSample,
        () => {
          stop.current = null;
          setStatus("ready");
        },
      );
      stop.current = preview.stop;
      setDepthType(preview.depthType);
      setStatus("active");
    } catch (error) {
      setStatus("ready");
      setMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "AR camera permission was declined. Allow it in your browser and try again."
          : error instanceof DOMException && error.name === "NotSupportedError"
            ? "This device or browser cannot start the required AR depth session."
            : error instanceof Error
              ? error.message
              : "Could not start depth preview on this device.",
      );
    }
  };

  const end = () => {
    void stop.current?.();
  };

  return (
    <>
      <div className="sensor-block depth-block">
        <div className="sensor-icon">
          <ScanLine size={24} />
        </div>
        <span className="sensor-number">03 / DEPTH PREVIEW</span>
        <h3>See depth when your phone can.</h3>
        <p>
          On supported Android Chrome devices, request WebXR depth, preferring
          raw, and show a live center distance. This is a sensor check, not a
          repair measurement.
        </p>
        <button onClick={begin} disabled={status !== "ready"} type="button">
          {status === "checking"
            ? "Checking AR support…"
            : status === "unavailable"
              ? "AR depth unavailable here"
              : status === "starting"
                ? "Opening AR depth…"
                : status === "active"
                  ? "Depth preview active"
                  : "Start depth preview"}
        </button>
        {status === "unavailable" && (
          <p className="depth-note">
            Try Chrome on an ARCore Android phone. iPhone LiDAR requires a
            separate native ARKit app.
          </p>
        )}
        {message && (
          <p className="inline-error" role="alert">
            {message}
          </p>
        )}
        <span className="future-label">
          EXPERIMENTAL · DOES NOT SET CAD SCALE
        </span>
      </div>
      <div
        ref={overlay}
        className={`depth-overlay ${status === "starting" || status === "active" ? "active" : ""}`}
        aria-hidden={status !== "starting" && status !== "active"}
      >
        <div className="depth-overlay-panel">
          <span className="sensor-number">LIVE WEBXR DEPTH</span>
          <strong>
            {sample ? `${sample.distanceM.toFixed(2)} m` : "Waiting for depth…"}
          </strong>
          <span>Distance at center of view</span>
          <small>
            Browser depth mode: {depthType}. A raw mode here does not include
            ARCore’s native confidence image.
          </small>
          {sample && (
            <small>
              Patch variation (not accuracy) {Math.round(sample.spreadM * 1000)}{" "}
              mm · {sample.points}
              /9 valid pixels · depth map {sample.widthPx}×{sample.heightPx}
            </small>
          )}
          <small>
            Move slowly and point at a matte surface. This is not a hole-spacing
            measurement.
          </small>
          <button type="button" onClick={end} disabled={status !== "active"}>
            Stop depth preview
          </button>
        </div>
        <div className="depth-reticle" aria-hidden="true" />
      </div>
    </>
  );
}
