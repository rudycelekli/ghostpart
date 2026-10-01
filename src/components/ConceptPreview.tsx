import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { conceptGeometry, type DesignConcept } from "../lib/design";

export function ConceptPreview({ concept }: { concept: DesignConcept }) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const geometry = conceptGeometry(concept);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9e5db");
    const bounds = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(longest * 1.5, -longest * 1.5, longest * 2.2));
    camera.lookAt(center);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const material = new THREE.MeshStandardMaterial({
      color: "#e75b38",
      metalness: 0.1,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geometry, material));
    scene.add(new THREE.HemisphereLight("#ffffff", "#9a8b79", 2.1));
    const key = new THREE.DirectionalLight("#fff9e8", 3);
    key.position
      .copy(center)
      .add(new THREE.Vector3(-longest, -longest, longest * 2));
    scene.add(key);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = longest * 0.8;
    controls.maxDistance = longest * 6;
    controls.update();
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
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
  }, [concept]);
  return (
    <div
      ref={mount}
      className="concept-preview"
      role="img"
      aria-label="Interactive 3D preview of the unverified concept"
    />
  );
}
