// Coordinate math for land navigation.
//
// Implements WGS84 lat/lon <-> UTM <-> MGRS conversions plus the azimuth,
// distance, and grid<->magnetic helpers from TC 3-25.26 (Map Reading and Land
// Navigation). Everything is self-contained so the app works fully offline in
// the field — no network, no external geo libraries.

// --- WGS84 ellipsoid constants ---
const A = 6378137.0; // semi-major axis (meters)
const F = 1 / 298.257223563; // flattening
const E2 = F * (2 - F); // first eccentricity squared
const EP2 = E2 / (1 - E2); // second eccentricity squared
const K0 = 0.9996; // UTM scale factor on the central meridian

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface UTM {
  zone: number; // longitudinal zone 1..60
  hemisphere: "N" | "S";
  easting: number; // meters
  northing: number; // meters
}

/** Normalize an angle in degrees to the 0..360 range. */
export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Longitudinal UTM zone for a given longitude (no Norway/Svalbard exceptions). */
export function utmZone(lat: number, lon: number): number {
  let zone = Math.floor((lon + 180) / 6) + 1;
  // Norway zone 32 exception
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  // Svalbard exceptions
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31;
    else if (lon >= 9 && lon < 21) zone = 33;
    else if (lon >= 21 && lon < 33) zone = 35;
    else if (lon >= 33 && lon < 42) zone = 37;
  }
  return zone;
}

/** Convert WGS84 lat/lon (degrees) to UTM. */
export function latLonToUTM(lat: number, lon: number): UTM {
  const zone = utmZone(lat, lon);
  const lon0 = (zone - 1) * 6 - 180 + 3; // central meridian of the zone
  const latR = lat * DEG;
  const dLon = (lon - lon0) * DEG;

  const N = A / Math.sqrt(1 - E2 * Math.sin(latR) ** 2);
  const T = Math.tan(latR) ** 2;
  const C = EP2 * Math.cos(latR) ** 2;
  const Acoef = Math.cos(latR) * dLon;

  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * latR -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * latR) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * latR) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * latR));

  let easting =
    K0 *
      N *
      (Acoef +
        ((1 - T + C) * Acoef ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * EP2) * Acoef ** 5) / 120) +
    500000;

  let northing =
    K0 *
    (M +
      N *
        Math.tan(latR) *
        (Acoef ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * Acoef ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * EP2) * Acoef ** 6) / 720));

  const hemisphere: "N" | "S" = lat >= 0 ? "N" : "S";
  if (lat < 0) northing += 10000000;

  easting = Math.round(easting * 1000) / 1000;
  northing = Math.round(northing * 1000) / 1000;
  return { zone, hemisphere, easting, northing };
}

/** Convert UTM back to WGS84 lat/lon (degrees). */
export function utmToLatLon(utm: UTM): LatLon {
  const { zone, hemisphere, easting } = utm;
  let { northing } = utm;
  const x = easting - 500000;
  if (hemisphere === "S") northing -= 10000000;

  const lon0 = (zone - 1) * 6 - 180 + 3;
  const M = northing / K0;
  const mu =
    M / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = EP2 * Math.cos(phi1) ** 2;
  const R1 = (A * (1 - E2)) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) /
          720);

  const lon =
    lon0 * DEG +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);

  return { lat: lat * RAD, lon: lon * RAD };
}

// --- MGRS ---

const LAT_BANDS = "CDEFGHJKLMNPQRSTUVWX"; // 8°-wide bands, C at -80°

function latBand(lat: number): string {
  if (lat >= 84) return "X";
  if (lat < -80) return "C";
  const idx = Math.floor((lat + 80) / 8);
  return LAT_BANDS[Math.min(idx, LAT_BANDS.length - 1)];
}

// 100km square column letters cycle in three sets based on zone number.
const COL_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
// Row letters cycle every 2,000km; two alternating alphabets by zone parity.
const ROW_SET_ODD = "ABCDEFGHJKLMNPQRSTUV";
const ROW_SET_EVEN = "FGHJKLMNPQRSTUVABCDE";

