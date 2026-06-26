"use client";

import { useEffect } from "react";

// Native bridge for when the app runs inside the iOS (Capacitor) shell.
// WKWebView doesn't implement navigator.geolocation, so we shim it to the
// Capacitor Geolocation plugin — every existing navigator.geolocation call in
// the app then works unchanged on device. On the web this is a no-op.
interface CapWindow {
  Capacitor?: { isNativePlatform?: () => boolean };
}

export default function CapacitorBridge() {
  useEffect(() => {
    const cap = (window as unknown as CapWindow).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    (async () => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        await Geolocation.requestPermissions().catch(() => {});

        const toPos = (p: {
          coords: {
            latitude: number;
            longitude: number;
            accuracy: number;
            altitude?: number | null;
            altitudeAccuracy?: number | null;
            heading?: number | null;
            speed?: number | null;
          };
          timestamp: number;
        }): GeolocationPosition =>
          ({
            coords: {
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
              altitude: p.coords.altitude ?? null,
              altitudeAccuracy: p.coords.altitudeAccuracy ?? null,
              heading: p.coords.heading ?? null,
              speed: p.coords.speed ?? null,
              toJSON() {
                return this;
              },
            },
            timestamp: p.timestamp,
            toJSON() {
              return this;
            },
          }) as GeolocationPosition;

        const watchers = new Map<number, Promise<string>>();
        let nextId = 1;

        const geo = {
          getCurrentPosition(
            ok: PositionCallback,
            err?: PositionErrorCallback | null,
            opts?: PositionOptions,
          ) {
            Geolocation.getCurrentPosition({
              enableHighAccuracy: opts?.enableHighAccuracy ?? true,
              timeout: opts?.timeout,
            })
              .then((p) => ok(toPos(p)))
              .catch((e) => err?.({ code: 2, message: String(e) } as GeolocationPositionError));
          },
          watchPosition(
            ok: PositionCallback,
            err?: PositionErrorCallback | null,
            opts?: PositionOptions,
          ): number {
            const id = nextId++;
            const w = Geolocation.watchPosition(
              { enableHighAccuracy: opts?.enableHighAccuracy ?? true },
              (p, e) => {
                if (e) {
                  err?.({ code: 2, message: String(e) } as GeolocationPositionError);
                  return;
                }
                if (p) ok(toPos(p));
              },
            );
            watchers.set(id, w);
            return id;
          },
          clearWatch(id: number) {
            const w = watchers.get(id);
            if (w) {
              w.then((wid) => Geolocation.clearWatch({ id: wid })).catch(() => {});
              watchers.delete(id);
            }
          },
        };

        try {
          Object.defineProperty(navigator, "geolocation", {
            value: geo,
            configurable: true,
          });
        } catch {
          /* some WebViews lock navigator.geolocation; nothing we can do */
        }
      } catch {
        /* @capacitor/geolocation not available — web build, ignore */
      }

      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return null;
}
