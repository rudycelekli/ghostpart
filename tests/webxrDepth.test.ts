import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCenterDepth, startDepthPreview } from "../src/lib/webxrDepth";

afterEach(() => vi.unstubAllGlobals());

describe("WebXR depth preview", () => {
  it("reports a median scene distance and visible patch variation", () => {
    const values = [1.0, 1.02, 0.98, 1.01, 1.5, 0.99, 1.03, 0.97, 1.04];
    let index = 0;
    const sample = sampleCenterDepth({
      width: 160,
      height: 120,
      getDepthInMeters: () => values[index++],
    });
    expect(sample?.distanceM).toBeCloseTo(1.01);
    expect(sample?.spreadM).toBeCloseTo(0.53);
    expect(sample?.points).toBe(9);
    expect(sample?.widthPx).toBe(160);
  });

  it("does not present sparse or invalid depth as a reading", () => {
    expect(
      sampleCenterDepth({
        width: 160,
        height: 120,
        getDepthInMeters: () => 0,
      }),
    ).toBeNull();
    expect(
      sampleCenterDepth({
        width: 0,
        height: 120,
        getDepthInMeters: () => 1,
      }),
    ).toBeNull();
  });

  it("requests CPU WebXR depth and ends the session cleanly", async () => {
    let frameCallback:
      | ((
          time: number,
          frame: {
            getViewerPose: () => { views: object[] };
            getDepthInformation: () => {
              width: number;
              height: number;
              getDepthInMeters: () => number;
            };
          },
        ) => void)
      | undefined;
    let onSessionEnd: (() => void) | undefined;
    const session = {
      depthUsage: "cpu-optimized",
      depthType: "raw",
      updateRenderState: vi.fn(),
      requestReferenceSpace: vi.fn(async () => ({})),
      requestAnimationFrame: vi.fn((callback: typeof frameCallback) => {
        frameCallback = callback;
        return 1;
      }),
      addEventListener: vi.fn((_type: string, callback: () => void) => {
        onSessionEnd = callback;
      }),
      end: vi.fn(async () => onSessionEnd?.()),
    };
    const requestSession = vi.fn(async () => session);
    const gl = {
      FRAMEBUFFER: 1,
      COLOR_BUFFER_BIT: 2,
      DEPTH_BUFFER_BIT: 4,
      makeXRCompatible: vi.fn(async () => {}),
      bindFramebuffer: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
    };
    class Layer {
      framebuffer = null;
      constructor(_session: unknown, _context: unknown, _options: unknown) {}
    }
    vi.stubGlobal("window", { isSecureContext: true, XRWebGLLayer: Layer });
    vi.stubGlobal("navigator", { xr: { requestSession } });
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => gl }),
    });
    const onSample = vi.fn();
    const onEnd = vi.fn();
    const preview = await startDepthPreview({} as Element, onSample, onEnd);
    expect(requestSession).toHaveBeenCalledWith(
      "immersive-ar",
      expect.objectContaining({
        requiredFeatures: ["local", "depth-sensing", "dom-overlay"],
        depthSensing: expect.objectContaining({
          usagePreference: ["cpu-optimized"],
          dataFormatPreference: ["luminance-alpha", "float32"],
          depthTypeRequest: ["raw", "smooth"],
        }),
      }),
    );
    expect(frameCallback).toBeDefined();
    frameCallback?.(500, {
      getViewerPose: () => ({ views: [{}] }),
      getDepthInformation: () => ({
        width: 160,
        height: 120,
        getDepthInMeters: () => 1.2,
      }),
    });
    expect(onSample).toHaveBeenCalledWith(
      expect.objectContaining({ distanceM: 1.2 }),
    );
    expect(preview.depthType).toBe("raw");
    await preview.stop();
    expect(session.end).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