function hundredKmLetters(zone: number, easting: number, northing: number): string {
  const setCol = (zone - 1) % 3;
  const colIdx = Math.floor(easting / 100000) - 1; // eastings are 100000..900000
  const colLetter = COL_SETS[setCol][colIdx];

  const rowSet = zone % 2 === 1 ? ROW_SET_ODD : ROW_SET_EVEN;
  const rowIdx = Math.floor(northing / 100000) % 20;
  const rowLetter = rowSet[rowIdx];
  return `${colLetter}${rowLetter}`;
}

/**
 * MGRS string for a lat/lon. `precision` is digits per axis (5 = 1m, 4 = 10m,
 * 3 = 100m, 2 = 1km). Returns e.g. "18S UJ 23487 06483".
 */
export function latLonToMGRS(lat: number, lon: number, precision = 5): string {
  const utm = latLonToUTM(lat, lon);
  const band = latBand(lat);
  const square = hundredKmLetters(utm.zone, utm.easting, utm.northing);

  const div = 10 ** (5 - precision);
  const e = Math.floor((utm.easting % 100000) / div)
    .toString()
    .padStart(precision, "0");
  const n = Math.floor((utm.northing % 100000) / div)
    .toString()
    .padStart(precision, "0");

  return `${utm.zone}${band} ${square} ${e} ${n}`;
}

export interface ParsedMGRS extends UTM {
  precision: number;
}

/**
 * Parse an MGRS string (spaces optional) into full-resolution UTM coordinates.
 * Returns null if the string is not valid MGRS.
 */
export function parseMGRS(raw: string): ParsedMGRS | null {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  const m = s.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/);
  if (!m) return null;
  const zone = parseInt(m[1], 10);
  if (zone < 1 || zone > 60) return null;
  const band = m[2];
  const colLetter = m[3];
  const rowLetter = m[4];
  const digits = m[5];
  if (digits.length % 2 !== 0) return null;
  const precision = digits.length / 2;

  const setCol = (zone - 1) % 3;
  const colIdx = COL_SETS[setCol].indexOf(colLetter);
  if (colIdx < 0) return null;
  const easting100k = (colIdx + 1) * 100000;

  const rowSet = zone % 2 === 1 ? ROW_SET_ODD : ROW_SET_EVEN;
  const rowIdx = rowSet.indexOf(rowLetter);
  if (rowIdx < 0) return null;

  // Resolve the northing band: pick the multiple of 2,000km that lands the
  // point inside the latitude band's northing range.
  const bandIdx = LAT_BANDS.indexOf(band);
  const hemisphere: "N" | "S" = bandIdx >= LAT_BANDS.indexOf("N") ? "N" : "S";
  const approxLat = -80 + bandIdx * 8 + 4;
  const approxNorthingRaw = latLonToUTM(approxLat, (zone - 1) * 6 - 180 + 3).northing;
  const approxNorthing =
    hemisphere === "S" ? approxNorthingRaw - 10000000 : approxNorthingRaw;

  let northing100k = rowIdx * 100000;
  while (northing100k < approxNorthing - 1000000) northing100k += 2000000;
  while (northing100k > approxNorthing + 1000000) northing100k -= 2000000;

  const div = precision > 0 ? 10 ** (5 - precision) : 100000;
  const e = precision > 0 ? parseInt(digits.slice(0, precision), 10) * div : 0;
  const n = precision > 0 ? parseInt(digits.slice(precision), 10) * div : 0;

  let northing = northing100k + n;
  if (hemisphere === "S" && northing < 0) northing += 10000000;

  return {
    zone,
    hemisphere,
    easting: easting100k + e,
    northing,
    precision,
  };
}

// --- Azimuth & distance ---

/**
 * Grid azimuth (degrees, 0–360, clockwise from grid north) and straight-line
 * distance in meters between two points given as UTM eastings/northings in the
 * same zone. This is planar grid math — exactly how a protractor reads a map.
 */
export function gridAzimuthDistance(
  from: { easting: number; northing: number },
  to: { easting: number; northing: number },
): { azimuth: number; distance: number } {
  const dE = to.easting - from.easting;
  const dN = to.northing - from.northing;
  const azimuth = norm360(Math.atan2(dE, dN) * RAD);
  const distance = Math.hypot(dE, dN);
  return { azimuth, distance };
}

/**
 * Dead reckoning: from a start point, follow a GRID azimuth for a distance (m)
 * and return the resulting position — no GPS required. Works in the local UTM
 * grid, exactly how you'd plot a leg with a protractor and a pace count.
 */
