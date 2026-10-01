import { describe, expect, it } from "vitest";
import {
  conceptGeometry,
  openScadFromConcept,
  parseExplicitConcept,
  stlFromConcept,
  verifyModelConcept,
} from "../src/lib/design";
import { requestDesignConcept } from "../src/lib/localAi";

describe("description to editable CAD", () => {
  it("builds an explicitly dimensioned plate and exports printable source", () => {
    const concept = parseExplicitConcept(
      "A 60 mm x 20 mm x 4 mm plate with two 5 mm holes 40 mm apart and 3 mm corner radius.",
    );
    expect(concept).toEqual({
      kind: "plate",
      width: 60,
      height: 20,
      thickness: 4,
      holeDiameter: 5,
      holeSpacing: 40,
      cornerRadius: 3,
    });
    expect(stlFromConcept(concept)).toContain("solid exported");
    expect(openScadFromConcept(concept)).toContain("translate([10, 10");
    const geometry = conceptGeometry(concept);
    expect(geometry.getAttribute("position").count).toBeGreaterThan(100);
    geometry.dispose();
  });

  it("builds a ring spacer and rejects too-thin walls", () => {
    const concept = parseExplicitConcept(
      "A washer with 20 mm outer diameter, 5 mm inner diameter, 4 mm thickness.",
    );
    expect(concept).toEqual({
      kind: "spacer",
      outerDiameter: 20,
      innerDiameter: 5,
      thickness: 4,
    });
    expect(openScadFromConcept(concept)).toContain("difference()");
    expect(() =>
      parseExplicitConcept(
        "A washer with 6 mm outer diameter, 5 mm inner diameter, 4 mm thickness.",
      ),
    ).toThrow(/wall/);
  });

  it("rejects invented dimensions and impossible holes from a model", () => {
    const prompt =
      "A 60 mm x 20 mm x 4 mm plate with two 5 mm holes 40 mm apart";
    expect(() =>
      verifyModelConcept(
        {
          kind: "plate",
          width: 60,
          height: 20,
          thickness: 4,
          holeDiameter: 5,
          holeSpacing: 42,
          cornerRadius: 0,
        },
        prompt,
      ),
    ).toThrow(/invented/);
    expect(() =>
      verifyModelConcept(
        {
          kind: "plate",
          width: 60,
          height: 20,
          thickness: 4,
          holeDiameter: 5,
          holeSpacing: 60,
          cornerRadius: 0,
        },
        `${prompt} 60 mm`,
      ),
    ).toThrow(/edge walls/);
  });

  it("uses only local Ollama and validates its JSON answer", async () => {
    let called = "";
    const fetcher = (async (url: RequestInfo | URL) => {
      called = String(url);
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              kind: "spacer",
              outerDiameter: 20,
              innerDiameter: 5,
              thickness: 4,
            }),
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const concept = await requestDesignConcept({
      model: "local",
      description:
        "A washer with 20 mm outer diameter, 5 mm inner diameter, 4 mm thickness.",
      fetcher,
    });
    expect(called).toBe("http://127.0.0.1:11434/api/chat");
    expect(concept.kind).toBe("spacer");
  });
});
