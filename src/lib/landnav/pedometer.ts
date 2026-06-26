// Automatic step detection from the phone's accelerometer (DeviceMotion).
// Peak-detects footfalls so the app can count steps hands-free instead of
// making you tap every pace. Fully on-device, works offline.
//
// Note: this counts STEPS (every footfall). A land-nav "pace" is every other
// step (same foot), so paces = steps / 2.

interface MotionEventiOS {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

/** Ask for motion-sensor permission (required on iOS 13+). Returns true if usable. */
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent === "undefined") return false;
  const dme = DeviceMotionEvent as unknown as MotionEventiOS;
  if (typeof dme.requestPermission === "function") {
    try {
      return (await dme.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true; // no explicit permission needed (most Android)
}

/**
 * Start counting steps. Calls `onStep` once per detected footfall. Returns a
 * stop function. Uses a gravity-tracking high-pass + hysteresis peak detector
 * with a refractory period so a single stride isn't double-counted.
 */
export function startPedometer(onStep: () => void): () => void {
  let gravity = 9.81; // running estimate of the gravity component of |a|
  let armed = true; // hysteresis latch
  let lastStep = 0;
  const HIGH = 1.5; // m/s^2 above baseline to fire a step
  const LOW = 0.6; // must drop below this to re-arm
  const MIN_INTERVAL = 270; // ms between steps (≈ up to ~220 spm)

  function handle(e: DeviceMotionEvent) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    // Low-pass to track the gravity baseline; the residual is body motion.
    gravity = gravity * 0.9 + mag * 0.1;
    const dyn = mag - gravity;
    const now = e.timeStamp || performance.now();

    if (armed && dyn > HIGH && now - lastStep > MIN_INTERVAL) {
      armed = false;
      lastStep = now;
      onStep();
    } else if (!armed && dyn < LOW) {
      armed = true;
    }
  }

  window.addEventListener("devicemotion", handle);
  return () => window.removeEventListener("devicemotion", handle);
}
