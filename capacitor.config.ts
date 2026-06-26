import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the Next.js static export (out/) into a native iOS app. The app's root
// (/) is the DEADRECKON home, so the iOS app launches straight into it — no
// entry-point rewriting needed.
const config: CapacitorConfig = {
  appId: "com.adamgarceau.deadreckon",
  appName: "DEADRECKON",
  webDir: "out",
  ios: {
    contentInset: "always",
    backgroundColor: "#161c12",
  },
  plugins: {
    Geolocation: {},
  },
};

export default config;
