"use client";

import { useEffect, useRef, useState } from "react";
import {
  backAzimuth,
  compassPoint,
  degreesToMils,
  gridToMagnetic,
  magneticToGrid,
  norm360,
  roundHalfDegree,
} from "@/lib/landnav/coords";
import {
  solveDeclination,
  gridToMagneticLARS,
  magneticToGridLARS,
  type Side,
} from "@/lib/landnav/declination";
import { DEFAULT_REGION } from "@/lib/landnav/region";

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

function QuickConverters({ declination }: { declination: number }) {
  const [decl, setDecl] = useState(declination.toFixed(1));
  const [grid, setGrid] = useState("");
  const [mag, setMag] = useState("");
  const [baInput, setBaInput] = useState("");
  const [milDeg, setMilDeg] = useState("");
  const [degMil, setDegMil] = useState("");

  useEffect(() => {
    setDecl(declination.toFixed(1));
  }, [declination]);

  const d = parseFloat(decl) || 0;

  return (
    <div className="ln-panel p-5 space-y-5">
      <h2 className="font-semibold text-lg">Quick Converters</h2>

      <div>
        <Field label="G-M angle from map margin (° — east +, west −)">
          <input className="ln-input ln-mono" inputMode="decimal" value={decl} onChange={(e) => setDecl(e.target.value)} />
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

// ---------- small shared bits ----------

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

// ---------- page ----------

export default function CompassPage() {
  const [gm, setGm] = useState(DEFAULT_REGION.gmAngle);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compass &amp; Azimuth</h1>
        <p className="text-[var(--ln-muted)] text-sm mt-1">
          Live compass and the azimuth calculators — declination, conversions,
          back azimuth, and mils.
        </p>
      </div>
      <LiveCompass />
      <DeclinationSolver onGm={setGm} />
      <QuickConverters declination={gm} />
    </div>
  );
}
