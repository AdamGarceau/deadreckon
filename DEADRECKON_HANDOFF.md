# DEADRECKON — Project Handoff for Desktop Claude

**For:** Claude running on Adam's MacBook Pro (M4 Pro)
**From:** Claude Code on the web (session that built the app)
**Date:** 2026-06-27
**User:** Adam Garceau — adam@grabyourassets.com — lives in **St. George, Utah** (UTM zone 12S)

---

## 0. TL;DR — what you're being asked to do

DEADRECKON is a finished, build-verified **offline land-navigation web app** (based on the Army manual **TC 3-25.26**). It's already live at **https://deadreckon.adamgarceau.com**. It has been extracted into its **own standalone repo** and prepped to become a **native iOS app via Capacitor**.

The web session that built it **could not create the new GitHub repo** (its GitHub token was scoped to `adamgya/gya` only — repo creation returns 403). Your job:

1. **Create the `deadreckon` GitHub repo and push the project to it.**
2. **Build the iOS app in Xcode and run it on Adam's iPhone.**

Everything you need is below. Two ways to get the code (either works):

- **Bundle (Adam has this file):** `deadreckon.bundle` — a full git repo.
  `git clone deadreckon.bundle deadreckon`
- **Branch on the existing repo:** the standalone project is pushed to
  `github.com/AdamGYA/GYA` on branch **`deadreckon-standalone`** (root of that
  branch IS the standalone project — it does not share history with `main`).
  `git clone -b deadreckon-standalone https://github.com/AdamGYA/GYA deadreckon`

---

## 1. What DEADRECKON is

A self-contained land-nav tool built from the request: *"help me do land nav with a topographical map… Digital protractor, azimuth, the works,"* and later *"Eventually I want something I can make into an Apple iPhone app. So it should work offline."*

It turns **a photo of a paper topographic map** into a working navigation instrument:
photograph the map → calibrate it to its grid → drop your GPS onto it → measure grid/magnetic azimuth and distance to your objective. **All client-side. Works with no signal.** The name **DEADRECKON** was chosen by Adam (he rejected "Azimuth" as not cool enough and "Cairn" as "lame / needs to be more hardcore").

### Features
- **Map workspace** (`/map`) — photograph a topo map; calibrate to the grid with a plain-language go/no-go verdict in meters (multi-point conformal fit, residuals, datum selector incl. NAD27 warning); on-map **digital protractor** (grid/magnetic/back-azimuth, distance, mils); plot live GPS on the photo; automatic **terrain reading** (steep ground from contour density, water from blue); **hazard pins** with azimuth-crossing warnings; **3D terrain drape** over real elevation (three.js).
- **Go To** (`/navigate`) — waypoint navigation (reorderable), follow-the-arrow compass (honest LIVE-HEADING vs BEARING-ONLY + degraded-GPS flags), and a true **Dead Reckon mode** (plot position by azimuth + distance in meters *or* paces, with ± uncertainty, resection nudge, return route — zero GPS).
- **Compass** (`/compass`) — live magnetometer, declination/LARS solver, grid⇄magnetic conversion, back azimuth, mils.
- **Coordinates** (`/coordinates`) — GPS → MGRS / UTM / lat-lon (WGS84, precision capped to fix accuracy), **Copy position for SOS / satellite text**, converters, pace count (manual + accelerometer pedometer).
- **Field reference** (`/guide`) — quick-reference card distilled from TC 3-25.26.
- **Night/Day** high-contrast themes (sunlight legibility). Defaults tuned for St. George, UT.

### How it was validated (Adam asked for this rigor)
- Self-contained WGS84 coordinate math with a **25-case regression suite** (all passing).
- A synthetic **Army review board** + multi-TM research reviewed the approach.
- Name + customer model came from **ICP/CEP research**.
- Usability hardened over **5 Google-Ventures-style sprint rounds** with grounded personas (given realistic character flaws) + a designer + a technical writer, reaching **9/10 across all reviewers** (up from a round-1 low of 4).
- Coordinate math cross-checked against a real **CalTopo paper map** (USNG zone 12S) — the app independently computed the same grid square.

---

## 2. Current state — what's done

