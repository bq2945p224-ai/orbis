"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Listing = {
  id: string;
  parcelId: string;
  priceCents: number;
  districtName: string;
  cityName: string;
  areaM2: number;
  landType: string;
  zoning: string;
  label: string | null;
  sellerName?: string;
  sellerKind?: string;
  latitude?: number;
  longitude?: number;
};

type Parcel = {
  parcelId: string;
  acquiredAt: string;
  acquisition: string;
  districtName: string;
  cityName: string;
  areaM2: number;
  landType: string;
  zoning: string;
  label: string | null;
  latitude?: number;
  longitude?: number;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function PropertyPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [listed, mine] = await Promise.all([
      api<{ listings: Listing[] }>("/property/listings"),
      api<{ parcels: Parcel[] }>("/property/mine"),
    ]);
    setListings(listed.listings);
    setParcels(mine.parcels);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Property</h1>
      <p className="text-sm text-ink/70">
        Buy urban listings or claim any 100×100 m cell on the{" "}
        <a href="/map" className="underline">
          world map
        </a>{" "}
        from the World Government. Owned land yields nearby resources over time.
      </p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Market listings</h2>
        <ul className="space-y-3">
          {listings.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
              <p className="font-medium">
                {row.label ?? "Parcel"} · {row.districtName}, {row.cityName}
              </p>
              <p className="text-ink/60">
                {row.areaM2} m² · {row.landType} · {row.zoning}
                {row.sellerName ? ` · seller: ${row.sellerName}` : ""}
              </p>
              <p>{money(row.priceCents)}</p>
              <div className="flex flex-wrap gap-2">
                {row.latitude != null && row.longitude != null && (
                  <a
                    href={`/map?parcel=${row.parcelId}&lng=${row.longitude}&lat=${row.latitude}`}
                    className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
                  >
                    View on map
                  </a>
                )}
                <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/property/buy", {
                      method: "POST",
                      body: JSON.stringify({ listingId: row.id }),
                    });
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Purchase failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {row.sellerKind === "world_government" ? "Buy from World Government" : "Buy"}
              </button>
              </div>
            </li>
          ))}
        </ul>
        {!loading && listings.length === 0 && (
          <p className="text-sm text-ink/60">No open listings.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Your parcels</h2>
        <ul className="space-y-3">
          {parcels.map((row) => (
            <li key={row.parcelId} className="border border-ink/10 bg-white/60 p-4 text-sm space-y-2">
              <p className="font-medium">
                {row.label ?? "Parcel"} · {row.districtName}, {row.cityName}
              </p>
              <p className="text-ink/60">
                {row.areaM2} m² · acquired {new Date(row.acquiredAt).toLocaleDateString()}
              </p>
              <div className="flex flex-wrap gap-2">
                {row.latitude != null && row.longitude != null && (
                  <a
                    href={`/map?parcel=${row.parcelId}&lng=${row.longitude}&lat=${row.latitude}`}
                    className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
                  >
                    View on map
                  </a>
                )}
                <button
                  className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    const raw = window.prompt("List price in ORB (e.g. 500.00):");
                    if (!raw) return;
                    const priceCents = Math.round(parseFloat(raw) * 100);
                    if (!Number.isFinite(priceCents) || priceCents <= 0) {
                      setError("Invalid price");
                      return;
                    }
                    setBusy(true);
                    setError(null);
                    try {
                      await api("/property/list", {
                        method: "POST",
                        body: JSON.stringify({ parcelId: row.parcelId, priceCents }),
                      });
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "List failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  List for sale
                </button>
                <button
                  className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    const name = window.prompt("Building name:");
                    if (!name) return;
                    const typeRaw = window.prompt(
                      "Type: shed | house | mansion | skyscraper",
                      "house",
                    );
                    if (!typeRaw) return;
                    const buildingType = typeRaw.trim().toLowerCase();
                    if (!["shed", "house", "mansion", "skyscraper"].includes(buildingType)) {
                      setError("Unknown building type");
                      return;
                    }
                    setBusy(true);
                    setError(null);
                    try {
                      const quote = await api<{
                        allowed: boolean;
                        reason?: string;
                        costCents: number;
                        terrain: string;
                        multiplier: number;
                      }>("/property/build-quote", {
                        method: "POST",
                        body: JSON.stringify({ parcelId: row.parcelId, buildingType }),
                      });
                      if (!quote.allowed) {
                        setError(quote.reason ?? "Cannot build here");
                        return;
                      }
                      const ok = window.confirm(
                        `Build ${buildingType} on ${quote.terrain} terrain?\nCost: ${(
                          quote.costCents / 100
                        ).toFixed(2)} ORB (${quote.multiplier}× terrain factor)`,
                      );
                      if (!ok) return;
                      await api("/property/build", {
                        method: "POST",
                        body: JSON.stringify({
                          parcelId: row.parcelId,
                          name,
                          buildingType,
                        }),
                      });
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Build failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Build…
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!loading && parcels.length === 0 && (
          <p className="text-sm text-ink/60">You do not own any parcels.</p>
        )}
      </section>
    </div>
  );
}
