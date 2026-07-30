"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "./statistics-model";

type MapLayerId = "dark" | "detailed" | "classic";

const MAP_LAYER_STORAGE_KEY = "expense-tracker-map-layer";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAP_LAYERS: Record<
  MapLayerId,
  { label: string; url: string; attribution: string; maxZoom: number }
> = {
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 20,
  },
  detailed: {
    label: "Detailed",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 20,
  },
  classic: {
    label: "Classic",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
  },
};

function initialLayer(): MapLayerId {
  try {
    const saved = window.localStorage.getItem(MAP_LAYER_STORAGE_KEY);
    if (saved === "dark" || saved === "detailed" || saved === "classic") {
      return saved;
    }
  } catch {
    // Safari can block storage in a restricted browsing context.
  }
  const theme = document.documentElement.dataset.theme;
  if (theme === "light") return "detailed";
  if (theme === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "detailed";
}

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

        let activeLayerLoaded = false;
        const baseLayers = Object.fromEntries(
          (Object.entries(MAP_LAYERS) as [
            MapLayerId,
            (typeof MAP_LAYERS)[MapLayerId],
          ][]).map(([, layer]) => {
            const tiles = leaflet.tileLayer(layer.url, {
              attribution: layer.attribution,
              maxZoom: layer.maxZoom,
              subdomains: "abcd",
            });
            tiles.on("tileload", () => {
              if (!map?.hasLayer(tiles)) return;
              activeLayerLoaded = true;
              if (!cancelled) setTileStatus("ready");
            });
            return [layer.label, tiles];
          }),
        );
        const selectedLayer = initialLayer();
        baseLayers[MAP_LAYERS[selectedLayer].label].addTo(map);
        const layerControl = leaflet.control
          .layers(baseLayers, undefined, {
            collapsed: true,
            position: "topright",
          })
          .addTo(map);
        const toggle = layerControl
          .getContainer()
          ?.querySelector<HTMLElement>(".leaflet-control-layers-toggle");
        toggle?.setAttribute("aria-label", "Choose map layer");
        toggle?.setAttribute("title", "Choose map layer");
        map.on("baselayerchange", (event) => {
          activeLayerLoaded = false;
          setTileStatus("loading");
          const selected = (Object.entries(MAP_LAYERS) as [
            MapLayerId,
            (typeof MAP_LAYERS)[MapLayerId],
          ][]).find(([, layer]) => layer.label === event.name)?.[0];
          if (selected) {
            try {
              window.localStorage.setItem(MAP_LAYER_STORAGE_KEY, selected);
            } catch {
              // The selected layer still works when storage is unavailable.
            }
          }
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            if (!activeLayerLoaded && !cancelled) setTileStatus("failed");
          }, 12_000);
        });

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
          if (!activeLayerLoaded && !cancelled) setTileStatus("failed");
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
          Loading map detail…
        </p>
      ) : null}
      {tileStatus === "failed" ? (
        <p className="map-error" role="status">
          This map layer is unavailable, but the location dots remain
          interactive. Try another layer from the control in the top right.
        </p>
      ) : null}
    </>
  );
}
