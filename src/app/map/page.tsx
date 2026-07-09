"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  backAzimuth,
  compassPoint,
  degreesToMils,
  formatMeters,
  gridAzimuthDistance,
  gridToMagnetic,
  haversine,
  initialBearing,
  latLonToMGRS,
  latLonToUTM,
  norm360,
  parseMGRS,
  utmToLatLon,
  type LatLon,
  type UTM,
} from "@/lib/landnav/coords";
import {
  buildTransform,
  metersPerPixel,
  pixelToWorld,
  transformResiduals,
  worldToPixel,
  type Affine,
  type ControlPoint,
  type Pixel,
} from "@/lib/landnav/transform";
import { DEFAULT_REGION } from "@/lib/landnav/region";
import { analyzeTerrain, type TerrainAnalysis } from "@/lib/landnav/terrain";
import { type LatLonBox } from "@/lib/landnav/elevation";
import Terrain3D from "./Terrain3D";
import NumberField from "../NumberField";

type Mode = "calibrate" | "measure" | "hazard";

type HazardType = "cliff" | "water" | "steep" | "impassable" | "other";

interface Hazard {
  pixel: Pixel;
  type: HazardType;
}

const HAZARD_META: Record<HazardType, { label: string; color: string; glyph: string }> = {
  cliff: { label: "Cliff / drop-off", color: "#d9544d", glyph: "▲" },
  water: { label: "Water / flash flood", color: "#6fb3d6", glyph: "≈" },
  steep: { label: "Steep slope", color: "#e0a400", glyph: "◣" },
  impassable: { label: "Impassable", color: "#d9544d", glyph: "✕" },
  other: { label: "Other hazard", color: "#e0a400", glyph: "!" },
};

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface SavedMap {
  src: string;
  control: ControlPoint[];
  declination: number;
  hazards?: Hazard[];
}

const STORAGE_KEY = "azimuth.map.v1";

