// Elevation height-field from open Terrarium terrain-RGB tiles (AWS open data,
// keyless, CORS-enabled). Browser-only: fetches PNG tiles, decodes them on a
// canvas, and samples an N×N grid of ground elevations (meters) over a lat/long
// bounding box. Fetched once with signal, then the browser caches the tiles.

export interface Heightfield {
  n: number; // grid is n×n
  data: Float32Array; // elevation in meters, row-major (north→south, west→east)
  min: number;
  max: number;
  /** meters of ground per grid step, east/west and north/south (for scaling) */
  spanEW: number;
  spanNS: number;
}

export interface LatLonBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

const TILE = 256;

function lon2x(lon: number, z: number): number {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function lat2y(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}

function chooseZoom(box: LatLonBox): number {
  const lonSpan = Math.max(1e-4, box.east - box.west);
  let z = Math.round(Math.log2((3 * 360) / lonSpan));
  z = Math.max(8, Math.min(14, z));
  // keep tile count sane
  while (z > 8) {
    const tx = Math.floor(lon2x(box.east, z)) - Math.floor(lon2x(box.west, z)) + 1;
    const ty = Math.floor(lat2y(box.south, z)) - Math.floor(lat2y(box.north, z)) + 1;
    if (tx * ty <= 42) break;
    z--;
  }
  return z;
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let done = false;
    const finish = (v: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    // Don't hang forever if the elevation service is unreachable.
    setTimeout(() => finish(null), 12000);
    img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  });
}

const DEG = Math.PI / 180;

/** Approx ground meters between two lat/long points along E-W and N-S. */
function spans(box: LatLonBox): { ew: number; ns: number } {
  const midLat = (box.north + box.south) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(midLat * DEG);
  return {
    ew: Math.abs(box.east - box.west) * mPerDegLon,
    ns: Math.abs(box.north - box.south) * mPerDegLat,
  };
}

/**
 * Build an n×n elevation grid over the box. Throws if no tiles load (offline
 * with nothing cached). Row 0 = north edge.
 */
export async function fetchHeightfield(box: LatLonBox, n = 96): Promise<Heightfield> {
  const z = chooseZoom(box);
  const tx0 = Math.floor(lon2x(box.west, z));
  const tx1 = Math.floor(lon2x(box.east, z));
  const ty0 = Math.floor(lat2y(box.north, z)); // north → smaller y
  const ty1 = Math.floor(lat2y(box.south, z));
  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");

  const jobs: Promise<void>[] = [];
  let loaded = 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        loadTile(z, tx, ty).then((img) => {
          if (img) {
            ctx.drawImage(img, (tx - tx0) * TILE, (ty - ty0) * TILE);
            loaded++;
          }
        }),
      );
    }
  }
  await Promise.all(jobs);
  if (loaded === 0) throw new Error("No elevation tiles loaded (need signal once to cache them).");

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const sample = (px: number, py: number): number => {
    const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py)));
    const i = (y * canvas.width + x) * 4;
    return img[i] * 256 + img[i + 1] + img[i + 2] / 256 - 32768;
  };

  const data = new Float32Array(n * n);
  let min = Infinity;
  let max = -Infinity;
  const originX = tx0;
  const originY = ty0;
  for (let r = 0; r < n; r++) {
    const lat = box.north + ((box.south - box.north) * r) / (n - 1);
    const gy = (lat2y(lat, z) - originY) * TILE;
    for (let c = 0; c < n; c++) {
      const lon = box.west + ((box.east - box.west) * c) / (n - 1);
      const gx = (lon2x(lon, z) - originX) * TILE;
      const e = sample(gx, gy);
      data[r * n + c] = e;
      if (e < min) min = e;
      if (e > max) max = e;
    }
  }

  const { ew, ns } = spans(box);
  return { n, data, min, max, spanEW: ew, spanNS: ns };
}
