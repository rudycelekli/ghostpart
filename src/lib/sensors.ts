export type CaptureSensors = {
  motion: number | null;
  tilt: number | null;
  active: boolean;
};

type PermissionEvent = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};
type OrientationPermissionEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export async function requestSensorPermission(): Promise<void> {
  if (
    typeof DeviceMotionEvent === "undefined" &&
    typeof DeviceOrientationEvent === "undefined"
  ) {
    throw new Error("This device or browser does not expose motion sensors.");
  }
  if (typeof DeviceMotionEvent !== "undefined") {
    const motion = DeviceMotionEvent as PermissionEvent;
    if (
      motion.requestPermission &&
      (await motion.requestPermission()) !== "granted"
    )
      throw new Error("Motion permission was denied.");
  }
  if (typeof DeviceOrientationEvent !== "undefined") {
    const orientation = DeviceOrientationEvent as OrientationPermissionEvent;
    if (
      orientation.requestPermission &&
      (await orientation.requestPermission()) !== "granted"
    )
      throw new Error("Orientation permission was denied.");
  }
}

export type TapSignature = { loudness: number; dominantHz: number };

export async function recordTapSignature(): Promise<TapSignature> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Microphone capture is unavailable in this browser.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  try {
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    const times = new Float32Array(analyser.fftSize);
    const frequencies = new Float32Array(analyser.frequencyBinCount);
    let bestLoudness = 0;
    let bestFrequency = 0;
    const start = performance.now();
    while (performance.now() - start < 2200) {
      analyser.getFloatTimeDomainData(times);
      const rms = Math.sqrt(
        times.reduce((sum, value) => sum + value * value, 0) / times.length,
      );
      if (rms > bestLoudness) {
        bestLoudness = rms;
        analyser.getFloatFrequencyData(frequencies);
        let peak = 0;
        const minBin = Math.ceil((100 * analyser.fftSize) / context.sampleRate);
        const maxBin = Math.min(
          frequencies.length - 1,
          Math.floor((4000 * analyser.fftSize) / context.sampleRate),
        );
        for (let bin = minBin; bin <= maxBin; bin += 1) {
          if (frequencies[bin] > frequencies[peak]) peak = bin;
        }
        bestFrequency = (peak * context.sampleRate) / analyser.fftSize;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
    }
    if (bestLoudness < 0.002)
      throw new Error(
        "No tap was detected. Try again closer to the microphone.",
      );
    return { loudness: bestLoudness, dominantHz: Math.round(bestFrequency) };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
  }
}