export default function MapPage() {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [mode, setMode] = useState<Mode>("calibrate");
  const [control, setControl] = useState<ControlPoint[]>([]);
  const [measure, setMeasure] = useState<Pixel[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [hazardType, setHazardType] = useState<HazardType>("cliff");
  const [terrain, setTerrain] = useState<TerrainAnalysis | null>(null);
  const [showTerrain, setShowTerrain] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const [gpsWorld, setGpsWorld] = useState<{ easting: number; northing: number; acc: number } | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [declination, setDeclination] = useState(DEFAULT_REGION.gmAngle);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [pending, setPending] = useState<Pixel | null>(null);
  const [entering, setEntering] = useState<Pixel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const watchId = useRef<number | null>(null);

  const transform: Affine | null = control.length >= 2 ? buildTransform(control) : null;
  const residuals = transform && control.length >= 3 ? transformResiduals(transform, control) : null;
  const verdict = calibrationVerdict(
    control.length,
    residuals?.rms ?? null,
    transform ? metersPerPixel(transform) : null,
  );

  // Geographic bounding box of the calibrated map (for 3D elevation).
  let mapBox: LatLonBox | null = null;
  if (transform && natural) {
    const corners: Pixel[] = [
      { x: 0, y: 0 },
      { x: natural.w, y: 0 },
      { x: natural.w, y: natural.h },
      { x: 0, y: natural.h },
    ];
    const lls = corners.map((c) => {
      const w = pixelToWorld(transform, c);
      return utmToLatLon({ zone: DEFAULT_REGION.utmZone, hemisphere: "N", easting: w.easting, northing: w.northing });
    });
    const lats = lls.map((l) => l.lat);
    const lons = lls.map((l) => l.lon);
    mapBox = {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons),
    };
  }

  // ---- persistence ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: SavedMap = JSON.parse(raw);
        setSrc(saved.src);
        setControl(saved.control || []);
        setHazards(saved.hazards || []);
        if (typeof saved.declination === "number") setDeclination(saved.declination);
        setMode("measure");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const persist = useCallback(
    (next: Partial<SavedMap>) => {
      if (!src && !next.src) return;
      const data: SavedMap = {
        src: next.src ?? src ?? "",
        control: next.control ?? control,
        declination: next.declination ?? declination,
        hazards: next.hazards ?? hazards,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        flash("Map too large to save offline — it stays loaded until reload.");
      }
    },
    [src, control, declination, hazards, flash],
  );

  // ---- image loading ----
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setSrc(dataUrl);
        setControl([]);
        setMeasure([]);
        setHazards([]);
        setTerrain(null);
        setMode("calibrate");
        fitToContainer(img.naturalWidth, img.naturalHeight);
        persist({ src: dataUrl, control: [], hazards: [] });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function analyzeMapTerrain() {
    if (!src) return;
    setAnalyzing(true);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const dw = Math.max(1, Math.round(img.naturalWidth * scale));
        const dh = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = dw;
        canvas.height = dh;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, dw, dh);
        const { data } = ctx.getImageData(0, 0, dw, dh);
        // scale maps downscaled px -> natural px
        const result = analyzeTerrain(data, dw, dh, img.naturalWidth / dw);
        setTerrain(result);
        setShowTerrain(true);
        flash(
          result.steepCount + result.waterCount === 0
            ? "No strong steep/water signal found — read the contours yourself."
            : `Terrain read: ${result.steepCount} steep zone(s)${result.waterCount ? ", water present" : ""}.`,
        );
      } catch {
        flash("Couldn't analyze this image.");
      } finally {
        setAnalyzing(false);
      }
    };
    img.onerror = () => {
      setAnalyzing(false);
      flash("Couldn't load the image for analysis.");
    };
    img.src = src;
  }

  function loadDemo() {
    const w = 1000;
    const h = 800;
    // Pre-calibrated sample: grid intersections at known pixels map to a
    // self-consistent UTM patch (10 m/px), so the fit verdict reads "Good".
    const demo: ControlPoint[] = [
      { pixel: { x: 100, y: 700 }, world: { easting: 271000, northing: 4160000 } },
      { pixel: { x: 900, y: 700 }, world: { easting: 279000, northing: 4160000 } },
      { pixel: { x: 100, y: 100 }, world: { easting: 271000, northing: 4166000 } },
    ];
    setNatural({ w, h });
    setSrc("/sample-topo.svg");
    setControl(demo);
    setMeasure([]);
    setHazards([]);
    setTerrain(null);
    setMode("measure");
    fitToContainer(w, h);
    flash("Demo map loaded and calibrated — tap two points to read an azimuth.");
  }

  const fitToContainer = useCallback((w: number, h: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = Math.min(rect.width / w, rect.height / h) * 0.96;
    setView({
      scale,
      tx: (rect.width - w * scale) / 2,
      ty: (rect.height - h * scale) / 2,
    });
  }, []);

  // Re-derive natural size if we restored a src without it.
  useEffect(() => {
    if (src && !natural) {
      const img = new Image();
      img.onload = () => {
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        fitToContainer(img.naturalWidth, img.naturalHeight);
      };
      img.src = src;
    }
  }, [src, natural, fitToContainer]);

  // ---- pointer: pan / pinch / tap ----
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{
    startView: View;
    startMid: { x: number; y: number };
    startDist: number;
    moved: boolean;
    downAt: number;
    downPt: { x: number; y: number };
  } | null>(null);

  function screenToImage(clientX: number, clientY: number): Pixel {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x: (x - view.tx) / view.scale, y: (y - view.ty) / view.scale };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const mid = midpoint(pts);
    gesture.current = {
      startView: view,
      startMid: mid,
      startDist: pts.length === 2 ? dist(pts[0], pts[1]) : 0,
      moved: false,
      downAt: e.timeStamp,
      downPt: { x: e.clientX, y: e.clientY },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    const movedDist = Math.hypot(e.clientX - g.downPt.x, e.clientY - g.downPt.y);
    // Fingers jitter a few px on a "tap." Only treat clear drags as pans, so a
    // real objective tap on a phone isn't silently swallowed as a pan.
    if (movedDist > 12) g.moved = true;

    const rect = containerRef.current!.getBoundingClientRect();
    if (pts.length === 2) {
      // pinch zoom around midpoint
      const mid = midpoint(pts);
      const d = dist(pts[0], pts[1]);
      const factor = d / (g.startDist || d);
      const newScale = clamp(g.startView.scale * factor, 0.05, 20);
      const mx = g.startMid.x - rect.left;
      const my = g.startMid.y - rect.top;
      // keep the image point under the midpoint fixed
      const imgX = (mx - g.startView.tx) / g.startView.scale;
      const imgY = (my - g.startView.ty) / g.startView.scale;
      setView({
        scale: newScale,
        tx: mid.x - rect.left - imgX * newScale,
        ty: mid.y - rect.top - imgY * newScale,
      });
    } else if (pts.length === 1) {
      // pan
      setView({
        scale: g.startView.scale,
        tx: g.startView.tx + (e.clientX - g.downPt.x),
        ty: g.startView.ty + (e.clientY - g.downPt.y),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g && !g.moved && e.timeStamp - g.downAt < 500 && pointers.current.size === 0) {
      handleTap(screenToImage(e.clientX, e.clientY));
    }
    if (pointers.current.size === 0) gesture.current = null;
  }

  function handleTap(p: Pixel) {
    if (!natural) return;
    if (p.x < 0 || p.y < 0 || p.x > natural.w || p.y > natural.h) return;
    if (mode === "calibrate") {
      setPending(p);
    } else if (mode === "hazard") {
      // Tap an existing hazard to remove it; otherwise drop a new one.
      const hitIdx = hazards.findIndex(
        (h) => Math.hypot(h.pixel.x - p.x, h.pixel.y - p.y) < 18 / view.scale,
      );
      const next =
        hitIdx >= 0
          ? hazards.filter((_, i) => i !== hitIdx)
          : [...hazards, { pixel: p, type: hazardType }];
      setHazards(next);
      persist({ hazards: next });
    } else {
      setMeasure((m) => (m.length >= 2 ? [p] : [...m, p]));
    }
  }

  function zoomBy(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const imgX = (cx - view.tx) / view.scale;
    const imgY = (cy - view.ty) / view.scale;
    const newScale = clamp(view.scale * factor, 0.05, 20);
    setView({ scale: newScale, tx: cx - imgX * newScale, ty: cy - imgY * newScale });
  }

  // ---- GPS ----
  function toggleGps() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setGpsActive(false);
      setGpsWorld(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      flash("Geolocation not supported.");
      return;
    }
    setGpsActive(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const utm = latLonToUTM(pos.coords.latitude, pos.coords.longitude);
        setGpsWorld({ easting: utm.easting, northing: utm.northing, acc: pos.coords.accuracy });
      },
      (err) => flash(err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }
  useEffect(
    () => () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  // ---- derived overlay geometry ----
  const gpsPixel = transform && gpsWorld ? worldToPixel(transform, gpsWorld) : null;

  let measureResult: {
    azimuth: number;
    distance: number;
    a: Pixel;
    b: Pixel;
  } | null = null;
  if (measure.length === 2 && transform) {
    const wa = pixelToWorld(transform, measure[0]);
    const wb = pixelToWorld(transform, measure[1]);
    const { azimuth, distance } = gridAzimuthDistance(wa, wb);
    measureResult = { azimuth, distance, a: measure[0], b: measure[1] };
  }

  // Coordinates of each tapped point, so a tap after calibration immediately
  // reads back a grid (MGRS + UTM) — start first, then objective.
  const tappedCoords =
    transform && measure.length
      ? measure.map((p) => {
          const w = pixelToWorld(transform, p);
          const ll = utmToLatLon({
            zone: DEFAULT_REGION.utmZone,
            hemisphere: "N",
            easting: w.easting,
            northing: w.northing,
          });
          return {
            mgrs: latLonToMGRS(ll.lat, ll.lon, 5),
            easting: Math.round(w.easting),
            northing: Math.round(w.northing),
          };
        })
      : [];

  // Real-world position of the objective (2nd measure point) and the live GPS,
  // used to slave a live compass to the bearing you just measured.
  const objectiveLL: LatLon | null =
    transform && measure.length === 2
      ? (() => {
          const w = pixelToWorld(transform, measure[1]);
          return utmToLatLon({
            zone: DEFAULT_REGION.utmZone,
            hemisphere: "N",
            easting: w.easting,
            northing: w.northing,
          });
        })()
      : null;
  const gpsLL: LatLon | null = gpsWorld
    ? utmToLatLon({
        zone: DEFAULT_REGION.utmZone,
        hemisphere: "N",
        easting: gpsWorld.easting,
        northing: gpsWorld.northing,
      })
    : null;

  // Open the live "walk it" compass: get orientation permission (iOS needs the
  // gesture), make sure GPS is live so distance counts down, then show it.
  async function openFollow() {
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (doe && typeof doe.requestPermission === "function") await doe.requestPermission();
    } catch {
      /* heading is optional — the magnetic bearing still shows */
    }
    if (watchId.current == null) toggleGps();
    setFollowing(true);
  }

  // Hazards within a corridor (~60 m) of the measured azimuth line.
  const hazardWarnings: string[] = [];
  if (measureResult && transform) {
    const mpp = metersPerPixel(transform);
    const seen = new Set<HazardType>();
    for (const h of hazards) {
      const dPx = pointSegmentDistance(h.pixel, measureResult.a, measureResult.b);
      if (dPx * mpp <= 60 && !seen.has(h.type)) {
        seen.add(h.type);
        hazardWarnings.push(HAZARD_META[h.type].label.toLowerCase());
      }
    }
  }

  function resetMap() {
    setSrc(null);
    setNatural(null);
    setControl([]);
    setMeasure([]);
    setHazards([]);
    setTerrain(null);
    setGpsWorld(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Map Workspace</h1>
          <p className="text-[var(--ln-muted)] text-sm">
            Photograph → calibrate → plot &amp; measure.
          </p>
        </div>
        {src && (
          <div className="flex gap-2">
            <label className="ln-btn-ghost cursor-pointer">
              New map
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            </label>
            <button className="ln-btn-ghost" onClick={resetMap}>Clear</button>
          </div>
        )}
      </div>

      {!src ? (
        <UploadPanel onFile={onFile} onDemo={loadDemo} />
      ) : (
        <>
          {/* mode + calibration status */}
          <div className="ln-panel p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="grid grid-cols-3 gap-1">
                <button className={mode === "calibrate" ? "ln-btn text-sm" : "ln-btn-ghost text-sm"} onClick={() => setMode("calibrate")}>
                  Calibrate
                </button>
                <button
                  className={mode === "measure" ? "ln-btn text-sm" : "ln-btn-ghost text-sm"}
                  onClick={() => setMode("measure")}
                  disabled={!transform}
                >
                  Measure
                </button>
                <button className={mode === "hazard" ? "ln-btn text-sm" : "ln-btn-ghost text-sm"} onClick={() => setMode("hazard")}>
                  Hazards
                </button>
              </div>
              <span className="ln-chip" style={{ color: verdict.color, borderColor: verdict.color }}>
                {verdict.label}
              </span>
            </div>
            {mode === "hazard" && (
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(HAZARD_META) as HazardType[]).map((t) => (
                  <button
                    key={t}
                    className="text-xs px-2 py-1 rounded border"
                    style={{
                      borderColor: HAZARD_META[t].color,
                      background: hazardType === t ? HAZARD_META[t].color : "transparent",
                      color: hazardType === t ? "#0e120a" : "var(--ln-ink)",
                    }}
                    onClick={() => setHazardType(t)}
                  >
                    {HAZARD_META[t].glyph} {HAZARD_META[t].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* the map canvas */}
          <div
            ref={containerRef}
            className="ln-panel relative overflow-hidden touch-none select-none"
            style={{ height: "62vh", minHeight: 360 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {natural && (
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{
                  width: natural.w,
                  height: natural.h,
                  transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} width={natural.w} height={natural.h} alt="topographic map" draggable={false} />
                <svg
                  className="absolute top-0 left-0 pointer-events-none"
                  width={natural.w}
                  height={natural.h}
                  viewBox={`0 0 ${natural.w} ${natural.h}`}
                >
                  {/* terrain analysis overlay (steep = red, water = blue) */}
                  {showTerrain && terrain &&
                    terrain.cells.map((c, i) => {
                      const s = terrain.cellSize * terrain.scale;
                      const isWater = c.water > 0.4 && c.water >= c.steepness;
                      return (
                        <rect
                          key={`t${i}`}
                          x={c.gx * s}
                          y={c.gy * s}
                          width={s}
                          height={s}
                          fill={isWater ? "var(--ln-blue)" : "var(--ln-red)"}
                          fillOpacity={isWater ? 0.35 : Math.min(0.55, 0.2 + c.steepness * 0.45)}
                        />
                      );
                    })}

                  {/* measure line + protractor */}
                  {measureResult && (
                    <Protractor
                      a={measureResult.a}
                      b={measureResult.b}
                      scale={view.scale}
                      azimuth={measureResult.azimuth}
                    />
                  )}
                  {measure.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={7 / view.scale} fill="var(--ln-amber)" stroke="#000" strokeWidth={1.5 / view.scale} />
                  ))}

                  {/* control points */}
                  {control.map((c, i) => (
                    <g key={i}>
                      <circle cx={c.pixel.x} cy={c.pixel.y} r={8 / view.scale} fill="none" stroke="var(--ln-blue)" strokeWidth={2 / view.scale} />
                      <line x1={c.pixel.x - 12 / view.scale} y1={c.pixel.y} x2={c.pixel.x + 12 / view.scale} y2={c.pixel.y} stroke="var(--ln-blue)" strokeWidth={1.5 / view.scale} />
                      <line x1={c.pixel.x} y1={c.pixel.y - 12 / view.scale} x2={c.pixel.x} y2={c.pixel.y + 12 / view.scale} stroke="var(--ln-blue)" strokeWidth={1.5 / view.scale} />
                      <text x={c.pixel.x + 12 / view.scale} y={c.pixel.y - 12 / view.scale} fill="var(--ln-blue)" fontSize={13 / view.scale} className="ln-mono">
                        {i + 1}
                      </text>
                    </g>
                  ))}

                  {/* hazard markers */}
                  {hazards.map((h, i) => (
                    <g key={`h${i}`}>
                      <circle cx={h.pixel.x} cy={h.pixel.y} r={11 / view.scale} fill={HAZARD_META[h.type].color} fillOpacity={0.85} stroke="#000" strokeWidth={1.5 / view.scale} />
                      <text x={h.pixel.x} y={h.pixel.y + 5 / view.scale} textAnchor="middle" fontSize={14 / view.scale} fill="#0e120a" fontWeight="bold">
                        {HAZARD_META[h.type].glyph}
                      </text>
                    </g>
                  ))}

                  {/* pending crosshair being fine-positioned */}
                  {pending && (
                    <g>
                      <line x1={pending.x - 26 / view.scale} y1={pending.y} x2={pending.x + 26 / view.scale} y2={pending.y} stroke="var(--ln-amber)" strokeWidth={1.5 / view.scale} />
                      <line x1={pending.x} y1={pending.y - 26 / view.scale} x2={pending.x} y2={pending.y + 26 / view.scale} stroke="var(--ln-amber)" strokeWidth={1.5 / view.scale} />
                      <circle cx={pending.x} cy={pending.y} r={4 / view.scale} fill="none" stroke="var(--ln-amber)" strokeWidth={1.5 / view.scale} />
                    </g>
                  )}

                  {/* GPS position */}
                  {gpsPixel && (
                    <g>
                      <circle cx={gpsPixel.x} cy={gpsPixel.y} r={10 / view.scale} fill="var(--ln-red)" fillOpacity={0.25} />
                      <circle cx={gpsPixel.x} cy={gpsPixel.y} r={5 / view.scale} fill="var(--ln-red)" stroke="#fff" strokeWidth={1.5 / view.scale} />
                    </g>
                  )}
                </svg>
              </div>
            )}

            {/* zoom controls */}
            <div className="absolute right-2 bottom-2 flex flex-col gap-1">
              <button className="ln-btn-ghost w-10 h-10 !p-0 text-xl bg-[var(--ln-panel)]" onClick={() => zoomBy(1.3)}>+</button>
              <button className="ln-btn-ghost w-10 h-10 !p-0 text-xl bg-[var(--ln-panel)]" onClick={() => zoomBy(1 / 1.3)}>−</button>
              <button className="ln-btn-ghost w-10 h-10 !p-0 text-xs bg-[var(--ln-panel)]" onClick={() => natural && fitToContainer(natural.w, natural.h)}>fit</button>
            </div>

            {/* mode hint */}
            <div className="absolute left-2 top-2 ln-chip bg-[var(--ln-panel)]">
              {mode === "calibrate"
                ? `Tap a known grid point (${control.length}/2+)`
                : mode === "hazard"
                ? "Tap to drop a hazard · tap one to remove"
                : transform
                ? "Tap start, then objective"
                : "Calibrate first"}
            </div>
          </div>

          {/* action row */}
          <div className="grid grid-cols-2 gap-2">
            <button className="ln-btn" onClick={toggleGps}>
              {gpsActive ? "Stop GPS" : "Plot my GPS"}
            </button>
            {mode === "measure" && gpsPixel ? (
              <button className="ln-btn-ghost" onClick={() => setMeasure([gpsPixel])}>
                Start from GPS, tap objective
              </button>
            ) : (
              <button className="ln-btn-ghost" onClick={() => setMeasure([])} disabled={mode !== "measure"}>
                Clear measurement
              </button>
            )}
          </div>

          {/* tapped-point coordinates — immediate read-back after calibration */}
          {tappedCoords.length > 0 && (
            <div className="ln-panel p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold">Tapped point{tappedCoords.length > 1 ? "s" : ""}</h3>
                <button className="ln-btn-ghost text-sm" onClick={() => setMeasure([])}>
                  Clear
                </button>
              </div>
              {tappedCoords.map((c, i) => {
                const role =
                  tappedCoords.length === 1 ? "Point" : i === 0 ? "Start" : "Objective";
                return (
                  <div key={i} className="ln-panel-2 px-3 py-2">
                    <div className="ln-label">
                      <span className="text-[var(--ln-od-bright)]">{role}</span>
                    </div>
                    <div className="ln-mono ln-stat text-base break-all">{c.mgrs}</div>
                    <div className="ln-mono text-xs text-[var(--ln-muted)]">
                      {c.easting} E · {c.northing} N · {DEFAULT_REGION.mgrsGridZone}
                    </div>
                  </div>
                );
              })}
              {measure.length === 1 && (
                <p className="text-[11px] text-[var(--ln-muted)]">
                  Tap your objective for the azimuth, back-azimuth, and distance from here.
                </p>
              )}
            </div>
          )}

          {/* terrain reading */}
          <div className="ln-panel p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold">Read terrain</h3>
              <div className="flex gap-2">
                {mapBox && (
                  <button className="ln-btn-ghost text-sm" onClick={() => setShow3D(true)}>
                    3D view
                  </button>
                )}
                {terrain && (
                  <button className="ln-btn-ghost text-sm" onClick={() => setShowTerrain((v) => !v)}>
                    {showTerrain ? "Hide overlay" : "Show overlay"}
                  </button>
                )}
                <button className="ln-btn text-sm" onClick={analyzeMapTerrain} disabled={analyzing}>
                  {analyzing ? "Reading…" : terrain ? "Re-analyze" : "Analyze map"}
                </button>
              </div>
            </div>
            {terrain ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="ln-chip"><span style={{ color: "var(--ln-red)" }}>■</span>&nbsp;{terrain.steepCount} steep zone(s)</span>
                  <span className="ln-chip"><span style={{ color: "var(--ln-blue)" }}>■</span>&nbsp;{terrain.waterCount ? "water present" : "no water found"}</span>
                </div>
                <p className="text-[11px] text-[var(--ln-muted)]">
                  Red = tightly-spaced contours (steep ground / possible cliffs —
                  fall hazard). Blue = water/drainages (flash-flood hazard in
                  canyons). This is a heuristic read of the map&apos;s ink, not a
                  survey — confirm against the contours and the ground.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--ln-muted)]">
                Scan the map photo on-device to highlight steep ground (packed
                contour lines) and water. Fully offline. Then add Hazard pins for
                anything specific.
              </p>
            )}
          </div>

          {hazardWarnings.length > 0 && (
            <div className="ln-panel p-3 border-l-4" style={{ borderLeftColor: "var(--ln-red)" }}>
              <p className="text-sm">
                <strong style={{ color: "var(--ln-red)" }}>Hazard on this route:</strong>{" "}
                <span className="text-[var(--ln-muted)]">
                  your azimuth passes near {hazardWarnings.join(", ")}. Re-check before moving.
                </span>
              </p>
            </div>
          )}

          {gpsWorld && !transform && (
            <p className="text-xs text-[var(--ln-amber)]">
              GPS locked, but the map isn&apos;t calibrated yet — add 2+ control
              points to place your position on it.
            </p>
          )}
          {gpsWorld && transform && !gpsPixel && (
            <p className="text-xs text-[var(--ln-amber)]">
              Your GPS position falls outside this map sheet.
            </p>
          )}

          {/* measurement result */}
          {measureResult && (
            <>
              <MeasurePanel
                azimuth={measureResult.azimuth}
                distance={measureResult.distance}
                declination={declination}
              />
              <button className="ln-btn w-full flex items-center justify-center gap-2" onClick={openFollow}>
                <span aria-hidden>🧭</span> Follow on compass — walk this azimuth
              </button>
            </>
          )}

          {/* control point list */}
          {control.length > 0 && (
            <ControlList
              control={control}
              mpp={transform ? metersPerPixel(transform) : null}
              residuals={residuals}
              verdict={verdict}
              onRemove={(i) => {
                const next = control.filter((_, idx) => idx !== i);
                setControl(next);
                persist({ control: next });
              }}
            />
          )}

          {/* declination setting */}
          <div className="ln-panel p-4 flex items-center gap-3 flex-wrap">
            <span className="ln-label">G-M angle for magnetic azimuths (° east +)</span>
            <NumberField
              className="ln-input ln-mono w-24"
              value={declination}
              ariaLabel="G-M angle"
              onChange={(v) => {
                setDeclination(v);
                persist({ declination: v });
              }}
            />
            <span className="text-xs text-[var(--ln-muted)]">
              Default {DEFAULT_REGION.gmAngle}° for {DEFAULT_REGION.name} (2026) — use your
              map&apos;s printed G-M angle if you&apos;re elsewhere.
            </span>
          </div>
        </>
      )}

      {/* fine-position the tapped point with a magnifier before entering coords */}
      {pending && src && natural && (
        <AdjustPoint
          src={src}
          natural={natural}
          pixel={pending}
          onChange={setPending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setEntering(pending);
            setPending(null);
          }}
        />
      )}

      {/* calibration coordinate entry dialog */}
      {entering && (
        <CalibrateDialog
          onCancel={() => setEntering(null)}
          onSave={(world) => {
            const next = [...control, { pixel: entering, world }];
            setControl(next);
            setEntering(null);
            persist({ control: next });
            if (next.length >= 2) {
              setMode("measure");
              // Calibrated — immediately find and plot the user's position.
              if (watchId.current == null) {
                toggleGps();
                flash("Calibrated — finding your position…");
              } else {
                flash("Map calibrated.");
              }
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 ln-panel px-4 py-2 text-sm">
          {toast}
        </div>
      )}

      {following && objectiveLL && (
        <FollowCompass
          objective={objectiveLL}
          objectiveLabel={latLonToMGRS(objectiveLL.lat, objectiveLL.lon, 5)}
          gps={gpsLL}
          gridAzimuth={measureResult?.azimuth ?? 0}
          declination={declination}
          onClose={() => setFollowing(false)}
        />
      )}

      {show3D && src && mapBox && (
        <Terrain3D src={src} box={mapBox} onClose={() => setShow3D(false)} />
      )}
    </div>
  );
}

// Live "walk it" compass: slaves a needle to the azimuth you measured on the map.
// With live GPS it recomputes the bearing + distance to the objective as you move;
// without it, it falls back to the fixed magnetic bearing off the map line.
function FollowCompass({
  objective,
  objectiveLabel,
  gps,
  gridAzimuth,
  declination,
  onClose,
}: {
  objective: LatLon;
  objectiveLabel: string;
  gps: LatLon | null;
  gridAzimuth: number;
  declination: number;
  onClose: () => void;
}) {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    function handle(e: DeviceOrientationEvent & { webkitCompassHeading?: number }) {
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
      else if (typeof e.alpha === "number") h = norm360(360 - e.alpha);
      if (h != null) setHeading(h);
    }
    window.addEventListener("deviceorientationabsolute", handle as EventListener);
    window.addEventListener("deviceorientation", handle as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handle as EventListener);
      window.removeEventListener("deviceorientation", handle as EventListener);
    };
  }, []);

  // Bearing to the objective: live off GPS if we have it, else the fixed map line.
  let magBearing: number;
  let distance: number | null = null;
  let live = false;
  if (gps) {
    const trueBearing = initialBearing(gps, objective);
    magBearing = norm360(trueBearing - DEFAULT_REGION.declination);
    distance = haversine(gps, objective);
    live = true;
  } else {
    magBearing = gridToMagnetic(gridAzimuth, declination);
  }
  const hasHeading = heading != null;
  // How far to turn: 0 = objective is straight ahead (top of phone).
  const arrow = hasHeading ? norm360(magBearing - heading) : magBearing;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--ln-bg,#0e120a)] flex flex-col items-center p-5 overflow-y-auto">
      <div className="w-full max-w-md flex items-center justify-between">
        <h2 className="font-semibold text-lg">Walk to objective</h2>
        <button className="ln-btn-ghost" onClick={onClose}>Close</button>
      </div>

      <div
        className="w-full max-w-md ln-panel p-2 text-center text-sm font-semibold mt-3"
        style={{
          color: hasHeading ? "var(--ln-od-bright)" : "var(--ln-amber)",
          borderColor: hasHeading ? "var(--ln-od)" : "var(--ln-amber)",
        }}
      >
        {hasHeading
          ? "● LIVE HEADING — turn until the arrow points straight up"
          : "▲ NO COMPASS SENSOR — set the magnetic bearing below on a compass"}
      </div>

      <div className="relative w-72 h-72 my-6">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--ln-line)] bg-[var(--ln-panel-2)]" />
        <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[var(--ln-amber)]">▲</div>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${arrow}deg)`, transition: "transform 0.15s ease-out" }}
        >
          <svg viewBox="0 0 100 100" className="w-48 h-48">
            <polygon points="50,8 70,60 50,48 30,60" fill="var(--ln-od-bright)" />
            <rect x="46" y="48" width="8" height="40" rx="3" fill="var(--ln-od)" />
          </svg>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-24">
          <div className="text-3xl font-bold ln-mono ln-stat">
            {distance != null ? formatMeters(distance) : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-md text-center">
        <div className="ln-panel-2 p-2">
          <div className="ln-label">Magnetic</div>
          <div className="ln-mono ln-stat text-lg text-[var(--ln-amber)]">{Math.round(magBearing)}°</div>
        </div>
        <div className="ln-panel-2 p-2">
          <div className="ln-label">Direction</div>
          <div className="ln-mono ln-stat text-lg">{compassPoint(magBearing)}</div>
        </div>
        <div className="ln-panel-2 p-2">
          <div className="ln-label">{live ? "Distance" : "Heading"}</div>
          <div className="ln-mono ln-stat text-lg">
            {live ? (distance != null ? formatMeters(distance) : "—") : hasHeading ? `${Math.round(heading!)}°` : "—"}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md ln-panel-2 p-2 text-center mt-3">
        <div className="ln-label">Objective</div>
        <div className="ln-mono text-sm break-all">{objectiveLabel}</div>
      </div>

      {!live && (
        <p className="text-[11px] text-[var(--ln-amber)] mt-3 text-center max-w-md">
          GPS is off, so distance can&apos;t count down. Turn on <strong>Plot my GPS</strong> for
          live guidance, or set {Math.round(magBearing)}° on your compass and follow it.
        </p>
      )}
      <p className="text-[11px] text-[var(--ln-muted)] mt-2 text-center max-w-md">
        Hold the phone flat, away from metal. Phone compasses drift 10–20° — confirm
        against a lensatic compass before you rely on it.
      </p>
    </div>
  );
}

