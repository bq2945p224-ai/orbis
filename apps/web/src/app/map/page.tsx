"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/lib/api";
import { claimSizeForZoom } from "@orbis/contracts";

type SearchHit = {
  type: string;
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type ParcelFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
};

type OwnedParcel = {
  parcelId: string;
  label: string | null;
  districtName: string;
  cityName: string;
  areaM2: number;
  latitude: number;
  longitude: number;
  geometry: ParcelFeature["geometry"];
};

type ResourceType = {
  key: string;
  name: string;
  unit: string;
  heatmapColor: string;
};

type CellPreview = {
  ix: number;
  iy: number;
  areaM2: number;
  cellSizeM: number;
  latitude: number;
  longitude: number;
  status: "available" | "owned";
  priceCents: number;
  seller: string;
  terrain?: string;
  elevationM?: number | null;
  resources: Array<{
    resourceKey: string;
    resourceName: string;
    richness: number;
    unit: string;
    label: string | null;
  }>;
};

/**
 * Landscape basemap only (no road/border/label cartography).
 * Esri World Imagery stays sharp through high zoom; DEM adds relief.
 */
const TERRAIN_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      // Native tiles commonly available through ~19; beyond that MapLibre overzooms smoothly.
      maxzoom: 19,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
    terrain: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
      attribution: "Mapzen / AWS Terrain Tiles",
    },
  },
  layers: [
    {
      id: "land",
      type: "background",
      paint: { "background-color": "#1a1f14" },
    },
    {
      id: "imagery",
      type: "raster",
      source: "imagery",
      paint: {
        "raster-opacity": 1,
        "raster-fade-duration": 150,
        "raster-resampling": "linear",
        // Slightly mute so it reads as terrain, not a street map.
        "raster-saturation": -0.15,
        "raster-contrast": 0.08,
      },
    },
    {
      id: "hillshade",
      type: "hillshade",
      source: "terrain",
      paint: {
        "hillshade-exaggeration": 0.28,
        "hillshade-shadow-color": "#0d0f0a",
        "hillshade-highlight-color": "#f0ebe0",
        "hillshade-illumination-anchor": "viewport",
      },
    },
  ],
  terrain: {
    source: "terrain",
    exaggeration: 1.15,
  },
};

