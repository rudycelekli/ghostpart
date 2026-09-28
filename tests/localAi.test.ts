import { describe, expect, it } from "vitest";
import { requestRepairAdvice } from "../src/lib/localAi";
import {
  calibrationTransform,
  plateFromImagePoints,
  type Point,
  type Quad,
} from "../src/lib/measure";
import { assessMeasurement } from "../src/lib/quality";

const corners: Quad = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 300 },
  { x: 100, y: 300 },
];
const holes: Point[] = [
  { x: 150, y: 200 },
  { x: 350, y: 200 },
];
const h = calibrationTransform(corners, 40);
const plate = plateFromImagePoints(h, holes, {
  margin: 10,
  thickness: 4,
  holeDiameter: 5,
  cornerRadius: 4,
});
const quality = assessMeasurement({
  corners,
  holes,
  markerSizeMm: 40,
  markerScaleChecked: true,
  independentSpansMm: [40],
  clickRadiusPx: 2,
});
const advice = {
  purpose: "Bridge the mounting holes.",
  hypotheses: ["The old tab may have fractured."],
  checks: ["Test the printed fit."],
  unknowns: ["Load and material are not measured."],
};

describe("local repair adviser", () => {
  it("refuses unverified geometry before calling a model", async () => {
    const fetcher = (() => {
      throw new Error("should not fetch");
    }) as typeof fetch;
    await expect(
      requestRepairAdvice({
        model: "local",
        goal: "repair tab",
        plate,
        quality: { ...quality, status: "needs-check" },
        fetcher,
      }),
    ).rejects.toThrow(/Cross-check/);
  });

  it("sends a photo only to a model with vision capability", async () => {
    const requests: { url: string; body: any }[] = [];
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (String(url).endsWith("/api/show"))
        return new Response(JSON.stringify({ capabilities: ["completion"] }), {
          status: 200,
        });
      return new Response(
        JSON.stringify({ message: { content: JSON.stringify(advice) } }),
        { status: 200 },
      );
    }) as typeof fetch;
    const result = await requestRepairAdvice({
      model: "text-only",
      goal: "repair tab",
      plate,
      quality,
      imageBase64: "photo-data",
      fetcher,
    });
    expect(result.usedImage).toBe(false);
    expect(result.advice.hypotheses).toHaveLength(1);
    expect(result.advice.observations[0]).toContain(
      "independent check: 40.0 mm",
    );
    expect(result.advice.observations[2]).toContain("Proposed hole diameter");
    expect(result.advice.unknowns.at(-1)).toContain("have not been verified");
    expect(
      requests.every(({ url }) => url.startsWith("http://127.0.0.1:11434/")),
    ).toBe(true);
    expect(requests[1].body.messages[1].images).toBeUndefined();
    expect(requests[1].body.format.required).toContain("unknowns");
  });

  it("includes an explicitly supplied photo for a vision model", async () => {
    let chatBody: any;
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/show"))
        return new Response(
          JSON.stringify({ capabilities: ["completion", "vision"] }),
          { status: 200 },
        );
      chatBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ message: { content: JSON.stringify(advice) } }),
        { status: 200 },
      );
    }) as typeof fetch;
    const result = await requestRepairAdvice({
      model: "vision",
      goal: "repair tab",
      plate,
      quality,
      imageBase64: "photo-data",
      fetcher,
    });
    expect(result.usedImage).toBe(true);
    expect(chatBody.messages[1].images).toEqual(["photo-data"]);
  });
});
