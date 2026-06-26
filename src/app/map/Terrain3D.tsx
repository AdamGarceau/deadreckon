"use client";

import { useEffect, useRef, useState } from "react";
import { fetchHeightfield, type LatLonBox } from "@/lib/landnav/elevation";

// Drapes the photographed map over a real elevation height-field (Terrarium
// tiles) and renders it as an orbitable 3D terrain. three.js is imported
// dynamically so it never weighs down the rest of the app.

export default function Terrain3D({
  src,
  box,
  onClose,
}: {
  src: string;
  box: LatLonBox;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Fetching elevation…");
  const [exaggeration, setExaggeration] = useState(1.8);
  const exagRef = useRef(1.8);
  const applyRef = useRef<((v: number) => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        setStatus("Fetching elevation… (needs signal once)");
        const hf = await fetchHeightfield(box, 96);
        if (disposed) return;
        setStatus("");

        const mount = mountRef.current!;
        const width = mount.clientWidth;
        const height = mount.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x161c12);

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
        camera.position.set(0, 1.4, 1.7);

        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
        } catch {
          setStatus("This device couldn't start 3D (WebGL unavailable). The rest of the app works without it.");
          return;
        }
        // Cap pixel ratio to keep GPU memory in check on phones.
        renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
        renderer.setSize(width, height);
        renderer.domElement.addEventListener(
          "webglcontextlost",
          (ev) => {
            ev.preventDefault();
            setStatus("3D ran out of graphics memory and stopped. Close other tabs/apps and reopen, or skip 3D — the rest works offline.");
          },
          { once: true },
        );
        mount.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2.05;

        // Geometry: unit plane scaled to the box aspect; displace by elevation.
        const aspect = hf.spanEW / hf.spanNS;
        const planeW = aspect >= 1 ? 2 : 2 * aspect;
        const planeH = aspect >= 1 ? 2 / aspect : 2;
        const geo = new THREE.PlaneGeometry(planeW, planeH, hf.n - 1, hf.n - 1);

        const relief = Math.max(1, hf.max - hf.min);
        // vertical scale: relief in meters -> world units, relative to ground span
        const groundSpan = Math.max(hf.spanEW, hf.spanNS);
        const baseV = (relief / groundSpan) * 2;
        const pos = geo.attributes.position as import("three").BufferAttribute;
        const applyExag = (exag: number) => {
          for (let r = 0; r < hf.n; r++) {
            for (let c = 0; c < hf.n; c++) {
              const e = hf.data[r * hf.n + c];
              const norm = (e - hf.min) / relief; // 0..1
              const idx = r * hf.n + c;
              pos.setZ(idx, norm * baseV * exag);
            }
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();
        };
        applyExag(exagRef.current);
        applyRef.current = applyExag;

        // Texture: the photographed map, DOWNSCALED first. A full-res phone photo
        // (12+ MP) as a GPU texture can crash iOS Safari (the "flash"/reload).
        const baseImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = src;
        });
        const MAX_TEX = 2048;
        const tScale = Math.min(1, MAX_TEX / Math.max(baseImg.naturalWidth, baseImg.naturalHeight));
        const tw = Math.max(1, Math.round(baseImg.naturalWidth * tScale));
        const th = Math.max(1, Math.round(baseImg.naturalHeight * tScale));
        const tCanvas = document.createElement("canvas");
        tCanvas.width = tw;
        tCanvas.height = th;
        tCanvas.getContext("2d")!.drawImage(baseImg, 0, 0, tw, th);
        const tex = new THREE.CanvasTexture(tCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2; // lay flat, north = -Z
        scene.add(mesh);

        scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(-1.5, 2, 1); // low NW sun for shaded relief
        scene.add(sun);

        let raf = 0;
        const animate = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(animate);
        };
        animate();

        const onResize = () => {
          const w = mount.clientWidth;
          const h = mount.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", onResize);
          controls.dispose();
          geo.dispose();
          mat.dispose();
          tex.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        };
      } catch (e) {
        if (!disposed) setStatus(e instanceof Error ? e.message : "Couldn't build 3D terrain.");
      }
    })();

    return () => {
      disposed = true;
      applyRef.current = null;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--ln-bg)] flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--ln-line)]">
        <div className="font-bold">3D terrain</div>
        <button className="ln-btn-ghost" onClick={onClose}>Close</button>
      </div>
      <div ref={mountRef} className="flex-1 relative">
        {status && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6">
            <p className="text-sm text-[var(--ln-muted)]">{status}</p>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-[var(--ln-line)] flex items-center gap-3">
        <span className="ln-label">Vertical exaggeration</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={exaggeration}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setExaggeration(v);
            exagRef.current = v;
            applyRef.current?.(v);
          }}
          className="flex-1"
        />
        <span className="ln-mono text-sm w-10 text-right">{exaggeration.toFixed(1)}×</span>
      </div>
    </div>
  );
}
