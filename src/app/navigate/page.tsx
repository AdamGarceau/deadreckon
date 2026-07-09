"use client";

import { useEffect, useRef, useState } from "react";
import {
  compassPoint,
  deadReckon,
  formatMeters,
  haversine,
  initialBearing,
  latLonToMGRS,
  magneticToGrid,
  norm360,
  parseMGRS,
  utmToLatLon,
  type LatLon,
} from "@/lib/landnav/coords";
import { DEFAULT_REGION } from "@/lib/landnav/region";
import { useGmAngle, gmToTrueDeclination } from "@/lib/landnav/useGmAngle";
import NumberField from "../NumberField";

interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const STORE = "azimuth.waypoints.v1";
const ARRIVE_M = 15; // auto-advance radius

function parseCoordInput(s: string): LatLon | null {
  const t = s.trim();
  const mgrs = parseMGRS(t);
  if (mgrs) return utmToLatLon(mgrs);
  // "lat, lon" or "lat lon" decimal degrees
  const m = t.match(/^(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

interface OrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

export default function NavigatePage() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [name, setName] = useState("");
  const [coord, setCoord] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [gm, setGm] = useGmAngle();
  const [tab, setTab] = useState<"waypoints" | "dr">("waypoints");

  const [navigating, setNavigating] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fix, setFix] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [needPerm, setNeedPerm] = useState(false);
  const [arrivedMsg, setArrivedMsg] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const activeRef = useRef(0);

  // load / persist
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setWaypoints(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (doe && typeof doe.requestPermission === "function") setNeedPerm(true);
  }, []);

  function save(list: Waypoint[]) {
    setWaypoints(list);
    try {
      localStorage.setItem(STORE, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function addWaypoint() {
    setErr(null);
    const ll = parseCoordInput(coord);
    if (!ll) {
      setErr("Enter MGRS (12S AB 123 456) or lat, long (37.1, -113.5).");
      return;
    }
    save([
      ...waypoints,
      { id: `${Date.now()}-${waypoints.length}`, name: name.trim() || `WP ${waypoints.length + 1}`, lat: ll.lat, lon: ll.lon },
    ]);
    setName("");
    setCoord("");
  }

  function moveWaypoint(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= waypoints.length) return;
    const next = [...waypoints];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  function captureGps() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoord(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),
      () => setErr("Couldn't read GPS."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function handleOrient(e: OrientationEvent) {
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
    else if (typeof e.alpha === "number") h = norm360(360 - e.alpha);
    if (h != null) setHeading(h);
  }

  async function startNav() {
    if (!waypoints.length) return;
    setActiveIdx(0);
    activeRef.current = 0;
    // orientation permission (iOS)
    const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (doe && typeof doe.requestPermission === "function") await doe.requestPermission();
    } catch {
      /* heading optional */
    }
    window.addEventListener("deviceorientationabsolute", handleOrient as EventListener);
    window.addEventListener("deviceorientation", handleOrient as EventListener);

    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const cur = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        setFix(cur);
        const wp = waypoints[activeRef.current];
        if (wp && haversine(cur, wp) <= ARRIVE_M) {
          if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
          if (activeRef.current < waypoints.length - 1) {
            activeRef.current += 1;
            setActiveIdx(activeRef.current);
            setArrivedMsg(`Reached ${wp.name}. Next: ${waypoints[activeRef.current].name}.`);
          } else {
            setArrivedMsg(`Reached ${wp.name} — final waypoint. Navigation complete.`);
            stopNav();
          }
          window.setTimeout(() => setArrivedMsg(null), 4000);
        }
      },
      () => setErr("GPS unavailable — open sky helps."),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    setNavigating(true);
  }

  function stopNav() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    window.removeEventListener("deviceorientationabsolute", handleOrient as EventListener);
    window.removeEventListener("deviceorientation", handleOrient as EventListener);
    setNavigating(false);
  }

  useEffect(() => () => stopNav(), []);

  // ---- derived nav data ----
  const target = waypoints[activeIdx] ?? null;
  let trueBearing: number | null = null;
  let magBearing: number | null = null;
  let distance: number | null = null;
  let arrow = 0;
  if (navigating && fix && target) {
    trueBearing = initialBearing(fix, target);
    magBearing = norm360(trueBearing - gmToTrueDeclination(gm));
    distance = haversine(fix, target);
    arrow = heading != null ? norm360(magBearing - heading) : magBearing;
  }
  // Warn if the user is far from the region whose declination default we use.
  const farFromRegion =
    fix != null &&
    haversine(fix, { lat: DEFAULT_REGION.lat, lon: DEFAULT_REGION.lon }) > 150000;

  // ---------------- render ----------------
  if (navigating && target) {
    const arr = heading != null; // do we have device heading?
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Go To</h1>
          <button className="ln-btn-ghost" onClick={stopNav}>Stop</button>
        </div>

        {/* Heading-source + accuracy status — degrade loudly */}
        <div
          className="ln-panel p-2 text-center text-sm font-semibold"
          style={{ color: arr ? "var(--ln-od-bright)" : "var(--ln-amber)", borderColor: arr ? "var(--ln-od)" : "var(--ln-amber)" }}
        >
          {arr ? "● LIVE COMPASS HEADING" : "▲ BEARING ONLY — keep phone flat, point its top at the objective"}
          {fix && (
            <span className="ml-2 font-normal" style={{ color: fix.accuracy > 20 ? "var(--ln-amber)" : "var(--ln-muted)" }}>
              · GPS ±{Math.round(fix.accuracy)} m{fix.accuracy > 25 ? " (degraded)" : ""}
            </span>
          )}
        </div>
        {farFromRegion && (
          <div className="ln-panel p-2 text-xs text-[var(--ln-amber)] text-center">
            ▲ Declination is set for {DEFAULT_REGION.name} ({DEFAULT_REGION.declination}°E, 2026). You appear far
            from there — update it (Stop → Declination) or your bearings are off.
          </div>
        )}

        <div className="ln-panel p-5 flex flex-col items-center">
          <div className="text-sm text-[var(--ln-muted)]">
            Heading to <span className="text-[var(--ln-ink)] font-semibold">{target.name}</span> ·
            {" "}{activeIdx + 1}/{waypoints.length}
          </div>

          {/* big direction arrow */}
          <div className="relative w-64 h-64 my-4">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--ln-line)] bg-[var(--ln-panel-2)]" />
            <div className="absolute left-1/2 top-2 -translate-x-1/2 text-xs text-[var(--ln-muted)]">
              {arr ? "ahead" : "magnetic"}
            </div>
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: `rotate(${arrow}deg)`, transition: "transform 0.15s ease-out" }}
            >
              <svg viewBox="0 0 100 100" className="w-44 h-44">
                <polygon points="50,8 70,60 50,48 30,60" fill="var(--ln-od-bright)" />
                <rect x="46" y="48" width="8" height="40" rx="3" fill="var(--ln-od)" />
              </svg>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-20">
              <div className="text-3xl font-bold ln-mono ln-stat">{distance != null ? formatMeters(distance) : "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-sm text-center">
            <Stat label="Magnetic" value={magBearing != null ? `${Math.round(magBearing)}°` : "—"} />
            <Stat label="Direction" value={magBearing != null ? compassPoint(magBearing) : "—"} />
            <Stat label="GPS" value={fix ? `±${Math.round(fix.accuracy)} m` : "—"} />
          </div>

          {!arr && (
            <p className="text-[11px] text-[var(--ln-amber)] mt-3 text-center max-w-xs">
              No compass heading on this device — the arrow shows the magnetic
              bearing from north. Set {magBearing != null ? Math.round(magBearing) : "—"}° on your
              compass and follow it.
            </p>
          )}
          <p className="text-[11px] text-[var(--ln-muted)] mt-2 text-center max-w-xs">
            Walk where the arrow points. Auto-advances within {ARRIVE_M} m. Phone
            compass drifts near metal — verify with a real compass.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="ln-btn-ghost"
            onClick={() => { const i = Math.max(0, activeIdx - 1); setActiveIdx(i); activeRef.current = i; }}
            disabled={activeIdx === 0}
          >
            ◂ Previous
          </button>
          <button
            className="ln-btn-ghost"
            onClick={() => { const i = Math.min(waypoints.length - 1, activeIdx + 1); setActiveIdx(i); activeRef.current = i; }}
            disabled={activeIdx >= waypoints.length - 1}
          >
            Skip ▸
          </button>
        </div>

        {arrivedMsg && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 ln-panel px-4 py-2 text-sm">
            {arrivedMsg}
          </div>
        )}
      </div>
    );
  }

  // --- setup / waypoint editor ---
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Go To</h1>
        <p className="text-[var(--ln-muted)] text-sm mt-1">
          <strong>Type coordinates</strong> you were given — a radio call, briefing, or
          mission packet — then follow the arrow. Or dead-reckon a position by azimuth
          and distance with no GPS at all.
        </p>
        <p className="text-[11px] text-[var(--ln-muted)] mt-1">
          Plotting off your paper map instead? Use <strong>Map → Route</strong> to tap
          waypoints straight onto it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button className={tab === "waypoints" ? "ln-btn" : "ln-btn-ghost"} onClick={() => setTab("waypoints")}>
          Follow (GPS)
        </button>
        <button className={tab === "dr" ? "ln-btn" : "ln-btn-ghost"} onClick={() => setTab("dr")}>
          Dead reckon (no GPS)
        </button>
      </div>

      {tab === "dr" && <DeadReckon gm={gm} setGm={setGm} />}
      {tab === "waypoints" && (
      <>
      <div>
        <p className="text-[var(--ln-muted)] text-sm">
          Drop in your waypoints, hit start, and walk where the arrow points. It
          steps to the next one as you arrive. GPS works with no cell signal.
        </p>
      </div>

      <div className="ln-panel p-5 space-y-3">
        <h2 className="font-semibold">Add a waypoint</h2>
        <div className="space-y-2">
          <input className="ln-input" placeholder="Name (optional) — e.g. Truck, Saddle, RP1" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="ln-input ln-mono" placeholder="MGRS or lat, long" value={coord} onChange={(e) => setCoord(e.target.value)} />
          {coord.trim() && (() => {
            const ll = parseCoordInput(coord);
            return ll ? (
              <p className="text-[11px] ln-mono" style={{ color: "var(--ln-od-bright)" }}>
                → {latLonToMGRS(ll.lat, ll.lon, 4)} · {ll.lat.toFixed(4)}, {ll.lon.toFixed(4)}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--ln-amber)]">Unrecognized — use MGRS (12S AB 1234 5678) or “lat, long”.</p>
            );
          })()}
        </div>
        {err && <p className="text-xs text-[var(--ln-red)]">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="ln-btn" onClick={addWaypoint}>Add waypoint</button>
          <button className="ln-btn-ghost" onClick={captureGps}>Use my GPS</button>
        </div>
      </div>

      {waypoints.length > 0 && (
        <div className="ln-panel p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Route · {waypoints.length} waypoint(s)</h2>
            <button className="text-xs text-[var(--ln-red)]" onClick={() => save([])}>Clear all</button>
          </div>
          <p className="text-[11px] text-[var(--ln-muted)]">Use ▲ ▼ to reorder — that&apos;s the order you&apos;ll navigate them.</p>
          {waypoints.map((w, i) => (
            <div key={w.id} className="ln-panel-2 px-3 py-2 flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  className="ln-btn-ghost !px-2 !py-0.5 text-sm leading-none disabled:opacity-30"
                  onClick={() => moveWaypoint(i, -1)}
                  disabled={i === 0}
                  aria-label="move up"
                >▲</button>
                <button
                  className="ln-btn-ghost !px-2 !py-0.5 text-sm leading-none disabled:opacity-30"
                  onClick={() => moveWaypoint(i, 1)}
                  disabled={i === waypoints.length - 1}
                  aria-label="move down"
                >▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  <span className="text-[var(--ln-od-bright)]">{i + 1}.</span> {w.name}
                </div>
                <div className="ln-mono text-xs text-[var(--ln-muted)]">{latLonToMGRS(w.lat, w.lon, 4)}</div>
              </div>
              <button className="text-xs text-[var(--ln-red)]" onClick={() => save(waypoints.filter((x) => x.id !== w.id))}>
                remove
              </button>
            </div>
          ))}

          <label className="flex items-center gap-2 pt-2">
            <span className="ln-label">G-M angle (° east +)</span>
            <NumberField className="ln-input ln-mono w-20" value={gm} onChange={setGm} ariaLabel="G-M angle" />
          </label>

          <button className="ln-btn w-full mt-2" onClick={startNav}>
            {needPerm ? "Enable compass & start" : "Start navigation"}
          </button>
        </div>
      )}

      {waypoints.length === 0 && (
        <p className="text-sm text-[var(--ln-muted)]">
          No waypoints yet. Add your objective (and any checkpoints) above, or tap
          <strong> Use my GPS</strong> to mark where you&apos;re standing now so you
          can find your way back.
        </p>
      )}
      </>
      )}
    </div>
  );
}

