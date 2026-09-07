"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Health = {
  characterId: string;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  thirst: number;
  maxThirst: number;
  energy: number;
  maxEnergy: number;
  infectedPathogenKey: string | null;
  vaccinatedPathogenKey: string | null;
  supplies: { food: number; water: number };
  prices: { food: number; water: number };
  environment: {
    biome: string;
    districtName: string | null;
    cityName: string | null;
    canBuyFood: boolean;
    canBuyWater: boolean;
    canForageFood: boolean;
    canForageWater: boolean;
    nearFertileSoil: boolean;
    note: string;
  };
};

type Pathogen = {
  key: string;
  name: string;
  description: string;
  contagiousness?: number;
  transmissibility?: number;
  severity: number;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

function StatBar({
  label,
  value,
  max,
  warnBelow,
}: {
  label: string;
  value: number;
  max: number;
  warnBelow: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const critical = value < warnBelow;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={critical ? "text-red-700" : "text-ink/70"}>
          {Math.round(value)}/{max}
        </span>
      </div>
      <div className="h-2 w-full bg-ink/10">
        <div
          className={`h-full ${critical ? "bg-red-700" : "bg-steel"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pathogens, setPathogens] = useState<Pathogen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [me, world] = await Promise.all([
      api<Health>("/healthcare/me"),
      api<{ pathogens: Pathogen[] }>("/world/pathogens"),
    ]);
    setHealth(me);
    setPathogens(world.pathogens);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Health</h1>
        <p className="mt-1 text-sm text-ink/70">
          Keep HP, hunger, thirst, and energy up. Buy food and water where markets exist — deserts
          have none. You auto-eat/drink from inventory as needs drop.
        </p>
      </div>

      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {health && (
        <>
          <section className="border border-ink/10 bg-white/60 p-5 space-y-4">
            <h2 className="font-display text-xl">Vitals</h2>
            <StatBar label="Health" value={health.hp} max={health.maxHp} warnBelow={30} />
            <StatBar
              label="Hunger (food)"
              value={health.hunger}
              max={health.maxHunger}
              warnBelow={20}
            />
            <StatBar
              label="Thirst (water)"
              value={health.thirst}
              max={health.maxThirst}
              warnBelow={20}
            />
            <StatBar
              label="Energy"
              value={health.energy}
              max={health.maxEnergy}
              warnBelow={20}
            />
            {health.infectedPathogenKey && (
              <p className="text-sm text-steel">Infected: {health.infectedPathogenKey}</p>
            )}
          </section>

          <section className="border border-ink/10 bg-white/60 p-5 space-y-2 text-sm">
            <h2 className="font-display text-xl">Location supply</h2>
            <p>
              {health.environment.districtName
                ? `${health.environment.districtName}, ${health.environment.cityName}`
                : "Unknown"}{" "}
              · biome <strong>{health.environment.biome}</strong>
            </p>
            <p className="text-ink/70">{health.environment.note}</p>
            <ul className="text-ink/70 list-disc pl-5">
              <li>Buy food: {health.environment.canBuyFood ? "yes" : "no"}</li>
              <li>Buy water: {health.environment.canBuyWater ? "yes" : "no"}</li>
              <li>Forage food: {health.environment.canForageFood ? "yes" : "no"}</li>
              <li>Forage water: {health.environment.canForageWater ? "yes" : "no"}</li>
            </ul>
            <Link href="/travel" className="inline-block underline pt-1">
              Travel elsewhere
            </Link>
          </section>

          <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
            <h2 className="font-display text-xl">Supplies</h2>
            <p>
              Food rations: <strong>{health.supplies.food}</strong> · Water canteens:{" "}
              <strong>{health.supplies.water}</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || health.supplies.food < 1}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/consume", {
                      method: "POST",
                      body: JSON.stringify({ itemKey: "food", quantity: 1 }),
                    }),
                  )
                }
              >
                Eat ration
              </button>
              <button
                disabled={busy || health.supplies.water < 1}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/consume", {
                      method: "POST",
                      body: JSON.stringify({ itemKey: "water", quantity: 1 }),
                    }),
                  )
                }
              >
                Drink water
              </button>
              <button
                disabled={busy || !health.environment.canBuyFood}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/buy-supplies", {
                      method: "POST",
                      body: JSON.stringify({ itemKey: "food", quantity: 1 }),
                    }),
                  )
                }
              >
                Buy food ({money(health.prices.food)})
              </button>
              <button
                disabled={busy || !health.environment.canBuyWater}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/buy-supplies", {
                      method: "POST",
                      body: JSON.stringify({ itemKey: "water", quantity: 1 }),
                    }),
                  )
                }
              >
                Buy water ({money(health.prices.water)})
              </button>
              <button
                disabled={busy || !health.environment.canForageFood}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/forage", {
                      method: "POST",
                      body: JSON.stringify({ kind: "food" }),
                    }),
                  )
                }
              >
                Forage food
              </button>
              <button
                disabled={busy || !health.environment.canForageWater}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/forage", {
                      method: "POST",
                      body: JSON.stringify({ kind: "water" }),
                    }),
                  )
                }
              >
                Forage water
              </button>
            </div>
          </section>

          <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
            <h2 className="font-display text-xl">Clinic</h2>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/treat", {
                      method: "POST",
                      body: JSON.stringify({ kind: "clinic" }),
                    }),
                  )
                }
              >
                Clinic ({money(5000)})
              </button>
              <button
                disabled={busy}
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                onClick={() =>
                  void run(() =>
                    api("/healthcare/treat", {
                      method: "POST",
                      body: JSON.stringify({ kind: "vaccine" }),
                    }),
                  )
                }
              >
                Vaccine ({money(8000)})
              </button>
            </div>
          </section>
        </>
      )}

      {pathogens.length > 0 && (
        <section className="space-y-2 text-sm">
          <h2 className="font-display text-xl">Known pathogens</h2>
          <ul className="space-y-2">
            {pathogens.map((p) => (
              <li key={p.key} className="border border-ink/10 bg-white/50 px-3 py-2">
                <p className="font-medium">{p.name}</p>
                <p className="text-ink/60">{p.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
