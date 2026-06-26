// Declination diagram + LARS rule, straight from how it's taught.
//
// A US military topographic map's declination diagram shows three norths:
//   TN — true north (center reference, the star)
//   GN — grid north
//   MN — magnetic north
// GN and MN each have an angular value relative to TN, and each sits on the
// left (west) or right (east) of TN.
//
// G-M angle (the "total value"):
//   - GN and MN on OPPOSITE sides of TN  -> ADD the absolute values
//   - GN and MN on the SAME side of TN   -> SUBTRACT the absolute values
//
// LARS — "Left Add, Right Subtract" — applies when converting a GRID azimuth
// to a MAGNETIC (compass) heading:
//   - MN on the LEFT of GN  -> ADD the G-M angle
//   - MN on the RIGHT of GN -> SUBTRACT the G-M angle
//
// We model side as a signed position on an east-positive axis (west = -, east
// = +). Then everything falls out of the geometry automatically.

import { norm360 } from "./coords";

export type Side = "E" | "W"; // east (right) or west (left) of the reference

export interface DeclinationInput {
  gnValue: number; // angle of GN from TN, degrees (>= 0)
  gnSide: Side; // GN left(W)/right(E) of TN
  mnValue: number; // angle of MN from TN, degrees (>= 0)
  mnSide: Side; // MN left(W)/right(E) of TN
}

function pos(value: number, side: Side): number {
  return side === "E" ? Math.abs(value) : -Math.abs(value);
}

export interface DeclinationSolution {
  gmAngle: number; // magnitude of the G-M angle (degrees)
  /** Signed G-M angle, EAST-positive: magnetic = grid - signedGM. */
  signedGM: number;
  /** Are GN and MN on opposite sides of TN? (drives add vs subtract of values) */
  oppositeSides: boolean;
  /** LARS action when converting GRID -> MAGNETIC. */
  larsAction: "add" | "subtract";
  /** MN is on which side of GN. */
  mnRelativeToGn: "left" | "right";
  /** Human-readable working, mirroring the training slide. */
  steps: string[];
}

export function solveDeclination(input: DeclinationInput): DeclinationSolution {
  const gnPos = pos(input.gnValue, input.gnSide);
  const mnPos = pos(input.mnValue, input.mnSide);

  const oppositeSides = input.gnSide !== input.mnSide;
  const gmAngle = Math.abs(mnPos - gnPos);
  // East-positive signed G-M angle so that magnetic = grid - signedGM.
  const signedGM = mnPos - gnPos;

  const mnLeftOfGn = mnPos < gnPos; // smaller (more west) => left
  const larsAction: "add" | "subtract" = mnLeftOfGn ? "add" : "subtract";

  const steps: string[] = [];
  steps.push(
    `GN is ${Math.abs(input.gnValue)}° ${input.gnSide === "E" ? "right (east)" : "left (west)"} of TN; ` +
      `MN is ${Math.abs(input.mnValue)}° ${input.mnSide === "E" ? "right (east)" : "left (west)"} of TN.`,
  );
  if (oppositeSides) {
    steps.push(
      `GN and MN are on OPPOSITE sides of TN → ADD: ${Math.abs(input.gnValue)}° + ${Math.abs(input.mnValue)}° = ${gmAngle}° G-M angle.`,
    );
  } else {
    steps.push(
      `GN and MN are on the SAME side of TN → SUBTRACT: |${Math.abs(input.gnValue)}° − ${Math.abs(input.mnValue)}°| = ${gmAngle}° G-M angle.`,
    );
  }
  steps.push(
    `MN is on the ${mnLeftOfGn ? "LEFT" : "RIGHT"} of GN → LARS says ${larsAction.toUpperCase()} when going grid → magnetic.`,
  );
  return {
    gmAngle,
    signedGM,
    oppositeSides,
    larsAction,
    mnRelativeToGn: mnLeftOfGn ? "left" : "right",
    steps,
  };
}

/** Grid azimuth -> magnetic (compass) heading using a solved declination. */
export function gridToMagneticLARS(gridAz: number, sol: DeclinationSolution): number {
  const delta = sol.larsAction === "add" ? sol.gmAngle : -sol.gmAngle;
  return norm360(gridAz + delta);
}

/** Magnetic (compass) heading -> grid azimuth (inverse of LARS). */
export function magneticToGridLARS(magAz: number, sol: DeclinationSolution): number {
  const delta = sol.larsAction === "add" ? -sol.gmAngle : sol.gmAngle;
  return norm360(magAz + delta);
}
