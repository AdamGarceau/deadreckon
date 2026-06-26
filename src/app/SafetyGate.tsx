"use client";

import { useEffect, useState } from "react";

const KEY = "azimuth.safety.ack.v1";

// First-run, must-acknowledge safety posture. TC 3-25.26 frames GPS/phone apps
// as a supplement to — never a replacement for — map and compass.
export default function SafetyGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!show) return null;

  function ack() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="ln-panel p-6 max-w-sm">
        <h2 className="font-bold text-lg" style={{ color: "var(--ln-amber)" }}>
          This is a backup, not your primary
        </h2>
        <p className="mt-2 text-sm text-[var(--ln-ink)]">
          GPS lies in canyons and the phone compass drifts near metal — verify
          against the terrain, and carry a paper map and a real compass.
        </p>
        <button className="ln-btn w-full mt-4" onClick={ack}>
          Got it — continue
        </button>
      </div>
    </div>
  );
}
