"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Candidate = {
  characterId: string;
  characterName: string;
  partyId: string | null;
};

type Election = {
  id: string;
  countryName: string;
  office: string;
  status: string;
  opensAt: string;
  closesAt: string;
  candidates: Candidate[];
};

type Office = {
  id: string;
  countryName: string;
  office: string;
  holderName: string | null;
  sinceAt: string | null;
};

type Law = {
  id: string;
  countryName: string;
  title: string;
  body: string;
  effectKey: string | null;
  effectValue: number | null;
  enactorName: string | null;
  enactedAt: string;
};

type Party = {
  id: string;
  name: string;
  platform: string;
  countryName: string;
};

type EffectCatalogItem = {
  key: string;
  label: string;
  description: string;
};

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} ORB`;
}

export default function PoliticsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [franchiseNote, setFranchiseNote] = useState<string | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [laws, setLaws] = useState<Law[]>([]);
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalogItem[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyName, setPartyName] = useState("");
  const [partyPlatform, setPartyPlatform] = useState("");
  const [lawTitle, setLawTitle] = useState("");
  const [lawBody, setLawBody] = useState("");
  const [lawEffectKey, setLawEffectKey] = useState("");
  const [lawEffectValue, setLawEffectValue] = useState("200");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [el, off, lw, pt] = await Promise.all([
      api<{ elections: Election[]; franchiseNote?: string }>("/politics/elections"),
      api<{ offices: Office[] }>("/politics/offices"),
      api<{ laws: Law[]; effectCatalog?: EffectCatalogItem[] }>("/politics/laws"),
      api<{ parties: Party[] }>("/politics/parties"),
    ]);
    setElections(el.elections);
    setFranchiseNote(el.franchiseNote ?? null);
    setOffices(off.offices);
    setLaws(lw.laws);
    setEffectCatalog(lw.effectCatalog ?? []);
    setParties(pt.parties);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Politics</h1>
      <p className="text-sm text-ink/70">
        Parties, elections, and office power. Votes install office-holders; office-holders can enact
        laws with real effects (today: property tax). Platform text alone does nothing — attach an
        effect when you legislate. Franchise requires a{" "}
        <Link className="underline" href="/identity">
          national ID
        </Link>{" "}
        for that country.
      </p>
      {franchiseNote && <p className="text-xs text-ink/55">{franchiseNote}</p>}
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {info && <p className="text-sm text-ink/70">{info}</p>}

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Parties</h2>
        <p className="text-xs text-ink/55">
          Membership is real history; platform copy is cosmetic until you win office and pass laws.
        </p>
        <ul className="space-y-2">
          {parties.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 border border-ink/10 bg-white/50 px-3 py-2"
            >
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-ink/60">{p.platform || p.countryName}</p>
              </div>
              <button
                className="border border-ink/20 px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/politics/parties/join", {
                      method: "POST",
                      body: JSON.stringify({ partyId: p.id }),
                    });
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Join party failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Join
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <input
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Party name"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
          />
          <textarea
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Platform (optional, cosmetic)"
            rows={2}
            value={partyPlatform}
            onChange={(e) => setPartyPlatform(e.target.value)}
          />
          <button
            className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
            disabled={busy || !partyName.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api("/politics/parties", {
                  method: "POST",
                  body: JSON.stringify({
                    name: partyName.trim(),
                    platform: partyPlatform.trim() || undefined,
                  }),
                });
                setPartyName("");
                setPartyPlatform("");
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Create party failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Create party
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">Elections</h2>
          <button
            className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setInfo(null);
              try {
                const opened = await api<{ office: string; closesAt: string }>(
                  "/politics/elections/open",
                  { method: "POST", body: "{}" },
                );
                setInfo(`Opened election for ${opened.office}`);
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Open election failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Open election (office-holders)
          </button>
        </div>
        <ul className="space-y-3">
          {elections.map((el) => (
            <li key={el.id} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
              <p className="font-medium">
                {el.office} · {el.countryName}
              </p>
              <p className="text-ink/60">
                {el.status} · closes {new Date(el.closesAt).toLocaleString()}
              </p>
              <ul className="space-y-1 text-xs">
                {(el.candidates ?? []).map((c) => (
                  <li
                    key={c.characterId}
                    className="flex flex-wrap items-center justify-between gap-2 border border-ink/10 bg-white/60 px-2 py-1"
                  >
                    <span>{c.characterName}</span>
                    <button
                      className="border border-ink/20 px-2 py-0.5 hover:bg-ink/5 disabled:opacity-50"
                      disabled={busy || el.status !== "open"}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await api("/politics/vote", {
                            method: "POST",
                            body: JSON.stringify({
                              electionId: el.id,
                              candidateCharacterId: c.characterId,
                            }),
                          });
                          setInfo(`Voted for ${c.characterName}`);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Vote failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Vote
                    </button>
                  </li>
                ))}
              </ul>
              {(el.candidates ?? []).length === 0 && (
                <p className="text-xs text-ink/50">No candidates yet.</p>
              )}
              <button
                className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                disabled={busy || el.status !== "open"}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/politics/candidacy", {
                      method: "POST",
                      body: JSON.stringify({ electionId: el.id }),
                    });
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Candidacy failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Run for office
              </button>
            </li>
          ))}
        </ul>
        {!loading && elections.length === 0 && (
          <p className="text-sm text-ink/60">No elections. Office-holders can open one.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Offices</h2>
        <ul className="text-sm space-y-2">
          {offices.map((o) => (
            <li key={o.id} className="border border-ink/10 bg-white/50 px-3 py-2">
              {o.office} · {o.countryName} — {o.holderName ?? "vacant"}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Laws</h2>
        <ul className="space-y-2 text-sm">
          {laws.map((law) => (
            <li key={law.id} className="border border-ink/10 bg-white/50 p-3">
              <p className="font-medium">
                {law.title} · {law.countryName}
              </p>
              <p className="text-ink/70">{law.body}</p>
              {law.effectKey && (
                <p className="text-xs text-steel pt-1">
                  Effect: {law.effectKey}
                  {law.effectValue != null
                    ? ` = ${
                        law.effectKey === "property_tax_cents_per_day"
                          ? `${money(law.effectValue)}/day per parcel`
                          : law.effectValue
                      }`
                    : ""}
                </p>
              )}
              {!law.effectKey && (
                <p className="text-xs text-ink/45 pt-1">No machine effect (record only).</p>
              )}
              <p className="text-ink/60 text-xs">
                {law.enactorName ?? "Unknown"} · {new Date(law.enactedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
        {!loading && laws.length === 0 && (
          <p className="text-sm text-ink/60">No active laws.</p>
        )}
      </section>

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Enact law</h2>
        <p className="text-ink/60 text-xs">
          Requires holding a government office. Attach an effect so the world tick consumes it —
          otherwise the law is archival text only.
        </p>
        {effectCatalog.map((e) => (
          <p key={e.key} className="text-xs text-ink/55">
            <strong>{e.label}</strong> — {e.description}
          </p>
        ))}
        <input
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          placeholder="Title"
          value={lawTitle}
          onChange={(e) => setLawTitle(e.target.value)}
        />
        <textarea
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          placeholder="Body"
          rows={3}
          value={lawBody}
          onChange={(e) => setLawBody(e.target.value)}
        />
        <select
          className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
          value={lawEffectKey}
          onChange={(e) => setLawEffectKey(e.target.value)}
        >
          <option value="">No effect (text only)</option>
          <option value="property_tax_cents_per_day">Property tax (¢/day)</option>
        </select>
        {lawEffectKey === "property_tax_cents_per_day" && (
          <input
            className="w-full border border-ink/20 bg-white/80 px-2 py-1.5"
            placeholder="Cents per day (e.g. 200 = 2 ORB)"
            value={lawEffectValue}
            onChange={(e) => setLawEffectValue(e.target.value)}
          />
        )}
        <button
          className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
          disabled={busy || !lawTitle.trim() || !lawBody.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setInfo(null);
            try {
              const payload: Record<string, unknown> = {
                title: lawTitle.trim(),
                body: lawBody.trim(),
              };
              if (lawEffectKey) {
                const effectValue = parseInt(lawEffectValue, 10);
                if (!Number.isFinite(effectValue) || effectValue < 0) {
                  setError("Invalid effect value");
                  setBusy(false);
                  return;
                }
                payload.effectKey = lawEffectKey;
                payload.effectValue = effectValue;
              }
              await api("/politics/laws", {
                method: "POST",
                body: JSON.stringify(payload),
              });
              setLawTitle("");
              setLawBody("");
              setInfo("Law enacted");
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Enact law failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Enact
        </button>
      </section>
    </div>
  );
}