- ✅ **Live web app:** https://deadreckon.adamgarceau.com (302 root → app, title "DEADRECKON — Land Navigation").
- ✅ **Standalone repo built & build-verified** (`next build` green, 7 static routes).
- ✅ **App moved to root** in the standalone version: `/` is home, then `/map`, `/navigate`, `/compass`, `/coordinates`, `/guide`. (In the *original* GYA monorepo it lived under `/landnav`.) All nav links, service worker, and manifest were rewritten to match root.
- ✅ **Trimmed dependencies** — only `next`, `react`, `react-dom`, `three`, and Capacitor packages. Dropped all ads-dashboard deps (Supabase, Anthropic SDK, recharts, OpenNext).
- ✅ **Capacitor 6 iOS wrapper** configured (`capacitor.config.ts`, appId `com.adamgarceau.deadreckon`).
- ✅ **`src/app/CapacitorBridge.tsx`** — on native iOS, shims `navigator.geolocation` (WKWebView has none) to the Capacitor Geolocation plugin, so all existing GPS code works unchanged on device; sets status-bar style. No-op on web.
- ✅ **Own deploy workflow** `.github/workflows/deploy.yml` → Cloudflare Pages → `deadreckon.adamgarceau.com`.
- ✅ **`IOS_BUILD.md`** and **`README.md`** in the repo.

### Why it was extracted to its own repo (Adam: "Separate project" → "Extract to its own repo")
It originally lived inside the **GYA** monorepo (an unrelated Google-Ads dashboard). That repo's old Cloudflare Pages project kept **failing builds** on every push, because it runs an OpenNext (server) build that's incompatible with this app's static export. Those failures are harmless noise but annoying. A standalone repo (a) stops that conflict permanently and (b) is clean to wrap as an iOS app.

---

## 3. YOUR STEP 1 — create the repo and push

```bash
# Option A: from the bundle Adam gives you
git clone deadreckon.bundle deadreckon
cd deadreckon
git remote remove origin 2>/dev/null || true

# create the empty repo (gh CLI, logged in as AdamGYA)
gh repo create AdamGYA/deadreckon --private --source=. --remote=origin --push
# (or make it public: swap --private for --public)
```

If you prefer manual:
```bash
# create an empty repo named "deadreckon" (no README) on github.com, then:
git remote add origin https://github.com/AdamGYA/deadreckon.git
git branch -M main
git push -u origin main
```

### Then add the deploy secrets to the new repo
Settings → Secrets and variables → Actions → New repository secret:

- **`CLOUDFLARE_API_TOKEN`** — token scoped to *Cloudflare Pages: Edit*. **Required.**
- **`CLOUDFLARE_DNS_TOKEN`** — token with *Zone:DNS:Edit* (optional; lets the
  workflow auto-manage the CNAME. Without it, the DNS step just warns.)

> ⚠️ **Never paste these tokens into chat or commit them.** Only add them through
> the GitHub Actions secrets UI. (Adam has done this before for the GYA repo.)

The first push to `main` triggers `.github/workflows/deploy.yml`, which builds the
static export and publishes it to the **`azimuth-landnav`** Cloudflare Pages project
(the one already serving `deadreckon.adamgarceau.com`).

### Cloudflare facts (public IDs, not secrets)
- Account ID: `3d2364de1180a79c2e39a6bdbf1f377c`
- Zone ID (adamgarceau.com): `d46e6bd74b99b49b43c002ebb3334f84`
- Pages project name: `azimuth-landnav`
- Custom domain: `deadreckon.adamgarceau.com` → CNAME to `azimuth-landnav.pages.dev` (proxied)

> Note: the domain is already attached and live from the *old* GYA workflow. Once
> this standalone repo deploys, it becomes the source of truth. You can then delete
> `.github/workflows/deploy-landnav.yml` from the GYA repo to stop double-deploys
> (optional cleanup).

---

## 4. YOUR STEP 2 — build the iOS app (this is the main event)

The full guide is `IOS_BUILD.md` in the repo. Essentials:

