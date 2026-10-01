import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { openScadFromPlate, plateGeometry } from "./cad";
import type { Plate } from "./measure";

/** A concept is deliberately separate from a measured repair plate. */
export type DesignConcept =
  | {
      kind: "plate";
      width: number;
      height: number;
      thickness: number;
      holeDiameter: number;
      holeSpacing: number;
      cornerRadius: number;
    }
  | {
      kind: "spacer";
      outerDiameter: number;
      innerDiameter: number;
      thickness: number;
    };

export const examplePlate: DesignConcept = {
  kind: "plate",
  width: 60,
  height: 20,
  thickness: 4,
  holeDiameter: 5,
  holeSpacing: 40,
  cornerRadius: 3,
};

export const exampleSpacer: DesignConcept = {
  kind: "spacer",
  outerDiameter: 20,
  innerDiameter: 5,
  thickness: 4,
};

function bounded(value: number, min: number, max: number, name: string) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} must be between ${min} and ${max} mm.`);
}

export function validateConcept(concept: DesignConcept): void {
  bounded(concept.thickness, 0.5, 50, "Thickness");
  if (concept.kind === "spacer") {
    bounded(concept.outerDiameter, 3, 300, "Outer diameter");
    bounded(concept.innerDiameter, 0.5, 100, "Inner diameter");
    if (concept.outerDiameter - concept.innerDiameter < 3)
      throw new Error("Spacer needs at least 1.5 mm wall on each side.");
    return;
  }
  bounded(concept.width, 3, 300, "Width");
  bounded(concept.height, 3, 300, "Height");
  bounded(concept.holeDiameter, 0, 50, "Hole diameter");
  bounded(concept.holeSpacing, 0, 290, "Hole spacing");
  bounded(concept.cornerRadius, 0, 50, "Corner radius");
  if (concept.cornerRadius > Math.min(concept.width, concept.height) / 2)
    throw new Error("Corner radius exceeds half the plate's shorter side.");
  if ((concept.holeDiameter === 0) !== (concept.holeSpacing === 0))
    throw new Error(
      "Specify both hole diameter and spacing, or set both to zero.",
    );
  if (
    concept.holeDiameter > 0 &&
    (concept.width - concept.holeSpacing - concept.holeDiameter < 3 ||
      concept.height - concept.holeDiameter < 3 ||
      concept.holeSpacing < concept.holeDiameter + 1)
  )
    throw new Error("Holes need 1.5 mm edge walls and must not overlap.");
}

export function conceptPlate(
  concept: Extract<DesignConcept, { kind: "plate" }>,
): Plate {
  validateConcept(concept);
  return {
    width: concept.width,
    height: concept.height,
    thickness: concept.thickness,
    holeDiameter: concept.holeDiameter || 1,
    cornerRadius: concept.cornerRadius,
    holes: concept.holeDiameter
      ? [
          {
            x: (concept.width - concept.holeSpacing) / 2,
            y: concept.height / 2,
          },
          {
            x: (concept.width + concept.holeSpacing) / 2,
            y: concept.height / 2,
          },
        ]
      : [],
  };
}

export function conceptGeometry(concept: DesignConcept): THREE.ExtrudeGeometry {
  validateConcept(concept);
  if (concept.kind === "plate") return plateGeometry(conceptPlate(concept));
  const shape = new THREE.Shape();
  shape.absarc(0, 0, concept.outerDiameter / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, concept.innerDiameter / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, {
    depth: concept.thickness,
    bevelEnabled: false,
    curveSegments: 96,
  });
}

export function stlFromConcept(concept: DesignConcept): string {
  const geometry = conceptGeometry(concept);
  const stl = new STLExporter().parse(new THREE.Mesh(geometry), {
    binary: false,
  }) as string;
  geometry.dispose();
  return stl;
}

export function openScadFromConcept(concept: DesignConcept): string {
  validateConcept(concept);
  if (concept.kind === "plate")
    return `// UNVERIFIED concept from description. Check every dimension and test fit.\n${openScadFromPlate(conceptPlate(concept))}`;
  const n = (value: number) => Number(value.toFixed(3));
  return `// UNVERIFIED concept from description. Check every dimension and test fit.\nouter_diameter = ${n(concept.outerDiameter)};\ninner_diameter = ${n(concept.innerDiameter)};\nthickness = ${n(concept.thickness)};\n$fn = 96;\ndifference() {\n  cylinder(h=thickness, d=outer_diameter);\n  translate([0,0,-0.1]) cylinder(h=thickness+0.2, d=inner_diameter);\n}\n`;
}

