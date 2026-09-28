import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { plateGeometry } from "../lib/cad";
import type { Plate } from "../lib/measure";

export function PartPreview({ plate }: { plate: Plate }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9e5db");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    const longest = Math.max(plate.width, plate.height);
    camera.position.set(
      plate.width * 0.85,
      -plate.height * 1.15,
      longest * 1.55,
    );
    camera.lookAt(plate.width / 2, plate.height / 2, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const geometry = plateGeometry(plate);
    const material = new THREE.MeshStandardMaterial({
      color: "#e75b38",
      metalness: 0.12,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight("#ffffff", "#9a8b79", 2.1));
    const key = new THREE.DirectionalLight("#fff9e8", 3);
    key.position.set(-plate.width, -plate.height, longest * 2);
    scene.add(key);
    const grid = new THREE.GridHelper(longest * 2, 16, "#c9c2b5", "#d8d1c6");
    grid.rotation.x = Math.PI / 2;
    grid.position.set(plate.width / 2, plate.height / 2, -1.8);
    scene.add(grid);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(plate.width / 2, plate.height / 2, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = longest * 0.8;
    controls.maxDistance = longest * 5;
    controls.update();
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [plate]);

  return (
    <div
      className="part-preview"
      ref={mount}
      aria-label="Interactive 3D preview of the repair plate"
      role="img"
    />
  );
}
