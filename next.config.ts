import type { NextConfig } from "next";

// Static export so the whole app is a folder of files — works offline and
// wraps cleanly into the iOS (Capacitor) WKWebView bundle.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
