"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "./statistics-model";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function detailZoom(point: MapPoint): number {
  if (point.precision === "venue") return 18;
  if (point.precision === "address") return 17;
  if (point.precision === "city") return 12;
  return 5;
}

export function DetailedLocationMap({
  points,
  onSelect,
}: {
  points: MapPoint[];
  onSelect: (point: MapPoint) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [tileStatus, setTileStatus] = useState<
    "loading" | "ready" | "failed"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    let timeoutId: number | undefined;

    async function mount() {
      if (!container.current || !points.length) return;
      try {
        const leaflet = await import("leaflet");
        if (cancelled || !container.current) return;
        const first = points[0];
        map = leaflet.map(container.current, {
          attributionControl: true,
          zoomControl: true,
          preferCanvas: false,
        });

        let tileErrors = 0;
        let tileLoaded = false;
        const tiles = leaflet.tileLayer(TILE_URL, {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        });
        tiles.on("tileload", () => {
          tileLoaded = true;
          if (!cancelled) setTileStatus("ready");
        });
        tiles.on("tileerror", () => {
          tileErrors += 1;
          if (!tileLoaded && tileErrors >= 4 && !cancelled) {
            setTileStatus("failed");
          }
        });
        tiles.addTo(map);

        const bounds = leaflet.latLngBounds([]);
        for (const point of points) {
          const location = leaflet.latLng(point.latitude, point.longitude);
          bounds.extend(location);
          const marker = leaflet.circleMarker(location, {
            bubblingMouseEvents: false,
            color: "#ffffff",
            fillColor: "#ff4f5e",
            fillOpacity: 0.92,
            opacity: 1,
            radius: Math.min(22, 8 + Math.sqrt(point.count - 1) * 5),
            weight: 2,
          });
          const tooltip = document.createElement("span");
          tooltip.textContent = `${point.label} · ${point.count} receipt${point.count === 1 ? "" : "s"}`;
          marker.bindTooltip(tooltip, { direction: "top", offset: [0, -6] });
          marker.on("click", () => onSelect(point));
          marker.addTo(map);
        }

        if (points.length === 1) {
          map.setView([first.latitude, first.longitude], detailZoom(first));
        } else {
          map.fitBounds(bounds, { padding: [54, 54], maxZoom: 16 });
        }

        timeoutId = window.setTimeout(() => {
          if (!tileLoaded && !cancelled) setTileStatus("failed");
        }, 12_000);
      } catch {
        if (!cancelled) setTileStatus("failed");
      }
    }

    void mount();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      map?.remove();
    };
  }, [onSelect, points]);

  if (!points.length) {
    return <div className="map-empty">No usable coordinates are available for this selection.</div>;
  }
  return (
    <>
      <div
        className="detailed-location-map"
        ref={container}
        aria-label="Interactive map of expense locations"
      />
      {tileStatus === "loading" ? (
        <p className="map-status" role="status">
          Loading street detail…
        </p>
      ) : null}
      {tileStatus === "failed" ? (
        <p className="map-error" role="status">
          The street background is unavailable, but the location dots remain
          interactive. The location ranking below is also available.
        </p>
      ) : null}
    </>
  );
}
