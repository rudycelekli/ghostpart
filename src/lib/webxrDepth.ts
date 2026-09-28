export type DepthSample = {
  distanceM: number;
  spreadM: number;
  points: number;
  widthPx: number;
  heightPx: number;
};

type DepthImage = {
  width: number;
  height: number;
  getDepthInMeters(x: number, y: number): number;
};

type XRViewLike = object;
type XRPoseLike = { views: XRViewLike[] };
type XRReferenceSpaceLike = object;
type XRFrameLike = {
  getViewerPose(space: XRReferenceSpaceLike): XRPoseLike | null;
  getDepthInformation(view: XRViewLike): DepthImage | null;
};
type XRLayerLike = { framebuffer: WebGLFramebuffer | null };
type XRSessionLike = {
  depthUsage?: string;
  depthType?: "raw" | "smooth" | null;
  updateRenderState(state: { baseLayer: XRLayerLike }): void;
  requestReferenceSpace(type: "local"): Promise<XRReferenceSpaceLike>;
  requestAnimationFrame(
    callback: (time: number, frame: XRFrameLike) => void,
  ): number;
  addEventListener(type: "end", listener: () => void): void;
  end(): Promise<void>;
};
type XRSystemLike = {
  isSessionSupported(type: "immersive-ar"): Promise<boolean>;
  requestSession(
    type: "immersive-ar",
    options: {
      requiredFeatures: string[];
      domOverlay: { root: Element };
      depthSensing: {
        usagePreference: string[];
        dataFormatPreference: string[];
        formatPreference: string[];
        depthTypeRequest: string[];
      };
    },
  ): Promise<XRSessionLike>;
};
type XRNavigator = Navigator & { xr?: XRSystemLike };
type XRCanvasContext = WebGLRenderingContext & {
  makeXRCompatible(): Promise<void>;
};
type XRLayerConstructor = new (
  session: XRSessionLike,
  context: XRCanvasContext,
  options: { alpha: boolean },
) => XRLayerLike;

export function sampleCenterDepth(image: DepthImage): DepthSample | null {
  if (image.width <= 0 || image.height <= 0) return null;
  const values: number[] = [];
  for (const x of [0.48, 0.5, 0.52]) {
    for (const y of [0.48, 0.5, 0.52]) {
      const depth = image.getDepthInMeters(x, y);
      if (Number.isFinite(depth) && depth > 0) values.push(depth);
    }
  }
  if (values.length < 5) return null;
  values.sort((a, b) => a - b);
  return {
    distanceM: values[Math.floor(values.length / 2)],
    spreadM: values[values.length - 1] - values[0],
    points: values.length,
    widthPx: image.width,
    heightPx: image.height,
  };
}

export async function supportsImmersiveAr(): Promise<boolean> {
  if (!window.isSecureContext) return false;
  const xr = (navigator as XRNavigator).xr;
  if (!xr) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/** Starts CPU-readable WebXR depth; caller must invoke from a user gesture. */
export async function startDepthPreview(
  overlay: Element,
  onSample: (sample: DepthSample | null) => void,
  onEnd: () => void,
): Promise<{
  stop: () => Promise<void>;
  depthType: "raw" | "smooth" | "unreported";
}> {
  const xr = (navigator as XRNavigator).xr;
  const Layer = (window as Window & { XRWebGLLayer?: XRLayerConstructor })
    .XRWebGLLayer;
  if (!xr || !Layer || !window.isSecureContext)
    throw new Error("This browser does not provide immersive AR depth.");

  // Keep this request in the original tap handler for browsers requiring activation.
  const session = await xr.requestSession("immersive-ar", {
    requiredFeatures: ["local", "depth-sensing", "dom-overlay"],
    domOverlay: { root: overlay },
    depthSensing: {
      usagePreference: ["cpu-optimized"],
      dataFormatPreference: ["luminance-alpha", "float32"],
      // Older WebXR depth implementations used this name.
      formatPreference: ["luminance-alpha", "float32"],
      depthTypeRequest: ["raw", "smooth"],
    },
  });

  let ended = false;
  let lastPublished = 0;
  const close = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  session.addEventListener("end", close);
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      xrCompatible: true,
      alpha: true,
    }) as XRCanvasContext | null;
    if (!gl) throw new Error("WebGL is unavailable for this AR session.");
    if (typeof gl.makeXRCompatible === "function") await gl.makeXRCompatible();
    const layer = new Layer(session, gl, { alpha: true });
    session.updateRenderState({ baseLayer: layer });
    const space = await session.requestReferenceSpace("local");
    if (session.depthUsage !== "cpu-optimized")
      throw new Error("This device does not expose CPU-readable depth.");

    const frameLoop = (time: number, frame: XRFrameLike) => {
      if (ended) return;
      session.requestAnimationFrame(frameLoop);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (time - lastPublished < 250) return;
      lastPublished = time;
      const view = frame.getViewerPose(space)?.views[0];
      if (!view) return;
      try {
        const image = frame.getDepthInformation(view);
        onSample(image ? sampleCenterDepth(image) : null);
      } catch {
        onSample(null);
      }
    };
    session.requestAnimationFrame(frameLoop);
    return {
      depthType: session.depthType ?? "unreported",
      stop: async () => {
        if (!ended) await session.end();
        close();
      },
    };
  } catch (error) {
    await session.end().catch(() => {});
    close();
    throw error;
  }
}
