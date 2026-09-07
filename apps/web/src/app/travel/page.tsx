"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import maplibregl, { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "@/lib/api";

type Status = {
  hasVehicle: boolean;
  position: { lat: number; lng: number } | null;
  location: {
    districtId: string;
    districtName: string;
    cityName: string;
  } | null;
  trip: {
    id: string;
    arrivesAt: string;
    costCents: number;
    status: string;
    mode: string;
    distanceM: number | null;
    destinationLabel: string | null;
    durationLabel: string;
    toLat: number | null;
    toLng: number | null;
  } | null;
};

type Quote = {
  mode: "walk" | "drive";
  distanceM: number;
  durationMs: number;
  durationLabel: string;
  costCents: number;
  speedKmh: number;
  hasVehicle: boolean;
  note: string;
  to: { lat: number; lng: number; label: string };
};

type AddressHit = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  districtName: string | null;
  cityName: string | null;
};

type Dest = {
  districtId: string;
  districtName: string;
  cityName: string;
  cityLat: number;
  cityLng: number;
  costCents: number;
  durationLabel: string;
  label: string;
  mode: string;
  distanceM: number;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

function km(m: number) {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Landscape imagery (no road/label cartography) for destination picking. */
const TERRAIN_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [
    { id: "land", type: "background", paint: { "background-color": "#1a1f14" } },
    {
      id: "imagery",
      type: "raster",
      source: "imagery",
      paint: {
        "raster-opacity": 1,
        "raster-resampling": "linear",
        "raster-saturation": -0.12,
      },
    },
  ],
};

export default function TravelPage() {
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const youMarkerRef = useRef<Marker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [destinations, setDestinations] = useState<Dest[]>([]);
  const [addressQ, setAddressQ] = useState("");
  const [addressHits, setAddressHits] = useState<AddressHit[]>([]);
  const [picked, setPicked] = useState<{
    lat: number;
    lng: number;
    label?: string;
    buildingId?: string;
  } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [s, d] = await Promise.all([
      api<Status>("/travel/status"),
      api<{ destinations: Dest[] }>("/travel/destinations"),
    ]);
    setStatus(s);
    setDestinations(d.destinations);
    return s;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await refresh();
        if (cancelled) return;
        if (!containerRef.current || mapRef.current) return;

        const center: [number, number] = s.position
          ? [s.position.lng, s.position.lat]
          : [9.19, 45.4642];

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: TERRAIN_STYLE,
          center,
          zoom: 11,
          maxZoom: 20,
          pixelRatio: typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1,
        });
        map.addControl(new maplibregl.NavigationControl(), "top-right");

        map.on("load", () => {
          if (s.position) {
            youMarkerRef.current = new maplibregl.Marker({ color: "#1f6b45" })
              .setLngLat([s.position.lng, s.position.lat])
              .setPopup(new maplibregl.Popup().setText("You are here"))
              .addTo(map);
          }
        });

        map.on("click", (e) => {
          const { lng, lat } = e.lngLat;
          setPicked({ lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
          setAddressHits([]);
          if (markerRef.current) markerRef.current.remove();
          markerRef.current = new maplibregl.Marker({ color: "#8b4513" })
            .setLngLat([lng, lat])
            .addTo(map);
        });

        mapRef.current = map;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      youMarkerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!picked) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const body = picked.buildingId
          ? { toBuildingId: picked.buildingId }
          : { toLat: picked.lat, toLng: picked.lng, destinationLabel: picked.label };
        const q = await api<Quote>("/travel/quote", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!cancelled) setQuote(q);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Quote failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picked]);

  async function searchAddress() {
    if (addressQ.trim().length < 2) return;
    setError(null);
    try {
      const data = await api<{ hits: AddressHit[] }>(
        `/travel/addresses?q=${encodeURIComponent(addressQ.trim())}`,
      );
      setAddressHits(data.hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Address search failed");
    }
  }

  function chooseAddress(hit: AddressHit) {
    setPicked({
      lat: hit.latitude,
      lng: hit.longitude,
      label: hit.address || hit.name,
      buildingId: hit.id,
    });
    setAddressHits([]);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [hit.longitude, hit.latitude], zoom: 13 });
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new maplibregl.Marker({ color: "#8b4513" })
        .setLngLat([hit.longitude, hit.latitude])
        .addTo(map);
    }
  }

  async function depart() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const body = picked.buildingId
        ? { toBuildingId: picked.buildingId }
        : {
            toLat: picked.lat,
            toLng: picked.lng,
            destinationLabel: picked.label,
          };
      await api("/travel", { method: "POST", body: JSON.stringify(body) });
      await refresh();
      setPicked(null);
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Travel failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Travel</h1>
        <p className="mt-1 text-sm text-ink/70">
          No airports yet — click the map or enter a house address. Without a car you walk (≈5
          km/h). With a vehicle you drive (≈45 km/h average). Times match real life.
        </p>
      </div>

      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {status && (
        <div className="border border-ink/10 bg-white/60 p-5 text-sm space-y-2">
          <p>
            Mode available:{" "}
            <strong>{status.hasVehicle ? "Drive (you own a vehicle)" : "Walk only"}</strong>
            {!status.hasVehicle && (
              <>
                {" "}
                — buy a car on{" "}
                <Link href="/assets" className="underline">
                  Assets
                </Link>
              </>
            )}
          </p>
          {status.location && (
            <p>
              District:{" "}
              <strong>
                {status.location.districtName}, {status.location.cityName}
              </strong>
            </p>
          )}
          {status.position && (
            <p className="text-ink/60">
              Position: {status.position.lat.toFixed(5)}, {status.position.lng.toFixed(5)}
            </p>
          )}
          {status.trip ? (
            <p className="text-steel">
              {status.trip.mode === "drive" ? "Driving" : "Walking"} to{" "}
              {status.trip.destinationLabel ?? "destination"}
              {status.trip.distanceM != null ? ` (${km(status.trip.distanceM)})` : ""} — arrives{" "}
              {new Date(status.trip.arrivesAt).toLocaleString()} ({status.trip.durationLabel}
              {status.trip.costCents > 0 ? `, fuel ${money(status.trip.costCents)}` : ", free"}).
            </p>
          ) : (
            <p className="text-ink/60">Not traveling. Click the map to set a destination.</p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div ref={containerRef} className="h-[50vh] w-full border border-ink/10" />
        <aside className="space-y-4 text-sm">
          <div className="space-y-2">
            <h2 className="font-display text-lg">House address</h2>
            <div className="flex gap-2">
              <input
                value={addressQ}
                onChange={(e) => setAddressQ(e.target.value)}
                placeholder="Search building address…"
                className="flex-1 border border-ink/20 bg-white px-2 py-1.5"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchAddress();
                }}
              />
              <button
                type="button"
                onClick={() => void searchAddress()}
                className="border border-ink/20 px-2 py-1.5 text-xs hover:bg-ink/5"
              >
                Find
              </button>
            </div>
            {addressHits.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-auto border border-ink/10 bg-white/80 p-2">
                {addressHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="w-full text-left hover:bg-ink/5 px-1 py-1"
                      onClick={() => chooseAddress(hit)}
                    >
                      <span className="font-medium">{hit.address || hit.name}</span>
                      <span className="block text-ink/50 text-xs">
                        {[hit.districtName, hit.cityName].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {quote && picked && (
            <div className="border border-ink/10 bg-white/70 p-3 space-y-2">
              <h2 className="font-display text-lg">Trip quote</h2>
              <p className="font-medium">{picked.label ?? quote.to.label}</p>
              <p>
                {quote.mode === "drive" ? "Drive" : "Walk"} · {km(quote.distanceM)} ·{" "}
                {quote.durationLabel} · {quote.speedKmh} km/h
              </p>
              <p>{quote.costCents > 0 ? money(quote.costCents) : "Free"}</p>
              <p className="text-ink/60 text-xs">{quote.note}</p>
              <button
                type="button"
                disabled={busy || Boolean(status?.trip)}
                onClick={() => void depart()}
                className="bg-steel px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Depart
              </button>
            </div>
          )}
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Districts</h2>
        <p className="text-sm text-ink/60">Quick hops to known districts (same walk/drive rules).</p>
        <ul className="space-y-2">
          {destinations.map((d) => (
            <li
              key={d.districtId}
              className="flex flex-wrap items-center justify-between gap-3 border border-ink/10 bg-white/50 px-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {d.districtName}, {d.cityName}
                </p>
                <p className="text-ink/60">
                  {d.label} · {km(d.distanceM)} · {d.durationLabel}
                  {d.costCents > 0 ? ` · ${money(d.costCents)}` : " · free"}
                </p>
              </div>
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy || Boolean(status?.trip)}
                onClick={() => {
                  setPicked({
                    lat: d.cityLat,
                    lng: d.cityLng,
                    label: `${d.districtName}, ${d.cityName}`,
                  });
                  mapRef.current?.flyTo({ center: [d.cityLng, d.cityLat], zoom: 11 });
                  if (markerRef.current) markerRef.current.remove();
                  if (mapRef.current) {
                    markerRef.current = new maplibregl.Marker({ color: "#8b4513" })
                      .setLngLat([d.cityLng, d.cityLat])
                      .addTo(mapRef.current);
                  }
                }}
              >
                Select
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
