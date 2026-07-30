"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "./statistics-model";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/fiord";

export function DetailedLocationMap({
  points,
  onSelect,
}: {
  points: MapPoint[];
  onSelect: (point: MapPoint) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;
    async function mount() {
      if (!container.current || !points.length) return;
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        const first = points[0];
        map = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE,
          center: [first.longitude, first.latitude],
          zoom: points.length === 1
            ? first.precision === "venue" ? 17 : first.precision === "address" ? 16 : first.precision === "city" ? 12 : 4
            : 2,
          attributionControl: { compact: true },
          maxZoom: 19,
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (!map) return;
          map.addSource("expense-locations", {
            type: "geojson",
            cluster: true,
            clusterRadius: 42,
            clusterMaxZoom: 16,
            data: {
              type: "FeatureCollection",
              features: points.map((point) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
                properties: {
                  key: point.key,
                  label: point.label,
                  count: point.count,
                  totalPence: point.totalPence,
                  precision: point.precision,
                },
              })),
            },
          });
          map.addLayer({
            id: "location-clusters",
            type: "circle",
            source: "expense-locations",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#ff4f5e",
              "circle-radius": ["step", ["get", "point_count"], 18, 4, 24, 10, 32],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: "location-cluster-count",
            type: "symbol",
            source: "expense-locations",
            filter: ["has", "point_count"],
            layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
            paint: { "text-color": "#ffffff" },
          });
          map.addLayer({
            id: "expense-location-points",
            type: "circle",
            source: "expense-locations",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#ff4f5e",
              "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 8, 8, 19],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          map.on("click", "location-clusters", async (event) => {
            if (!map) return;
            const feature = map.queryRenderedFeatures(event.point, { layers: ["location-clusters"] })[0];
            const clusterId = Number(feature?.properties?.cluster_id);
            const source = map.getSource("expense-locations") as import("maplibre-gl").GeoJSONSource;
            if (!Number.isFinite(clusterId)) return;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            if (feature.geometry.type !== "Point") return;
            const coordinates = feature.geometry.coordinates as [number, number];
            map.easeTo({ center: coordinates, zoom });
          });
          map.on("click", "expense-location-points", (event) => {
            const feature = event.features?.[0];
            const key = String(feature?.properties?.key ?? "");
            const point = points.find((candidate) => candidate.key === key);
            if (point) onSelect(point);
          });
          for (const layer of ["location-clusters", "expense-location-points"]) {
            map.on("mouseenter", layer, () => { if (map) map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", layer, () => { if (map) map.getCanvas().style.cursor = ""; });
          }
          if (points.length > 1) {
            const bounds = new maplibre.LngLatBounds();
            points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
            map.fitBounds(bounds, { padding: 54, maxZoom: 16, duration: 0 });
          }
        });
        map.on("error", () => setError("The detailed map could not load. Location rankings remain available below."));
      } catch {
        setError("The detailed map could not load. Location rankings remain available below.");
      }
    }
    void mount();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [onSelect, points]);

  if (!points.length) {
    return <div className="map-empty">No usable coordinates are available for this selection.</div>;
  }
  return (
    <>
      <div className="detailed-location-map" ref={container} aria-label="Interactive map of expense locations" />
      {error ? <p className="map-error" role="status">{error}</p> : null}
    </>
  );
}
