import Link from "next/link";

export const metadata = {
  title: "Field Reference — DEADRECKON",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ln-panel p-5">
      <h2 className="font-semibold text-lg mb-3" style={{ color: "var(--ln-od-bright)" }}>
        {title}
      </h2>
      <div className="space-y-2 text-sm text-[var(--ln-ink)]">{children}</div>
    </section>
  );
}

function Term({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-[var(--ln-od-bright)]">›</span>
      <p>
        <strong>{t}.</strong> <span className="text-[var(--ln-muted)]">{d}</span>
      </p>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Field Reference</h1>
        <p className="text-[var(--ln-muted)] text-sm mt-1">
          Working notes distilled from <strong>TC 3-25.26 — Map Reading and Land
          Navigation</strong> (Nov 2013, HQ Dept. of the Army). Quick reference,
          not a substitute for the manual or training.
        </p>
      </div>

      <Section title="Grid coordinates (MGRS)">
        <Term t="Read right, then up" d="Give the easting (left→right) before the northing (bottom→top). “Right and up.”" />
        <Term t="Precision" d="A grid like 12S AB 1234 5678 is 8 digits = 10 m. 6 digits = 100 m, 10 digits = 1 m. Always give the same number of digits for easting and northing." />
        <Term t="Grid zone + 100k square" d="Full MGRS = grid-zone designator (e.g. 12S) + two-letter 100,000 m square (e.g. AB) + the numeric easting/northing." />
        <Term t="St. George" d="Southern Utah sits in grid zone 12S. The Coordinates tab reads your GPS straight into MGRS." />
      </Section>

      <Section title="The three norths & the G-M angle">
        <Term t="True north (TN)" d="Toward the geographic North Pole — the star on the declination diagram." />
        <Term t="Grid north (GN)" d="The direction the map’s vertical grid lines point." />
        <Term t="Magnetic north (MN)" d="Where the compass needle points; it drifts over time and varies by location." />
        <Term t="G-M angle" d="The angle between grid north and magnetic north, printed in the declination diagram. Use it to convert between grid and magnetic azimuths." />
        <p className="ln-panel-2 p-3 mt-2">
          Two values appear in the diagram. If GN and MN are on{" "}
          <strong>opposite</strong> sides of TN, <strong>add</strong> the
          absolute values; if on the <strong>same</strong> side,{" "}
          <strong>subtract</strong> them — that total is the G-M angle.
        </p>
      </Section>

      <Section title="LARS — converting azimuths">
        <p>
          <strong>L</strong>eft <strong>A</strong>dd, <strong>R</strong>ight{" "}
          <strong>S</strong>ubtract — applied when converting a{" "}
          <strong>grid azimuth → magnetic (compass) heading</strong>:
        </p>
        <Term t="MN left of GN" d="ADD the G-M angle to the grid azimuth." />
        <Term t="MN right of GN" d="SUBTRACT the G-M angle from the grid azimuth." />
        <Term t="Going the other way" d="Magnetic → grid reverses it (right add, left subtract)." />
        <p className="text-[var(--ln-muted)]">
          In Southern Utah magnetic north is east (right) of grid north, so you{" "}
          <strong>subtract</strong> ~11° going grid→magnetic. The{" "}
          <Link href="/compass" className="underline text-[var(--ln-blue)]">Compass tab</Link>{" "}
          does this for you.
        </p>
      </Section>

      <Section title="Azimuths & distance">
        <Term t="Azimuth" d="A horizontal angle measured clockwise from a north reference, 0–360°. Grid azimuths are measured from grid north with a protractor." />
        <Term t="Back azimuth" d="Reverse direction: add 180° if the azimuth is under 180°, subtract 180° if it’s 180° or more." />
        <Term t="Mils" d="6400 mils = 360°. 1° ≈ 17.78 mils. Artillery and many compasses use mils." />
        <Term t="Measuring on the map" d="Plot start and end, draw the line, then read the angle against grid north. The Map tab’s protractor does this once the map is calibrated." />
      </Section>

      <Section title="Terrain features">
        <Term t="Five major" d="Hill, ridge, valley, saddle, depression." />
        <Term t="Three minor" d="Draw, spur, cliff." />
        <Term t="Two supplementary" d="Cut and fill (man-made)." />
        <Term t="Contour lines" d="Connect points of equal elevation. Close together = steep; far apart = gentle. The contour interval is in the marginal data." />
        <Term t="Terrain association" d="Navigate by matching the ground to the map — handrails, catching features, and checkpoints — rather than azimuth alone." />
      </Section>

      <Section title="Finding your location">
        <Term t="Resection" d="Determine your position by shooting back-azimuths to two or three known, identifiable features and plotting them; you’re where the lines cross." />
        <Term t="Modified resection" d="Same idea when you’re on a linear feature (road, stream) — one azimuth to a known point fixes you along it." />
        <Term t="Intersection" d="Locate an unknown distant point by shooting azimuths to it from two known positions." />
        <Term t="Dead reckoning" d="Hold a known azimuth and track distance by pace count to arrive at a point you can’t see." />
      </Section>

      <Section title="Moving smart">
        <Term t="Pace count" d="Count every time the same foot strikes. Calibrate over 100 m; most people run ~110–125 paces per 100 m on flat ground (more uphill/rough)." />
        <Term t="Steering marks" d="Pick a distant feature on your azimuth, walk to it, then pick the next — keeps you straight without staring at the compass." />
        <Term t="Deliberate offset" d="Aim intentionally left or right of a point on a linear feature (~3° per 100 m of offset wanted) so you know which way to turn when you hit it." />
        <Term t="Attack points & handrails" d="Navigate to an obvious nearby feature (attack point), then fine-navigate to the objective. Follow linear features (handrails) when they parallel your route." />
      </Section>

      <Section title="Don't get killed">
        <Term t="GPS supplements the map" d="It doesn’t replace map-and-compass skills. Canyons, cliffs, and tree cover degrade GPS; carry analog tools and know them cold." />
        <Term t="Magnetic interference" d="Vehicles, weapons, power lines, and even a phone deflect a compass — and a phone’s magnetometer is worse. Step away from metal and verify." />
        <Term t="Battery & water" d="Electronics fail. In Southern Utah, heat and dehydration kill faster than a wrong azimuth. Plan water, tell someone your route, set a turnaround time." />
      </Section>

      <Section title="Check the math yourself">
        <p>Don&apos;t take the app&apos;s word for it — these are worked examples you can reproduce by hand:</p>
        <Term t="Grid → magnetic (FM example)" d="Grid azimuth 199.5° with a 9.5° EAST G-M angle: 199.5 − 9.5 = 190.0° magnetic. (East G-M angle subtracts going grid→magnetic; the Compass tab gives the same answer.)" />
        <Term t="Back azimuth" d="From 65°: 65 + 180 = 245°. From 245°: 245 − 180 = 65°." />
        <Term t="Mils" d="90° × 6400/360 = 1600 mils." />
        <Term t="Your position" d="On the Coordinates tab, your GPS MGRS should match a paper plot of the same lat/long to within your fix accuracy — if it doesn't, suspect datum (WGS84 vs NAD27) or a bad fix." />
      </Section>

      <div className="ln-panel p-4 text-center text-xs text-[var(--ln-muted)]">
        Source: TC 3-25.26 (FM 3-25.26), Map Reading and Land Navigation —
        Headquarters, Department of the Army, November 2013. Public doctrine,
        summarized for field reference.
      </div>
    </div>
  );
}