export function deadReckon(start: LatLon, gridAz: number, distanceM: number): LatLon {
  const u = latLonToUTM(start.lat, start.lon);
  const a = gridAz * DEG;
  return utmToLatLon({
    ...u,
    easting: u.easting + distanceM * Math.sin(a),
    northing: u.northing + distanceM * Math.cos(a),
  });
}

/** Back azimuth: add 180° if under 180°, otherwise subtract 180°. */
export function backAzimuth(az: number): number {
  return norm360(az + 180);
}

/**
 * Convert a GRID azimuth to a MAGNETIC (compass) azimuth using the signed G–M
 * angle, with the convention EAST = positive, WEST = negative.
 *
 * Doctrine (TC 3-25.26 / FM 3-25.26): for an EASTERLY G–M angle, going
 * grid→magnetic you SUBTRACT the angle (and magnetic→grid you ADD); a WESTERLY
 * G–M angle is the mirror. With EAST stored positive, `grid - gmAngle` produces
 * exactly that — e.g. grid 199.5° with a 9.5°E G–M angle → magnetic 190.0°.
 */
export function gridToMagnetic(gridAz: number, gmAngle: number): number {
  return norm360(gridAz - gmAngle);
}

/** Convert a MAGNETIC (compass) azimuth to a GRID azimuth (EAST positive). */
export function magneticToGrid(magAz: number, gmAngle: number): number {
  return norm360(magAz + gmAngle);
}

/** Back azimuth expressed in mils (6400-mil circle). */
export function backAzimuthMils(az: number): number {
  return Math.round(degreesToMils(backAzimuth(az)) / 10) * 10;
}

/**
 * Grid convergence γ — the angle between grid north and true north at a point.
 * Spherical approximation γ ≈ (λ − λ₀)·sin(φ), zero on the zone's central
 * meridian and growing toward the edges. East-positive. Used to relate the
 * map's G–M angle to a true-referenced magnetic declination:
 *   G–M angle = declination − convergence.
 */
export function gridConvergence(lat: number, lon: number): number {
  const zone = utmZone(lat, lon);
  const lon0 = (zone - 1) * 6 - 180 + 3;
  return (lon - lon0) * Math.sin(lat * DEG);
}

/**
 * Choose an honest MGRS precision (digits PER AXIS) for a GPS fix of the given
 * accuracy in meters. A 3–10 m consumer fix must not be reported to 1 m. Caps:
 * ≤2 m → 1 m (5), ≤20 m → 10 m (4), ≤200 m → 100 m (3), else 1 km (2).
 */
export function mgrsPrecisionForAccuracy(accuracyMeters: number): number {
  if (!isFinite(accuracyMeters) || accuracyMeters <= 0) return 4;
  if (accuracyMeters <= 2) return 5;
  if (accuracyMeters <= 20) return 4;
  if (accuracyMeters <= 200) return 3;
  return 2;
}

/** Round a G–M angle / declination to the nearest 0.5° for display (per the diagram convention). */
export function roundHalfDegree(deg: number): number {
  return Math.round(deg * 2) / 2;
}

// --- Haversine (for great-circle distance between raw GPS fixes) ---

/**
 * Initial great-circle bearing (TRUE azimuth, degrees 0–360) from a to b.
 * Subtract magnetic declination (east-positive) to get a magnetic bearing.
 */
export function initialBearing(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return norm360(Math.atan2(y, x) * RAD);
}

export function haversine(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --- Formatting helpers ---

export function formatLatLon(ll: LatLon): string {
  const latH = ll.lat >= 0 ? "N" : "S";
  const lonH = ll.lon >= 0 ? "E" : "W";
  return `${Math.abs(ll.lat).toFixed(5)}°${latH}, ${Math.abs(ll.lon).toFixed(5)}°${lonH}`;
}

export function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

/** Compass point label (16-wind) for an azimuth in degrees. */
export function compassPoint(az: number): string {
  const pts = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return pts[Math.round(norm360(az) / 22.5) % 16];
}

/** Convert an azimuth in degrees to mils (6400 mils = 360°). */
export function degreesToMils(deg: number): number {
  return Math.round(norm360(deg) * (6400 / 360));
}
