import Link from "next/link";
import LastPosition from "./LastPosition";

const TOOLS = [
  {
    href: "/map",
    title: "Map Workspace",
    desc: "Photograph your topo map, calibrate it to the grid, then plot your GPS position and shoot azimuths with the digital protractor.",
    tag: "Protractor · GPS · Georeference",
    icon: "M9 3l6 2 6-2v16l-6 2-6-2-6 2V5z",
  },
  {
    href: "/compass",
    title: "Compass & Azimuth",
    desc: "Live magnetic compass plus grid⇄magnetic conversion, back azimuth, and mils — the declination math done for you.",
    tag: "G-M angle · Back azimuth · Mils",
    icon: "M12 2a10 10 0 100 20 10 10 0 000-20z",
  },
  {
    href: "/coordinates",
    title: "Coordinates & Pace",
    desc: "Read your position as MGRS, UTM, and lat/long. Track pace count and leg distance as you move.",
    tag: "MGRS · UTM · Pace count",
    icon: "M12 2v20 M2 12h20",
  },
  {
    href: "/guide",
    title: "Field Reference",
    desc: "Quick-reference card distilled from TC 3-25.26 (Map Reading and Land Navigation): azimuths, terrain features, resection, intersection.",
    tag: "TC 3-25.26",
    icon: "M4 4h11a3 3 0 013 3v13H7a3 3 0 00-3 3z",
  },
];

export default function LandNavHome() {
  return (
    <div className="space-y-6">
      {/* Primary tasks — the two jobs, above the fold, in plain words */}
      <section className="space-y-3">
        <LastPosition />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/coordinates?go=1" className="ln-panel p-5 flex items-center gap-4 hover:border-[var(--ln-od-bright)] transition-colors">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--ln-od)] text-[#0e120a] shrink-0">
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 21s-7-5.2-7-11a7 7 0 1114 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
            </span>
            <div>
              <div className="text-xl font-bold">Where am I?</div>
              <div className="text-sm text-[var(--ln-muted)]">GPS → your grid (MGRS), offline</div>
            </div>
          </Link>
          <Link href="/map" className="ln-panel p-5 flex items-center gap-4 hover:border-[var(--ln-od-bright)] transition-colors">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--ln-od)] text-[#0e120a] shrink-0">
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M12 6l3 9-3-2-3 2z" fill="currentColor"/></svg>
            </span>
            <div>
              <div className="text-xl font-bold">Azimuth to…</div>
              <div className="text-sm text-[var(--ln-muted)]">Direction &amp; distance to your objective</div>
            </div>
          </Link>
        </div>
      </section>

      {/* Hero / what it is */}
      <section className="ln-panel p-5 sm:p-6">
        <div className="ln-chip mb-3">Based on TC 3-25.26 (FM 3-25.26)</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Navigate when the signal dies.{" "}
          <span style={{ color: "var(--ln-od-bright)" }}>Dead reckon it.</span>
        </h1>
        <p className="mt-2 text-[var(--ln-muted)] max-w-2xl text-sm">
          DEADRECKON turns a photo of a paper topographic map into a working
          navigation tool — calibrate it to its grid, drop your GPS on it, and
          measure grid azimuth and distance to your objective. Built to keep
          working when the cell signal doesn&apos;t.
        </p>
      </section>

      {/* Tools grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="ln-panel p-5 hover:border-[var(--ln-od-bright)] transition-colors group">
            <div className="flex items-start gap-3">
              <span className="ln-panel-2 inline-flex items-center justify-center w-11 h-11 shrink-0">
                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="var(--ln-od-bright)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
              </span>
              <div>
                <h2 className="font-semibold text-lg group-hover:text-[var(--ln-od-bright)] transition-colors">
                  {t.title}
                </h2>
                <p className="text-sm text-[var(--ln-muted)] mt-1">{t.desc}</p>
                <div className="ln-chip mt-3">{t.tag}</div>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* How it works */}
      <section className="ln-panel p-5 sm:p-6">
        <h2 className="font-semibold text-lg mb-4">How a typical fix works</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { n: "1", t: "Photograph & calibrate", d: "Snap your topo map. Tap two grid-line intersections and type their grid coordinates. The app locks the photo to the real-world grid." },
            { n: "2", t: "Find yourself", d: "Hit GPS. Your position drops onto the photo. No grid lines on your map? Resection from two known features instead." },
            { n: "3", t: "Shoot the azimuth", d: "Tap your position, then your objective. Read the grid azimuth, the magnetic azimuth to set on your compass, and the distance." },
          ].map((s) => (
            <li key={s.n} className="ln-panel-2 p-4">
              <div className="w-7 h-7 rounded-full bg-[var(--ln-od)] text-[#0e120a] font-bold flex items-center justify-center mb-2">
                {s.n}
              </div>
              <div className="font-medium">{s.t}</div>
              <p className="text-sm text-[var(--ln-muted)] mt-1">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Safety note */}
      <section className="ln-panel p-4 border-l-4" style={{ borderLeftColor: "var(--ln-amber)" }}>
        <p className="text-sm text-[var(--ln-muted)]">
          <strong className="text-[var(--ln-ink)]">Field note.</strong> A phone is a
          supplement to — not a replacement for — a real map, a real lensatic
          compass, and the skills to use them. Batteries die, magnetometers drift
          near metal and vehicles, and GPS lies in canyons. Always carry and know
          how to use the analog tools. Southern Utah backcountry is unforgiving.
        </p>
      </section>
    </div>
  );
}
