// Default region context. The primary user navigates around St. George, Utah,
// so defaults (map center, UTM/MGRS zone, magnetic declination) are tuned for
// Southern Utah. Everything is user-overridable.
//
// One source of truth for declination: we store the magnetic declination
// (true→magnetic) and derive the G-M angle (grid→magnetic) from it using grid
// convergence, so every screen shows the SAME number.
//   G-M angle = declination − grid convergence   (all east-positive)

import { gridConvergence } from "./coords";

const LAT = 37.0965;
const LON = -113.5684;

// 2026 magnetic declination near St. George ≈ +10.9° EAST (true→magnetic).
const DECLINATION = 10.9;
// Grid convergence (grid north vs true north) in zone 12 here ≈ −1.5° (St.
// George sits west of the 111°W central meridian).
const CONVERGENCE = Math.round(gridConvergence(LAT, LON) * 10) / 10;
// Signed, east-positive G-M angle used everywhere for grid↔magnetic.
const GM_ANGLE = Math.round((DECLINATION - CONVERGENCE) * 10) / 10;

export const DEFAULT_REGION = {
  name: "St. George, Utah",
  lat: LAT,
  lon: LON,
  utmZone: 12,
  mgrsGridZone: "12S",
  declination: DECLINATION,
  convergence: CONVERGENCE,
  // The one declination value the app uses for grid↔magnetic conversions.
  gmAngle: GM_ANGLE,
  // Defaults for the declination-diagram (LARS) solver, chosen so the solver
  // reproduces gmAngle exactly: GN sits at the convergence, MN at the declination.
  solverDefaults: {
    gnValue: Math.abs(CONVERGENCE),
    gnSide: (CONVERGENCE >= 0 ? "E" : "W") as "E" | "W",
    mnValue: DECLINATION,
    mnSide: (DECLINATION >= 0 ? "E" : "W") as "E" | "W",
  },
};

// A few well-known Southern Utah landmarks for examples / quick demos.
export const LANDMARKS = [
  { name: "St. George (Dixie Rock)", lat: 37.1118, lon: -113.5836 },
  { name: "Zion — Angels Landing", lat: 37.2692, lon: -112.9469 },
  { name: "Snow Canyon State Park", lat: 37.2061, lon: -113.6418 },
  { name: "Pine Valley Peak", lat: 37.3833, lon: -113.4783 },
  { name: "Sand Hollow Reservoir", lat: 37.1156, lon: -113.3789 },
];
