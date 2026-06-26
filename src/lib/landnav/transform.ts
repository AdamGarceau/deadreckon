// Georeferencing: map photo pixels <-> real-world UTM coordinates.
//
// The user calibrates a photographed topo map by tapping known grid
// intersections and entering their coordinates. From those control points we
// fit a transform that converts any pixel to a ground coordinate (and back),
// which is what lets us plot a live GPS fix on the paper map and read true
// grid azimuths/distances off it.

export interface Pixel {
  x: number;
  y: number;
}

export interface World {
  easting: number;
  northing: number;
}

export interface ControlPoint {
  pixel: Pixel;
  world: World;
}

// Affine transform: world = M * pixel + t, stored as 6 coefficients.
//   easting  = a*x + b*y + c
//   northing = d*x + e*y + f
export interface Affine {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
  inverse: Affine | null; // pixel-from-world, filled in by buildTransform
}

/**
 * Least-squares conformal (similarity) fit in one of two orientations:
 *   reflected=false → rotation+scale: E = a·x − b·y + tx, N = b·x + a·y + ty
 *   reflected=true  → with a handedness flip: E = a·x + b·y + tx, N = b·x − a·y + ty
 *
 * A map photographed north-up has image-y pointing DOWN while northing points
 * UP, so the correct map is the REFLECTED form — a plain rotation+scale (det ≥ 0)
 * cannot flip handedness. We fit whichever orientation the control points imply.
 * Either way the scale stays uniform and there is no shear, so a photographed
 * (isotropic) UTM grid is modeled honestly and we can report real residuals.
 */
function conformalFit(points: ControlPoint[], reflected: boolean): Affine {
  const N = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const rhs = [0, 0, 0, 0];
  const addRow = (row: number[], val: number) => {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) N[i][j] += row[i] * row[j];
      rhs[i] += row[i] * val;
    }
  };
  // unknowns p = [a, b, tx, ty]
  for (const { pixel, world } of points) {
    const { x, y } = pixel;
    if (reflected) {
      addRow([x, y, 1, 0], world.easting); // E = a·x + b·y + tx
      addRow([-y, x, 0, 1], world.northing); // N = -a·y + b·x + ty
    } else {
      addRow([x, -y, 1, 0], world.easting); // E = a·x - b·y + tx
      addRow([y, x, 0, 1], world.northing); // N = a·y + b·x + ty
    }
  }
  const [a, b, tx, ty] = solveN(N, rhs);
  return reflected
    ? finalizeAffine({ a, b, c: tx, d: b, e: -a, f: ty, inverse: null })
    : finalizeAffine({ a, b: -b, c: tx, d: b, e: a, f: ty, inverse: null });
}

// Solve an n×n linear system with Gaussian elimination + partial pivoting.
function solveN(Min: number[][], v: number[]): number[] {
  const n = v.length;
  const m = Min.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / d;
      for (let k = col; k <= n; k++) m[r][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / m[i][i]);
}

export interface Residuals {
  perPoint: number[]; // ground distance (m) between control world coord and the fit
  rms: number; // root-mean-square residual (m)
  max: number; // worst single residual (m)
}

/** Residuals of a transform against its control points, in ground meters. */
export function transformResiduals(t: Affine, points: ControlPoint[]): Residuals {
  const perPoint = points.map((p) => {
    const w = pixelToWorld(t, p.pixel);
    return Math.hypot(w.easting - p.world.easting, w.northing - p.world.northing);
  });
  const rms = Math.sqrt(perPoint.reduce((s, r) => s + r * r, 0) / (perPoint.length || 1));
  return { perPoint, rms, max: perPoint.length ? Math.max(...perPoint) : 0 };
}

function finalizeAffine(t: Affine): Affine {
  const det = t.a * t.e - t.b * t.d;
  if (Math.abs(det) > 1e-12) {
    const ia = t.e / det;
    const ib = -t.b / det;
    const id = -t.d / det;
    const ie = t.a / det;
    t.inverse = {
      a: ia,
      b: ib,
      c: -(ia * t.c + ib * t.f),
      d: id,
      e: ie,
      f: -(id * t.c + ie * t.f),
      inverse: null,
    };
  }
  return t;
}

/**
 * Build the best conformal transform for the control points. Fits both
 * orientations (direct and reflected) and keeps whichever fits better — so a
 * north-up map photo (reflected) and an unusually oriented one both work. With
 * exactly two points both fit the points exactly; we default to the reflected
 * (north-up) orientation, which is how paper maps are calibrated.
 */
export function buildTransform(points: ControlPoint[]): Affine | null {
  if (points.length < 2) return null;
  const reflectedFit = conformalFit(points, true);
  if (points.length === 2) return reflectedFit;
  const directFit = conformalFit(points, false);
  const rmsOf = (t: Affine) => transformResiduals(t, points).rms;
  return rmsOf(reflectedFit) <= rmsOf(directFit) ? reflectedFit : directFit;
}

export function pixelToWorld(t: Affine, p: Pixel): World {
  return {
    easting: t.a * p.x + t.b * p.y + t.c,
    northing: t.d * p.x + t.e * p.y + t.f,
  };
}

export function worldToPixel(t: Affine, w: World): Pixel | null {
  if (!t.inverse) return null;
  const inv = t.inverse;
  return {
    x: inv.a * w.easting + inv.b * w.northing + inv.c,
    y: inv.d * w.easting + inv.e * w.northing + inv.f,
  };
}

/**
 * Ground resolution in meters-per-pixel, averaged over the transform. Useful
 * for sanity-checking a calibration ("does this scale look right?").
 */
export function metersPerPixel(t: Affine): number {
  const sx = Math.hypot(t.a, t.d);
  const sy = Math.hypot(t.b, t.e);
  return (sx + sy) / 2;
}
