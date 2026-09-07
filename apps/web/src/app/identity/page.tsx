"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Identity = {
  characterName: string;
  locationCountry: { id: string; code: string; name: string } | null;
  passport: {
    passportNumber: string;
    issuedAt: string;
    status: string;
    issuer: string;
  } | null;
  nationalIds: Array<{
    id: string;
    documentNumber: string;
    nationality: string;
    countryCode: string;
    countryId: string;
    issuedAt: string;
    status: string;
  }>;
  residency: Array<{
    countryId: string;
    countryCode: string;
    countryName: string;
    residencyDaysRequired: number;
    requiresPresence: boolean;
    daysPresent: number;
    hoursPresent: number;
    currentlyPresent: boolean;
    hasNationalId: boolean;
    eligible: boolean;
    missing: string[] | null;
  }>;
};

export default function IdentityPage() {
  const [data, setData] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const me = await api<Identity>("/identity/me");
    setData(me);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Identity</h1>
      <p className="text-sm text-ink/70">
        Every person holds a World Government passport. Sovereign countries issue national identity
        cards once you meet their residency rules — some require days or weeks inside their
        borders. Presence uses game time (1 game day = 4 real hours).
      </p>
      {loading && <p className="text-sm text-ink/60">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {info && <p className="text-sm text-ink/70">{info}</p>}

      {data && (
        <>
          <section className="border border-ink/10 bg-white/60 p-5 space-y-2 text-sm">
            <h2 className="font-display text-xl">World Government passport</h2>
            {data.passport ? (
              <>
                <p>
                  <strong>{data.passport.passportNumber}</strong> · {data.passport.status}
                </p>
                <p className="text-ink/60">
                  Issued by {data.passport.issuer} on{" "}
                  {new Date(data.passport.issuedAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-ink/50">
                  Universal identity for {data.characterName}. Not a nationality.
                </p>
              </>
            ) : (
              <p className="text-ink/60">Passport pending…</p>
            )}
            {data.locationCountry && (
              <p className="pt-1">
                Currently in: {data.locationCountry.name} ({data.locationCountry.code})
              </p>
            )}
          </section>

          <section className="border border-ink/10 bg-white/50 p-5 space-y-3 text-sm">
            <h2 className="font-display text-xl">National identity cards</h2>
            {data.nationalIds.length === 0 && (
              <p className="text-ink/60">None yet — apply below when eligible.</p>
            )}
            <ul className="space-y-2">
              {data.nationalIds.map((n) => (
                <li key={n.id} className="border border-ink/10 bg-white/70 p-3">
                  <p className="font-medium">
                    {n.nationality} · {n.documentNumber}
                  </p>
                  <p className="text-ink/60 text-xs">
                    Nationality: {n.countryCode} · issued{" "}
                    {new Date(n.issuedAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl">Citizenship / residency</h2>
            <p className="text-sm text-ink/60">
              Presence accrues in game time while you are physically in a country (1 game day = 4
              real hours). Leaving pauses the clock; returning continues from your accumulated
              days.
            </p>
            <ul className="space-y-3">
              {data.residency.map((r) => (
                <li key={r.countryId} className="border border-ink/10 bg-white/50 p-4 text-sm space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {r.countryName} ({r.countryCode})
                    </p>
                    {r.hasNationalId ? (
                      <span className="text-xs text-ink/60">ID held</span>
                    ) : r.eligible ? (
                      <span className="text-xs text-ink/70">Eligible</span>
                    ) : null}
                  </div>
                  <p className="text-ink/60 text-xs">
                    Requires {r.residencyDaysRequired} day
                    {r.residencyDaysRequired === 1 ? "" : "s"} present
                    {r.requiresPresence ? " · must apply while in-country" : ""}
                  </p>
                  <p className="text-xs">
                    Your presence: {r.daysPresent}d ({r.hoursPresent}h)
                    {r.currentlyPresent ? " · here now" : " · not here"}
                  </p>
                  {r.missing && r.missing.length > 0 && (
                    <ul className="text-xs text-ink/50 list-disc pl-4">
                      {r.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                  {!r.hasNationalId && (
                    <button
                      className="border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5 disabled:opacity-50"
                      disabled={busy || !r.eligible}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        setInfo(null);
                        try {
                          const result = await api<{ note: string }>("/identity/citizenship/apply", {
                            method: "POST",
                            body: JSON.stringify({ countryId: r.countryId }),
                          });
                          setInfo(result.note);
                          await refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Apply failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Apply for national ID
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <Link href="/character" className="inline-block text-sm underline">
            Character
          </Link>
        </>
      )}
    </div>
  );
}
