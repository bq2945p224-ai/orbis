"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Election = {
  id: string;
  countryName: string;
  office: string;
  status: string;
  opensAt: string;
  closesAt: string;
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
  enactorName: string | null;
  enactedAt: string;
};

type Party = {
  id: string;
  name: string;
  platform: string;
  countryName: string;
};

export default function PoliticsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [laws, setLaws] = useState<Law[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyName, setPartyName] = useState("");
  const [partyPlatform, setPartyPlatform] = useState("");
  const [lawTitle, setLawTitle] = useState("");
  const [lawBody, setLawBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [el, off, lw, pt] = await Promise.all([
      api<{ elections: Election[] }>("/politics/elections"),
      api<{ offices: Office[] }>("/politics/offices"),
      api<{ laws: Law[] }>("/politics/laws"),
      api<{ parties: Party[] }>("/politics/parties"),
    ]);
    setElections(el.elections);
    setOffices(off.offices);
    setLaws(lw.laws);
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
      <p className="text-sm text-ink/70">Parties, elections, offices, and legislation.</p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="border border-ink/10 bg-white/60 p-5 space-y-3 text-sm">
        <h2 className="font-display text-xl">Parties</h2>
        <ul className="space-y-2">
          {parties.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border border-ink/10 bg-white/50 px-3 py-2">
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
            placeholder="Platform (optional)"
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
        <h2 className="font-display text-xl">Elections</h2>
        <ul className="space-y-3">
          {elections.map((el) => (
            <li key={el.id} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
              <p className="font-medium">
                {el.office} · {el.countryName}
              </p>
              <p className="text-ink/60">
                {el.status} · closes {new Date(el.closesAt).toLocaleString()}
              </p>
              <div className="flex flex-wrap gap-2">
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
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Candidacy failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Run for office
                </button>
                <button
                  className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                  disabled={busy || el.status !== "open"}
                  onClick={async () => {
                    const candidateCharacterId = window.prompt("Candidate character ID:");
                    if (!candidateCharacterId) return;
                    setBusy(true);
                    setError(null);
                    try {
                      await api("/politics/vote", {
                        method: "POST",
                        body: JSON.stringify({ electionId: el.id, candidateCharacterId }),
                      });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Vote failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Vote
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!loading && elections.length === 0 && (
          <p className="text-sm text-ink/60">No elections.</p>
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
        <p className="text-ink/60 text-xs">Requires holding a government office.</p>
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
        <button
          className="border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-50"
          disabled={busy || !lawTitle.trim() || !lawBody.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/politics/laws", {
                method: "POST",
                body: JSON.stringify({ title: lawTitle.trim(), body: lawBody.trim() }),
              });
              setLawTitle("");
              setLawBody("");
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