// ---------------- sub-components ----------------

function UploadPanel({ onFile, onDemo }: { onFile: (e: React.ChangeEvent<HTMLInputElement>) => void; onDemo: () => void }) {
  return (
    <div className="ln-panel p-8 text-center">
      <div className="mx-auto w-16 h-16 ln-panel-2 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="var(--ln-od-bright)" strokeWidth="1.6">
          <path d="M9 3l6 2 6-2v16l-6 2-6-2-6 2V5z M9 3v16 M15 5v16" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="font-semibold text-lg">Load your topographic map</h2>
      <p className="text-sm text-[var(--ln-muted)] max-w-md mx-auto mt-2 mb-5">
        Take a photo of your paper map or pick an existing image. For the best
        calibration, capture the map flat and square-on, with the printed grid
        lines clearly visible.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <label className="ln-btn cursor-pointer">
          Photograph map
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </label>
        <label className="ln-btn-ghost cursor-pointer">
          Choose image
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
      </div>
      <button className="mt-4 text-sm underline text-[var(--ln-blue)]" onClick={onDemo}>
        New to this? Try a pre-calibrated demo map →
      </button>
    </div>
  );
}

interface Verdict {
  level: "none" | "warn" | "ok" | "bad";
  label: string;
  detail: string;
  color: string;
}

