import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import type { Plate } from "./measure";
import { validatePlate } from "./measure";

export function plateGeometry(plate: Plate): THREE.ExtrudeGeometry {
  validatePlate(plate);
  const { width: w, height: h, cornerRadius: r } = plate;
  const shape = new THREE.Shape();
  if (r > 0) {
    shape.moveTo(r, 0);
    shape.lineTo(w - r, 0);
    shape.quadraticCurveTo(w, 0, w, r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(r, h);
    shape.quadraticCurveTo(0, h, 0, h - r);
    shape.lineTo(0, r);
    shape.quadraticCurveTo(0, 0, r, 0);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(w, 0);
    shape.lineTo(w, h);
    shape.lineTo(0, h);
  }
  shape.closePath();
  for (const hole of plate.holes) {
    const path = new THREE.Path();
    path.absarc(hole.x, hole.y, plate.holeDiameter / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: plate.thickness,
    bevelEnabled: false,
    curveSegments: 48,
    steps: 1,
  });
  geometry.computeVertexNormals();
  return geometry;
}

export function stlFromPlate(plate: Plate): string {
  const geometry = plateGeometry(plate);
  const mesh = new THREE.Mesh(geometry);
  const stl = new STLExporter().parse(mesh, { binary: false }) as string;
  geometry.dispose();
  return stl;
}

export function openScadFromPlate(plate: Plate): string {
  validatePlate(plate);
  const n = (value: number) => Number(value.toFixed(3));
  const holes = plate.holes
    .map(
      (hole) =>
        `    translate([${n(hole.x)}, ${n(hole.y)}, -0.1]) cylinder(h=thickness+0.2, d=hole_diameter, $fn=64);`,
    )
    .join("\n");
  return `// GhostPart repair plate. All dimensions in millimetres.\n// Edit the parameters, then render (F6) and export STL.\nwidth = ${n(plate.width)};\nheight = ${n(plate.height)};\nthickness = ${n(plate.thickness)};\nhole_diameter = ${n(plate.holeDiameter)};\ncorner_radius = ${n(plate.cornerRadius)};\n\nmodule rounded_plate(w, h, r) {\n  if (r > 0) offset(r=r) offset(delta=-r) square([w,h]);\n  else square([w,h]);\n}\n\ndifference() {\n  linear_extrude(height=thickness) rounded_plate(width, height, corner_radius);\n${holes}\n}\n`;
}

export function downloadFile(
  name: string,
  content: string,
  mime: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
