"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Treaty = {
  id: string;
  title: string;
  body: string;
  signedAt: string;
};

type Sanction = {
  id: string;
  fromCountryId: string;
  toCountryId: string;
  reason: string;
  active: boolean;
};

type MilitaryUnit = {
  id: string;
  countryName: string;
  name: string;
  districtName: string | null;
  strength: number;
};

type War = {
  id: string;
  aggressorCountryId: string;
  defenderCountryId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
};

type EnvMetric = {
  districtName: string;
  cityName: string;
  pollution: number;
  measuredAt: string;
};

type Crime = {
  id: string;
  accusedName: string;
  kind: string;
  districtName: string | null;
  status: string;
  createdAt: string;
};

type CourtCase = {
  id: string;
  crimeKind: string;
  accusedName: string;
  status: string;
  verdict: string | null;
  fineCents: number | null;
};

type Npc = {
  id: string;
  name: string;
  role: string;
  districtName: string | null;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function WorldPage() {
  const [treaties, setTreaties] = useState<Treaty[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [military, setMilitary] = useState<MilitaryUnit[]>([]);
  const [wars, setWars] = useState<War[]>([]);
  const [environment, setEnvironment] = useState<EnvMetric[]>([]);
  const [crimes, setCrimes] = useState<Crime[]>([]);
  const [courts, setCourts] = useState<CourtCase[]>([]);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [accusedId, setAccusedId] = useState("");
  const [crimeKind, setCrimeKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [t, s, m, w, e, c, co, n] = await Promise.all([
      api<{ treaties: Treaty[] }>("/world/treaties"),
      api<{ sanctions: Sanction[] }>("/world/sanctions"),
      api<{ units: MilitaryUnit[] }>("/world/military"),
      api<{ wars: War[] }>("/world/wars"),
      api<{ metrics: EnvMetric[] }>("/world/environment"),
      api<{ crimes: Crime[] }>("/world/crimes"),
      api<{ cases: CourtCase[] }>("/world/courts"),
      api<{ npcs: Npc[] }>("/world/npcs"),
    ]);
    setTreaties(t.treaties);
    setSanctions(s.sanctions);
    setMilitary(m.units);
    setWars(w.wars);
    setEnvironment(e.metrics);
    setCrimes(c.crimes);
    setCourts(co.cases);
    setNpcs(n.npcs);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">World</h1>
      <p className="text-sm text-ink/70">
        Treaties, sanctions, military, wars, environment, justice, and NPCs.
      </p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="space-y-2">
        <h2 className="font-display text-xl">Treaties</h2>
        <ul className="text-sm space-y-2">
          {treaties.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 p-3">
              <p className="font-medium">{row.title}</p>
              <p className="text-ink/70">{row.body}</p>
            </li>
          ))}
        </ul>
        {!loading && treaties.length === 0 && (
          <p className="text-sm text-ink/60">No treaties.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Sanctions</h2>
        <ul className="text-sm space-y-1">
          {sanctions.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.fromCountryId} → {row.toCountryId}: {row.reason}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Military</h2>
        <ul className="text-sm space-y-1">
          {military.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.name} · {row.countryName}
              {row.districtName ? ` · ${row.districtName}` : ""} · strength {row.strength}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Wars</h2>
        <ul className="text-sm space-y-1">
          {wars.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.aggressorCountryId} vs {row.defenderCountryId} · {row.status}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Environment</h2>
        <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
          {environment.map((row, i) => (
            <li key={i} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.districtName}, {row.cityName} · pollution {row.pollution}
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Report crime</h2>
        <input
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          placeholder="Accused character ID"
          value={accusedId}
          onChange={(e) => setAccusedId(e.target.value)}
        />
        <input
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          placeholder="Crime kind (e.g. theft)"
          value={crimeKind}
          onChange={(e) => setCrimeKind(e.target.value)}
        />
        <button
          className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
          disabled={busy || !accusedId.trim() || !crimeKind.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/world/crimes", {
                method: "POST",
                body: JSON.stringify({
                  accusedCharacterId: accusedId.trim(),
                  kind: crimeKind.trim(),
                }),
              });
              setAccusedId("");
              setCrimeKind("");
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Report failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Report
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Crimes</h2>
        <ul className="text-sm space-y-1">
          {crimes.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.accusedName} · {row.kind} · {row.status}
              {row.districtName ? ` · ${row.districtName}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Courts</h2>
        <ul className="text-sm space-y-1">
          {courts.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.accusedName} · {row.crimeKind} · {row.status}
              {row.verdict ? ` · ${row.verdict}` : ""}
              {row.fineCents != null ? ` · fine ${money(row.fineCents)}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">NPCs</h2>
        <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
          {npcs.map((row) => (
            <li key={row.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {row.name} · {row.role}
              {row.districtName ? ` · ${row.districtName}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