function emptyCollection() {
  return { type: "FeatureCollection" as const, features: [] as ParcelFeature[] };
}

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const aliveRef = useRef(true);
  const ownedIdsRef = useRef<Set<string>>(new Set());
  const resourceFilterRef = useRef<string>("");
  const showGridRef = useRef(true);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [cellPreview, setCellPreview] = useState<CellPreview | null>(null);
  const [parcelCount, setParcelCount] = useState(0);
  const [owned, setOwned] = useState<OwnedParcel[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [resourceFilter, setResourceFilter] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [gridHint, setGridHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resourceFilterRef.current = resourceFilter;
  }, [resourceFilter]);

  useEffect(() => {
    showGridRef.current = showGrid;
  }, [showGrid]);

  useEffect(() => {
    aliveRef.current = true;
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TERRAIN_STYLE,
      center: [9.19, 45.4642],
      zoom: 8,
      maxZoom: 20,
      // Request denser tiles on retina / HiDPI so close zooms stay sharp.
      pixelRatio: typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const onLoad = () => {
      if (!aliveRef.current) return;

      if (!map.getSource("parcels")) {
        map.addSource("parcels", { type: "geojson", data: emptyCollection() });
        map.addLayer({
          id: "parcels-fill",
          type: "fill",
          source: "parcels",
          paint: { "fill-color": "#2c4a6e", "fill-opacity": 0.35 },
        });
        map.addLayer({
          id: "parcels-outline",
          type: "line",
          source: "parcels",
          paint: { "line-color": "#0f1419", "line-width": 1 },
        });
      }

      if (!map.getSource("owned-parcels")) {
        map.addSource("owned-parcels", { type: "geojson", data: emptyCollection() });
        map.addLayer({
          id: "owned-fill",
          type: "fill",
          source: "owned-parcels",
          paint: { "fill-color": "#1f6b45", "fill-opacity": 0.55 },
        });
        map.addLayer({
          id: "owned-outline",
          type: "line",
          source: "owned-parcels",
          paint: { "line-color": "#0b3d24", "line-width": 2.5 },
        });
      }

      if (!map.getSource("claim-grid")) {
        map.addSource("claim-grid", { type: "geojson", data: emptyCollection() });
        map.addLayer({
          id: "claim-grid-fill",
          type: "fill",
          source: "claim-grid",
          paint: {
            "fill-color": [
              "match",
              ["get", "status"],
              "owned",
              "#6b7280",
              "#c4a35a",
            ],
            "fill-opacity": 0.22,
          },
        });
        map.addLayer({
          id: "claim-grid-outline",
          type: "line",
          source: "claim-grid",
          paint: { "line-color": "#5c4a1f", "line-width": 0.8, "line-opacity": 0.7 },
        });
      }

      if (!map.getSource("resources")) {
        map.addSource("resources", { type: "geojson", data: emptyCollection() });
        map.addLayer({
          id: "resources-heat",
          type: "heatmap",
          source: "resources",
          maxzoom: 14,
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "richness"], 0, 0, 100, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 12, 1.6],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 12, 40],
            "heatmap-opacity": 0.75,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0,0,0,0)",
              0.2,
              "rgba(70,90,40,0.4)",
              0.5,
              "rgba(196,120,40,0.7)",
              0.8,
              "rgba(180,40,20,0.85)",
              1,
              "rgba(80,10,10,0.95)",
            ],
          },
        });
        map.addLayer({
          id: "resources-points",
          type: "circle",
          source: "resources",
          minzoom: 5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "richness"], 20, 4, 100, 10],
            "circle-color": "#8b4513",
            "circle-opacity": 0.7,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#1a1a1a",
          },
        });
      }

      void loadParcels(map);
      void loadOwned(map);
      void loadResources(map);
      void loadGrid(map);
    };

    const onMoveEnd = () => {
      if (!aliveRef.current) return;
      void loadParcels(map);
      void loadResources(map);
      void loadGrid(map);
    };

    const onParcelClick = async (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      if (!aliveRef.current) return;
      const f = e.features?.[0];
      const id = f?.properties?.id as string | undefined;
      if (!id) return;
      const res = await fetch(`/api/map/parcels/${id}`, { credentials: "include" });
      if (!aliveRef.current) return;
      const data = (await res.json()) as Record<string, unknown>;
      setSelected({ ...data, ownedByYou: ownedIdsRef.current.has(id) });
      setCellPreview(null);
    };

    const onGridClick = async (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      if (!aliveRef.current) return;
      const f = e.features?.[0];
      const ix = Number(f?.properties?.ix);
      const iy = Number(f?.properties?.iy);
      const cellSizeM = Number(f?.properties?.cellSizeM) || 100;
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;
      setError(null);
      try {
        const preview = await api<CellPreview>("/property/preview-cell", {
          method: "POST",
          body: JSON.stringify({ ix, iy, cellSizeM }),
        });
        setCellPreview(preview);
        setSelected(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not preview cell");
      }
    };

    map.on("load", onLoad);
    map.on("moveend", onMoveEnd);
    map.on("click", "parcels-fill", onParcelClick);
    map.on("click", "owned-fill", onParcelClick);
    map.on("click", "claim-grid-fill", onGridClick);

    mapRef.current = map;

    const params = new URLSearchParams(window.location.search);
    const lng = Number(params.get("lng"));
    const lat = Number(params.get("lat"));
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      map.once("load", () => {
        map.flyTo({ center: [lng, lat], zoom: 14 });
      });
    }

    void api<ResourceType[]>("/map/resources/types")
      .then((types) => {
        if (aliveRef.current) setResourceTypes(types);
      })
      .catch(() => undefined);

    return () => {
      aliveRef.current = false;
      map.off("load", onLoad);
      map.off("moveend", onMoveEnd);
      map.off("click", "parcels-fill", onParcelClick);
      map.off("click", "owned-fill", onParcelClick);
      map.off("click", "claim-grid-fill", onGridClick);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getStyle()) return;
    if (map.getLayer("resources-heat")) {
      map.setLayoutProperty("resources-heat", "visibility", showHeatmap ? "visible" : "none");
    }
    if (map.getLayer("resources-points")) {
      map.setLayoutProperty("resources-points", "visibility", showHeatmap ? "visible" : "none");
    }
  }, [showHeatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getStyle()) return;
    const vis = showGrid ? "visible" : "none";
    if (map.getLayer("claim-grid-fill")) {
      map.setLayoutProperty("claim-grid-fill", "visibility", vis);
    }
    if (map.getLayer("claim-grid-outline")) {
      map.setLayoutProperty("claim-grid-outline", "visibility", vis);
    }
    if (showGrid) void loadGrid(map);
  }, [showGrid]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getStyle()) void loadResources(map);
  }, [resourceFilter]);

  async function loadOwned(map: Map) {
    try {
      const data = await api<{ parcels: OwnedParcel[] }>("/property/mine");
      if (!aliveRef.current || !map.getStyle()) return;
      const parcels = data.parcels ?? [];
      setOwned(parcels);
      ownedIdsRef.current = new Set(parcels.map((p) => p.parcelId));
      const features: ParcelFeature[] = parcels
        .filter((row) => row.geometry)
        .map((row) => ({
          type: "Feature",
          properties: { id: row.parcelId, label: row.label, areaM2: row.areaM2, owned: true },
          geometry: row.geometry,
        }));
      (map.getSource("owned-parcels") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features,
      });
    } catch {
      // not logged in
    }
  }

  async function loadParcels(map: Map) {
    if (!aliveRef.current || !map.getStyle()) return;
    const b = map.getBounds();
    const params = new URLSearchParams({
      minLng: String(b.getWest()),
      minLat: String(b.getSouth()),
      maxLng: String(b.getEast()),
      maxLat: String(b.getNorth()),
      limit: "200",
    });
    try {
      const res = await fetch(`/api/map/parcels?${params}`, { credentials: "include" });
      if (!aliveRef.current) return;
      const data: unknown = await res.json();
      if (!aliveRef.current || !map.getSource("parcels")) return;
      const rows = Array.isArray(data)
        ? (data as Array<{
            id: string;
            label: string | null;
            areaM2: number;
            landType: string;
            geometry: ParcelFeature["geometry"];
          }>)
        : [];
      setParcelCount(rows.length);
      const features: ParcelFeature[] = rows.map((row) => ({
        type: "Feature",
        properties: {
          id: row.id,
          label: row.label,
          areaM2: row.areaM2,
          landType: row.landType,
        },
        geometry: row.geometry,
      }));
      (map.getSource("parcels") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features,
      });
    } catch {
      // ignore
    }
  }

  async function loadResources(map: Map) {
    if (!aliveRef.current || !map.getStyle()) return;
    const b = map.getBounds();
    const params = new URLSearchParams({
      minLng: String(b.getWest()),
      minLat: String(b.getSouth()),
      maxLng: String(b.getEast()),
      maxLat: String(b.getNorth()),
      limit: "800",
    });
    const filter = resourceFilterRef.current;
    if (filter) params.set("resource", filter);
    try {
      const res = await fetch(`/api/map/resources?${params}`, { credentials: "include" });
      if (!aliveRef.current) return;
      const data: unknown = await res.json();
      const rows = Array.isArray(data)
        ? (data as Array<{
            id: string;
            resourceKey: string;
            resourceName: string;
            richness: number;
            label: string | null;
            geometry: ParcelFeature["geometry"];
          }>)
        : [];
      const features: ParcelFeature[] = rows.map((row) => ({
        type: "Feature",
        properties: {
          id: row.id,
          resourceKey: row.resourceKey,
          resourceName: row.resourceName,
          richness: row.richness,
          label: row.label,
        },
        geometry: row.geometry,
      }));
      (map.getSource("resources") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features,
      });
    } catch {
      // ignore
    }
  }

  async function loadGrid(map: Map) {
    if (!aliveRef.current || !map.getStyle() || !showGridRef.current) return;
    const cellSizeM = claimSizeForZoom(map.getZoom());
    if (!cellSizeM) {
      setGridHint("Zoom in (z12+) for the claim grid — keep zooming to reach 1×1 m cells.");
      (map.getSource("claim-grid") as GeoJSONSource | undefined)?.setData(emptyCollection());
      return;
    }
    const b = map.getBounds();
    const params = new URLSearchParams({
      minLng: String(b.getWest()),
      minLat: String(b.getSouth()),
      maxLng: String(b.getEast()),
      maxLat: String(b.getNorth()),
      cellSizeM: String(cellSizeM),
      limit: "500",
    });
    try {
      const res = await fetch(`/api/map/grid?${params}`, { credentials: "include" });
      if (!aliveRef.current) return;
      const data = (await res.json()) as {
        zoomIn?: boolean;
        features?: ParcelFeature[];
        areaM2?: number;
        cellSizeM?: number;
      };
      if (data.zoomIn) {
        setGridHint(`Zoom further in for ${cellSizeM}×${cellSizeM} m cells (too many in view).`);
        (map.getSource("claim-grid") as GeoJSONSource | undefined)?.setData(emptyCollection());
        return;
      }
      setGridHint(
        `Claim grid: ${cellSizeM}×${cellSizeM} m (${(data.areaM2 ?? cellSizeM * cellSizeM).toLocaleString()} m²). Zoom to 18+ for 1 m².`,
      );
      (map.getSource("claim-grid") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: data.features ?? [],
      });
    } catch {
      // ignore
    }
  }

  async function onSearch() {
    if (!query.trim()) return;
    const res = await fetch(`/api/map/search?q=${encodeURIComponent(query)}`, {
      credentials: "include",
    });
    const data: unknown = await res.json();
    setHits(Array.isArray(data) ? (data as SearchHit[]) : []);
  }

  async function buySelectedCell() {
    if (!cellPreview || cellPreview.status !== "available") return;
    setBusy(true);
    setError(null);
    try {
      const bought = await api<{
        parcelId: string;
        latitude: number;
        longitude: number;
        priceCents: number;
      }>("/property/buy-cell", {
        method: "POST",
        body: JSON.stringify({
          ix: cellPreview.ix,
          iy: cellPreview.iy,
          cellSizeM: cellPreview.cellSizeM,
        }),
      });
      setCellPreview(null);
      const map = mapRef.current;
      if (map) {
        await loadOwned(map);
        await loadParcels(map);
        await loadGrid(map);
        map.flyTo({ center: [bought.longitude, bought.latitude], zoom: 14 });
      }
      setSelected({
        message: `Purchased ${money(bought.priceCents)} of land from World Government`,
        parcelId: bought.parcelId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  }

  function flyToOwned(parcel: OwnedParcel) {
    mapRef.current?.flyTo({
      center: [parcel.longitude, parcel.latitude],
      zoom: 14,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">World Map</h1>
          <p className="text-sm text-ink/70">
            Higher-res terrain with elevation. Claim from 1000 m cells down to 1 m² as you zoom
            (z18+). World Government sells unowned land; terrain affects what you can build.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations…"
            className="border border-ink/20 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={() => void onSearch()}
            className="bg-steel px-3 py-2 text-sm font-medium text-white"
          >
            Search
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
          Resource heatmap
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Claim grid
        </label>
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="border border-ink/20 bg-white px-2 py-1"
        >
          <option value="">All resources</option>
          {resourceTypes.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        {gridHint && <span className="text-ink/60">{gridHint}</span>}
      </div>

      {hits.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {hits.map((hit) => (
            <li key={`${hit.type}-${hit.id}`}>
              <button
                className="border border-ink/15 bg-white/70 px-2 py-1 hover:bg-white"
                onClick={() => {
                  mapRef.current?.flyTo({
                    center: [hit.longitude, hit.latitude],
                    zoom: 12,
                  });
                }}
              >
                {hit.name} ({hit.type})
              </button>
            </li>
          ))}
        </ul>
      )}

      {owned.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {owned.map((parcel) => (
            <li key={parcel.parcelId}>
              <button
                className="border border-emerald-800/30 bg-emerald-50 px-2 py-1 hover:bg-emerald-100"
                onClick={() => flyToOwned(parcel)}
              >
                Your land: {parcel.label ?? "Parcel"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div ref={containerRef} className="h-[70vh] w-full border border-ink/10" />
        <aside className="border border-ink/10 bg-white/60 p-4 text-sm space-y-3">
          <h2 className="font-display text-lg">Inspection</h2>
          <p className="text-ink/60">
            Parcels in view: <strong>{parcelCount}</strong>
            {owned.length > 0 ? (
              <>
                {" "}
                · owned: <strong>{owned.length}</strong>
              </>
            ) : null}
          </p>

          {cellPreview && (
            <div className="space-y-2 border border-ink/10 bg-white/80 p-3">
              <p className="font-medium">
                Cell {cellPreview.ix},{cellPreview.iy}
              </p>
              <p className="text-ink/60">
                {cellPreview.areaM2.toLocaleString()} m² · {cellPreview.cellSizeM}×
                {cellPreview.cellSizeM} m
                {cellPreview.terrain
                  ? ` · terrain: ${cellPreview.terrain}${
                      cellPreview.elevationM != null
                        ? ` (${Math.round(cellPreview.elevationM)} m)`
                        : ""
                    }`
                  : ""}
              </p>
              <p>Status: {cellPreview.status}</p>
              {cellPreview.status === "available" && (
                <p>
                  World Government price: <strong>{money(cellPreview.priceCents)}</strong>
                </p>
              )}
              {cellPreview.resources.length > 0 ? (
                <ul className="space-y-1">
                  {cellPreview.resources.map((r) => (
                    <li key={r.resourceKey + (r.label ?? "")}>
                      {r.resourceName} · richness {Math.round(r.richness)}
                      {r.label ? ` · ${r.label}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink/60">No major deposits under this cell.</p>
              )}
              {cellPreview.status === "available" && (
                <button
                  disabled={busy}
                  onClick={() => void buySelectedCell()}
                  className="bg-steel px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  Buy from World Government
                </button>
              )}
            </div>
          )}

          {!cellPreview && !selected && (
            <p className="text-ink/60">
              Zoom in, click a gold grid cell to preview/buy, or toggle the resource heatmap.
            </p>
          )}

          {selected && (
            <dl className="space-y-2">
              {Object.entries(selected)
                .filter(([k]) => k !== "geometry")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink/50">{k}</dt>
                    <dd className="break-all">{String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}
