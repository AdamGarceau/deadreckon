"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function DaylightToggle() {
  const [day, setDay] = useState(false);
  useEffect(() => {
    const on = localStorage.getItem("deadreckon.daylight") === "1";
    setDay(on);
    document.documentElement.classList.toggle("ln-day", on);
  }, []);
  function toggle() {
    const next = !day;
    setDay(next);
    document.documentElement.classList.toggle("ln-day", next);
    try {
      localStorage.setItem("deadreckon.daylight", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  return (
    <button onClick={toggle} aria-label="Toggle daylight mode" className="ln-chip" title="Sunlight / night contrast">
      {day ? "☀ Day" : "☾ Night"}
    </button>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/map", label: "Map", icon: "M9 3l6 2 6-2v16l-6 2-6-2-6 2V5z M9 3v16 M15 5v16" },
  { href: "/navigate", label: "Go To", icon: "M3 11l18-8-8 18-2-8-8-2z" },
  { href: "/coordinates", label: "Tools", icon: "M12 2v20 M2 12h20 M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0" },
  { href: "/guide", label: "Guide", icon: "M4 4h11a3 3 0 013 3v13H7a3 3 0 00-3 3z M4 4v16" },
];

export default function LandNavNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Top bar */}
      <header className="ln-topbar sticky top-0 z-40 border-b border-[var(--ln-line)] bg-[var(--ln-bg)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="ln-logo inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-[var(--ln-od-bright)]">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <polyline points="5,19 11,12 16,14" stroke="var(--ln-od)" strokeWidth="2" strokeDasharray="1 3" strokeLinecap="round" />
                <g transform="translate(17,11) rotate(33)">
                  <polygon points="0,-6 3,1 0,0 -3,1" fill="var(--ln-od-bright)" />
                </g>
              </svg>
            </span>
            <div className="leading-none">
              <div className="font-bold tracking-wide text-[var(--ln-ink)]">DEADRECKON</div>
              <div className="text-[10px] ln-mono text-[var(--ln-muted)]">LAND NAV · TC 3-25.26</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <span className="ln-chip hidden sm:inline-flex">Offline-capable</span>
            <DaylightToggle />
          </div>
        </div>
      </header>

      {/* Bottom tab bar (thumb-reachable in the field) */}
      <nav className="ln-tabbar fixed bottom-0 inset-x-0 z-40 border-t border-[var(--ln-line)] bg-[var(--ln-panel)]/97 backdrop-blur">
        <div className="max-w-5xl mx-auto grid grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-col items-center gap-1 py-2.5"
                style={{ color: active ? "var(--ln-od-bright)" : "var(--ln-muted)" }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
                <span className="text-[10px] font-medium">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
