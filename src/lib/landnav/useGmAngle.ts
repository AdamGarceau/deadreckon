"use client";

// Single source of truth for the magnetic declination the whole app uses.
//
// The user sets ONE number — the G-M angle (grid→magnetic) printed on their map
// margin — and every screen reads/writes it here, so setting it once sets it
// everywhere (Map, Coordinates/Tools, Go To). Persisted offline; changes made in
// one mounted screen propagate live to the others.
//
// IMPORTANT — two conventions, one source:
//   • G-M angle (grid→magnetic): used to convert a GRID azimuth to a compass
//     heading. This is what we store.
//   • Magnetic declination (true→magnetic): used when a bearing was computed from
//     lat/long (true north), e.g. Go To's live arrow. Derive it with
//     gmToTrueDeclination() — do NOT reuse the G-M angle there or you inject the
//     grid-convergence error (~1.5° in this region).

import { useEffect, useState } from "react";
import { DEFAULT_REGION } from "./region";

const KEY = "deadreckon.gmAngle";
type Listener = (v: number) => void;
const listeners = new Set<Listener>();
let current: number | null = null;

function read(): number {
  if (current != null) return current;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw != null) {
      const n = parseFloat(raw);
      if (isFinite(n)) {
        current = n;
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  current = DEFAULT_REGION.gmAngle;
  return current;
}

/** Shared G-M angle (grid→magnetic, °E positive). Returns [value, setValue]. */
export function useGmAngle(): [number, (v: number) => void] {
  const [gm, setGmState] = useState<number>(() =>
    typeof window === "undefined" ? DEFAULT_REGION.gmAngle : read(),
  );

  useEffect(() => {
    setGmState(read()); // reconcile after hydration
    const l: Listener = (v) => setGmState(v);
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue != null) {
        const n = parseFloat(e.newValue);
        if (isFinite(n)) {
          current = n;
          setGmState(n);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setGm = (v: number) => {
    if (!isFinite(v)) return;
    current = v;
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(v));
  };

  return [gm, setGm];
}

/** Push a value into the shared store imperatively (e.g. one-time migration). */
export function setGmAngle(v: number) {
  if (!isFinite(v)) return;
  current = v;
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(v));
}

/**
 * True (true→magnetic) declination derived from the shared G-M angle, for screens
 * that work in true bearings. gmAngle = declination − convergence, so
 * declination = gmAngle + convergence.
 */
export function gmToTrueDeclination(gm: number): number {
  return gm + DEFAULT_REGION.convergence;
}
