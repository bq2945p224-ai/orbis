"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type AssetItem = {
  kind: string;
  id: string;
  title: string;
  category: string;
  subtitle?: string;
  estimatedValueCents: number;
  href?: string;
  acquiredAt?: string;
};

type Portfolio = {
  netWorthCents: number;
  currency: string;
  byCategory: Record<string, number>;
  sections: {
    cash: AssetItem[];
    properties: AssetItem[];
    buildings: AssetItem[];
    vehicles: AssetItem[];
    art: AssetItem[];
    jewelry: AssetItem[];
    collectibles: AssetItem[];
    vessels: AssetItem[];
    aircraft: AssetItem[];
    otherMovable: AssetItem[];
    equity: AssetItem[];
    commodities: AssetItem[];
  };
};

type Listing = {
  id: string;
  title: string;
  priceCents: number;
  category: string;
  definitionName: string;
  sellerName: string;
  metadata: Record<string, unknown>;
};

function money(cents: number) {
  return `${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ORB`;
}

const SECTION_META: Array<{
  key: keyof Portfolio["sections"];
  title: string;
  empty: string;
}> = [
  { key: "cash", title: "Cash", empty: "No bank balance." },
  { key: "properties", title: "Properties", empty: "No land owned yet." },
  { key: "buildings", title: "Buildings", empty: "No structures on your land." },
  { key: "vehicles", title: "Vehicles", empty: "No cars or road vehicles." },
  { key: "vessels", title: "Vessels", empty: "No boats or yachts." },
  { key: "aircraft", title: "Aircraft", empty: "No aircraft." },
  { key: "art", title: "Art", empty: "No fine art." },
  { key: "jewelry", title: "Jewelry", empty: "No jewelry." },
  { key: "collectibles", title: "Collectibles", empty: "No collectibles." },
  { key: "equity", title: "Company equity", empty: "No company shares." },
  {
    key: "commodities",
    title: "Commodity stockpiles",
    empty: "No large resource holdings (only significant stockpiles appear here).",
  },
  { key: "otherMovable", title: "Other assets", empty: "Nothing else." },
];

export default function AssetsPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, m] = await Promise.all([
      api<Portfolio>("/assets/portfolio"),
      api<{ listings: Listing[] }>("/assets/market"),
    ]);
    setPortfolio(p);
    setListings(m.listings);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-3xl">Assets</h1>
        <p className="mt-1 text-sm text-ink/70">
          Your meaningful holdings — land, vehicles, art, equity, and major stockpiles. Everyday
          junk stays out of this ledger.
        </p>
      </div>

      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {portfolio && (
        <section className="border border-ink/10 bg-white/60 p-5 space-y-3">
          <h2 className="font-display text-xl">Net worth</h2>
          <p className="font-display text-3xl tracking-tight">{money(portfolio.netWorthCents)}</p>
          <ul className="flex flex-wrap gap-2 text-xs text-ink/70">
            {Object.entries(portfolio.byCategory)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, cents]) => (
                <li key={cat} className="border border-ink/10 bg-white/70 px-2 py-1">
                  {cat}: {money(cents)}
                </li>
              ))}
          </ul>
        </section>
      )}

      {portfolio &&
        SECTION_META.map(({ key, title, empty }) => {
          const rows = portfolio.sections[key] ?? [];
          if (rows.length === 0 && key === "otherMovable") return null;
          return (
            <section key={key} className="space-y-3">
              <h2 className="font-display text-xl">{title}</h2>
              {rows.length === 0 ? (
                <p className="text-sm text-ink/60">{empty}</p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li
                      key={`${row.kind}-${row.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 border border-ink/10 bg-white/50 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {row.href ? (
                            <Link href={row.href} className="underline-offset-2 hover:underline">
                              {row.title}
                            </Link>
                          ) : (
                            row.title
                          )}
                        </p>
                        {row.subtitle && <p className="text-ink/60">{row.subtitle}</p>}
                      </div>
                      <p className="tabular-nums">{money(row.estimatedValueCents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Asset market</h2>
        <p className="text-sm text-ink/60">
          World Government and players list cars, art, jewelry, and other capital goods here.
        </p>
        <ul className="space-y-3">
          {listings.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-ink/10 bg-white/50 p-4 text-sm"
            >
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="text-ink/60">
                  {row.definitionName} · {row.category} · {row.sellerName}
                </p>
                <p className="mt-1">{money(row.priceCents)}</p>
              </div>
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/assets/buy", {
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
                Buy
              </button>
            </li>
          ))}
        </ul>
        {!loading && listings.length === 0 && (
          <p className="text-sm text-ink/60">No open asset listings.</p>
        )}
      </section>
    </div>
  );
}