const number = "(\\d+(?:\\.\\d+)?)";
const mm = "\\s*mm";
const explicitNumbers = new RegExp(`${number}${mm}`, "gi");

/** Parses only narrow, fully dimensioned descriptions; it never invents a length. */
export function parseExplicitConcept(prompt: string): DesignConcept {
  const input = prompt
    .toLowerCase()
    .replaceAll("×", "x")
    .replaceAll("millimeters", "mm");
  const values = [...input.matchAll(explicitNumbers)].map((match) =>
    Number(match[1]),
  );
  if (values.length < 3)
    throw new Error(
      "Give every dimension explicitly in mm, or use a template below.",
    );
  if (/\b(spacer|washer|ring)\b/.test(input)) {
    const outer =
      input.match(
        new RegExp(`${number}${mm}\\s*(?:outer|outside)(?:\\s+diameter)?`),
      ) ??
      input.match(
        new RegExp(`(?:outer|outside)(?:\\s+diameter)?\\s*${number}${mm}`),
      );
    const inner =
      input.match(
        new RegExp(`${number}${mm}\\s*(?:inner|inside|hole)(?:\\s+diameter)?`),
      ) ??
      input.match(
        new RegExp(`(?:inner|inside|hole)(?:\\s+diameter)?\\s*${number}${mm}`),
      );
    const thick =
      input.match(new RegExp(`${number}${mm}\\s*(?:thick|thickness)`)) ??
      input.match(new RegExp(`(?:thick|thickness)\\s*${number}${mm}`));
    if (!outer || !inner || !thick)
      throw new Error(
        "For a spacer, specify outer diameter, inner diameter, and thickness in mm.",
      );
    const concept: DesignConcept = {
      kind: "spacer",
      outerDiameter: Number(outer[1]),
      innerDiameter: Number(inner[1]),
      thickness: Number(thick[1]),
    };
    validateConcept(concept);
    return concept;
  }
  if (!/\bplate\b/.test(input))
    throw new Error(
      "This version understands a flat plate or a ring spacer. Choose a template below.",
    );
  const triple = input.match(
    new RegExp(
      `${number}${mm}\\s*(?:x|by)\\s*${number}${mm}\\s*(?:x|by)\\s*${number}${mm}`,
    ),
  );
  if (!triple)
    throw new Error("For a plate, write width x height x thickness in mm.");
  const holes = input.match(
    new RegExp(`(?:two|2)\\s+${number}${mm}\\s+holes?`),
  );
  const spacing = input.match(
    new RegExp(
      `${number}${mm}\\s*(?:apart|spacing|between\\s+(?:centers|centres))`,
    ),
  );
  if (!!holes !== !!spacing)
    throw new Error(
      "Specify two hole diameters and their center spacing, or omit holes entirely.",
    );
  const radius = input.match(
    new RegExp(`${number}${mm}\\s*(?:corner\\s+radius|rounded\\s+corners)`),
  );
  const concept: DesignConcept = {
    kind: "plate",
    width: Number(triple[1]),
    height: Number(triple[2]),
    thickness: Number(triple[3]),
    holeDiameter: holes ? Number(holes[1]) : 0,
    holeSpacing: spacing ? Number(spacing[1]) : 0,
    cornerRadius: radius ? Number(radius[1]) : 0,
  };
  validateConcept(concept);
  return concept;
}

/** The model may classify shape, but every returned dimension must occur in the user's text. */
export function verifyModelConcept(
  value: unknown,
  prompt: string,
): DesignConcept {
  if (!value || typeof value !== "object")
    throw new Error("AI returned an invalid design.");
  const item = value as Record<string, unknown>;
  if (item.kind !== "plate" && item.kind !== "spacer")
    throw new Error("AI proposed an unsupported shape.");
  const keys =
    item.kind === "plate"
      ? [
          "width",
          "height",
          "thickness",
          "holeDiameter",
          "holeSpacing",
          "cornerRadius",
        ]
      : ["outerDiameter", "innerDiameter", "thickness"];
  const concept = { kind: item.kind } as Record<string, unknown>;
  const mentioned = [...prompt.matchAll(explicitNumbers)].map((match) =>
    Number(match[1]),
  );
  for (const key of keys) {
    const value = item[key];
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`AI omitted ${key}. State it explicitly in mm.`);
    if (value !== 0 && !mentioned.includes(value))
      throw new Error(
        `AI invented ${key} (${value} mm). State it explicitly in your description.`,
      );
    concept[key] = value;
  }
  const verified = concept as DesignConcept;
  validateConcept(verified);
  return verified;
}
