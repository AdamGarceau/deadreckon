# DEADRECKON — iOS App Build Handoff

This repo is the **DEADRECKON** land-navigation web app, wrapped as a native iOS
app using **Capacitor 6**. The web app is a Next.js **static export**
(`output: "export"`), so the whole app builds to `out/` and Capacitor serves it
from a `WKWebView`. The app's root (`/`) is the DEADRECKON home, so the iOS app
launches straight into it. Everything works **offline** (PWA service worker +
bundled assets), which is the whole point — land nav happens where there's no
signal.

This document is written for **Claude running on the user's MacBook Pro (M4 Pro)**
to finish turning the web app into an Xcode project and run it on a device.

---

## What's already done (in this repo)

- `capacitor.config.ts` — appId `com.adamgarceau.deadreckon`, appName `DEADRECKON`,
  `webDir: "out"`.
- `src/app/CapacitorBridge.tsx` — mounted in the root layout. On a native
  platform it shims `navigator.geolocation` to the Capacitor Geolocation plugin
  (WKWebView has no geolocation), and sets the status-bar style. On web it's a
  no-op.
- `package.json` scripts:
  - `npm run ios:build` → `next build`
  - `npm run ios:sync` → `npm run ios:build && npx cap sync ios`
  - `npm run ios:open` → `npx cap open ios`
- Capacitor deps already in `package.json`: `@capacitor/core`, `@capacitor/cli`,
  `@capacitor/ios`, `@capacitor/geolocation`, `@capacitor/status-bar`,
  `@capacitor/app`, `@capacitor/haptics`.

The `ios/` native project is **not** committed — it's generated on the Mac with
`npx cap add ios` (standard Capacitor practice; it's a build artifact).

---

## Prerequisites on the Mac

1. **Xcode** (latest from the App Store) + Command Line Tools:
   `xcode-select --install`
2. **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`)
3. **Node 20+** (matches the repo). `node -v` to check.
4. An **Apple ID** signed in to Xcode (Xcode ▸ Settings ▸ Accounts). A free
   account is fine for running on your own device; a paid Apple Developer
   account ($99/yr) is needed for TestFlight / App Store.

---

## First-time build steps

Run from the repo root:

```bash
# 1. install JS deps
npm install

# 2. build the static web app into out/ and rewrite the iOS entry point
npm run ios:build

# 3. create the native iOS project (one time only)
npx cap add ios

# 4. copy the web build + plugins into the iOS project
npx cap sync ios

# 5. open in Xcode
npx cap open ios
```

After the first time, the loop is just:

```bash
npm run ios:sync   # rebuild web + copy into ios/
npx cap open ios   # (or just press Run in Xcode)
```

---

## Xcode configuration (one time)

In Xcode, select the **App** target ▸ **Signing & Capabilities**:

1. **Team**: pick your Apple ID team.
2. **Bundle Identifier**: `com.adamgarceau.deadreckon` (already set; change only
   if it collides).
3. Let Xcode **automatically manage signing**.

### Info.plist — required permission strings

Capacitor's geolocation will crash on launch without usage descriptions. Add
these keys to `ios/App/App/Info.plist` (Xcode: target ▸ Info, or edit the file).
The pedometer/compass features use device motion + orientation, so include those
too:

| Key | Suggested value |
| --- | --- |
| `NSLocationWhenInUseUsageDescription` | `DEADRECKON uses your location to plot where you are on your map and guide you to waypoints.` |
| `NSMotionUsageDescription` | `DEADRECKON uses motion sensors for the step-counter pace tracker.` |

> Compass heading (`DeviceOrientation`) does **not** require a plist key on iOS,
> but the web app asks for permission at runtime via a button — that's expected.

> If you later add background location, you'll also need
> `NSLocationAlwaysAndWhenInUseUsageDescription` and a background mode. Not
> needed for the current foreground-only nav.

---

## Running on a physical iPhone

1. Plug in the iPhone, trust the computer.
2. In Xcode, pick the device from the run-target dropdown (top bar).
3. Press **Run** (⌘R).
4. First run: on the phone, **Settings ▸ General ▸ VPN & Device Management** ▸
   trust your developer certificate.
5. Test the real-device features that don't work in the simulator:
   - **GPS** (calibrate map, "show me where I am")
   - **Compass** heading
   - **Pedometer** pace count (walk around)

The simulator is fine for layout/UI but has no real GPS/compass/motion.

---

## Notes / gotchas

- **Don't run `npx cap copy` without `ios:build` first** — it copies whatever is
  in `out/`. Always `npm run ios:sync` so the web build is fresh.
- The app launches at `out/index.html`, which is the DEADRECKON home (`/`).
- **Offline**: the service worker (`public/sw.js`, cache `deadreckon-v3`) caches
  the shell. Inside the native bundle everything is local anyway, so offline is
  automatic. Satellite/SOS texting is an OS-level feature — the app just needs to
  not require connectivity, which it doesn't.
- **App icon / splash**: generate with `@capacitor/assets` later
  (`npx @capacitor/assets generate --ios`) from `public/deadreckon-icon.svg`
  (export a 1024×1024 PNG first). Not required to run.
- **three.js / 3D terrain** fetches elevation tiles from AWS over the network —
  that part needs signal. Everything else is offline.

---

## TL;DR for Mac Claude

```bash
npm install
npm run ios:build
npx cap add ios
npx cap sync ios
npx cap open ios
# then in Xcode: set Team, add the two Info.plist permission strings, Run on device
```
