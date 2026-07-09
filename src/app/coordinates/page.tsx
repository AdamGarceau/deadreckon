"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatMeters,
  gridAzimuthDistance,
  gridToMagnetic,
  magneticToGrid,
  backAzimuth,
  compassPoint,
  degreesToMils,
  haversine,
  latLonToMGRS,
  latLonToUTM,
  mgrsPrecisionForAccuracy,
  norm360,
  parseMGRS,
  utmToLatLon,
  type LatLon,
  type UTM,
} from "@/lib/landnav/coords";
import {
  solveDeclination,
  gridToMagneticLARS,
  magneticToGridLARS,
  type Side,
} from "@/lib/landnav/declination";
import { DEFAULT_REGION } from "@/lib/landnav/region";
import { useGmAngle } from "@/lib/landnav/useGmAngle";
import { saveLastFix } from "../LastPosition";
import { requestMotionPermission, startPedometer } from "@/lib/landnav/pedometer";

// ---------- Live GPS ----------

interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

function LiveGPS() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareText, setShareText] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  function start() {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported on this device.");
      return;
    }
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          heading: p.coords.heading,
          speed: p.coords.speed,
          timestamp: p.timestamp,
        });
        saveLastFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          mgrs: latLonToMGRS(
            p.coords.latitude,
            p.coords.longitude,
            mgrsPrecisionForAccuracy(p.coords.accuracy),
          ),
          accuracy: p.coords.accuracy,
          at: p.timestamp,
        });
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }

  function stop() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    setWatching(false);
  }

  useEffect(() => () => stop(), []);

  // Deep-link from Home's "Where am I?" — auto-acquire a fix on arrival.
  useEffect(() => {
    if (typeof window !== "undefined" && /[?&]go=1/.test(window.location.search)) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const precision = fix ? mgrsPrecisionForAccuracy(fix.accuracy) : 5;
  const mgrs = fix ? latLonToMGRS(fix.lat, fix.lon, precision) : null;
  const utm = fix ? latLonToUTM(fix.lat, fix.lon) : null;
  const precLabel = { 5: "1 m", 4: "10 m", 3: "100 m", 2: "1 km" }[precision] ?? "";

  return (
    <div className="ln-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Your Position</h2>
        {fix && (
          <span className="ln-chip" style={{ color: fix.accuracy <= 10 ? "var(--ln-od-bright)" : "var(--ln-amber)" }}>
            ±{Math.round(fix.accuracy)} m
          </span>
        )}
      </div>

      {!fix ? (
        <div className="text-center py-5">
          <p className="text-sm text-[var(--ln-muted)] mb-4">
            Get a GPS fix and read it as MGRS, UTM, and lat/long.
          </p>
          <button className="ln-btn" onClick={start}>
            {watching ? "Acquiring…" : "Get GPS fix"}
          </button>
          {error && <p className="text-xs text-[var(--ln-red)] mt-3">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <Readout label={`MGRS · WGS84 · ${precLabel}`} value={mgrs!} big />
          <p className="text-[11px] text-[var(--ln-muted)] -mt-1">
            Precision capped to your ±{Math.round(fix.accuracy)} m fix — reporting
            tighter than the GPS can hold is false precision.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Readout
              label={`UTM ${utm!.zone}${utm!.hemisphere} · WGS84`}
              value={`${Math.round(utm!.easting)} E  ${Math.round(utm!.northing)} N`}
            />
            <Readout
              label="Lat / Long · WGS84"
              value={`${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Mini label="Altitude" value={fix.altitude != null ? `${Math.round(fix.altitude)} m` : "—"} />
            <Mini label="Speed" value={fix.speed != null ? `${(fix.speed * 3.6).toFixed(1)} km/h` : "—"} />
            <Mini label="Heading" value={fix.heading != null ? `${Math.round(fix.heading)}°` : "—"} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="ln-btn flex-1"
              onClick={() => {
                const msg =
                  `My position: ${mgrs} (MGRS, WGS84). ` +
                  `Lat/long ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}. ` +
                  `Accuracy ±${Math.round(fix.accuracy)} m.`;
                const done = () => setCopied(true);
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(msg).then(done).catch(() => setShareText(msg));
                } else {
                  setShareText(msg);
                }
                window.setTimeout(() => setCopied(false), 2500);
              }}
            >
              {copied ? "Copied ✓" : "Copy position for SOS text"}
            </button>
            <button className="ln-btn-ghost" onClick={watching ? stop : start}>
              {watching ? "Pause" : "Resume"}
            </button>
          </div>
          {shareText && (
            <textarea
              className="ln-input ln-mono text-xs mt-1"
              readOnly
              rows={3}
              value={shareText}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <p className="text-[11px] text-[var(--ln-muted)]">
            Paste this into an Emergency SOS / satellite text so rescuers get your
            exact grid. GPS and these tools work with no cell signal.
          </p>
          {fix.accuracy > 20 && (
            <p className="text-xs text-[var(--ln-amber)]">
              Low accuracy — open sky improves the fix. In canyons GPS can be off
              by tens of meters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Coordinate converter ----------

function CoordinateConverter() {
  const [mode, setMode] = useState<"latlon" | "mgrs">("mgrs");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [mgrsIn, setMgrsIn] = useState("");
  const [out, setOut] = useState<{ mgrs: string; utm: UTM; lat: number; lon: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function convert() {
    setErr(null);
    try {
      let la: number, lo: number;
      if (mode === "latlon") {
        la = parseFloat(lat);
        lo = parseFloat(lon);
        if (!isFinite(la) || !isFinite(lo)) throw new Error("Enter valid lat and long.");
      } else {
        const parsed = parseMGRS(mgrsIn);
        if (!parsed) throw new Error("Couldn't parse that MGRS string.");
        const ll = utmToLatLon(parsed);
        la = ll.lat;
        lo = ll.lon;
      }
      setOut({ mgrs: latLonToMGRS(la, lo), utm: latLonToUTM(la, lo), lat: la, lon: lo });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conversion failed.");
      setOut(null);
    }
  }

  return (
    <div className="ln-panel p-5 space-y-4">
      <h2 className="font-semibold text-lg">Coordinate Converter</h2>
      <div className="grid grid-cols-2 gap-1">
        <button className={mode === "mgrs" ? "ln-btn" : "ln-btn-ghost"} onClick={() => setMode("mgrs")}>
          From MGRS
        </button>
        <button className={mode === "latlon" ? "ln-btn" : "ln-btn-ghost"} onClick={() => setMode("latlon")}>
          From Lat/Long
        </button>
      </div>

      {mode === "mgrs" ? (
        <label className="block space-y-1">
          <span className="ln-label">MGRS (e.g. {DEFAULT_REGION.mgrsGridZone} AB 12345 67890)</span>
          <input className="ln-input ln-mono" value={mgrsIn} onChange={(e) => setMgrsIn(e.target.value)} placeholder={`${DEFAULT_REGION.mgrsGridZone} ...`} />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="ln-label">Latitude</span>
            <input className="ln-input ln-mono" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="37.0965" />
          </label>
          <label className="block space-y-1">
            <span className="ln-label">Longitude</span>
            <input className="ln-input ln-mono" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-113.5684" />
          </label>
        </div>
      )}

      <button className="ln-btn w-full" onClick={convert}>Convert</button>
      {err && <p className="text-xs text-[var(--ln-red)]">{err}</p>}

      {out && (
        <div className="space-y-2 pt-1">
          <Readout label="MGRS" value={out.mgrs} big />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Readout label={`UTM ${out.utm.zone}${out.utm.hemisphere}`} value={`${Math.round(out.utm.easting)} E  ${Math.round(out.utm.northing)} N`} />
            <Readout label="Lat / Long" value={`${out.lat.toFixed(5)}, ${out.lon.toFixed(5)}`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Azimuth & distance between two grids ----------

function gridInputToUTM(s: string): { easting: number; northing: number } | null {
  const parsed = parseMGRS(s);
  if (parsed) return { easting: parsed.easting, northing: parsed.northing };
  // Fall back to "easting northing" raw numbers.
  const m = s.trim().match(/^(\d{4,7})[\s,]+(\d{4,8})$/);
  if (m) return { easting: parseInt(m[1], 10), northing: parseInt(m[2], 10) };
  return null;
}

function AzimuthDistance() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gm] = useGmAngle();
  const [res, setRes] = useState<{ azimuth: number; distance: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function compute() {
    setErr(null);
    const a = gridInputToUTM(from);
    const b = gridInputToUTM(to);
    if (!a || !b) {
      setErr("Enter two points as MGRS or as “easting northing”.");
      setRes(null);
      return;
    }
    setRes(gridAzimuthDistance(a, b));
  }

  return (
    <div className="ln-panel p-5 space-y-4">
      <h2 className="font-semibold text-lg">Azimuth &amp; Distance</h2>
      <p className="text-sm text-[var(--ln-muted)]">
        Two points → grid azimuth, distance, back azimuth, and the magnetic
        azimuth to set on your compass.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="ln-label">From — your position</span>
          <input className="ln-input ln-mono" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="12S AB 123 456" />
          <button
            type="button"
            className="text-xs underline text-[var(--ln-blue)]"
            onClick={() => {
              if (!("geolocation" in navigator)) return;
              navigator.geolocation.getCurrentPosition(
                (p) => setFrom(latLonToMGRS(p.coords.latitude, p.coords.longitude, mgrsPrecisionForAccuracy(p.coords.accuracy))),
                () => setErr("Couldn't get GPS — type your grid instead."),
                { enableHighAccuracy: true, timeout: 15000 },
              );
            }}
          >
            Use my GPS
          </button>
        </label>
        <label className="block space-y-1">
          <span className="ln-label">To — objective</span>
          <input className="ln-input ln-mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="12S AB 234 567" />
        </label>
      </div>
      <button className="ln-btn w-full" onClick={compute}>Compute</button>
      {err && <p className="text-xs text-[var(--ln-red)]">{err}</p>}

      {res && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <Mini label="Grid azimuth" value={`${res.azimuth.toFixed(1)}°`} accent />
            <Mini label="Magnetic" value={`${gridToMagnetic(res.azimuth, gm).toFixed(1)}°`} />
            <Mini label="Back azimuth" value={`${backAzimuth(res.azimuth).toFixed(0)}°`} />
            <Mini label="Distance" value={formatMeters(res.distance)} />
            <Mini label="Mils (grid)" value={`${degreesToMils(res.azimuth)}`} />
            <Mini label="Direction" value={compassPoint(res.azimuth)} />
          </div>
          <p className="text-[11px] text-[var(--ln-muted)]">
            Magnetic uses your G-M angle set in Tools ▸ Compass ▸ Declination.
          </p>
        </>
      )}
    </div>
  );
}

// ---------- Pace count ----------

function PaceCount() {
  const [calDist, setCalDist] = useState("100");
  const [calPaces, setCalPaces] = useState("");
  const [pacesPer100, setPacesPer100] = useState<number | null>(null);

  const [count, setCount] = useState(0);

  // Load any previously-saved pace calibration (shared with the Dead Reckon plotter).
  useEffect(() => {
    try {
      const v = localStorage.getItem("deadreckon.pace.per100");
      if (v) setPacesPer100(parseFloat(v));
    } catch {
      /* ignore */
    }
  }, []);

  // --- automatic step counting (accelerometer) ---
  const [auto, setAuto] = useState(false);
  const [autoSteps, setAutoSteps] = useState(0);
  const [autoErr, setAutoErr] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  async function toggleAuto() {
    if (auto) {
      stopRef.current?.();
      stopRef.current = null;
      setAuto(false);
      return;
    }
    const ok = await requestMotionPermission();
    if (!ok) {
      setAutoErr("Motion sensor unavailable or permission denied on this device.");
      return;
    }
    setAutoErr(null);
    stopRef.current = startPedometer(() => setAutoSteps((s) => s + 1));
    setAuto(true);
  }

  function calibrate() {
    const dist = parseFloat(calDist);
    const paces = parseFloat(calPaces);
    if (isFinite(dist) && isFinite(paces) && dist > 0) {
      const per100 = (paces / dist) * 100;
      setPacesPer100(per100);
      try {
        localStorage.setItem("deadreckon.pace.per100", String(per100));
      } catch {
        /* ignore */
      }
    }
  }

  function useAutoForCalibration() {
    // Auto counts steps; a pace = 2 steps. Fill the pace field so the existing
    // calibration math stays consistent.
    setCalPaces(String(Math.round(autoSteps / 2)));
  }

  // --- auto-calibrate by WALKING: divide paces by the GPS distance covered, so
  // you get your paces/100 m from any natural walk without pacing off a measured
  // course. Accelerometer counts the footfalls; GPS sums the ground distance. ---
  const [walking, setWalking] = useState(false);
  const [walkSteps, setWalkSteps] = useState(0);
  const [walkDist, setWalkDist] = useState(0);
  const [walkErr, setWalkErr] = useState<string | null>(null);
  const walkStopRef = useRef<(() => void) | null>(null);
  const walkWatchRef = useRef<number | null>(null);
  const prevFixRef = useRef<LatLon | null>(null);

  useEffect(
    () => () => {
      walkStopRef.current?.();
      if (walkWatchRef.current != null) navigator.geolocation.clearWatch(walkWatchRef.current);
    },
    [],
  );

  async function toggleWalk() {
    if (walking) {
      walkStopRef.current?.();
      walkStopRef.current = null;
      if (walkWatchRef.current != null) {
        navigator.geolocation.clearWatch(walkWatchRef.current);
        walkWatchRef.current = null;
      }
      prevFixRef.current = null;
      setWalking(false);
      const paces = walkSteps / 2;
      if (walkDist >= 20 && paces > 0) {
        const per100 = (paces / walkDist) * 100;
        setPacesPer100(per100);
        try {
          localStorage.setItem("deadreckon.pace.per100", String(per100));
        } catch {
          /* ignore */
        }
      } else {
        setWalkErr("Walk at least ~50 m in a straight line for a good average.");
      }
      return;
    }
    const ok = await requestMotionPermission();
    if (!ok) {
      setWalkErr("Motion sensor unavailable or permission denied on this device.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setWalkErr("GPS not available on this device.");
      return;
    }
    setWalkErr(null);
    setWalkSteps(0);
    setWalkDist(0);
    prevFixRef.current = null;
    walkStopRef.current = startPedometer(() => setWalkSteps((s) => s + 1));
    walkWatchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const cur: LatLon = { lat: p.coords.latitude, lon: p.coords.longitude };
        const prev = prevFixRef.current;
        if (!prev) {
          prevFixRef.current = cur;
          return;
        }
        const seg = haversine(prev, cur);
        // Ignore stationary jitter (<0.8 m); reset the baseline after a GPS jump
        // (>40 m) without counting it; only accumulate clean, in-range segments.
        if (seg > 40) {
          prevFixRef.current = cur;
        } else if (seg >= 0.8 && p.coords.accuracy <= 25) {
          setWalkDist((d) => d + seg);
          prevFixRef.current = cur;
        }
      },
      (e) => setWalkErr(e.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    setWalking(true);
  }

  const walkPaces = walkSteps / 2;
  const walkPer100Live = walkDist >= 5 && walkPaces > 0 ? (walkPaces / walkDist) * 100 : null;

  const distFromCount = pacesPer100 ? (count / pacesPer100) * 100 : null;
  // Auto distance: steps/2 = paces, then apply pace calibration.
  const autoDist = pacesPer100 ? (autoSteps / 2 / pacesPer100) * 100 : null;

  return (
    <div className="ln-panel p-5 space-y-4">
      <h2 className="font-semibold text-lg">Pace Count</h2>
      <p className="text-sm text-[var(--ln-muted)]">
        Calibrate your pace over a known distance (a pace = every time the same
        foot hits the ground), then tally as you walk to estimate distance
        covered.
      </p>
      <div className="grid grid-cols-2 gap-3 items-end">
        <label className="block space-y-1">
          <span className="ln-label">Course distance (m)</span>
          <input className="ln-input ln-mono" inputMode="decimal" value={calDist} onChange={(e) => setCalDist(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="ln-label">Your paces over it</span>
          <input className="ln-input ln-mono" inputMode="decimal" value={calPaces} onChange={(e) => setCalPaces(e.target.value)} />
        </label>
      </div>
      <button className="ln-btn-ghost w-full" onClick={calibrate}>Set pace count</button>
      {pacesPer100 != null && (
        <div className="ln-panel-2 p-3 text-center">
          <span className="ln-label">Your pace count</span>
          <div className="ln-mono ln-stat text-xl text-[var(--ln-od-bright)]">
            {pacesPer100.toFixed(0)} paces / 100 m
          </div>
        </div>
      )}

      {/* Auto-calibrate by walking (GPS distance ÷ paces) */}
      <div className="border-t border-[var(--ln-line)] pt-4">
        <div className="flex items-center justify-between mb-2 gap-3">
          <div>
            <span className="ln-label">Auto-calibrate by walking (GPS)</span>
            <div className="ln-mono ln-stat text-2xl">
              {Math.round(walkPaces)} <span className="text-base text-[var(--ln-muted)]">paces</span>
            </div>
            <div className="text-sm text-[var(--ln-muted)]">
              {formatMeters(walkDist)} walked
              {walkPer100Live != null ? ` · ≈ ${walkPer100Live.toFixed(0)} paces/100 m` : ""}
            </div>
          </div>
          <button className={walking ? "ln-btn shrink-0" : "ln-btn-ghost shrink-0"} onClick={toggleWalk}>
            {walking ? "Stop & set" : "Start walking"}
          </button>
        </div>
        {walkErr && <p className="text-xs text-[var(--ln-red)] mt-1">{walkErr}</p>}
        <p className="text-[11px] text-[var(--ln-muted)] mt-1">
          Walk a straight ~100 m at your natural pace with GPS on, then Stop &amp; set.
          It divides your paces by the GPS distance to find your paces-per-100 m
          automatically — no measured course needed. Open sky gives the best fix.
        </p>
      </div>

      {/* Automatic step counting */}
      <div className="border-t border-[var(--ln-line)] pt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="ln-label">Automatic (accelerometer)</span>
            <div className="ln-mono ln-stat text-3xl">
              {autoSteps} <span className="text-base text-[var(--ln-muted)]">steps</span>
            </div>
            <div className="text-sm text-[var(--ln-muted)]">
              ≈ {Math.round(autoSteps / 2)} paces{autoDist != null ? ` · ${formatMeters(autoDist)}` : ""}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button className={auto ? "ln-btn" : "ln-btn-ghost"} onClick={toggleAuto}>
              {auto ? "Stop" : "Auto-count"}
            </button>
            <button className="ln-btn-ghost text-xs" onClick={() => setAutoSteps(0)}>Reset</button>
          </div>
        </div>
        {auto && (
          <button className="ln-btn-ghost w-full text-sm" onClick={useAutoForCalibration}>
            Use these steps to set my pace count (over the course distance above)
          </button>
        )}
        {autoErr && <p className="text-xs text-[var(--ln-red)] mt-1">{autoErr}</p>}
        <p className="text-[11px] text-[var(--ln-muted)] mt-2">
          Keep the phone steady (pocket/strap). The accelerometer detects each
          footfall; a pace = 2 steps. Verify against a manual count on your first
          leg — gait and terrain vary. A watch (Garmin/Apple) can&apos;t feed a web
          app, but a future iOS app could read its step data.
        </p>
      </div>

      {/* Manual tally */}
      <div className="border-t border-[var(--ln-line)] pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="ln-label">Manual tally (paces)</span>
            <div className="ln-mono ln-stat text-4xl">{count}</div>
            {distFromCount != null && (
              <div className="text-sm text-[var(--ln-muted)]">≈ {formatMeters(distFromCount)}</div>
            )}
          </div>
          <button className="ln-btn-ghost" onClick={() => setCount(0)}>Reset</button>
        </div>
        <button
          className="ln-btn w-full py-6 text-xl"
          onClick={() => setCount((c) => c + 1)}
        >
          + Tap each pace
        </button>
      </div>
    </div>
  );
}

// ---------- Live magnetic compass ----------

interface OrientationEventWithHeading extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

function LiveCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    const anyOrientation = typeof DeviceOrientationEvent !== "undefined";
    if (!anyOrientation) setSupported(false);
    // iOS 13+ requires an explicit permission request from a user gesture.
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (doe && typeof doe.requestPermission === "function") {
      setNeedsPermission(true);
    }
  }, []);

  function handle(e: OrientationEventWithHeading) {
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === "number") {
      h = e.webkitCompassHeading; // already magnetic heading, clockwise
    } else if (e.absolute && typeof e.alpha === "number") {
      h = norm360(360 - e.alpha); // alpha is counter-clockwise from north
    } else if (typeof e.alpha === "number") {
      h = norm360(360 - e.alpha);
    }
    if (h != null) {
      headingRef.current = h;
      setHeading(h);
    }
  }

  async function start() {
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (doe && typeof doe.requestPermission === "function") {
        const res = await doe.requestPermission();
        if (res !== "granted") {
          setSupported(false);
          return;
        }
      }
      window.addEventListener("deviceorientationabsolute", handle as EventListener);
      window.addEventListener("deviceorientation", handle as EventListener);
      setActive(true);
    } catch {
      setSupported(false);
    }
  }

  const az = heading ?? 0;

  return (
    <div className="ln-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Live Compass</h2>
        <span className="ln-chip">magnetic</span>
      </div>

      {!active ? (
        <div className="text-center py-6">
          <p className="text-sm text-[var(--ln-muted)] mb-4">
            Uses your device&apos;s magnetometer. Hold the phone flat and away from
            metal, vehicles, and electronics — they deflect the reading.
          </p>
          <button className="ln-btn" onClick={start}>
            {needsPermission ? "Enable compass" : "Start compass"}
          </button>
          {!supported && (
            <p className="text-xs text-[var(--ln-red)] mt-3">
              Compass sensor unavailable or permission denied on this device.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative w-56 h-56">
            {/* Rotating compass rose */}
            <div
              className="absolute inset-0 rounded-full border-2 border-[var(--ln-line)] bg-[var(--ln-panel-2)]"
              style={{ transform: `rotate(${-az}deg)`, transition: "transform 0.1s linear" }}
            >
              {Array.from({ length: 72 }).map((_, i) => {
                const major = i % 9 === 0;
                return (
                  <div
                    key={i}
                    className="absolute left-1/2 top-0 origin-bottom"
                    style={{
                      height: "50%",
                      transform: `translateX(-50%) rotate(${i * 5}deg)`,
                    }}
                  >
                    <div
                      style={{
                        width: major ? 2 : 1,
                        height: major ? 12 : 6,
                        background: major ? "var(--ln-od-bright)" : "var(--ln-muted)",
                      }}
                    />
                  </div>
                );
              })}
              {[
                { l: "N", d: 0, c: "var(--ln-red)" },
                { l: "E", d: 90, c: "var(--ln-ink)" },
                { l: "S", d: 180, c: "var(--ln-ink)" },
                { l: "W", d: 270, c: "var(--ln-ink)" },
              ].map((p) => (
                <div
                  key={p.l}
                  className="absolute left-1/2 top-1/2 font-bold text-sm"
                  style={{
                    transform: `translate(-50%,-50%) rotate(${p.d}deg) translateY(-88px) rotate(${-p.d}deg)`,
                    color: p.c,
                  }}
                >
                  {p.l}
                </div>
              ))}
            </div>
            {/* Fixed bearing index at top */}
            <div className="absolute left-1/2 -top-1 -translate-x-1/2 text-[var(--ln-amber)]">
              ▼
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-4xl font-bold ln-mono ln-stat">
                {Math.round(az)}°
              </div>
              <div className="text-sm text-[var(--ln-muted)]">{compassPoint(az)}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 w-full max-w-xs text-center">
            <div className="ln-panel-2 p-2">
              <div className="ln-label">Mils (≈)</div>
              <div className="ln-mono ln-stat">{Math.round(degreesToMils(az) / 10) * 10}</div>
            </div>
            <div className="ln-panel-2 p-2">
              <div className="ln-label">Back azimuth</div>
              <div className="ln-mono ln-stat">{Math.round(backAzimuth(az))}°</div>
            </div>
          </div>
          <div className="mt-3 max-w-xs space-y-2">
            <details className="ln-panel-2 p-2">
              <summary className="ln-label cursor-pointer">Calibrate &amp; interference</summary>
              <p className="text-[11px] text-[var(--ln-muted)] mt-2">
                If the reading wanders, wave the phone in a <strong>figure-8</strong> a
                few times to re-calibrate the magnetometer. Stand clear of metal
                before trusting it — FM 3-25.26 standoff: power lines{" "}
                <strong>55 m</strong>, vehicles <strong>18 m</strong>, telegraph/
                barbed wire <strong>10 m</strong>, helmet/rifle <strong>1 m</strong>.
              </p>
            </details>
            <p className="text-[11px] text-[var(--ln-amber)] text-center">
              Phone compasses drift 10–20°. Confirm against a lensatic compass
              before you rely on it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Declination diagram / LARS solver ----------

function DeclinationSolver({
  onGm,
}: {
  onGm: (signedGm: number) => void;
}) {
  const [gnValue, setGnValue] = useState(String(DEFAULT_REGION.solverDefaults.gnValue));
  const [gnSide, setGnSide] = useState<Side>(DEFAULT_REGION.solverDefaults.gnSide);
  const [mnValue, setMnValue] = useState(String(DEFAULT_REGION.solverDefaults.mnValue));
  const [mnSide, setMnSide] = useState<Side>(DEFAULT_REGION.solverDefaults.mnSide);
  const [gridAz, setGridAz] = useState("0");

  const sol = solveDeclination({
    gnValue: parseFloat(gnValue) || 0,
    gnSide,
    mnValue: parseFloat(mnValue) || 0,
    mnSide,
  });

  const ga = parseFloat(gridAz);
  const mag = isFinite(ga) ? gridToMagneticLARS(ga, sol) : null;

  return (
    <div className="ln-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Declination Diagram (LARS)</h2>
        <span className="ln-chip">TC 3-25.26</span>
      </div>
      <p className="text-sm text-[var(--ln-muted)]">
        Read the two values off your map&apos;s declination diagram and enter
        them. The solver finds the G-M angle and applies <strong>LARS</strong> —
        Left Add, Right Subtract — to convert a grid azimuth to a compass
        heading.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Field label="GN value (° from TN)">
          <input className="ln-input ln-mono" inputMode="decimal" value={gnValue} onChange={(e) => setGnValue(e.target.value)} />
        </Field>
        <Field label="GN side of TN">
          <SideToggle side={gnSide} setSide={setGnSide} />
        </Field>
        <Field label="MN value (° from TN)">
          <input className="ln-input ln-mono" inputMode="decimal" value={mnValue} onChange={(e) => setMnValue(e.target.value)} />
        </Field>
        <Field label="MN side of TN">
          <SideToggle side={mnSide} setSide={setMnSide} />
        </Field>
      </div>

      <div className="ln-panel-2 p-3 space-y-1.5">
        {sol.steps.map((s, i) => (
          <div key={i} className="text-sm flex gap-2">
            <span className="text-[var(--ln-od-bright)]">›</span>
            <span>{s}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <span className="ln-label">G-M angle</span>
          <span className="ln-mono ln-stat text-lg text-[var(--ln-od-bright)]">
            {sol.gmAngle.toFixed(1)}°
          </span>
          <span className="ln-mono text-xs text-[var(--ln-muted)]">
            (≈{Math.round(degreesToMils(sol.gmAngle) / 10) * 10} mils)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 items-end">
        <Field label="Grid azimuth (°)">
          <input className="ln-input ln-mono" inputMode="decimal" value={gridAz} onChange={(e) => setGridAz(e.target.value)} />
        </Field>
        <div className="ln-panel-2 p-3 text-center">
          <div className="ln-label">Set on compass (magnetic)</div>
          <div className="ln-mono ln-stat text-2xl text-[var(--ln-amber)]">
            {mag == null ? "—" : `${mag.toFixed(1)}°`}
          </div>
        </div>
      </div>
      {/* second-channel sanity check: grid / magnetic / back-az side by side — the anti-mistake block */}
      {mag != null && isFinite(ga) && (
        <div className="rounded-lg border-2 p-2" style={{ borderColor: "var(--ln-od)" }}>
          <div className="ln-label mb-1 text-center">Cross-check before you march</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="ln-panel-2 p-2"><div className="ln-label">Grid</div><div className="ln-mono ln-stat text-lg">{norm360(ga).toFixed(1)}°</div></div>
            <div className="ln-panel-2 p-2"><div className="ln-label">Magnetic</div><div className="ln-mono ln-stat text-lg text-[var(--ln-amber)]">{mag.toFixed(1)}°</div></div>
            <div className="ln-panel-2 p-2"><div className="ln-label">Back-az (mag)</div><div className="ln-mono ln-stat text-lg">{backAzimuth(mag).toFixed(1)}°</div></div>
          </div>
          <p className="text-[11px] text-[var(--ln-muted)] mt-1 text-center">
            {sol.larsAction === "subtract" ? "MN right of GN → grid − G-M" : "MN left of GN → grid + G-M"}. Confirm the add/subtract matches your map&apos;s declination diagram.
          </p>
        </div>
      )}

      <button className="ln-btn-ghost w-full" onClick={() => onGm(sol.signedGM)}>
        Use this G-M angle ({sol.signedGM >= 0 ? "+" : ""}
        {sol.signedGM.toFixed(1)}° {sol.signedGM >= 0 ? "E" : "W"}) in the quick converter ↓
      </button>
    </div>
  );
}

// ---------- Quick grid <-> magnetic + back azimuth + mils ----------

function QuickConverters() {
  const [gm, setGm] = useGmAngle();
  const [decl, setDecl] = useState(gm.toFixed(1));
  const [grid, setGrid] = useState("");
  const [mag, setMag] = useState("");
  const [baInput, setBaInput] = useState("");
  const [milDeg, setMilDeg] = useState("");
  const [degMil, setDegMil] = useState("");

  useEffect(() => {
    setDecl(gm.toFixed(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gm]);

  const d = parseFloat(decl) || 0;

  return (
    <div className="ln-panel p-5 space-y-5">
      <h2 className="font-semibold text-lg">Quick Converters</h2>

      <div>
        <Field label="G-M angle from map margin (° — east +, west −)">
          <input
            className="ln-input ln-mono"
            inputMode="decimal"
            value={decl}
            onChange={(e) => {
              setDecl(e.target.value);
              const v = parseFloat(e.target.value);
              if (isFinite(v)) setGm(v);
            }}
          />
        </Field>
        <p className="text-[11px] text-[var(--ln-muted)] mt-1">
          Default {DEFAULT_REGION.gmAngle}°E for {DEFAULT_REGION.name} (2026). Use the{" "}
          <strong>G-M angle</strong> printed on <em>your</em> map (grid↔magnetic), not a
          true-north declination — it&apos;s location-specific and drifts over time. Enter
          west as a negative number.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Grid azimuth →">
          <input
            className="ln-input ln-mono"
            inputMode="decimal"
            placeholder="grid °"
            value={grid}
            onChange={(e) => {
              setGrid(e.target.value);
              const g = parseFloat(e.target.value);
              setMag(isFinite(g) ? gridToMagnetic(g, d).toFixed(1) : "");
            }}
          />
        </Field>
        <Field label="Magnetic azimuth →">
          <input
            className="ln-input ln-mono"
            inputMode="decimal"
            placeholder="magnetic °"
            value={mag}
            onChange={(e) => {
              setMag(e.target.value);
              const m = parseFloat(e.target.value);
              setGrid(isFinite(m) ? magneticToGrid(m, d).toFixed(1) : "");
            }}
          />
        </Field>
      </div>
      <p className="text-xs text-[var(--ln-muted)] -mt-2">
        Type in either box; the other updates. East declination subtracts going
        grid→magnetic.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Back azimuth">
          <input
            className="ln-input ln-mono"
            inputMode="decimal"
            placeholder="azimuth °"
            value={baInput}
            onChange={(e) => setBaInput(e.target.value)}
          />
          <Result>
            {isFinite(parseFloat(baInput))
              ? `${backAzimuth(parseFloat(baInput)).toFixed(0)}°`
              : "—"}
          </Result>
        </Field>
        <Field label="Degrees → mils">
          <input
            className="ln-input ln-mono"
            inputMode="decimal"
            placeholder="degrees"
            value={degMil}
            onChange={(e) => setDegMil(e.target.value)}
          />
          <Result>
            {isFinite(parseFloat(degMil)) ? `${degreesToMils(parseFloat(degMil))} mils` : "—"}
          </Result>
        </Field>
        <Field label="Mils → degrees">
          <input
            className="ln-input ln-mono"
            inputMode="decimal"
            placeholder="mils"
            value={milDeg}
            onChange={(e) => setMilDeg(e.target.value)}
          />
          <Result>
            {isFinite(parseFloat(milDeg))
              ? `${(norm360((parseFloat(milDeg) * 360) / 6400)).toFixed(1)}°`
              : "—"}
          </Result>
        </Field>
      </div>
    </div>
  );
}

// ---------- small shared bits (compass helpers) ----------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="ln-label">{label}</span>
      {children}
    </label>
  );
}

function Result({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 ln-mono ln-stat text-lg text-[var(--ln-od-bright)]">{children}</div>
  );
}

function SideToggle({ side, setSide }: { side: Side; setSide: (s: Side) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <button
        className={`py-2 rounded text-sm font-medium ${side === "W" ? "ln-btn" : "ln-btn-ghost"}`}
        onClick={() => setSide("W")}
        type="button"
      >
        Left / W
      </button>
      <button
        className={`py-2 rounded text-sm font-medium ${side === "E" ? "ln-btn" : "ln-btn-ghost"}`}
        onClick={() => setSide("E")}
        type="button"
      >
        Right / E
      </button>
    </div>
  );
}

// ---------- shared ----------

function Readout({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="ln-panel-2 p-3">
      <div className="ln-label">{label}</div>
      <div className={`ln-mono ln-stat ${big ? "text-xl" : "text-base"} text-[var(--ln-ink)] break-all`}>
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ln-panel-2 p-2 text-center">
      <div className="ln-label">{label}</div>
      <div className="ln-mono ln-stat" style={{ color: accent ? "var(--ln-od-bright)" : "var(--ln-ink)" }}>
        {value}
      </div>
    </div>
  );
}

type NavSection = "position" | "compass" | "convert" | "pace";

const NAV_SECTIONS: { id: NavSection; label: string }[] = [
  { id: "position", label: "Position" },
  { id: "compass", label: "Compass" },
  { id: "convert", label: "Convert" },
  { id: "pace", label: "Pace" },
];

export default function CoordinatesPage() {
  const [gm, setGm] = useGmAngle();
  const [section, setSection] = useState<NavSection>("position");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nav Tools</h1>
        <p className="text-[var(--ln-muted)] text-sm mt-1">
          Position readout, live compass &amp; declination, coordinate/azimuth
          calculators, and pace count.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {NAV_SECTIONS.map((s) => (
          <button
            key={s.id}
            className={section === s.id ? "ln-btn text-sm" : "ln-btn-ghost text-sm"}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "position" && <LiveGPS />}

      {section === "compass" && (
        <>
          <LiveCompass />
          <DeclinationSolver onGm={setGm} />
          <QuickConverters />
        </>
      )}

      {section === "convert" && (
        <>
          <CoordinateConverter />
          <AzimuthDistance />
        </>
      )}

      {section === "pace" && <PaceCount />}
    </div>
  );
}
