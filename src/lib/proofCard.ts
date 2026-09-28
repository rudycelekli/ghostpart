import type { FitAssessment } from "./fit";
import type { Point } from "./measure";

/** Creates a local, vertical proof image. No photo leaves the browser. */
export async function downloadProofCard(input: {
  imageUrl: string;
  targetHoles: Point[];
  printedHoles: Point[];
  assessment: FitAssessment;
}): Promise<void> {
  const { imageUrl, targetHoles, printedHoles, assessment } = input;
  const image = new Image();
  image.src = imageUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not make the proof image.");
  ctx.fillStyle = "#202a25";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#e76543";
  ctx.font = "800 26px Arial, sans-serif";
  ctx.fillText("GHOSTPART  /  FIT SCAN", 65, 83);
  ctx.fillStyle = "#f4f2e8";
  ctx.font = "bold 64px Arial, sans-serif";
  ctx.fillText("Print. Scan. Correct.", 60, 170);
  ctx.font = "25px Arial, sans-serif";
  ctx.fillStyle = "#b9c8b9";
  ctx.fillText("Measured repair evidence · generated locally", 65, 220);

  const frame = { x: 60, y: 265, width: 960, height: 615 };
  ctx.fillStyle = "#647369";
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  const scale = Math.min(
    frame.width / image.naturalWidth,
    frame.height / image.naturalHeight,
  );
  const offsetX = frame.x + (frame.width - image.naturalWidth * scale) / 2;
  const offsetY = frame.y + (frame.height - image.naturalHeight * scale) / 2;
  ctx.drawImage(
    image,
    offsetX,
    offsetY,
    image.naturalWidth * scale,
    image.naturalHeight * scale,
  );
  const ring = (point: Point, color: string, label: string) => {
    const x = offsetX + point.x * scale;
    const y = offsetY + point.y * scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(label, x + 23, y - 15);
  };
  targetHoles.forEach((point, index) =>
    ring(point, "#b6ffd0", `T${index + 1}`),
  );
  printedHoles.forEach((point, index) =>
    ring(point, "#ffb07a", `P${index + 1}`),
  );

  const row = (label: string, value: string, y: number, color = "#f4f2e8") => {
    ctx.font = "23px Arial, sans-serif";
    ctx.fillStyle = "#b9c8b9";
    ctx.fillText(label, 65, y);
    ctx.textAlign = "right";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(value, 1015, y);
    ctx.textAlign = "left";
  };
  row(
    "CHECKED TARGET",
    `${assessment.checkedTargetSpacingMm.toFixed(1)} mm`,
    965,
  );
  row(
    "CHECKED PRINT",
    assessment.checkedPrintedSpacingMm === null
      ? "Not measured"
      : `${assessment.checkedPrintedSpacingMm.toFixed(1)} mm`,
    1040,
  );
  row(
    "REVISION",
    assessment.revisedPlate && assessment.spacingErrorMm !== null
      ? `${Math.abs(assessment.spacingErrorMm / 2).toFixed(2)} mm per hole`
      : "Measurement review",
    1115,
    "#ffab78",
  );
  ctx.fillStyle = "#89aa91";
  ctx.fillRect(60, 1160, 960, 2);
  ctx.fillStyle = "#b9c8b9";
  ctx.font = "22px Arial, sans-serif";
  ctx.fillText(
    "Measured dimensions · physical fit still requires testing",
    65,
    1222,
  );
  ctx.font = "bold 20px Arial, sans-serif";
  ctx.fillText("github.com/rudycelekli/ghostpart", 65, 1290);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Could not encode the proof image.")),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ghostpart-fit-proof.png";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
