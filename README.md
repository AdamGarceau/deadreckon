# DEADRECKON

**Navigate when the signal dies.**

A self-contained, offline-capable land-navigation app built from the manual
**TC 3-25.26 (FM 3-25.26), Map Reading and Land Navigation**. Photograph a paper
topographic map, calibrate it to its grid, drop your GPS position on it, and
shoot grid/magnetic azimuths to your objective — all client-side, no signal
required. Deploys as a PWA and wraps into a native iOS app via Capacitor.

Live: **https://deadreckon.adamgarceau.com**

## Features

- **Map workspace** — photograph a topo map, calibrate to the grid (plain-language
  go/no-go verdict in meters, multi-point conformal fit with residuals, datum
  selector), on-map digital protractor (grid/magnetic/back-azimuth, distance,
  mils), live GPS plotting, automatic terrain reading (steep ground + water from
  contours), hazard pins, and a 3D terrain drape over real elevation.
- **Go To** — waypoint navigation with a follow-the-arrow compass and a true
  dead-reckon mode (plot by azimuth + distance in meters or paces, with
  uncertainty, resection nudge, and return route — zero GPS).
- **Compass** — live magnetometer, declination/LARS solver, grid⇄magnetic
  conversion, back azimuth, mils.
- **Coordinates** — GPS → MGRS / UTM / lat-lon (WGS84), copy-for-SOS, converters,
  pace count (manual + accelerometer).
- **Field reference** distilled from TC 3-25.26. Night/Day high-contrast themes.
  Defaults tuned for the St. George, Utah area (UTM zone 12S).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
```

The app is a Next.js **static export** (`output: "export"`) — the whole thing is
a folder of files, so it works offline and drops cleanly into a native shell.

## iOS app

See **[IOS_BUILD.md](./IOS_BUILD.md)** for the full Capacitor → Xcode handoff.
Quick version:

```bash
npm install
npm run ios:build
npx cap add ios
npx cap sync ios
npx cap open ios
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the static
export and publishes it to Cloudflare Pages at `deadreckon.adamgarceau.com`.
Requires repo secret `CLOUDFLARE_API_TOKEN` (Pages: Edit); optional
`CLOUDFLARE_DNS_TOKEN` (Zone:DNS:Edit) to auto-manage the CNAME.

## Field note

A phone is a supplement to — never a replacement for — a real map, a real
lensatic compass, and the skills to use them. Batteries die, magnetometers drift
near metal, and GPS lies in canyons. Carry the analog tools.
