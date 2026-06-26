import type { Metadata, Viewport } from "next";
import LandNavNav from "./LandNavNav";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import SafetyGate from "./SafetyGate";
import CapacitorBridge from "./CapacitorBridge";
import "./globals.css";
import "./landnav.css";

export const metadata: Metadata = {
  title: "DEADRECKON — Land Navigation",
  description:
    "Navigate when the signal dies. Field land navigation with a photographed topographic map: digital protractor, grid/magnetic azimuths, MGRS coordinates, waypoint nav, terrain reading, live compass and GPS. Based on TC 3-25.26.",
  applicationName: "DEADRECKON",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DEADRECKON",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/deadreckon-icon.svg",
    apple: "/deadreckon-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c2417",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="ln-root min-h-screen flex flex-col">
          <ServiceWorkerRegister />
          <CapacitorBridge />
          <SafetyGate />
          <LandNavNav />
          <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-5 pb-28 pt-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
