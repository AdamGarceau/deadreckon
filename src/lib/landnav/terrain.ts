// On-device terrain reading from a photographed topographic map.
//
// We can't reconstruct a true elevation model from a photo, but we CAN read the
// two terrain signals that matter most for safety the same way a person does by
// eye:
//   • Steepness — where contour lines are packed tightly together. Densely
//     spaced contours mean steep ground and, at the extreme, cliffs (a fall
//     hazard). This is heuristic, from the brown contour ink density.
//   • Water — blue features (streams, drainages, ponds). In slot-canyon country
//     these are the flash-flood lines.
//
// It is a heuristic, not a survey. Always confirm against the contours and the
// ground. Everything runs in the browser canvas — fully offline.

export interface TerrainCell {
  gx: number; // cell column (downscaled-pixel units)
  gy: number; // cell row
  steepness: number; // 0..1, contour-line density
  water: number; // 0..1, blue coverage
}

export interface TerrainAnalysis {
  cells: TerrainCell[];
  cellSize: number; // in DOWNSCALED pixels
  scale: number; // multiply downscaled coords by this to get natural-image pixels
  steepCount: number;
  waterCount: number;
  maxSteepness: number;
}

function isContourPixel(r: number, g: number, b: number): boolean {
  // USGS contour brown / orange-brown ink: r > g > b, mid-tone, not white bg.
  return (
    r > 110 && r < 235 &&
    g > 70 && g < 185 &&
    b < 160 &&
    r - b > 32 &&
    r - g > 8 &&
    g - b >= 0
  );
}

function isWaterPixel(r: number, g: number, b: number): boolean {
  // Blue water tint: blue clearly dominant.
  return b > 95 && b - r > 18 && b - g > 8;
}

/**
 * Analyze terrain from already-decoded image pixels (downscaled for speed).
 * `scale` maps the downscaled coordinate space back to the original image.
 */
export function analyzeTerrain(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
  cellSize = 8,
): TerrainAnalysis {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const contourCount = new Float32Array(cols * rows);
  const waterCount = new Float32Array(cols * rows);

  for (let y = 0; y < height; y++) {
    const cy = (y / cellSize) | 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const cx = (x / cellSize) | 0;
      const ci = cy * cols + cx;
      if (isWaterPixel(r, g, b)) waterCount[ci]++;
      else if (isContourPixel(r, g, b)) contourCount[ci]++;
    }
  }

  const area = cellSize * cellSize;
  const cells: TerrainCell[] = [];
  let steepCount = 0;
  let water = 0;
  let maxSteepness = 0;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const ci = cy * cols + cx;
      // Contour-line ink typically covers ~10–30% of a steep cell; normalize.
      const steepness = Math.min(1, contourCount[ci] / area / 0.28);
      const wat = Math.min(1, waterCount[ci] / area / 0.2);
      if (steepness > 0.45 || wat > 0.4) {
        cells.push({ gx: cx, gy: cy, steepness, water: wat });
        if (steepness > 0.45) steepCount++;
        if (wat > 0.4) water++;
        if (steepness > maxSteepness) maxSteepness = steepness;
      }
    }
  }

  return { cells, cellSize, scale, steepCount, waterCount: water, maxSteepness };
}
