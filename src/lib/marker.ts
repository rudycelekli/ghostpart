import { calibrationTransform, type Quad } from "./measure";

/** Proposes the black-square corners of GhostPart's printed ArUco marker. */
export async function detectGhostMarker(
  imageUrl: string,
): Promise<Quad | null> {
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const scale = Math.min(
    1,
    1600 / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Could not read the photo for marker detection.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: aruco } = await import("js-aruco2");
  const detector = new aruco.AR.Detector({
    dictionaryName: "ARUCO_MIP_36h12",
    maxHammingDistance: 5,
  });
  const match = detector.detect(pixels).find((marker) => marker.id === 7);
  if (!match || match.corners.length !== 4) return null;
  const corners = match.corners.map(({ x, y }) => ({
    x: x / scale,
    y: y / scale,
  })) as Quad;
  // Reject a corrupt or unstable detector result before it reaches the UI.
  calibrationTransform(corners, 40);
  return corners;
}