// Plain-language go/no-go for the georeference. Two points always fit perfectly
// even when one is wrong, so we never call a 2-point fit "good" — three points
// are required to detect a mis-tap. Residuals are in ground meters.
function calibrationVerdict(count: number, rms: number | null, mpp: number | null): Verdict {
  if (count < 2)
    return { level: "none", label: `Tap a known grid point (${count}/2+)`, detail: "Add grid points to lock the map to the ground.", color: "var(--ln-muted)" };
  if (count === 2)
    return {
      level: "warn",
      label: "Usable — add a 3rd to verify",
      detail: "Two points fit perfectly even when one is wrong. Add a third point to catch a bad tap or a mistyped grid.",
      color: "var(--ln-amber)",
    };
  const r = rms ?? 0;
  // Scale-aware: you can't tap sub-pixel, so judge residual against the map's
  // resolution (≈6 px good, ≈12 px sloppy) as well as an absolute floor.
  const px = mpp && mpp > 0 ? mpp : 1;
  const goodMax = Math.max(15, px * 6);
  const sloppyMax = Math.max(30, px * 12);
  const rTxt = r < 1 ? "<1" : r.toFixed(0);
  const pxEq = mpp ? ` (~${(r / px).toFixed(0)} px of tap error)` : "";
  if (r <= goodMax)
    return { level: "ok", label: `Good — go (±${rTxt} m fit)`, detail: `The fit lands your control points within ${rTxt} m on the ground${pxEq} — good to plot and measure.`, color: "var(--ln-od-bright)" };
  if (r <= sloppyMax)
    return { level: "warn", label: `Sloppy — re-tap (±${r.toFixed(0)} m)`, detail: `Off by ~${r.toFixed(0)} m${pxEq}. If one point's Δ is much bigger than the others, fix that grid; otherwise zoom in and re-tap your points dead-center, or add another.`, color: "var(--ln-amber)" };
  return { level: "bad", label: `Not trustworthy (±${r.toFixed(0)} m)`, detail: `A control point is badly mis-tapped or mistyped (~${r.toFixed(0)} m off). The point with the largest Δ is the culprit — fix it before trusting any plotted position.`, color: "var(--ln-red)" };
}