// ---------------- Dead-reckoning plotter (no GPS) ----------------

interface Leg {
  id: string;
  azType: "grid" | "mag";
  az: number;
  dist: number;
}

function DeadReckon({ gm, setGm }: { gm: number; setGm: (v: number) => void }) {
  const [startStr, setStartStr] = useState("");
  const [start, setStart] = useState<LatLon | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [azType, setAzType] = useState<"grid" | "mag">("grid");
  const [az, setAz] = useState("");
  const [dist, setDist] = useState("");
  const [distUnit, setDistUnit] = useState<"m" | "paces">("m");
  const [pacesPer100, setPacesPer100] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("deadreckon.pace.per100");
      if (v) setPacesPer100(parseFloat(v));
    } catch {
      /* ignore */
    }
  }, []);

  function setStartFromInput() {
    setErr(null);
    const ll = parseCoordInput(startStr);
    if (!ll) {
      setErr("Enter a start as MGRS or lat, long — or use GPS / last fix.");
      return;
    }
    setStart(ll);
  }
  function startFromGps() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll = { lat: p.coords.latitude, lon: p.coords.longitude };
        setStart(ll);
        setStartStr(latLonToMGRS(ll.lat, ll.lon, 4));
      },
      () => setErr("Couldn't read GPS."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  function startFromLast() {
    try {
      const raw = localStorage.getItem("azimuth.lastfix.v1");
      if (raw) {
        const f = JSON.parse(raw);
        setStart({ lat: f.lat, lon: f.lon });
        setStartStr(latLonToMGRS(f.lat, f.lon, 4));
      } else setErr("No saved fix yet.");
    } catch {
      setErr("No saved fix yet.");
    }
  }

  function addLeg() {
    const a = parseFloat(az);
    const raw = parseFloat(dist);
    if (!isFinite(a) || !isFinite(raw) || raw <= 0) {
      setErr("Enter an azimuth (0–360) and a distance.");
      return;
    }
    if (distUnit === "paces" && !pacesPer100) {
      setErr("No pace count saved yet — calibrate it on the Coords tab, or enter meters.");
      return;
    }
    const meters = distUnit === "paces" ? (raw / pacesPer100!) * 100 : raw;
    setErr(null);
    setLegs([...legs, { id: `${Date.now()}-${legs.length}`, azType, az: norm360(a), dist: meters }]);
    setAz("");
    setDist("");
  }

  // Compute the chain of positions.
  const points: { pos: LatLon; leg?: Leg }[] = [];
  if (start) {
    points.push({ pos: start });
    let cur = start;
    for (const leg of legs) {
      const gridAz = leg.azType === "mag" ? magneticToGrid(leg.az, gm) : leg.az;
      cur = deadReckon(cur, gridAz, leg.dist);
      points.push({ pos: cur, leg });
    }
  }
  const final = points.length ? points[points.length - 1].pos : null;
  const totalDist = legs.reduce((s, l) => s + l.dist, 0);
  // Uncertainty: per leg combine ~5% pace/distance error and ~3° bearing-hold
  // lateral error, summed in quadrature over a 5 m base start fix.
  const BEARING_LATERAL = Math.sin((3 * Math.PI) / 180);
  const errorRadius = Math.sqrt(
    legs.reduce(
      (s, l) => s + (l.dist * 0.05) ** 2 + (l.dist * BEARING_LATERAL) ** 2,
      25,
    ),
  );

  return (
    <div className="space-y-4">
      <div className="ln-panel p-4 space-y-3">
        <h2 className="font-semibold">Start point</h2>
        <input className="ln-input ln-mono" placeholder="MGRS or lat, long" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <button className="ln-btn text-sm" onClick={setStartFromInput}>Set</button>
          <button className="ln-btn-ghost text-sm" onClick={startFromGps}>Use GPS</button>
          <button className="ln-btn-ghost text-sm" onClick={startFromLast}>Last fix</button>
        </div>
        {start && (
          <p className="text-xs ln-mono" style={{ color: "var(--ln-od-bright)" }}>
            Start: {latLonToMGRS(start.lat, start.lon, 4)}
          </p>
        )}
      </div>

      <div className="ln-panel p-4 space-y-3">
        <h2 className="font-semibold">Add a leg</h2>
        <div className="grid grid-cols-2 gap-1">
          <button className={azType === "grid" ? "ln-btn text-sm" : "ln-btn-ghost text-sm"} onClick={() => setAzType("grid")}>Grid az</button>
          <button className={azType === "mag" ? "ln-btn text-sm" : "ln-btn-ghost text-sm"} onClick={() => setAzType("mag")}>Magnetic az</button>
        </div>
        {azType === "mag" && (
          <label className="flex items-center gap-2">
            <span className="ln-label">G-M angle (° east +) for this AO</span>
            <NumberField className="ln-input ln-mono w-20" value={gm} onChange={setGm} ariaLabel="G-M angle" />
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="ln-label">Azimuth °</span><input className="ln-input ln-mono" inputMode="decimal" value={az} onChange={(e) => setAz(e.target.value)} placeholder="047" /></label>
          <label className="space-y-1">
            <span className="ln-label flex items-center justify-between">
              Distance
              <span className="flex gap-1">
                <button type="button" className={distUnit === "m" ? "ln-btn text-xs !py-1 !px-3" : "ln-btn-ghost text-xs !py-1 !px-3"} onClick={() => setDistUnit("m")}>m</button>
                <button type="button" className={distUnit === "paces" ? "ln-btn text-xs !py-1 !px-3" : "ln-btn-ghost text-xs !py-1 !px-3"} onClick={() => setDistUnit("paces")}>paces</button>
              </span>
            </span>
            <input className="ln-input ln-mono" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder={distUnit === "paces" ? "120" : "600"} />
          </label>
        </div>
        {distUnit === "paces" && (
          <p className="text-[11px] text-[var(--ln-muted)]">
            {pacesPer100
              ? `Your pace count: ${pacesPer100.toFixed(0)} paces/100 m${isFinite(parseFloat(dist)) ? ` · ${parseFloat(dist)} paces ≈ ${formatMeters((parseFloat(dist) / pacesPer100) * 100)}` : ""}`
              : "No pace count saved — calibrate it on the Coords tab first."}
          </p>
        )}
        <button className="ln-btn w-full" onClick={addLeg} disabled={!start}>Add leg</button>
        {err && <p className="text-xs text-[var(--ln-red)]">{err}</p>}
        {!start && <p className="text-xs text-[var(--ln-muted)]">Set a start point first.</p>}
      </div>

      {legs.length > 0 && final && (
        <div className="ln-panel p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Plotted position</h2>
            <button className="text-xs text-[var(--ln-red)]" onClick={() => setLegs([])}>Clear legs</button>
          </div>
          {points.map((p, i) => (
            <div key={i} className="ln-panel-2 px-3 py-2 text-sm flex items-center justify-between">
              <span className="ln-mono">
                {i === 0 ? "Start" : `Leg ${i}: ${p.leg!.azType === "mag" ? "mag" : "grid"} ${p.leg!.az.toFixed(0)}° / ${formatMeters(p.leg!.dist)}`}
              </span>
              <span className="ln-mono text-[var(--ln-muted)]">{latLonToMGRS(p.pos.lat, p.pos.lon, 4)}</span>
            </div>
          ))}
          <div className="ln-panel-2 p-3 text-center mt-1">
            <div className="ln-label">Dead-reckoned position · {formatMeters(totalDist)} total</div>
            <div className="ln-mono ln-stat text-2xl text-[var(--ln-od-bright)] break-all" style={{ letterSpacing: "0.04em" }}>
              {latLonToMGRS(final.lat, final.lon, 4)}
            </div>
            <div className="ln-mono text-xs text-[var(--ln-muted)]">{final.lat.toFixed(5)}, {final.lon.toFixed(5)}</div>
            <div className="ln-mono text-sm mt-1" style={{ color: errorRadius > 100 ? "var(--ln-amber)" : "var(--ln-muted)" }}>
              ± {Math.round(errorRadius)} m uncertainty
            </div>
          </div>
          {errorRadius > 100 && (
            <p className="text-[11px] text-[var(--ln-amber)]">
              Error has grown past ~100 m — confirm your position by resection off
              known features before continuing.
            </p>
          )}
          <details className="ln-panel-2 p-2" open>
            <summary className="ln-label cursor-pointer">Return route (back to start)</summary>
            <div className="mt-2 space-y-1">
              {[...legs].reverse().map((l, i) => {
                const gridAz = l.azType === "mag" ? magneticToGrid(l.az, gm) : l.az;
                const backGrid = norm360(gridAz + 180);
                return (
                  <div key={l.id} className="text-sm ln-mono flex justify-between">
                    <span>Back {i + 1}: grid {backGrid.toFixed(0)}° / {formatMeters(l.dist)}</span>
                    <span className="text-[var(--ln-muted)]">mag {norm360(backGrid - gm).toFixed(0)}°</span>
                  </div>
                );
              })}
            </div>
          </details>
          <p className="text-[11px] text-[var(--ln-muted)]">
            No GPS used — plotted from your start, azimuths, and distances.
            Uncertainty grows with distance and bearing-hold error; confirm at
            known features.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ln-panel-2 p-2">
      <div className="ln-label">{label}</div>
      <div className="ln-mono ln-stat">{value}</div>
    </div>
  );
}
