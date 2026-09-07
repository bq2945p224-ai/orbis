"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Industry = {
  key: string;
  name: string;
  description: string;
  primarySkillKey: string;
};

type Company = {
  id: string;
  name: string;
  description: string;
  treasuryCents: number;
  districtName: string;
  cityName: string;
  industry?: string;
  primarySkillKey?: string | null;
  founderCharacterId?: string;
};

type Mine = {
  characterId: string;
  founded: Array<{
    id: string;
    name: string;
    treasuryCents: number;
    industry?: string;
    primarySkillKey?: string | null;
  }>;
  shares: Array<{ companyId: string; shares: number; name: string }>;
  employment: Array<{
    id: string;
    companyId: string;
    title: string;
    salaryCentsPerDay: number;
    name: string;
  }>;
};

type Talent = {
  primarySkillKey: string;
  note: string;
  candidates: Array<{ characterId: string; name: string; skillLevel: number }>;
};

type Detail = {
  yieldMultiplier: number;
  workforce: {
    skillKey: string;
    avgSkillLevel: number;
    workerCount: number;
    members: Array<{ characterName: string; skillLevel: number; isFounder: boolean }>;
  };
};

const PRODUCT_KEYS = ["food", "goods", "medicine", "materials"] as const;

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("farm");
  const [seedOrb, setSeedOrb] = useState("500");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [talentFor, setTalentFor] = useState<string | null>(null);
  const [talent, setTalent] = useState<Talent | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});

  async function refresh() {
    const [all, owned] = await Promise.all([
      api<{ companies: Company[]; industries: Industry[] }>("/companies"),
      api<Mine>("/companies/mine"),
    ]);
    setCompanies(all.companies);
    setIndustries(all.industries ?? []);
    setMine(owned);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const myCompanyIds = new Set([
    ...(mine?.founded.map((c) => c.id) ?? []),
    ...(mine?.employment.map((e) => e.companyId) ?? []),
  ]);
  const foundedIds = new Set(mine?.founded.map((c) => c.id) ?? []);

  async function loadDetail(companyId: string) {
    const d = await api<Detail>(`/companies/${companyId}`);
    setDetails((prev) => ({ ...prev, [companyId]: d }));
  }

  async function loadTalent(companyId: string) {
    setBusy(true);
    setError(null);
    try {
      const t = await api<Talent>(`/companies/${companyId}/talent`);
      setTalentFor(companyId);
      setTalent(t);
      await loadDetail(companyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load talent");
    } finally {
      setBusy(false);
    }
  }

  const selectedIndustry = industries.find((i) => i.key === industry);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Companies</h1>
      <p className="text-sm text-ink/70">
        Found an industry company and hire skilled workers. A farm staffed with high-level farmers
        harvests more; companies look for talent that matches their primary skill.
      </p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {info && <p className="text-sm text-ink/70">{info}</p>}

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Create company</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="border border-ink/20 bg-white/80 px-2 py-1.5"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            {industries.map((i) => (
              <option key={i.key} value={i.key}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            className="border border-ink/20 bg-white/80 px-2 py-1.5 w-28"
            placeholder="Seed ORB"
            value={seedOrb}
            onChange={(e) => setSeedOrb(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy || !name.trim()}
            onClick={async () => {
              const seedCapitalCents = Math.round(parseFloat(seedOrb) * 100);
              if (!Number.isFinite(seedCapitalCents) || seedCapitalCents < 10_000) {
                setError("Seed capital must be at least 100 ORB");
                return;
              }
              setBusy(true);
              setError(null);
              setInfo(null);
              try {
                await api("/companies", {
                  method: "POST",
                  body: JSON.stringify({
                    name: name.trim(),
                    seedCapitalCents,
                    industry,
                  }),
                });
                setName("");
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Create failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Found
          </button>
        </div>
        {selectedIndustry && (
          <p className="text-ink/60 text-xs">
            {selectedIndustry.description} Primary skill:{" "}
            <strong>{selectedIndustry.primarySkillKey}</strong> — higher worker levels multiply
            output.
          </p>
        )}
        <p className="text-ink/60 text-xs">Minimum seed capital: 100 ORB.</p>
      </section>

      {mine && (mine.founded.length > 0 || mine.employment.length > 0) && (
        <section className="border border-ink/10 bg-white/50 p-5 space-y-2 text-sm">
          <h2 className="font-display text-xl">Your involvement</h2>
          {mine.founded.map((c) => (
            <p key={c.id}>
              Founded <strong>{c.name}</strong>
              {c.industry ? ` (${c.industry})` : ""} · treasury {money(c.treasuryCents)}
            </p>
          ))}
          {mine.employment.map((e) => (
            <p key={e.id}>
              {e.title} at <strong>{e.name}</strong> · {money(e.salaryCentsPerDay)}/day
            </p>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">All companies</h2>
        <ul className="space-y-3">
          {companies.map((co) => {
            const detail = details[co.id];
            const showTalent = talentFor === co.id && talent;
            return (
              <li key={co.id} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{co.name}</p>
                  <p>{money(co.treasuryCents)} treasury</p>
                </div>
                <p className="text-ink/60">
                  {co.districtName}, {co.cityName}
                  {co.industry ? ` · ${co.industry}` : ""}
                  {co.primarySkillKey ? ` · skill ${co.primarySkillKey}` : ""}
                </p>
                {co.description && <p className="text-ink/70">{co.description}</p>}
                {detail && (
                  <p className="text-xs text-ink/60">
                    Workforce avg {detail.workforce.skillKey} L{detail.workforce.avgSkillLevel} (
                    {detail.workforce.workerCount} people) · yield ≈{" "}
                    {detail.yieldMultiplier.toFixed(2)}×
                  </p>
                )}
                {myCompanyIds.has(co.id) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      id={`product-${co.id}`}
                      className="border border-ink/20 bg-white/80 px-2 py-1 text-xs"
                      defaultValue="food"
                    >
                      {PRODUCT_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <button
                      className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                      disabled={busy}
                      onClick={async () => {
                        const sel = document.getElementById(
                          `product-${co.id}`,
                        ) as HTMLSelectElement;
                        setBusy(true);
                        setError(null);
                        setInfo(null);
                        try {
                          const result = await api<{
                            quantity: number;
                            baseQuantity: number;
                            skillMultiplier: number;
                            avgSkillLevel: number;
                            skillKey: string;
                          }>("/companies/produce", {
                            method: "POST",
                            body: JSON.stringify({
                              companyId: co.id,
                              productKey: sel.value,
                              quantity: 1,
                            }),
                          });
                          setInfo(
                            `Queued ${result.quantity} ${sel.value} (${result.skillMultiplier.toFixed(2)}× from avg ${result.skillKey} L${result.avgSkillLevel})`,
                          );
                          await loadDetail(co.id);
                          await refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Produce failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Produce
                    </button>
                    <button
                      className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => loadDetail(co.id)}
                    >
                      Workforce
                    </button>
                    {foundedIds.has(co.id) && (
                      <button
                        className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => loadTalent(co.id)}
                      >
                        Hire talent
                      </button>
                    )}
                  </div>
                )}
                {showTalent && (
                  <div className="border-t border-ink/10 pt-2 space-y-2">
                    <p className="text-xs text-ink/60">{talent.note}</p>
                    {talent.candidates.length === 0 && (
                      <p className="text-xs text-ink/50">No free candidates in this district.</p>
                    )}
                    <ul className="space-y-1">
                      {talent.candidates.slice(0, 12).map((c) => (
                        <li
                          key={c.characterId}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span>
                            {c.name} · {talent.primarySkillKey} L{c.skillLevel}
                            {c.skillLevel >= 15 ? " ★" : c.skillLevel >= 10 ? " · strong" : ""}
                          </span>
                          <button
                            className="border border-ink/20 px-2 py-1 hover:bg-ink/5 disabled:opacity-50"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError(null);
                              setInfo(null);
                              try {
                                const hired = await api<{ note: string }>("/companies/hire", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    companyId: co.id,
                                    characterId: c.characterId,
                                    title:
                                      talent.primarySkillKey === "agriculture"
                                        ? "Farmer"
                                        : "Employee",
                                    salaryCentsPerDay: 3500 + c.skillLevel * 100,
                                  }),
                                });
                                setInfo(hired.note);
                                await loadTalent(co.id);
                                await refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Hire failed");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Hire
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!loading && companies.length === 0 && (
          <p className="text-sm text-ink/60">No companies yet.</p>
        )}
      </section>
    </div>
  );
}