### Prerequisites on the Mac
1. **Xcode** (App Store) + `xcode-select --install`
2. **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`)
3. **Node 20+**
4. **Apple ID** signed into Xcode (Settings ▸ Accounts). Free account works for
   running on your own device; paid Apple Developer ($99/yr) needed for TestFlight/App Store.

### First-time build
```bash
npm install
npm run ios:build        # = next build (produces out/)
npx cap add ios          # generates the native Xcode project (one time)
npx cap sync ios         # copies web build + plugins into ios/
npx cap open ios         # opens Xcode
```
After that, the loop is just: `npm run ios:sync` then press Run in Xcode.

### Xcode config (one time)
- **Signing & Capabilities** → pick your **Team** (your Apple ID). Let Xcode auto-manage signing.
- **Bundle Identifier**: `com.adamgarceau.deadreckon` (already set).
- **Info.plist** — add these or the app crashes when it asks for location/motion:

| Key | Value |
| --- | --- |
| `NSLocationWhenInUseUsageDescription` | `DEADRECKON uses your location to plot where you are on your map and guide you to waypoints.` |
| `NSMotionUsageDescription` | `DEADRECKON uses motion sensors for the step-counter pace tracker.` |

  (Compass/DeviceOrientation needs no plist key; the app asks at runtime via a button.)

### Run on a real iPhone
1. Plug in, trust the computer.
2. Pick the device in Xcode's run-target dropdown → **Run (⌘R)**.
3. On the phone: Settings ▸ General ▸ VPN & Device Management → trust your dev cert.
4. **Test on the physical device** (simulator has no real sensors): GPS ("where am I" / calibrate), compass heading, pedometer pace count (walk around).

### iOS gotchas
- `ios/` and `android/` are **gitignored** — they're generated artifacts.
- The app root (`/`) is the DEADRECKON home, so it launches straight into the app
  (no redirect script — unlike the earlier GYA version, that hack is gone).
- Service worker cache is `deadreckon-v3`. Inside the native bundle everything is
  local, so offline is automatic. Satellite/SOS texting is an OS feature — the app
  just needs to not require connectivity, which it doesn't.
- **3D terrain** (three.js) fetches elevation tiles from AWS over the network — that
  one feature needs signal. Everything else is fully offline.
- App icon/splash: later run `npx @capacitor/assets generate --ios` from a 1024×1024
  PNG of `public/deadreckon-icon.svg`. Not required to run.

---

## 5. Repo structure (standalone)

```
deadreckon/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout (html/body, ln-root theme, nav, SW, Capacitor, safety gate)
│   │   ├── globals.css           # tailwind import + base + iOS safe-area
│   │   ├── landnav.css           # tactical/topo theme (scoped .ln-root, night/day modes)
│   │   ├── page.tsx              # home (/)
│   │   ├── map/page.tsx          # largest file: calibrate/measure/hazard modes, magnifier, 3D, GPS
│   │   ├── map/Terrain3D.tsx     # lazy three.js 3D drape over elevation
│   │   ├── navigate/page.tsx     # waypoints + Dead Reckon
│   │   ├── compass/page.tsx
│   │   ├── coordinates/page.tsx
│   │   ├── guide/page.tsx
│   │   ├── LandNavNav.tsx        # top bar + bottom tab bar + Day/Night toggle
│   │   ├── SafetyGate.tsx        # first-run "backup not primary" acknowledgment
│   │   ├── ServiceWorkerRegister.tsx
│   │   ├── CapacitorBridge.tsx   # native geolocation shim
│   │   ├── NumberField.tsx       # string-buffered number input (fixes decimal "." bug)
│   │   └── LastPosition.tsx
│   └── lib/landnav/
│       ├── coords.ts             # WGS84 UTM/MGRS/lat-lon (Snyder), azimuth, G-M, mils, dead reckon, haversine
│       ├── transform.ts          # conformal (Helmert) georeferencing w/ reflection handling; least-squares
│       ├── region.ts             # DEFAULT_REGION = St. George (37.0965,-113.5684, zone 12, decl ~10.9)
│       ├── declination.ts        # solveDeclination, LARS rule (Left Add Right Subtract)
│       ├── terrain.ts            # contour-density → steep; blue → water
│       ├── elevation.ts          # Terrarium elevation tiles (AWS open data, CORS-enabled)
│       └── pedometer.ts          # accelerometer step peak detection
├── public/
│   ├── deadreckon-icon.svg
│   ├── manifest.webmanifest      # name DEADRECKON, start_url "/", scope "/"
│   ├── sw.js                     # offline SW, cache deadreckon-v3, network-first shell
│   └── sample-topo.svg           # demo map
├── capacitor.config.ts
├── next.config.ts                # output: "export", trailingSlash: true, images.unoptimized
├── tsconfig.json / postcss.config.mjs / eslint.config.mjs
├── package.json                  # trimmed; ios:build / ios:sync / ios:open scripts
├── .github/workflows/deploy.yml  # Cloudflare Pages deploy on push to main
├── IOS_BUILD.md
└── README.md
```

---

## 6. Key math / correctness notes (so you don't "fix" a non-bug)

- **Grid → magnetic** uses `norm360(gridAz − gmAngle)` where G-M angle is EAST-positive.
  Confirmed correct against the FM worked example: grid 199.5 − 9.5°E = magnetic 190.
  (LARS: for east declination you *subtract* going grid→magnetic.)
- **G-M angle** = declination − grid convergence. For St. George, declination ≈ 10.9°,
  convergence ≈ −1.5°, so gmAngle ≈ 12.4°.
- **Map photo georeferencing** must handle a **reflected** conformal fit: a north-up
  photo has y increasing *downward*, so `buildTransform` fits both direct and reflected
  orientations and keeps the lower-RMS one. (An earlier bug gave RMS ~510 before this.)
- **Calibration verdict is scale-aware**: "sloppy/good" thresholds scale with meters-per-pixel
  (`goodMax = max(15, mpp*6)`), because a ±16 m result at ~4 m/px is just tap precision
  (≈4 px), not a coordinate error. Adam hit this and thought his coords were wrong — they weren't.
- **NumberField** exists because a plain number-bound input reformatted "12." → "12",
  making the decimal point un-typeable (Adam: *"The . Does not work"*). It string-buffers input.

---

## 7. History / decisions (condensed conversation record)

This is the substance of the whole build conversation, in order:

1. **Kickoff:** Adam sent a photo of TC 3-25.26 and asked for a land-nav web app on a
   subdomain of AdamGarceau.com — photograph a topo map, find where you are / where
   you're going, digital protractor, azimuth, "the works."
2. **Research rigor:** "Do deep research. Make an army review board / synthetic panel…
   Consult multiple TMs." → built the review board + multi-TM research.
3. **Location:** "We live in St. George Utah" → defaults tuned to zone 12S.
4. **Calculators + offline + iOS:** "Calculators would be good for everything…
   Eventually I want an Apple iPhone app. So it should work offline. But let's do this
   first on the website."
5. **Usability:** run 5 customer agents + Google Ventures sprints; iterate "until you
   get at least a 9/10"; give personas "character flaws like normal people"; add ICP/CEP
   research; add a technical writer and designer. → reached 9.0 avg.
6. **Terrain:** show terrain hazards; identify terrain features; render a 3D image of
   the map. → terrain analysis + three.js 3D drape.
7. **GPS-like nav:** "put in all my coordinates and follow the compass without thinking
   … Like a GPS"; "I have cords, just need them plotted"; "Waypoints … so I can reorder
   them"; "calibrate and then show me where I am on the map using my GPS." → waypoints +
   live GPS plot + follow-arrow.
8. **Offline/SOS:** discussed Starlink satellite SOS texting — app must not require
   connectivity (it doesn't); added "copy position for SOS."
9. **Pace count:** Adam has a Garmin watch; others have Apple Watch → manual + automatic
   accelerometer pedometer.
10. **Naming:** rejected "Azimuth" and "Cairn" → chose **DEADRECKON**. "Ask our audience"
    informed it.
11. **Domain:** wanted it on AdamGarceau.com → `deadreckon.adamgarceau.com` via a dedicated
    Cloudflare Pages project + GitHub Action. DNS needed a Zone:DNS:Edit token
    (`CLOUDFLARE_DNS_TOKEN`); once added, the domain went live.
12. **Bug reports fixed:** "3D just flashes" (iOS memory crash — fixed by downscaling the
    photo texture to ≤2048 px, DPR cap, WebGL context-loss handling); declination "." not
    working (NumberField); calibration "Sloppy ±16m" with correct coords (explained tap
    precision + made verdict scale-aware); stale cache serving old version (SW → network-first).
13. **Accuracy check:** validated against a CalTopo paper map — math internally consistent
    and matching.
14. **iOS prep:** "Start prepping this for Xcode so it can be an iPhone app. We want to have
    Claude on my MacBook Pro M4 Pro making this into an app." → Capacitor scaffolding + IOS_BUILD.md.
15. **Separate project:** the GYA repo's legacy Cloudflare build kept failing on this app's
    commits (OpenNext vs static export). Adam: "Separate project" → chose **Extract to its
    own repo**. → this standalone `deadreckon` project was created and build-verified. The
    web session couldn't create the GitHub repo (token scoped to `adamgya/gya`), so it
    handed off the bundle + this doc.

### Standing preferences to respect
- **Never** paste API keys/tokens into chat — only GitHub Actions secrets.
- Confirm before outward-facing / hard-to-reverse actions.
- Adam wants the **best-case scenario**; he's fine giving more Cloudflare/GitHub access
  to get there.
- Field-safety framing matters to him: the app must always tell users it's a *backup*,
  not a replacement for a real map + lensatic compass (there's a first-run SafetyGate).

---

## 8. Verify after you deploy / build

- Web: `https://deadreckon.adamgarceau.com` loads, title "DEADRECKON — Land Navigation",
  tabs work, Day/Night toggles, "Where am I?" asks for GPS.
- iOS on device: GPS plots your position; compass heading responds when you rotate the
  phone; pace count increments as you walk; 3D loads (with signal); app works in Airplane
  Mode after first load (offline).

Good luck. The app is solid — the remaining work is packaging, not fixing.