function Protractor({ a, b, scale, azimuth }: { a: Pixel; b: Pixel; scale: number; azimuth: number }) {
  const r = Math.hypot(b.x - a.x, b.y - a.y);
  const ticks = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const major = deg % 30 === 0;
    const ang = (deg - 90) * (Math.PI / 180); // 0° at top (north), clockwise
    const r1 = r;
    const r2 = r - (major ? 16 : 8) / scale;
    ticks.push(
      <line
        key={deg}
        x1={a.x + r1 * Math.cos(ang)}
        y1={a.y + r1 * Math.sin(ang)}
        x2={a.x + r2 * Math.cos(ang)}
        y2={a.y + r2 * Math.sin(ang)}
        stroke="var(--ln-od-bright)"
        strokeOpacity={major ? 0.9 : 0.45}
        strokeWidth={(major ? 1.5 : 1) / scale}
      />,
    );
  }
  return (
    <g>
      <circle cx={a.x} cy={a.y} r={r} fill="var(--ln-od-bright)" fillOpacity={0.05} stroke="var(--ln-od-bright)" strokeOpacity={0.5} strokeWidth={1 / scale} />
      {/* North reference line (grid north = up) */}
      <line x1={a.x} y1={a.y} x2={a.x} y2={a.y - r} stroke="var(--ln-blue)" strokeWidth={1.5 / scale} strokeDasharray={`${6 / scale} ${4 / scale}`} />
      {ticks}
      {/* azimuth line */}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ln-amber)" strokeWidth={2.5 / scale} />
      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fill="var(--ln-amber)" fontSize={16 / scale} className="ln-mono" stroke="#000" strokeWidth={0.4 / scale}>
        {azimuth.toFixed(0)}°
      </text>
    </g>
  );
}

