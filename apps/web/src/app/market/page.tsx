"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Listing = {
  id: string;
  sellerName: string | null;
  itemKey: string;
  quantity: number;
  priceCentsEach: number;
};

type Loan = {
  id: string;
  principalCents: number;
  remainingCents: number;
  interestBps: number;
  status: string;
  createdAt: string;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function MarketPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [itemKey, setItemKey] = useState("");
  const [listQty, setListQty] = useState("1");
  const [listPrice, setListPrice] = useState("");
  const [loanOrb, setLoanOrb] = useState("1000");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [market, mine] = await Promise.all([
      api<{ listings: Listing[] }>("/markets/listings"),
      api<{ loans: Loan[] }>("/markets/loans/mine"),
    ]);
    setListings(market.listings);
    setLoans(mine.loans);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Market</h1>
      <p className="text-sm text-ink/70">Trade goods and request loans from the treasury.</p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Create listing</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Item key"
            value={itemKey}
            onChange={(e) => setItemKey(e.target.value)}
          />
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5 w-16"
            placeholder="Qty"
            value={listQty}
            onChange={(e) => setListQty(e.target.value)}
          />
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5 w-24"
            placeholder="Price ORB"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy || !itemKey.trim()}
            onClick={async () => {
              const quantity = parseInt(listQty, 10);
              const priceCentsEach = Math.round(parseFloat(listPrice) * 100);
              if (!Number.isFinite(quantity) || quantity <= 0) {
                setError("Invalid quantity");
                return;
              }
              if (!Number.isFinite(priceCentsEach) || priceCentsEach <= 0) {
                setError("Invalid price");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await api("/markets/listings", {
                  method: "POST",
                  body: JSON.stringify({ itemKey: itemKey.trim(), quantity, priceCentsEach }),
                });
                setItemKey("");
                setListPrice("");
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Listing failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            List item
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Open listings</h2>
        <ul className="space-y-3">
          {listings.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
              <p className="font-medium">
                {row.itemKey} × {row.quantity}
              </p>
              <p className="text-ink/60">
                {money(row.priceCentsEach)} each
                {row.sellerName ? ` · seller ${row.sellerName}` : ""}
              </p>
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy}
                onClick={async () => {
                  const raw = window.prompt(`Quantity to buy (max ${row.quantity}):`, "1");
                  if (!raw) return;
                  const quantity = parseInt(raw, 10);
                  if (!Number.isFinite(quantity) || quantity <= 0) {
                    setError("Invalid quantity");
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/markets/buy", {
                      method: "POST",
                      body: JSON.stringify({ listingId: row.id, quantity }),
                    });
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Buy failed");
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
          <p className="text-sm text-ink/60">No open listings.</p>
        )}
      </section>

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Request loan</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5 w-28"
            placeholder="Principal ORB"
            value={loanOrb}
            onChange={(e) => setLoanOrb(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              const principalCents = Math.round(parseFloat(loanOrb) * 100);
              if (!Number.isFinite(principalCents) || principalCents < 1000) {
                setError("Minimum loan is 10 ORB");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await api("/markets/loans", {
                  method: "POST",
                  body: JSON.stringify({ principalCents }),
                });
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Loan request failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Request
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Your loans</h2>
        <ul className="text-sm space-y-2">
          {loans.map((loan) => (
            <li key={loan.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {money(loan.principalCents)} principal · {money(loan.remainingCents)} remaining ·{" "}
              {loan.status} · {loan.interestBps / 100}% interest
            </li>
          ))}
        </ul>
        {!loading && loans.length === 0 && (
          <p className="text-sm text-ink/60">No loans.</p>
        )}
      </section>
    </div>
  );
}
