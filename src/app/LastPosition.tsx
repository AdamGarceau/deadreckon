"use client";

import { useEffect, useState } from "react";

export interface SavedFix {
  lat: number;
  lon: number;
  mgrs: string;
  accuracy: number;
  at: number;
}

export const LAST_FIX_KEY = "azimuth.lastfix.v1";

/** Persist the most recent GPS fix so it survives navigation/reload/sleep. */
export function saveLastFix(fix: SavedFix) {
  try {
    localStorage.setItem(LAST_FIX_KEY, JSON.stringify(fix));
  } catch {
    /* ignore */
  }
}

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Shows the last known position on Home — a no-power-needed memory aid and a
// safety hedge (you always have your most recent fix even if GPS drops).
export default function LastPosition() {
  const [fix, setFix] = useState<SavedFix | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_FIX_KEY);
      if (raw) setFix(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const t = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  if (!fix) return null;

  return (
    <div className="ln-panel-2 px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <div className="ln-label">Last known position</div>
        <div className="ln-mono text-[var(--ln-ink)] text-base">{fix.mgrs}</div>
      </div>
      <div className="text-right text-xs text-[var(--ln-muted)]">
        <div>±{Math.round(fix.accuracy)} m</div>
        <div>{ago(fix.at)}</div>
      </div>
    </div>
  );
}