function MeasurePanel({ azimuth, distance, declination }: { azimuth: number; distance: number; declination: number }) {
  const cells = [
    { label: "Grid azimuth", value: `${azimuth.toFixed(1)}°`, accent: true },
    { label: "Magnetic (set compass)", value: `${gridToMagnetic(azimuth, declination).toFixed(1)}°`, amber: true },
    { label: "Back azimuth", value: `${backAzimuth(azimuth).toFixed(0)}°` },
    { label: "Distance", value: formatMeters(distance) },
    { label: "Mils (grid)", value: `${degreesToMils(azimuth)}` },
    { label: "Direction", value: compassPoint(azimuth) },
  ];
  return (
    <div className="ln-panel p-4">
      <h3 className="font-semibold mb-3">Azimuth to objective</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="ln-panel-2 p-2 text-center">
            <div className="ln-label">{c.label}</div>
            <div
              className="ln-mono ln-stat text-lg"
              style={{ color: c.amber ? "var(--ln-amber)" : c.accent ? "var(--ln-od-bright)" : "var(--ln-ink)" }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlList({
  control,
  mpp,
  residuals,
  verdict,
  onRemove,
}: {
  control: ControlPoint[];
  mpp: number | null;
  residuals: { rms: number; max: number; perPoint: number[] } | null;
  verdict: Verdict;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="ln-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Control points</h3>
        {mpp && <span className="ln-chip">{mpp.toFixed(2)} m/px</span>}
      </div>
      <div
        className="ln-panel-2 p-2 mb-3 text-sm"
        style={{ borderColor: verdict.color }}
      >
        <span style={{ color: verdict.color }} className="font-semibold">{verdict.label}.</span>{" "}
        <span className="text-[var(--ln-muted)]">{verdict.detail}</span>
      </div>
      <div className="space-y-1.5">
        {control.map((c, i) => {
          const utm: UTM = {
            zone: DEFAULT_REGION.utmZone,
            hemisphere: "N",
            easting: c.world.easting,
            northing: c.world.northing,
          };
          return (
            <div key={i} className="flex items-center justify-between ln-panel-2 px-3 py-2">
              <div className="ln-mono text-sm">
                <span className="text-[var(--ln-blue)]">{i + 1}.</span>{" "}
                {Math.round(c.world.easting)} E {Math.round(c.world.northing)} N
                <span className="text-[var(--ln-muted)] ml-2">
                  {latLonToMGRS(...utmToLL(utm))}
                </span>
                {residuals && (
                  <span className="ml-2" style={{ color: residuals.perPoint[i] > 25 ? "var(--ln-red)" : "var(--ln-muted)" }}>
                    Δ{residuals.perPoint[i].toFixed(1)} m
                  </span>
                )}
              </div>
              <button className="text-[var(--ln-red)] text-sm" onClick={() => onRemove(i)}>
                remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Magnifier + nudge pad to place a control point dead-center despite fat fingers.
function AdjustPoint({
  src,
  natural,
  pixel,
  onChange,
  onCancel,
  onConfirm,
}: {
  src: string;
  natural: { w: number; h: number };
  pixel: Pixel;
  onChange: (p: Pixel) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const LOUPE = 148;
  const ZOOM = 5;
  const clampP = (p: Pixel): Pixel => ({
    x: Math.max(0, Math.min(natural.w, p.x)),
    y: Math.max(0, Math.min(natural.h, p.y)),
  });
  const nudge = (dx: number, dy: number) => onChange(clampP({ x: pixel.x + dx, y: pixel.y + dy }));
  const NudgeBtn = ({ d, dx, dy }: { d: string; dx: number; dy: number }) => (
    <button className="ln-btn-ghost !p-0 w-11 h-11 text-lg" onClick={() => nudge(dx, dy)} aria-label={`nudge ${d}`}>{d}</button>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 ln-panel border-t-2 border-[var(--ln-od-bright)] p-4 space-y-3">
      <div className="flex items-center justify-center gap-5">
        <div
          className="relative shrink-0"
          style={{
            width: LOUPE,
            height: LOUPE,
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid var(--ln-od-bright)",
            backgroundColor: "#000",
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${natural.w * ZOOM}px ${natural.h * ZOOM}px`,
            backgroundPosition: `${LOUPE / 2 - pixel.x * ZOOM}px ${LOUPE / 2 - pixel.y * ZOOM}px`,
          }}
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--ln-amber)]" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--ln-amber)]" />
          <div className="absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--ln-amber)]" />
        </div>
        <div className="grid grid-cols-3 gap-1 items-center justify-items-center">
          <span /><NudgeBtn d="▲" dx={0} dy={-1} /><span />
          <NudgeBtn d="◀" dx={-1} dy={0} /><span className="ln-label text-center text-[10px]">1&nbsp;px</span><NudgeBtn d="▶" dx={1} dy={0} />
          <span /><NudgeBtn d="▼" dx={0} dy={1} /><span />
        </div>
      </div>
      <p className="text-[11px] text-[var(--ln-muted)] text-center">
        Tap the map to move the crosshair, or nudge it to land dead-center on the
        grid intersection — then set its coordinates.
      </p>
      <div className="flex gap-2">
        <button className="ln-btn flex-1" onClick={onConfirm}>Set coordinates here</button>
        <button className="ln-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CalibrateDialog({
  onSave,
  onCancel,
}: {
  onSave: (world: { easting: number; northing: number }) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"mgrs" | "utm">("mgrs");
  const [mgrs, setMgrs] = useState("");
  const [easting, setEasting] = useState("");
  const [northing, setNorthing] = useState("");
  const [datum, setDatum] = useState<"WGS84" | "NAD83" | "NAD27">("WGS84");
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    if (tab === "mgrs") {
      const parsed = parseMGRS(mgrs);
      if (!parsed) {
        setErr("Enter a valid MGRS grid (e.g. 12S AB 12345 67890).");
        return;
      }
      onSave({ easting: parsed.easting, northing: parsed.northing });
    } else {
      const e = parseFloat(easting);
      const n = parseFloat(northing);
      if (!isFinite(e) || !isFinite(n)) {
        setErr("Enter numeric easting and northing.");
        return;
      }
      onSave({ easting: e, northing: n });
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onCancel}>
      <div className="ln-panel p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-lg mb-1">Name this grid point</h3>
        <p className="text-sm text-[var(--ln-muted)] mb-4">
          What are the real-world coordinates at the point you tapped? Use a
          printed grid-line intersection for best accuracy. Coordinates are read
          as <strong>WGS84</strong> — check your map sheet&apos;s datum note (a
          NAD27 sheet shifts ~100 m).
        </p>
        <div className="grid grid-cols-2 gap-1 mb-4">
          <button className={tab === "mgrs" ? "ln-btn" : "ln-btn-ghost"} onClick={() => setTab("mgrs")}>MGRS</button>
          <button className={tab === "utm" ? "ln-btn" : "ln-btn-ghost"} onClick={() => setTab("utm")}>UTM E/N</button>
        </div>
        {tab === "mgrs" ? (
          <input className="ln-input ln-mono" autoFocus placeholder="12S AB 12345 67890" value={mgrs} onChange={(e) => setMgrs(e.target.value)} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <input className="ln-input ln-mono" inputMode="decimal" placeholder="easting" value={easting} onChange={(e) => setEasting(e.target.value)} />
            <input className="ln-input ln-mono" inputMode="decimal" placeholder="northing" value={northing} onChange={(e) => setNorthing(e.target.value)} />
          </div>
        )}
        <div className="mt-4">
          <span className="ln-label">Map sheet datum (from the margin)</span>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {(["WGS84", "NAD83", "NAD27"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={datum === d ? "ln-btn text-sm" : "ln-btn-ghost text-sm"}
                onClick={() => setDatum(d)}
              >
                {d}
              </button>
            ))}
          </div>
          {datum === "NAD27" ? (
            <p className="text-xs text-[var(--ln-red)] mt-2">
              NAD27 differs from the GPS datum (WGS84) by up to ~100 m in this
              region. Your plotted GPS will be offset — treat positions as
              approximate and verify against terrain, or use a WGS84/NAD83 sheet.
            </p>
          ) : (
            <p className="text-[11px] text-[var(--ln-muted)] mt-1">
              WGS84 and NAD83 match GPS within ~1–2 m here. Older USGS quads are
              often NAD27 — check the sheet&apos;s margin.
            </p>
          )}
        </div>
        {err && <p className="text-xs text-[var(--ln-red)] mt-2">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button className="ln-btn flex-1" onClick={save}>Save point</button>
          <button className="ln-btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- helpers ----------------

function utmToLL(utm: UTM): [number, number] {
  const ll = utmToLatLon(utm);
  return [ll.lat, ll.lon];
}

function midpoint(pts: { x: number; y: number }[]) {
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Shortest distance from point p to segment a–b (pixel units).
function pointSegmentDistance(p: Pixel, a: Pixel, b: Pixel): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
